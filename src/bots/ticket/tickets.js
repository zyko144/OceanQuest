const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, GatewayIntentBits, LabelBuilder,
  MessageFlags, ModalBuilder, OverwriteType, PermissionFlagsBits: P, SlashCommandBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');
const config = require('../../config');
const db = require('../../lib/db');
const { STAFF_LEVELS, TICKET_MODERATORS } = require('../../lib/layout');
const { findChannel, findRole, isStaff, getMainGuild, channelMention } = require('../../lib/guild');
const { oceanEmbed, colors, ok, fail, WAVE, paragraphs } = require('../../lib/embeds');
const { sendLog, ensurePanel, ephemeral, truncate, unix } = require('../../lib/util');
const TYPES = require('./types');
const { buildTranscript } = require('./transcript');

const PANEL_FOOTER = 'Ocean Ticket ・ Centre des tickets';
const TICKET_FOOTER = 'Ocean Ticket ・ Secours en mer';
const CLOSED_PREFIX = '🔒';
const pad = (n) => String(n).padStart(4, '0');
const slug = (text) => text.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 20);

// ───────── Helpers ─────────

function isTicketChannel(guild, channel) {
  const category = findChannel(guild, 'cat_tickets');
  return Boolean(channel && category && channel.parentId === category.id && /n°\d+/.test(channel.topic ?? ''));
}

function parseTopic(channel) {
  const topic = channel.topic ?? '';
  const number = Number(topic.match(/n°(\d+)/)?.[1] ?? 0);
  const userId = topic.match(/<@!?(\d+)>/)?.[1];
  const type = topic.match(/ref:(\w+)/)?.[1] ?? 'support';
  return { number, user_id: userId, type };
}

async function getTicket(channel) {
  const fromTopic = parseTopic(channel);
  const row = await db.tickets.byChannel(channel.id).catch(() => null);
  const status = channel.name.startsWith(CLOSED_PREFIX) ? 'closed' : 'open';
  return { status, ...fromTopic, ...(row ?? {}), number: row?.number ?? fromTopic.number };
}

function openTicketChannels(guild, userId) {
  const category = findChannel(guild, 'cat_tickets');
  if (!category) return [];
  return guild.channels.cache.filter((c) => c.parentId === category.id
    && !c.name.startsWith(CLOSED_PREFIX)
    && new RegExp(`<@!?${userId}>`).test(c.topic ?? '')).map((c) => c);
}

async function nextTicketNumber(guild) {
  const stored = Number(await db.guildConfig.get(guild.id, 'ticket_counter')) || 0;
  const category = findChannel(guild, 'cat_tickets');
  const fromChannels = category
    ? Math.max(0, ...guild.channels.cache.filter((c) => c.parentId === category.id).map((c) => parseTopic(c).number))
    : 0;
  const next = Math.max(stored, fromChannels) + 1;
  await db.guildConfig.set(guild.id, 'ticket_counter', next);
  return next;
}

const typeOf = (id) => TYPES.find((t) => t.id === id) ?? TYPES[0];

function canManage(member, ticket) {
  return isStaff(member, 'helper') || member.id === ticket.user_id;
}

