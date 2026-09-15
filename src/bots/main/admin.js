// /setup, /annonce, /aide, /serveur, /jouer + compteur de membres.

const {
  ChannelType, GatewayIntentBits, LabelBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits: P,
  SlashCommandBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const config = require('../../config');
const layout = require('../../lib/layout');
const { findChannel, findRole, isStaff } = require('../../lib/guild');
const { oceanEmbed, colors, ok, fail } = require('../../lib/embeds');
const { ephemeral, unix, truncate } = require('../../lib/util');
const { linkButtons } = require('./welcome');

const ANNOUNCE_TARGETS = {
  announcements: { label: '📢 Annonces', ping: 'ping_news' },
  updates: { label: '🆕 Mises à jour', ping: 'ping_updates' },
  events: { label: '🎉 Événements', ping: 'ping_events' },
  giveaways: { label: '🎁 Giveaways', ping: 'ping_giveaways' },
  bugs: { label: '🐛 Bugs connus', ping: null },
};

const HELP = [
  ['🎣 Pêche & niveaux', '`/pecher` `/aquarium` `/rang` `/classement`'],
  ['💡 Communauté', '`/suggestion` `/jouer` `/serveur`'],
  ['🎫 Tickets', '`/ticket fermer` — ou le panneau du salon tickets'],
  ['🛡️ Modération', '`/avertir` `/avertissements` `/sourdine` `/fin-sourdine` `/expulser` `/bannir` `/debannir` `/purge` `/verrouiller` `/deverrouiller` `/lenteur` `/confinement`'],
  ['⚓ Administration', '`/setup` `/annonce` `/giveaway` `/ticket panneau` `/ticket stats` `/suggestion-statut`'],
];

const commands = [
  {
    data: new SlashCommandBuilder().setName('setup').setDescription('⚓ Construire / réparer le serveur Ocean Quest (salons, rôles, panneaux)')
      .setDefaultMemberPermissions(P.Administrator),
    async execute(interaction, ctx) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const report = await ctx.runSetup();
      return interaction.editReply({ embeds: [oceanEmbed({
        title: '⚓ Chantier naval terminé',
        color: colors.success,
        description: [
          `🎭 Rôles créés : **${report.rolesCreated.length}**`,
          `📁 Catégories créées : **${report.categoriesCreated.length}**`,
          `💬 Salons créés : **${report.channelsCreated.length}**`,
          '🧭 Panneaux (tickets, vérification, rôles, règlement…) publiés ou mis à jour.',
          report.warnings.length ? `\n⚠️ ${report.warnings.join('\n⚠️ ')}` : '',
        ].join('\n'),
        footer: 'Ocean Quest ・ Setup',
      })] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('annonce').setDescription('📢 Publier une annonce stylée')
      .setDefaultMemberPermissions(P.ManageMessages)
      .addStringOption((o) => o.setName('salon').setDescription('Où publier').setRequired(true)
        .addChoices(...Object.entries(ANNOUNCE_TARGETS).map(([value, t]) => ({ name: t.label, value }))))
      .addBooleanOption((o) => o.setName('ping').setDescription('Mentionner le rôle de notification associé')),
    async execute(interaction) {
      if (!isStaff(interaction.member, 'manager')) return interaction.reply(ephemeral({ embeds: [fail('Réservé aux Capitaines.')] }));
      const target = interaction.options.getString('salon');
      const ping = interaction.options.getBoolean('ping') ? '1' : '0';
      const modal = new ModalBuilder().setCustomId(`announce:send:${target}:${ping}`).setTitle('📢 Nouvelle annonce');
      modal.addLabelComponents(
        new LabelBuilder().setLabel('Titre').setTextInputComponent(new TextInputBuilder().setCustomId('title').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)),
        new LabelBuilder().setLabel('Message').setTextInputComponent(new TextInputBuilder().setCustomId('body').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)),
        new LabelBuilder().setLabel('Image (URL, optionnel)').setTextInputComponent(new TextInputBuilder().setCustomId('image').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500)),
      );
      return interaction.showModal(modal);
    },
  },
  {
    data: new SlashCommandBuilder().setName('aide').setDescription('🧭 Toutes les commandes des bots Ocean Quest'),
    async execute(interaction) {
      return interaction.reply(ephemeral({ embeds: [oceanEmbed({
        title: '🧭 Carte des commandes',
        color: colors.ocean,
        fields: HELP.map(([name, value]) => ({ name, value })),
        footer: 'Ocean Quest ・ Aide',
      })] }));
    },
  },
  {
    data: new SlashCommandBuilder().setName('serveur').setDescription('🏝️ Informations sur le serveur'),
    async execute(interaction) {
      const guild = await interaction.guild.fetch();
      const channels = guild.channels.cache;
      return interaction.reply({ embeds: [oceanEmbed({
        title: `🏝️ ${guild.name}`,
        thumbnail: guild.iconURL({ size: 256 }),
        color: colors.ocean,
        fields: [
          { name: '👥 Matelots', value: `${guild.approximateMemberCount ?? guild.memberCount}`, inline: true },
          { name: '🟢 En ligne', value: `${guild.approximatePresenceCount ?? '—'}`, inline: true },
          { name: '💎 Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (niv. ${guild.premiumTier})`, inline: true },
          { name: '💬 Salons', value: `${channels.filter((c) => c.type === ChannelType.GuildText).size} textuels ・ ${channels.filter((c) => c.type === ChannelType.GuildVoice).size} vocaux`, inline: true },
          { name: '🎭 Rôles', value: `${guild.roles.cache.size}`, inline: true },
          { name: '📅 Créé', value: `<t:${unix(guild.createdTimestamp)}:D>`, inline: true },
          { name: '🔱 Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
        ],
        footer: 'Ocean Quest ・ Serveur',
      })], allowedMentions: { parse: [] } });
    },
  },
  {
    data: new SlashCommandBuilder().setName('jouer').setDescription('🎮 Le lien pour jouer à Ocean Quest sur Roblox'),
    async execute(interaction) {
      const components = linkButtons();
      return interaction.reply({
        embeds: [oceanEmbed({
          title: '🎮 Prends la mer sur Ocean Quest !',
          description: config.game.robloxUrl
            ? 'Attrape ta canne, choisis ton bateau et pars à la chasse aux poissons légendaires. 🎣'
            : 'Le lien du jeu arrive très bientôt… garde un œil sur les annonces ! 👀',
          color: colors.lagoon,
          footer: 'Ocean Quest ・ Roblox',
        })],
        components,
      });
    },
  },
];

async function onAnnounceModal(interaction, [, target, ping]) {
  const def = ANNOUNCE_TARGETS[target];
  const channel = def ? findChannel(interaction.guild, target) : null;
  if (!channel) return interaction.reply(ephemeral({ embeds: [fail('Salon introuvable. Lance `/setup`.')] }));
  const image = interaction.fields.getTextInputValue('image')?.trim();
  const pingRole = ping === '1' && def.ping ? findRole(interaction.guild, def.ping) : null;
  const message = await channel.send({
    content: pingRole ? `${pingRole}` : undefined,
    embeds: [oceanEmbed({
      title: truncate(interaction.fields.getTextInputValue('title'), 256),
      description: interaction.fields.getTextInputValue('body'),
      color: colors.ocean,
      image: /^https?:\/\//i.test(image ?? '') ? image : undefined,
      footer: `Ocean Quest ・ ${def.label}`,
    }).setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL() })],
    allowedMentions: { roles: pingRole ? [pingRole.id] : [] },
  });
  await message.react('🌊').catch(() => null);
  return interaction.reply(ephemeral({ embeds: [ok(`Annonce publiée : ${message.url}`)] }));
}

async function updateMemberCounter(client, guild) {
  const def = layout.allChannels().find((c) => c.key === 'stats_members');
  const channel = findChannel(guild, 'stats_members');
  if (!channel || !def) return;
  const fresh = await client.guilds.fetch({ guild: guild.id, withCounts: true, force: true }).catch(() => guild);
  const name = layout.channelName(def, fresh.approximateMemberCount ?? guild.memberCount);
  if (channel.name !== name) await channel.setName(name, 'Compteur de membres').catch(() => null);
}

module.exports = {
  name: 'admin',
  intents: [GatewayIntentBits.Guilds],
  commands,
  components: { announce: (interaction, args) => (interaction.isModalSubmit() ? onAnnounceModal(interaction, args) : null) },
  async onReady(client, guild) {
    await updateMemberCounter(client, guild);
    setInterval(() => updateMemberCounter(client, guild).catch(() => null), 10 * 60_000).unref();
  },
};
