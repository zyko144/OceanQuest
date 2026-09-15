// Commandes de modération de l'équipage.

const { ChannelType, GatewayIntentBits, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const db = require('../../lib/db');
const layout = require('../../lib/layout');
const { findChannel, findRole } = require('../../lib/guild');
const { oceanEmbed, colors, ok, fail } = require('../../lib/embeds');
const { ephemeral, sendLog, parseDuration, formatDuration, unix, truncate } = require('../../lib/util');
const { activateRaid, deactivateRaid } = require('./state');

const FOOTER = 'Ocean Guard ・ Modération';
const MAX_TIMEOUT = 28 * 864e5;
const WARN_STEPS = [
  { count: 5, timeoutMs: 24 * 36e5 },
  { count: 3, timeoutMs: 36e5 },
];

function hierarchyError(interaction, target, capability) {
  if (!target) return 'Ce membre n’est pas sur le serveur.';
  if (target.id === interaction.user.id) return 'Tu ne peux pas te sanctionner toi-même, matelot.';
  if (target.id === interaction.guild.ownerId) return 'On ne sanctionne pas le propriétaire du navire.';
  if (target.user.bot && target.id === interaction.client.user.id) return 'Je ne vais pas me mettre aux fers moi-même…';
  const isOwner = interaction.user.id === interaction.guild.ownerId;
  if (!isOwner && target.roles.highest.comparePositionTo(interaction.member.roles.highest) >= 0) {
    return 'Ce membre a un grade égal ou supérieur au tien.';
  }
  if (capability && !target[capability]) return 'Mon rôle est trop bas pour sanctionner ce membre (remonte le rôle du bot).';
  return null;
}

async function record(interaction, { action, emoji, user, reason, durationMs, color = colors.warning, extra = [] }) {
  await db.modActions.log({
    guild_id: interaction.guild.id, action, user_id: user.id, moderator_id: interaction.user.id, reason, duration_ms: durationMs ?? null,
  }).catch(() => null);
  await sendLog(interaction.guild, 'log_moderation', oceanEmbed({
    title: `${emoji} ${action.charAt(0).toUpperCase()}${action.slice(1)}`,
    color,
    thumbnail: user.displayAvatarURL?.(),
    fields: [
      { name: 'Membre', value: `${user} \`${user.id}\``, inline: true },
      { name: 'Modérateur', value: `${interaction.user}`, inline: true },
      ...(durationMs ? [{ name: 'Durée', value: formatDuration(durationMs), inline: true }] : []),
      { name: 'Raison', value: truncate(reason, 1024) },
      ...extra,
    ],
    footer: FOOTER,
  }));
}

const dm = (user, guild, title, description) => user.send({
  embeds: [oceanEmbed({ title, description: `**Serveur :** ${guild.name}\n${description}`, color: colors.warning, footer: FOOTER })],
}).catch(() => null);

const reasonOption = (o) => o.setName('raison').setDescription('Raison').setMaxLength(400);

const commands = [
  {
    data: new SlashCommandBuilder().setName('avertir').setDescription('⚠️ Avertir un membre')
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre à avertir').setRequired(true))
      .addStringOption((o) => reasonOption(o).setRequired(true)),
    async execute(interaction) {
      const target = interaction.options.getMember('membre');
      const reason = interaction.options.getString('raison');
      const error = hierarchyError(interaction, target);
      if (error) return interaction.reply(ephemeral({ embeds: [fail(error)] }));

      await db.warnings.add({ guild_id: interaction.guild.id, user_id: target.id, moderator_id: interaction.user.id, reason });
      const all = await db.warnings.list(interaction.guild.id, target.id);
      await dm(target.user, interaction.guild, '⚠️ Tu as reçu un avertissement', `**Raison :** ${reason}\n**Total :** ${all.length} avertissement(s)`);
      await record(interaction, { action: 'avertissement', emoji: '⚠️', user: target.user, reason, extra: [{ name: 'Total', value: `${all.length}`, inline: true }] });

      let auto = '';
      const step = WARN_STEPS.find((s) => all.length === s.count);
      if (step && target.moderatable) {
        await target.timeout(step.timeoutMs, `Sanction automatique : ${all.length} avertissements`).catch(() => null);
        auto = `\n🔇 Sanction automatique : sourdine ${formatDuration(step.timeoutMs)}.`;
      }
      return interaction.reply({ embeds: [ok(`${target} a reçu un avertissement (**${all.length}** au total).\n**Raison :** ${reason}${auto}`, '⚠️ Avertissement')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('avertissements').setDescription('📋 Voir les avertissements d’un membre')
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    async execute(interaction) {
      const user = interaction.options.getUser('membre');
      const all = await db.warnings.list(interaction.guild.id, user.id);
      const lines = all.map((w) => `\`#${w.id}\` <t:${unix(w.created_at)}:d> par <@${w.moderator_id}> — ${truncate(w.reason, 120)}`);
      return interaction.reply(ephemeral({
        embeds: [oceanEmbed({
          title: `📋 Avertissements de ${user.username}`,
          description: lines.length ? truncate(lines.join('\n'), 4000) : 'Casier vierge, marin exemplaire ! 🌊',
          color: lines.length ? colors.warning : colors.success,
          footer: FOOTER,
        })],
      }));
    },
  },
  {
    data: new SlashCommandBuilder().setName('retirer-avertissement').setDescription('🧽 Retirer un avertissement par son numéro')
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addIntegerOption((o) => o.setName('numero').setDescription('Numéro (#) de l’avertissement').setRequired(true).setMinValue(1)),
    async execute(interaction) {
      const id = interaction.options.getInteger('numero');
      const removed = await db.warnings.remove(interaction.guild.id, id);
      if (!removed?.length) return interaction.reply(ephemeral({ embeds: [fail(`Aucun avertissement #${id}.`)] }));
      return interaction.reply(ephemeral({ embeds: [ok(`Avertissement #${id} retiré pour <@${removed[0].user_id}>.`)] }));
    },
  },
  {
    data: new SlashCommandBuilder().setName('effacer-avertissements').setDescription('🧼 Effacer tous les avertissements d’un membre')
      .setDefaultMemberPermissions(P.BanMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    async execute(interaction) {
      const user = interaction.options.getUser('membre');
      const removed = await db.warnings.clear(interaction.guild.id, user.id);
      await record(interaction, { action: 'casier effacé', emoji: '🧼', user, reason: `${removed?.length ?? 0} avertissement(s) effacé(s)`, color: colors.success });
      return interaction.reply(ephemeral({ embeds: [ok(`${removed?.length ?? 0} avertissement(s) effacé(s) pour ${user}.`)] }));
    },
  },
  {
    data: new SlashCommandBuilder().setName('sourdine').setDescription('🔇 Mettre un membre aux fers (timeout)')
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
      .addStringOption((o) => o.setName('duree').setDescription('Durée : 10m, 2h, 1j… (max 28j)').setRequired(true))
      .addStringOption(reasonOption),
    async execute(interaction) {
      const target = interaction.options.getMember('membre');
      const reason = interaction.options.getString('raison') ?? 'Aucune raison';
      const duration = parseDuration(interaction.options.getString('duree'));
      const error = hierarchyError(interaction, target, 'moderatable');
      if (error) return interaction.reply(ephemeral({ embeds: [fail(error)] }));
      if (!duration || duration > MAX_TIMEOUT) return interaction.reply(ephemeral({ embeds: [fail('Durée invalide (exemples : `10m`, `2h`, `3j`, max `28j`).')] }));
      await target.timeout(duration, `${interaction.user.tag} : ${reason}`);
      await dm(target.user, interaction.guild, '🔇 Tu as été mis aux fers', `**Durée :** ${formatDuration(duration)}\n**Raison :** ${reason}`);
      await record(interaction, { action: 'sourdine', emoji: '🔇', user: target.user, reason, durationMs: duration });
      return interaction.reply({ embeds: [ok(`${target} est aux fers pour **${formatDuration(duration)}** (fin <t:${unix(Date.now() + duration)}:R>).\n**Raison :** ${reason}`, '🔇 Sourdine')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('fin-sourdine').setDescription('🔊 Libérer un membre des fers')
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
      .addStringOption(reasonOption),
    async execute(interaction) {
      const target = interaction.options.getMember('membre');
      const reason = interaction.options.getString('raison') ?? 'Aucune raison';
      if (!target?.isCommunicationDisabled()) return interaction.reply(ephemeral({ embeds: [fail('Ce membre n’est pas en sourdine.')] }));
      await target.timeout(null, `${interaction.user.tag} : ${reason}`);
      await record(interaction, { action: 'fin de sourdine', emoji: '🔊', user: target.user, reason, color: colors.success });
      return interaction.reply({ embeds: [ok(`${target} est libéré des fers.`, '🔊 Sourdine levée')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('expulser').setDescription('👢 Expulser un membre')
      .setDefaultMemberPermissions(P.KickMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
      .addStringOption(reasonOption),
    async execute(interaction) {
      const target = interaction.options.getMember('membre');
      const reason = interaction.options.getString('raison') ?? 'Aucune raison';
      const error = hierarchyError(interaction, target, 'kickable');
      if (error) return interaction.reply(ephemeral({ embeds: [fail(error)] }));
      await dm(target.user, interaction.guild, '👢 Tu as été expulsé', `**Raison :** ${reason}`);
      await target.kick(`${interaction.user.tag} : ${reason}`);
      await record(interaction, { action: 'expulsion', emoji: '👢', user: target.user, reason, color: colors.danger });
      return interaction.reply({ embeds: [ok(`**${target.user.tag}** a été débarqué du navire.\n**Raison :** ${reason}`, '👢 Expulsion')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('bannir').setDescription('🔨 Bannir un utilisateur')
      .setDefaultMemberPermissions(P.BanMembers)
      .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true))
      .addStringOption(reasonOption)
      .addIntegerOption((o) => o.setName('supprimer_messages').setDescription('Supprimer ses messages des X derniers jours').setMinValue(0).setMaxValue(7)),
    async execute(interaction) {
      const user = interaction.options.getUser('utilisateur');
      const target = interaction.options.getMember('utilisateur');
      const reason = interaction.options.getString('raison') ?? 'Aucune raison';
      if (target) {
        const error = hierarchyError(interaction, target, 'bannable');
        if (error) return interaction.reply(ephemeral({ embeds: [fail(error)] }));
        await dm(user, interaction.guild, '🔨 Tu as été banni', `**Raison :** ${reason}\nTu peux contester via un ticket « Contester une sanction » si tu as un autre moyen de nous joindre.`);
      }
      const days = interaction.options.getInteger('supprimer_messages') ?? 0;
      await interaction.guild.bans.create(user.id, { reason: `${interaction.user.tag} : ${reason}`, deleteMessageSeconds: days * 86400 });
      await record(interaction, { action: 'bannissement', emoji: '🔨', user, reason, color: colors.danger });
      return interaction.reply({ embeds: [ok(`**${user.tag}** a été jeté par-dessus bord (banni).\n**Raison :** ${reason}`, '🔨 Bannissement')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('debannir').setDescription('🕊️ Lever le bannissement d’un utilisateur')
      .setDefaultMemberPermissions(P.BanMembers)
      .addStringOption((o) => o.setName('id').setDescription('ID Discord de l’utilisateur').setRequired(true))
      .addStringOption(reasonOption),
    async execute(interaction) {
      const id = interaction.options.getString('id').replace(/\D/g, '');
      const reason = interaction.options.getString('raison') ?? 'Aucune raison';
      const user = await interaction.guild.bans.remove(id, `${interaction.user.tag} : ${reason}`).catch(() => null);
      if (!user) return interaction.reply(ephemeral({ embeds: [fail('Aucun bannissement trouvé pour cet ID.')] }));
      await record(interaction, { action: 'débannissement', emoji: '🕊️', user, reason, color: colors.success });
      return interaction.reply({ embeds: [ok(`**${user.tag}** peut revenir à bord.`, '🕊️ Débannissement')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('purge').setDescription('🧹 Supprimer des messages')
      .setDefaultMemberPermissions(P.ManageMessages)
      .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption((o) => o.setName('membre').setDescription('Seulement les messages de ce membre')),
    async execute(interaction) {
      const amount = interaction.options.getInteger('nombre');
      const user = interaction.options.getUser('membre');
      await interaction.deferReply(ephemeral({}));
      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      if (user) messages = messages.filter((m) => m.author.id === user.id);
      const deleted = await interaction.channel.bulkDelete([...messages.values()].slice(0, amount), true);
      await sendLog(interaction.guild, 'log_moderation', oceanEmbed({
        description: `🧹 ${interaction.user} a supprimé **${deleted.size}** message(s) dans ${interaction.channel}${user ? ` (de ${user})` : ''}`,
        color: colors.warning,
        footer: FOOTER,
      }));
      return interaction.editReply({ embeds: [ok(`${deleted.size} message(s) emporté(s) par la marée. (Les messages de plus de 14 jours ne peuvent pas être supprimés en masse.)`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('verrouiller').setDescription('🔒 Verrouiller un salon')
      .setDefaultMemberPermissions(P.ManageChannels)
      .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(ChannelType.GuildText))
      .addStringOption(reasonOption),
    async execute(interaction) {
      const channel = interaction.options.getChannel('salon') ?? interaction.channel;
      await setLocked(interaction.guild, [channel], true, `${interaction.user.tag} : ${interaction.options.getString('raison') ?? 'verrouillage'}`);
      await channel.send({ embeds: [oceanEmbed({ description: `🔒 Salon verrouillé par l’équipage. ${interaction.options.getString('raison') ?? ''}`, color: colors.warning, footer: FOOTER })] });
      return interaction.reply(ephemeral({ embeds: [ok(`${channel} est verrouillé.`)] }));
    },
  },
  {
    data: new SlashCommandBuilder().setName('deverrouiller').setDescription('🔓 Déverrouiller un salon')
      .setDefaultMemberPermissions(P.ManageChannels)
      .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(ChannelType.GuildText)),
    async execute(interaction) {
      const channel = interaction.options.getChannel('salon') ?? interaction.channel;
      await setLocked(interaction.guild, [channel], false, `${interaction.user.tag} : déverrouillage`);
      await channel.send({ embeds: [oceanEmbed({ description: '🔓 Salon rouvert, bonne navigation !', color: colors.success, footer: FOOTER })] });
      return interaction.reply(ephemeral({ embeds: [ok(`${channel} est déverrouillé.`)] }));
    },
  },
  {
    data: new SlashCommandBuilder().setName('lenteur').setDescription('🐢 Définir le mode lent d’un salon')
      .setDefaultMemberPermissions(P.ManageChannels)
      .addIntegerOption((o) => o.setName('secondes').setDescription('0 pour désactiver (max 21600)').setRequired(true).setMinValue(0).setMaxValue(21600))
      .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(ChannelType.GuildText)),
    async execute(interaction) {
      const channel = interaction.options.getChannel('salon') ?? interaction.channel;
      const seconds = interaction.options.getInteger('secondes');
      await channel.setRateLimitPerUser(seconds, interaction.user.tag);
      return interaction.reply(ephemeral({ embeds: [ok(seconds ? `🐢 Mode lent de **${seconds}s** sur ${channel}.` : `Mode lent désactivé sur ${channel}.`)] }));
    },
  },
  {
    data: new SlashCommandBuilder().setName('confinement').setDescription('🌪️ Verrouiller tout le serveur (raid)')
      .setDefaultMemberPermissions(P.ManageGuild)
      .addStringOption((o) => o.setName('action').setDescription('Activer ou lever').setRequired(true)
        .addChoices({ name: '🌪️ Activer', value: 'on' }, { name: '🌤️ Lever', value: 'off' }))
      .addStringOption(reasonOption),
    async execute(interaction) {
      const on = interaction.options.getString('action') === 'on';
      const reason = interaction.options.getString('raison') ?? (on ? 'Confinement manuel' : 'Fin du confinement');
      await interaction.deferReply(ephemeral({}));
      const channels = layout.allChannels()
        .filter((c) => ['community', 'commands', 'suggestions'].includes(c.access))
        .map((c) => findChannel(interaction.guild, c.key)).filter(Boolean);
      await setLocked(interaction.guild, channels, on, `${interaction.user.tag} : ${reason}`);
      if (on) await activateRaid(interaction.guild, `${reason} (par ${interaction.user.tag})`, 60);
      else await deactivateRaid(interaction.guild, `${interaction.member}`);
      return interaction.editReply({ embeds: [ok(on ? `🌪️ ${channels.length} salons verrouillés et mode raid activé.` : `🌤️ ${channels.length} salons rouverts.`)] });
    },
  },
];

// Au déverrouillage, on revient aux permissions prévues par layout.js pour ce salon.
function presetValue(guild, channel, roleKey, flag) {
  const def = layout.allChannels().find((c) => findChannel(guild, c.key)?.id === channel.id);
  const rule = def && layout.access[def.access]().find((r) => r.role === roleKey);
  if (!rule) return null;
  if (rule.allow?.includes(P[flag])) return true;
  if (rule.deny?.includes(P[flag])) return false;
  return null;
}

async function setLocked(guild, channels, locked, reason) {
  const member = findRole(guild, 'member');
  const targets = [['@everyone', guild.roles.everyone.id], ['member', member?.id]].filter(([, id]) => id);
  for (const channel of channels) {
    for (const [roleKey, id] of targets) {
      const flags = ['SendMessages', 'SendMessagesInThreads', 'AddReactions'];
      const overwrite = Object.fromEntries(flags.map((flag) => [flag, locked ? false : presetValue(guild, channel, roleKey, flag)]));
      await channel.permissionOverwrites.edit(id, overwrite, { reason }).catch(() => null);
    }
  }
}

module.exports = {
  name: 'moderation',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  commands,
};