function panelPayload(guild) {
  const embed = oceanEmbed({
    title: '🛟  Secours en Mer — Centre des tickets',
    description: paragraphs(
      '> Une avarie ? Une question ?\n> L’équipage d’**Ocean Quest** vole à ton secours. 🚤',
      '### 🎫  Choisis ton type de ticket',
      TYPES.map((t) => `${t.emoji}  **${t.label}**\n-# ${t.description}`),
      WAVE,
      '### 📌  Avant d’ouvrir un ticket',
      [
        `• Jette un œil à la ${channelMention(guild, 'faq', '#faq')}`,
        '• Un ticket = un seul sujet, avec un maximum de détails',
        '• Ne ping pas le staff, on arrive vite',
        '• Tout abus du système de tickets sera sanctionné',
      ].join('\n'),
    ),
    color: colors.ocean,
    footer: PANEL_FOOTER,
    timestamp: false,
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:open')
    .setPlaceholder('🎫 Choisis le type de ticket…')
    .addOptions(TYPES.map((t) => ({ label: t.label, value: t.id, description: truncate(t.description, 100), emoji: t.emoji })));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

function ticketButtons({ claimedBy } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setStyle(ButtonStyle.Success).setEmoji('🙋')
      .setLabel(claimedBy ? `Pris en charge par ${truncate(claimedBy, 40)}` : 'Prendre en charge').setDisabled(Boolean(claimedBy)),
    new ButtonBuilder().setCustomId('ticket:close').setStyle(ButtonStyle.Danger).setEmoji('🔒').setLabel('Fermer'),
  );
}

function closedButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:reopen').setStyle(ButtonStyle.Secondary).setEmoji('🔓').setLabel('Rouvrir'),
    new ButtonBuilder().setCustomId('ticket:transcript').setStyle(ButtonStyle.Primary).setEmoji('📜').setLabel('Transcript'),
    new ButtonBuilder().setCustomId('ticket:delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️').setLabel('Supprimer'),
  );
}

// ───────── Ouverture ─────────

async function onSelectType(interaction) {
  const type = typeOf(interaction.values[0]);
  const open = openTicketChannels(interaction.guild, interaction.user.id);
  if (open.length >= config.tickets.maxOpenPerUser) {
    await interaction.reply(ephemeral({ embeds: [fail(`Tu as déjà ${open.length} ticket(s) ouvert(s) : ${open.map((c) => `<#${c.id}>`).join(', ')}.\nFerme-les avant d’en ouvrir un nouveau.`)] }));
  } else {
    const modal = new ModalBuilder().setCustomId(`ticket:form:${type.id}`).setTitle(truncate(`${type.emoji} ${type.label}`, 45));
    modal.addLabelComponents(type.questions.map((q) => new LabelBuilder()
      .setLabel(q.label)
      .setTextInputComponent(new TextInputBuilder()
        .setCustomId(q.id)
        .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(q.required)
        .setMaxLength(q.max))));
    await interaction.showModal(modal);
  }
  // Réinitialise la sélection du menu.
  await interaction.message.edit(panelPayload(interaction.guild)).catch(() => null);
}

async function onForm(interaction, typeId) {
  const type = typeOf(typeId);
  const { guild, member } = interaction;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const open = openTicketChannels(guild, member.id);
  if (open.length >= config.tickets.maxOpenPerUser) {
    return interaction.editReply({ embeds: [fail('Tu as déjà trop de tickets ouverts.')] });
  }
  const category = findChannel(guild, 'cat_tickets');
  if (!category) return interaction.editReply({ embeds: [fail('La catégorie des tickets est introuvable. Un admin doit lancer `/setup`.')] });

  const answers = type.questions
    .map((q) => ({ ...q, value: interaction.fields.getTextInputValue(q.id)?.trim() }))
    .filter((a) => a.value);
  const number = await nextTicketNumber(guild);
  const staffRoles = [...new Set([...STAFF_LEVELS[type.staff], ...TICKET_MODERATORS])].map((key) => findRole(guild, key)).filter(Boolean);
  const staffAllow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.AddReactions, P.ManageMessages];

  const channel = await guild.channels.create({
    name: `${type.emoji}・${pad(number)}-${slug(member.user.username) || member.id.slice(-4)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `🎫 n°${pad(number)} ・ ${type.label} ・ <@${member.id}> ・ ref:${type.id}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [P.ViewChannel] },
      { id: member.id, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.AddReactions] },
      ...staffRoles.map((role) => ({ id: role.id, type: OverwriteType.Role, allow: staffAllow })),
      { id: interaction.client.user.id, type: OverwriteType.Member, allow: [...staffAllow, P.ManageChannels] },
    ],
    reason: `Ticket ${type.label} ouvert par ${member.user.tag}`,
  });

  const row = await db.tickets.create({
    guild_id: guild.id,
    channel_id: channel.id,
    user_id: member.id,
    number,
    type: type.id,
    status: 'open',
    subject: truncate(answers.find((a) => a.id === 'details')?.value ?? type.label, 200),
    answers: Object.fromEntries(answers.map((a) => [a.id, a.value])),
  }).catch((e) => { console.warn('[tickets] db:', e.message); return null; });

  const pingRoles = [...new Set([type.staff, ...TICKET_MODERATORS])].map((key) => findRole(guild, key)).filter(Boolean);
  await channel.send({
    content: [`${member}`, ...pingRoles.map(String)].join(' ・ '),
    embeds: [oceanEmbed({
      title: `${type.emoji}  Ticket n°${pad(number)} — ${type.label}`,
      description: paragraphs(
        `> Ahoy ${member} ! Un membre de l’équipage va te répondre très vite.`,
        '-# 📎 Ajoute ici toutes les captures ou vidéos utiles.',
        `${WAVE}\n### 📝  Ta demande`,
      ),
      fields: answers.map((a) => ({ name: a.label, value: truncate(a.value, 1024) })),
      color: colors.lagoon,
      thumbnail: member.displayAvatarURL({ size: 256 }),
      footer: TICKET_FOOTER,
    })],
    components: [ticketButtons()],
    allowedMentions: { users: [member.id], roles: pingRoles.map((role) => role.id) },
  });

  await interaction.editReply({
    embeds: [ok(`Ton ticket a été ouvert : ${channel}`, '🎫 Bouteille à la mer envoyée !')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(channel.url).setLabel('Aller au ticket').setEmoji('🧭'),
    )],
  });

  await sendLog(guild, 'log_tickets', oceanEmbed({
    title: '📨 Ticket ouvert',
    color: colors.lagoon,
    fields: [
      { name: 'Ticket', value: `${channel} (n°${pad(number)})`, inline: true },
      { name: 'Type', value: `${type.emoji} ${type.label}`, inline: true },
      { name: 'Membre', value: `${member} \`${member.id}\``, inline: true },
    ],
    footer: TICKET_FOOTER,
  }));
  return row;
}

