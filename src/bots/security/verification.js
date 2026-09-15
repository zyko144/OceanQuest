// Vérification « Monter à bord » : un seul clic, pensée pour les plus jeunes.
// Les comptes très récents ne sont pas bloqués mais signalés au staff ;
// seul le mode raid (tempête) refuse temporairement les comptes de moins de 7 jours.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits } = require('discord.js');
const config = require('../../config');
const { findChannel, findRole, channelMention } = require('../../lib/guild');
const { oceanEmbed, colors, fail, WAVE, paragraphs } = require('../../lib/embeds');
const { ensurePanel, ephemeral, sendLog, unix } = require('../../lib/util');
const { isRaid, FOOTER } = require('./state');

const PANEL_FOOTER = 'Ocean Guard ・ Vérification';

function panelPayload(guild) {
  return {
    embeds: [oceanEmbed({
      title: '✅  Monte à bord !',
      description: paragraphs(
        '> Salut moussaillon ! 👋\n> Pour entrer sur le serveur, c’est **super simple** :',
        `### 1️⃣  Lis le règlement\n📜 ${channelMention(guild, 'rules', '#reglement')}`,
        '### 2️⃣  Clique sur le bouton vert\n👇 Juste en dessous !',
        WAVE,
        `-# 🛟 Un souci ? Demande de l’aide dans ${channelMention(guild, 'ticket_panel', '#ouvrir-un-ticket')}`,
      ),
      color: colors.success,
      footer: PANEL_FOOTER,
      timestamp: false,
    })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify:start').setStyle(ButtonStyle.Success).setEmoji('✅').setLabel('Je monte à bord !'),
    )],
  };
}

// Boutons pour aller directement dans les salons après la vérification.
function shortcuts(guild) {
  const links = [['general', '🍻', 'Taverne'], ['selfroles', '🧭', 'Mes rôles'], ['bot_commands', '🎣', 'Pêcher']]
    .map(([key, emoji, label]) => [findChannel(guild, key), emoji, label])
    .filter(([channel]) => channel)
    .map(([channel, emoji, label]) => new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(channel.url).setEmoji(emoji).setLabel(label));
  return links.length ? [new ActionRowBuilder().addComponents(links)] : [];
}

async function onStart(interaction) {
  const { guild, member, user } = interaction;
  const role = findRole(guild, 'member');
  if (!role) {
    return interaction.reply(ephemeral({ embeds: [fail('Oups, la vérification n’est pas encore prête. Préviens un membre du staff ! 🛟')] }));
  }
  if (member.roles.cache.has(role.id)) {
    return interaction.reply(ephemeral({
      embeds: [oceanEmbed({ title: '🎣  Tu es déjà à bord !', description: '> Tu peux déjà voir tout le serveur. Amuse-toi bien ! 🌊', color: colors.success, footer: FOOTER })],
      components: shortcuts(guild),
    }));
  }

  const ageDays = (Date.now() - user.createdTimestamp) / 864e5;
  if (isRaid() && ageDays < 7) {
    return interaction.reply(ephemeral({ embeds: [fail('> 🌪️ Il y a une grosse tempête sur le serveur en ce moment.\n> Réessaie dans quelques minutes !', '⛈️  Le port est fermé')] }));
  }

  try {
    await member.roles.add(role, 'Vérification réussie');
  } catch (error) {
    await sendLog(guild, 'log_security', oceanEmbed({
      title: '⚠️ Vérification impossible',
      description: `Je n’arrive pas à donner ${role} à ${user} : \`${error.message}\`\nVérifie que le rôle **${interaction.client.user.username}** est au-dessus de ${role} dans *Paramètres du serveur → Rôles*.`,
      color: colors.danger,
      footer: FOOTER,
    }));
    return interaction.reply(ephemeral({ embeds: [fail('Oups, je n’arrive pas à te faire monter à bord. 😕\nLe staff a été prévenu, il va t’aider très vite !')] }));
  }

  await interaction.reply(ephemeral({
    embeds: [oceanEmbed({
      title: '🎉  Bienvenue à bord !',
      description: paragraphs(
        `> Bravo ${user}, tu fais maintenant partie de l’équipage ! 🎣`,
        'Tu peux voir **tout le serveur**.\nClique sur un bouton pour commencer 👇',
      ),
      color: colors.success,
      footer: FOOTER,
    })],
    components: shortcuts(guild),
  }));

  const young = ageDays < config.security.minAccountAgeDays;
  return sendLog(guild, young ? 'log_security' : 'log_members', oceanEmbed({
    description: young
      ? `👀 ${user} \`${user.id}\` est monté à bord avec un **compte très récent** (créé <t:${unix(user.createdTimestamp)}:R>). À surveiller.`
      : `✅ ${user} \`${user.id}\` est monté à bord (vérifié).`,
    color: young ? colors.warning : colors.success,
    footer: FOOTER,
  }));
}

module.exports = {
  name: 'verification',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  components: {
    verify: (interaction, [action]) => (action === 'start' ? onStart(interaction) : null),
  },
  async panels(client, guild, ctx) {
    const channel = findChannel(guild, 'verify');
    if (channel) await ensurePanel(client, channel, panelPayload(guild), { otherBotIds: ctx.otherBotIds() });
  },
};
