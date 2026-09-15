// Auto-rôles : notifications et plateforme.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits } = require('discord.js');
const { findChannel, findRole } = require('../../lib/guild');
const { oceanEmbed, colors, ok, fail, WAVE } = require('../../lib/embeds');
const { ensurePanel, ephemeral } = require('../../lib/util');

const NOTIFICATIONS = [
  { key: 'ping_news', emoji: '📢', label: 'Annonces' },
  { key: 'ping_updates', emoji: '🆕', label: 'Mises à jour' },
  { key: 'ping_events', emoji: '🎉', label: 'Événements' },
  { key: 'ping_giveaways', emoji: '🎁', label: 'Giveaways' },
  { key: 'ping_rare', emoji: '🐟', label: 'Bancs rares' },
];
const PLATFORMS = [
  { key: 'pc', emoji: '💻', label: 'PC' },
  { key: 'mobile', emoji: '📱', label: 'Mobile' },
  { key: 'console', emoji: '🎮', label: 'Console' },
];

function panelPayload(guild) {
  const describe = (list) => list.map((r) => `${r.emoji} ${findRole(guild, r.key) ?? r.label}`).join('\n');
  const row = (list, style) => new ActionRowBuilder().addComponents(list.map((r) => new ButtonBuilder()
    .setCustomId(`roles:toggle:${r.key}`).setStyle(style).setEmoji(r.emoji).setLabel(r.label)));
  return {
    embeds: [oceanEmbed({
      title: '🧭 Hisse tes couleurs !',
      description: [
        'Clique sur un bouton pour **ajouter** ou **retirer** un rôle.',
        '',
        '**🔔 Notifications** — sois prévenu quand la marée change',
        describe(NOTIFICATIONS),
        '',
        WAVE,
        '**🕹️ Plateforme** — sur quoi navigues-tu ?',
        describe(PLATFORMS),
      ].join('\n'),
      color: colors.ocean,
      footer: 'Ocean Quest ・ Auto-rôles',
      timestamp: false,
    })],
    components: [row(NOTIFICATIONS, ButtonStyle.Primary), row(PLATFORMS, ButtonStyle.Secondary)],
  };
}

async function onToggle(interaction, key) {
  const allowed = [...NOTIFICATIONS, ...PLATFORMS].some((r) => r.key === key);
  const role = allowed ? findRole(interaction.guild, key) : null;
  if (!role) return interaction.reply(ephemeral({ embeds: [fail('Ce rôle est introuvable. Un admin doit lancer `/setup`.')] }));
  const has = interaction.member.roles.cache.has(role.id);
  if (has) await interaction.member.roles.remove(role, 'Auto-rôle');
  else await interaction.member.roles.add(role, 'Auto-rôle');
  return interaction.reply(ephemeral({ embeds: [ok(has ? `Rôle ${role} retiré.` : `Rôle ${role} ajouté !`, has ? '➖ Voile affalée' : '➕ Voile hissée')] }));
}

module.exports = {
  name: 'selfroles',
  intents: [GatewayIntentBits.Guilds],
  components: { roles: (interaction, [action, key]) => (action === 'toggle' ? onToggle(interaction, key) : null) },
  async panels(client, guild, ctx) {
    const channel = findChannel(guild, 'selfroles');
    if (channel) await ensurePanel(client, channel, panelPayload(guild), { otherBotIds: ctx.otherBotIds() });
  },
};
