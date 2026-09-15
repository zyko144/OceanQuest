// Suggestions de la communauté avec votes et fil de discussion.

const { EmbedBuilder, GatewayIntentBits, PermissionFlagsBits: P, SlashCommandBuilder, ThreadAutoArchiveDuration } = require('discord.js');
const { findChannel, isStaff } = require('../../lib/guild');
const { oceanEmbed, colors, ok, fail } = require('../../lib/embeds');
const { ephemeral, truncate } = require('../../lib/util');

const STATUSES = {
  pending: { label: '🕒 En attente', color: colors.ocean },
  review: { label: '🔎 À l’étude', color: colors.warning },
  accepted: { label: '✅ Acceptée', color: colors.success },
  denied: { label: '❌ Refusée', color: colors.danger },
  done: { label: '🚀 Ajoutée au jeu', color: colors.gold },
};

const commands = [
  {
    data: new SlashCommandBuilder().setName('suggestion').setDescription('💡 Proposer une idée pour Ocean Quest')
      .addStringOption((o) => o.setName('idee').setDescription('Ton idée (poisson, zone, mécanique…)').setRequired(true).setMinLength(10).setMaxLength(1500)),
    async execute(interaction) {
      const channel = findChannel(interaction.guild, 'suggestions');
      if (!channel) return interaction.reply(ephemeral({ embeds: [fail('Le salon des suggestions est introuvable.')] }));
      const idea = interaction.options.getString('idee');
      const message = await channel.send({ embeds: [oceanEmbed({
        title: '💡 Nouvelle suggestion',
        description: idea,
        color: STATUSES.pending.color,
        thumbnail: interaction.user.displayAvatarURL({ size: 128 }),
        fields: [
          { name: 'Proposée par', value: `${interaction.user}`, inline: true },
          { name: 'Statut', value: STATUSES.pending.label, inline: true },
        ],
        footer: 'Ocean Quest ・ Suggestions',
      })] });
      await message.react('✅').catch(() => null);
      await message.react('❌').catch(() => null);
      await message.startThread({ name: `💬 ${truncate(idea.replace(/\s+/g, ' '), 90)}`, autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek }).catch(() => null);
      return interaction.reply(ephemeral({ embeds: [ok(`Ta bouteille à la mer est partie : ${message.url}`, '💡 Suggestion envoyée')] }));
    },
  },
  {
    data: new SlashCommandBuilder().setName('suggestion-statut').setDescription('🧭 Changer le statut d’une suggestion (staff)')
      .setDefaultMemberPermissions(P.ManageMessages)
      .addStringOption((o) => o.setName('message').setDescription('Lien ou ID du message de la suggestion').setRequired(true))
      .addStringOption((o) => o.setName('statut').setDescription('Nouveau statut').setRequired(true)
        .addChoices(...Object.entries(STATUSES).map(([value, s]) => ({ name: s.label, value }))))
      .addStringOption((o) => o.setName('reponse').setDescription('Réponse de l’équipage').setMaxLength(1000)),
    async execute(interaction) {
      if (!isStaff(interaction.member, 'moderator')) return interaction.reply(ephemeral({ embeds: [fail('Réservé aux officiers.')] }));
      const channel = findChannel(interaction.guild, 'suggestions');
      const id = interaction.options.getString('message').split('/').pop().replace(/\D/g, '');
      const message = await channel?.messages.fetch(id).catch(() => null);
      if (!message || message.author.id !== interaction.client.user.id) {
        return interaction.reply(ephemeral({ embeds: [fail('Suggestion introuvable.')] }));
      }
      const status = STATUSES[interaction.options.getString('statut')];
      const answer = interaction.options.getString('reponse');
      const embed = EmbedBuilder.from(message.embeds[0]).setColor(status.color);
      const fields = (message.embeds[0].fields ?? []).filter((f) => !['Statut', 'Réponse de l’équipage'].includes(f.name));
      embed.setFields([
        ...fields,
        { name: 'Statut', value: status.label, inline: true },
        ...(answer ? [{ name: 'Réponse de l’équipage', value: `${answer}\n— ${interaction.user}` }] : []),
      ]);
      await message.edit({ embeds: [embed] });
      return interaction.reply(ephemeral({ embeds: [ok(`Statut mis à jour : ${status.label}`)] }));
    },
  },
];

module.exports = { name: 'suggestions', intents: [GatewayIntentBits.Guilds], commands };