// ───────── Gestion ─────────

async function onClaim(interaction) {
  if (!isStaff(interaction.member, 'helper')) {
    return interaction.reply(ephemeral({ embeds: [fail('Seul l’équipage peut prendre un ticket en charge.')] }));
  }
  const ticket = await getTicket(interaction.channel);
  if (ticket.claimed_by) {
    return interaction.reply(ephemeral({ embeds: [fail(`Ce ticket est déjà pris en charge par <@${ticket.claimed_by}>.`)] }));
  }
  if (ticket.id) await db.tickets.update(ticket.id, { claimed_by: interaction.user.id });
  await interaction.update({ components: [ticketButtons({ claimedBy: interaction.member.displayName })] });
  await interaction.channel.send({ embeds: [oceanEmbed({ description: `🙋 ${interaction.member} prend la barre de ce ticket.`, color: colors.success, footer: TICKET_FOOTER })] });
  await sendLog(interaction.guild, 'log_tickets', oceanEmbed({
    description: `🙋 ${interaction.member} a pris en charge ${interaction.channel} (n°${pad(ticket.number)})`,
    color: colors.success,
    footer: TICKET_FOOTER,
  }));
}

async function askClose(interaction) {
  const ticket = await getTicket(interaction.channel);
  if (!canManage(interaction.member, ticket)) {
    return interaction.reply(ephemeral({ embeds: [fail('Tu ne peux pas fermer ce ticket.')] }));
  }
  const modal = new ModalBuilder().setCustomId('ticket:closeform').setTitle('🔒 Fermer le ticket');
  modal.addLabelComponents(new LabelBuilder()
    .setLabel('Raison de la fermeture (optionnel)')
    .setTextInputComponent(new TextInputBuilder().setCustomId('reason').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(300)));
  return interaction.showModal(modal);
}

