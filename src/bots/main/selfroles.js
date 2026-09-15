// Auto-rôles : notifications et plateforme.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits } = require('discord.js');
const { findChannel, findRole } = require('../../lib/guild');
const { oceanEmbed, colors, ok, fail, WAVE, paragraphs } = require('../../lib/embeds');
const { ensurePanel, ephemeral } = require('../../lib/util');

const NOTIFICATIONS = [
  { key: 'ping_news', emoji: '📢', label: 'Annonces', hint: 'Les grandes nouvelles du port' },
  { key: 'ping_updates', emoji: '🆕', label: 'Mises à jour', hint: 'Chaque nouvelle marée du jeu' },
  { key: 'ping_events', emoji: '🎉', label: 'Événements', hint: 'Tournois de pêche et chasses au trésor' },
  { key: 'ping_giveaways', emoji: '🎁', label: 'Giveaways', hint: 'Les coffres au trésor à gagner' },
  { key: 'ping_rare', emoji: '🐟', label: 'Bancs rares', hint: 'Poissons rares et events en jeu' },
];
const PLATFORMS = [
  { key: 'pc', emoji: '💻', label: 'PC', hint: 'Tu navigues sur ordinateur' },
  { key: 'mobile', emoji: '📱', label: 'Mobile', hint: 'Tu navigues sur téléphone ou tablette' },
  { key: 'console', emoji: '🎮', label: 'Console', hint: 'Tu navigues sur Xbox ou PlayStation' },
];

function panelPayload(guild) {
  const describe = (list) => list.map((r) => `${r.emoji}  ${findRole(guild, r.key) ?? r.label}\n-# ${r.hint}`);
  const row = (list, style) => new ActionRowBuilder().addComponents(list.map((r) => new ButtonBuilder()
    .setCustomId(`roles:toggle:${r.key}`).setStyle(style).setEmoji(r.emoji).setLabel(r.label)));
  return {
    embeds: [oceanEmbed({
      title: '🧭  Hisse tes couleurs !',
      description: paragraphs(
        '> Clique sur un bouton pour **ajouter** un rôle.\n> Reclique dessus pour le **retirer**.',
        '### 🔔  Notifications',
        describe(NOTIFICATIONS),
        WAVE,
        '### 🕹️  Plateforme',
        describe(PLATFORMS),
      ),
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
