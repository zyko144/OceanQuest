// Giveaways « Coffre au trésor » persistés dans Supabase.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, GatewayIntentBits, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const db = require('../../lib/db');
const { findChannel, findRole, isStaff } = require('../../lib/guild');
const { oceanEmbed, colors, ok, fail } = require('../../lib/embeds');
const { ephemeral, parseDuration, unix, shuffle } = require('../../lib/util');

const FOOTER = 'Ocean Quest ・ Coffre au trésor';
const active = new Map(); // messageId -> { row, entrants: Set }
const saveTimers = new Map();

function giveawayEmbed(row, entrants, winners) {
  const ended = Boolean(winners);
  return oceanEmbed({
    title: ended ? '🏴‍☠️ Coffre ouvert !' : '🎁 Coffre au trésor !',
    description: [
      `**${row.prize}**`,
      '',
      ended
        ? (winners.length ? `🎉 Gagnant(s) : ${winners.map((id) => `<@${id}>`).join(', ')}` : '😢 Aucun participant, le coffre retourne au fond des mers.')
        : `Clique sur 🎁 pour participer !\n⏳ Fin <t:${unix(row.ends_at)}:R> (<t:${unix(row.ends_at)}:f>)`,
      '',
      `🏆 Gagnants : **${row.winners}** ・ 👥 Participants : **${entrants.size}**`,
      `🧭 Organisé par <@${row.host_id}>`,
    ].join('\n'),
    color: ended ? colors.deep : colors.gold,
    footer: FOOTER,
  });
}

const joinRow = (count, disabled = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('giveaway:join').setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setEmoji('🎁').setLabel(disabled ? `Terminé (${count})` : `Participer (${count})`).setDisabled(disabled),
);

function scheduleSave(entry) {
  clearTimeout(saveTimers.get(entry.row.id));
  saveTimers.set(entry.row.id, setTimeout(() => {
    db.giveaways.update(entry.row.id, { entrants: [...entry.entrants] }).catch(() => null);
  }, 3000));
}

async function endGiveaway(client, entry, { reroll = false } = {}) {
  const { row, entrants } = entry;
  active.delete(row.message_id);
  const winners = shuffle([...entrants]).slice(0, row.winners);
  const channel = await client.channels.fetch(row.channel_id).catch(() => null);
  await db.giveaways.update(row.id, { ended: true, winner_ids: winners, entrants: [...entrants] }).catch(() => null);
  if (!channel) return winners;
  const message = await channel.messages.fetch(row.message_id).catch(() => null);
  await message?.edit({ embeds: [giveawayEmbed(row, entrants, winners)], components: [joinRow(entrants.size, true)] }).catch(() => null);
  await channel.send({
    content: winners.length
      ? `🎉 ${reroll ? 'Nouveau tirage ! ' : ''}Félicitations ${winners.map((id) => `<@${id}>`).join(', ')} ! Vous remportez **${row.prize}** 🏴‍☠️\nOuvrez un ticket pour réclamer votre trésor.`
      : `😢 Personne n’a participé au giveaway **${row.prize}**.`,
    reply: message ? { messageReference: message.id, failIfNotExists: false } : undefined,
    allowedMentions: { users: winners },
  }).catch(() => null);
  return winners;
}

async function onJoin(interaction) {
  const entry = active.get(interaction.message.id);
  if (!entry) return interaction.reply(ephemeral({ embeds: [fail('Ce giveaway est terminé.')] }));
  const { entrants } = entry;
  const joined = !entrants.has(interaction.user.id);
  if (joined) entrants.add(interaction.user.id);
  else entrants.delete(interaction.user.id);
  scheduleSave(entry);
  await interaction.update({ embeds: [giveawayEmbed(entry.row, entrants)], components: [joinRow(entrants.size)] });
  return interaction.followUp(ephemeral({ embeds: [joined ? ok('Tu participes au giveaway, bonne chance ! 🍀') : ok('Tu ne participes plus au giveaway.', '👋 Participation retirée')] }));
}

