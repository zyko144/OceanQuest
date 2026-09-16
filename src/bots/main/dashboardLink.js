// /tableau-de-bord : lien de connexion personnel (5 min, usage unique) vers le tableau de bord web.

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder,
} = require('discord.js');
const config = require('../../config');
const auth = require('../../web/auth');
const { isStaff } = require('../../lib/guild');
const { oceanEmbed, colors, fail, paragraphs } = require('../../lib/embeds');

const commands = [
  {
    data: new SlashCommandBuilder().setName('tableau-de-bord').setDescription('📊 Ouvrir le tableau de bord web du staff')
      .setDefaultMemberPermissions(P.ManageMessages),
    async execute(interaction) {
      if (!isStaff(interaction.member, 'helper')) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [fail('Réservé à l’équipage.')] });
      }
      if (!config.web.publicUrl) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [fail('`PUBLIC_URL` n’est pas configurée sur Render.')] });
      }
      const url = await auth.createLoginLink(interaction.user.id);
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [oceanEmbed({
          title: '📊  Tableau de bord',
          description: paragraphs(
            '> Tickets, sanctions, économie, joueurs Roblox… tout le port en un coup d’œil.',
            '🔐 Ce lien est **personnel**, valable **5 minutes** et utilisable **une seule fois**.\n-# Ne le partage pas. Ta session dure ensuite 12 h.',
          ),
          color: colors.ocean,
          footer: 'Ocean Quest ・ Tableau de bord',
        })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setEmoji('📊').setLabel('Ouvrir le tableau de bord'),
        )],
      });
    },
  },
];

module.exports = { name: 'dashboardLink', intents: [GatewayIntentBits.Guilds], commands };