async function closeTicket(interaction, reason) {
  const { guild, channel, member } = interaction;
  const ticket = await getTicket(channel);
  if (!canManage(member, ticket)) return interaction.reply(ephemeral({ embeds: [fail('Tu ne peux pas fermer ce ticket.')] }));
  if (ticket.status !== 'open') return interaction.reply(ephemeral({ embeds: [fail('Ce ticket est déjà fermé.')] }));

  await interaction.deferReply();
  const type = typeOf(ticket.type);
  if (ticket.user_id) {
    await channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false, AddReactions: false, AttachFiles: false }).catch(() => null);
  }
  channel.setName(channel.name.replace(/^.+?・/, `${CLOSED_PREFIX}・`)).catch(() => null);

  const owner = ticket.user_id ? await interaction.client.users.fetch(ticket.user_id).catch(() => null) : null;
  const transcript = await buildTranscript(channel, {
    number: pad(ticket.number), typeLabel: type.label, ownerTag: owner?.tag ?? 'inconnu', user_id: ticket.user_id ?? '?',
  });

  const summary = oceanEmbed({
    title: '🔒 Ticket fermé',
    color: colors.warning,
    fields: [
      { name: 'Ticket', value: `#${channel.name} (n°${pad(ticket.number)})`, inline: true },
      { name: 'Type', value: `${type.emoji} ${type.label}`, inline: true },
      { name: 'Ouvert par', value: ticket.user_id ? `<@${ticket.user_id}>` : 'inconnu', inline: true },
      { name: 'Fermé par', value: `${member}`, inline: true },
      { name: 'Pris en charge par', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : '—', inline: true },
      { name: 'Messages', value: `${transcript.count}`, inline: true },
      { name: 'Raison', value: reason || 'Aucune raison donnée' },
    ],
    footer: TICKET_FOOTER,
  });

  const logMessage = await sendLog(guild, 'log_tickets', { embeds: [summary], files: [transcript.attachment] });
  if (ticket.id) {
    await db.tickets.update(ticket.id, {
      status: 'closed', closed_by: member.id, close_reason: reason || null, closed_at: new Date().toISOString(), transcript_url: logMessage?.url ?? null,
    });
  }

  if (owner) {
    await owner.send({
      embeds: [oceanEmbed({
        title: `🔒 Ton ticket n°${pad(ticket.number)} est fermé`,
        description: paragraphs(
          '> Merci d’avoir contacté l’équipage d’**Ocean Quest** ! 💙',
          `**Raison**\n-# ${reason || 'Aucune raison donnée'}`,
          '📜 Le transcript de la conversation est en pièce jointe.',
          '### ⭐  Comment s’est passé ton sauvetage ?',
        ),
        color: colors.ocean,
        footer: TICKET_FOOTER,
      })],
      files: [new AttachmentBuilder(transcript.attachment.attachment, { name: transcript.attachment.name })],
      components: [new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map((n) => new ButtonBuilder()
        .setCustomId(`ticket:rate:${ticket.id ?? 0}:${ticket.number}:${n}`)
        .setStyle(n >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setLabel('⭐'.repeat(n))))],
    }).catch(() => null);
  }

  await interaction.editReply({
    embeds: [oceanEmbed({
      title: '🔒 Ticket fermé',
      description: paragraphs(
        `> Fermé par ${member}`,
        reason ? `**Raison**\n-# ${reason}` : null,
        '-# Le staff peut rouvrir, récupérer le transcript ou supprimer ce ticket.',
      ),
      color: colors.warning,
      footer: TICKET_FOOTER,
    })],
    components: [closedButtons()],
  });
}

async function onReopen(interaction) {
  if (!isStaff(interaction.member, 'helper')) return interaction.reply(ephemeral({ embeds: [fail('Réservé à l’équipage.')] }));
  const ticket = await getTicket(interaction.channel);
  if (ticket.status === 'open') return interaction.reply(ephemeral({ embeds: [fail('Ce ticket est déjà ouvert.')] }));
  const type = typeOf(ticket.type);
  if (ticket.user_id) {
    await interaction.channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: true, AddReactions: true, AttachFiles: true }).catch(() => null);
  }
  interaction.channel.setName(interaction.channel.name.replace(/^.+?・/, `${type.emoji}・`)).catch(() => null);
  if (ticket.id) await db.tickets.update(ticket.id, { status: 'open', closed_at: null });
  await interaction.update({ components: [] });
  await interaction.channel.send({
    content: ticket.user_id ? `<@${ticket.user_id}>` : undefined,
    embeds: [oceanEmbed({ description: `🔓 Ticket rouvert par ${interaction.member}. Retour en mer !`, color: colors.success, footer: TICKET_FOOTER })],
    components: [ticketButtons()],
  });
  await sendLog(interaction.guild, 'log_tickets', oceanEmbed({ description: `🔓 ${interaction.member} a rouvert ${interaction.channel}`, color: colors.success, footer: TICKET_FOOTER }));
}