const command = {
  data: new SlashCommandBuilder().setName('giveaway').setDescription('🎁 Gérer les giveaways')
    .setDefaultMemberPermissions(P.ManageMessages)
    .addSubcommand((s) => s.setName('lancer').setDescription('Lancer un giveaway')
      .addStringOption((o) => o.setName('prix').setDescription('Ce qu’on gagne').setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName('duree').setDescription('Durée : 30m, 2h, 3j…').setRequired(true))
      .addIntegerOption((o) => o.setName('gagnants').setDescription('Nombre de gagnants').setMinValue(1).setMaxValue(20))
      .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : giveaways)').addChannelTypes(ChannelType.GuildText))
      .addBooleanOption((o) => o.setName('ping').setDescription('Mentionner le rôle 🎁 Coffre au Trésor')))
    .addSubcommand((s) => s.setName('terminer').setDescription('Terminer un giveaway maintenant')
      .addStringOption((o) => o.setName('message').setDescription('ID ou lien du message').setRequired(true)))
    .addSubcommand((s) => s.setName('relancer').setDescription('Retirer de nouveaux gagnants')
      .addStringOption((o) => o.setName('message').setDescription('ID ou lien du message').setRequired(true))),

  async execute(interaction) {
    if (!isStaff(interaction.member, 'manager')) return interaction.reply(ephemeral({ embeds: [fail('Réservé aux Capitaines.')] }));
    const sub = interaction.options.getSubcommand();

    if (sub === 'lancer') {
      const duration = parseDuration(interaction.options.getString('duree'));
      if (!duration || duration < 60_000) return interaction.reply(ephemeral({ embeds: [fail('Durée invalide (minimum 1 minute, ex : `30m`, `2h`, `3j`).')] }));
      const channel = interaction.options.getChannel('salon') ?? findChannel(interaction.guild, 'giveaways') ?? interaction.channel;
      const row = {
        guild_id: interaction.guild.id,
        channel_id: channel.id,
        prize: interaction.options.getString('prix'),
        winners: interaction.options.getInteger('gagnants') ?? 1,
        host_id: interaction.user.id,
        ends_at: new Date(Date.now() + duration).toISOString(),
        ended: false,
        entrants: [],
      };
      const entrants = new Set();
      const pingRole = interaction.options.getBoolean('ping') ? findRole(interaction.guild, 'ping_giveaways') : null;
      const message = await channel.send({
        content: pingRole ? `${pingRole}` : undefined,
        embeds: [giveawayEmbed(row, entrants)],
        components: [joinRow(0)],
        allowedMentions: { roles: pingRole ? [pingRole.id] : [] },
      });
      const saved = await db.giveaways.create({ ...row, message_id: message.id });
      active.set(message.id, { row: { ...row, ...saved, message_id: message.id }, entrants });
      return interaction.reply(ephemeral({ embeds: [ok(`Giveaway lancé dans ${channel} : ${message.url}`)] }));
    }

    const messageId = interaction.options.getString('message').split('/').pop().replace(/\D/g, '');
    await interaction.deferReply(ephemeral({}));
    if (sub === 'terminer') {
      const entry = active.get(messageId);
      if (!entry) return interaction.editReply({ embeds: [fail('Giveaway actif introuvable.')] });
      const winners = await endGiveaway(interaction.client, entry);
      return interaction.editReply({ embeds: [ok(`Giveaway terminé (${winners.length} gagnant(s)).`)] });
    }
    const row = await db.giveaways.byMessage(messageId);
    if (!row?.ended) return interaction.editReply({ embeds: [fail('Giveaway terminé introuvable.')] });
    const winners = await endGiveaway(interaction.client, { row, entrants: new Set(row.entrants ?? []) }, { reroll: true });
    return interaction.editReply({ embeds: [ok(`Nouveau tirage effectué (${winners.length} gagnant(s)).`)] });
  },
};

module.exports = {
  name: 'giveaways',
  intents: [GatewayIntentBits.Guilds],
  commands: [command],
  components: { giveaway: (interaction, [action]) => (action === 'join' ? onJoin(interaction) : null) },
  async onReady(client, guild) {
    const rows = await db.giveaways.active(guild.id).catch(() => []);
    for (const row of rows ?? []) active.set(row.message_id, { row, entrants: new Set(row.entrants ?? []) });
    setInterval(() => {
      for (const entry of active.values()) {
        if (new Date(entry.row.ends_at).getTime() <= Date.now()) endGiveaway(client, entry).catch((e) => console.error('[giveaways]', e));
      }
    }, 10_000).unref();
  },
};