async function onTranscript(interaction) {
  if (!isStaff(interaction.member, 'helper')) return interaction.reply(ephemeral({ embeds: [fail('Réservé à l’équipage.')] }));
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ticket = await getTicket(interaction.channel);
  const owner = ticket.user_id ? await interaction.client.users.fetch(ticket.user_id).catch(() => null) : null;
  const transcript = await buildTranscript(interaction.channel, {
    number: pad(ticket.number), typeLabel: typeOf(ticket.type).label, ownerTag: owner?.tag ?? 'inconnu', user_id: ticket.user_id ?? '?',
  });
  await interaction.editReply({ content: `📜 Transcript (${transcript.count} messages)`, files: [transcript.attachment] });
}

async function onDelete(interaction) {
  if (!isStaff(interaction.member, 'helper')) return interaction.reply(ephemeral({ embeds: [fail('Réservé à l’équipage.')] }));
  const ticket = await getTicket(interaction.channel);
  const delay = config.tickets.deleteDelaySec;
  await interaction.reply({ embeds: [oceanEmbed({ description: `🗑️ Ce ticket va couler <t:${unix(Date.now() + delay * 1000)}:R>…`, color: colors.danger, footer: TICKET_FOOTER })] });
  if (ticket.id) await db.tickets.update(ticket.id, { status: 'deleted' });
  await sendLog(interaction.guild, 'log_tickets', oceanEmbed({
    description: `🗑️ ${interaction.member} a supprimé **#${interaction.channel.name}** (n°${pad(ticket.number)})`,
    color: colors.danger,
    footer: TICKET_FOOTER,
  }));
  const { channel } = interaction;
  setTimeout(() => channel.delete(`Ticket supprimé par ${interaction.user.tag}`).catch(() => null), delay * 1000);
}

async function onRate(interaction, [id, number, stars]) {
  const rating = Number(stars);
  if (Number(id)) await db.tickets.update(Number(id), { rating }).catch(() => null);
  await interaction.update({
    components: [],
    embeds: [...interaction.message.embeds, oceanEmbed({ description: `Merci pour ta note : ${'⭐'.repeat(rating)} 💙`, color: colors.success, footer: TICKET_FOOTER })],
  });
  const guild = await getMainGuild(interaction.client);
  await sendLog(guild, 'log_tickets', oceanEmbed({
    description: `⭐ <@${interaction.user.id}> a noté le ticket n°${pad(number)} : **${rating}/5** ${'⭐'.repeat(rating)}`,
    color: rating >= 4 ? colors.success : rating >= 3 ? colors.warning : colors.danger,
    footer: TICKET_FOOTER,
  }));
}

// ───────── Commande /ticket ─────────

const command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('🎫 Gérer les tickets')
    .addSubcommand((s) => s.setName('fermer').setDescription('Fermer ce ticket')
      .addStringOption((o) => o.setName('raison').setDescription('Raison de la fermeture').setMaxLength(300)))
    .addSubcommand((s) => s.setName('ajouter').setDescription('Ajouter un membre à ce ticket')
      .addUserOption((o) => o.setName('membre').setDescription('Membre à ajouter').setRequired(true)))
    .addSubcommand((s) => s.setName('retirer').setDescription('Retirer un membre de ce ticket')
      .addUserOption((o) => o.setName('membre').setDescription('Membre à retirer').setRequired(true)))
    .addSubcommand((s) => s.setName('renommer').setDescription('Renommer ce ticket')
      .addStringOption((o) => o.setName('nom').setDescription('Nouveau nom').setRequired(true).setMaxLength(60)))
    .addSubcommand((s) => s.setName('panneau').setDescription('Republier le panneau des tickets'))
    .addSubcommand((s) => s.setName('stats').setDescription('Statistiques des tickets')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guild, channel, member } = interaction;

    if (sub === 'panneau') {
      if (!isStaff(member, 'admin')) return interaction.reply(ephemeral({ embeds: [fail('Réservé aux Amiraux.')] }));
      const target = findChannel(guild, 'ticket_panel') ?? channel;
      await ensurePanel(interaction.client, target, panelPayload(guild));
      return interaction.reply(ephemeral({ embeds: [ok(`Panneau publié dans ${target}.`)] }));
    }

    if (sub === 'stats') {
      if (!isStaff(member, 'helper')) return interaction.reply(ephemeral({ embeds: [fail('Réservé à l’équipage.')] }));
      const stats = await db.tickets.stats(guild.id);
      return interaction.reply(ephemeral({
        embeds: [oceanEmbed({
          title: '📊 Statistiques des tickets',
          fields: [
            { name: 'Total', value: `${stats.total}`, inline: true },
            { name: 'Ouverts', value: `${stats.open}`, inline: true },
            { name: 'Fermés', value: `${stats.closed}`, inline: true },
            { name: 'Satisfaction', value: stats.rating ? `${stats.rating.toFixed(2)} / 5 ⭐` : '—', inline: true },
            { name: 'Par type', value: TYPES.map((t) => `${t.emoji} ${t.label} : **${stats.byType[t.id] ?? 0}**`).join('\n') },
          ],
          footer: TICKET_FOOTER,
        })],
      }));
    }

    if (!isTicketChannel(guild, channel)) {
      return interaction.reply(ephemeral({ embeds: [fail('Cette commande s’utilise dans un ticket.')] }));
    }

    if (sub === 'fermer') return closeTicket(interaction, interaction.options.getString('raison'));

    if (!isStaff(member, 'helper')) return interaction.reply(ephemeral({ embeds: [fail('Réservé à l’équipage.')] }));

    if (sub === 'ajouter' || sub === 'retirer') {
      const user = interaction.options.getUser('membre');
      if (sub === 'ajouter') {
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
      } else {
        await channel.permissionOverwrites.delete(user.id);
      }
      return interaction.reply({ embeds: [oceanEmbed({ description: sub === 'ajouter' ? `➕ ${user} a été hissé à bord du ticket.` : `➖ ${user} a débarqué du ticket.`, color: colors.lagoon, footer: TICKET_FOOTER })] });
    }

    if (sub === 'renommer') {
      const ticket = await getTicket(channel);
      const prefix = ticket.status === 'open' ? typeOf(ticket.type).emoji : CLOSED_PREFIX;
      const name = `${prefix}・${interaction.options.getString('nom')}`;
      await channel.setName(name);
      return interaction.reply({ embeds: [oceanEmbed({ description: `✏️ Ticket renommé en **${name}**`, color: colors.lagoon, footer: TICKET_FOOTER })] });
    }
    return null;
  },
};

module.exports = {
  name: 'tickets',
  intents: [GatewayIntentBits.Guilds],
  commands: [command],
  components: {
    ticket: async (interaction, [action, ...args]) => {
      if (action === 'open' && interaction.isStringSelectMenu()) return onSelectType(interaction);
      if (action === 'form' && interaction.isModalSubmit()) return onForm(interaction, args[0]);
      if (action === 'claim') return onClaim(interaction);
      if (action === 'close') return askClose(interaction);
      if (action === 'closeform' && interaction.isModalSubmit()) return closeTicket(interaction, interaction.fields.getTextInputValue('reason')?.trim());
      if (action === 'reopen') return onReopen(interaction);
      if (action === 'transcript') return onTranscript(interaction);
      if (action === 'delete') return onDelete(interaction);
      if (action === 'rate') return onRate(interaction, args);
      return null;
    },
  },
  async panels(client, guild, ctx) {
    const channel = findChannel(guild, 'ticket_panel');
    if (channel) await ensurePanel(client, channel, panelPayload(guild), { otherBotIds: ctx.otherBotIds() });
  },
};
