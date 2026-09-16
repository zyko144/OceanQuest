// Accueil des nouveaux marins + panneaux fixes (bienvenue, règlement, FAQ, liens).

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, GatewayIntentBits } = require('discord.js');
const config = require('../../config');
const robloxGame = require('../../lib/robloxGame');
const { findChannel, findRole, channelMention } = require('../../lib/guild');
const { oceanEmbed, colors, WAVE, paragraphs } = require('../../lib/embeds');
const { ensurePanel } = require('../../lib/util');

const GREETINGS = [
  'Ahoy {user} ! Un nouveau marin vient d’accoster au port 🌊',
  'Terre en vue ! {user} rejoint l’équipage ⚓',
  '{user} a mordu à l’hameçon, bienvenue à bord ! 🎣',
  'Une nouvelle voile à l’horizon… c’est {user} ! ⛵',
  'Les mouettes l’annoncent : {user} débarque sur Ocean Quest 🐚',
];

function linkButtons() {
  const buttons = [];
  const gameUrl = robloxGame.gameUrl();
  if (gameUrl) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(gameUrl).setLabel('Jouer à Ocean Quest').setEmoji('🎮'));
  if (config.game.groupUrl) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(config.game.groupUrl).setLabel('Groupe Roblox').setEmoji('👥'));
  return buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
}

const RULES = [
  ['⚓', 'Respect de l’équipage', 'Aucune insulte, harcèlement, discrimination ou propos haineux.'],
  ['🌊', 'Pas de tempête de messages', 'Pas de spam, de flood, de mentions abusives ni de majuscules à outrance.'],
  ['📢', 'Pas de publicité', 'Invitations Discord et autopromotion interdites sans l’accord du staff.'],
  ['🔞', 'Contenu tout public', 'Rien de NSFW, choquant ou illégal — pseudo et photo de profil compris.'],
  ['⚖️', 'Échanges honnêtes', 'Arnaque lors d’un échange = bannissement. Aucun échange contre de l’argent réel.'],
  ['🛠️', 'Pas de triche', 'Exploits, scripts et hacks interdits. Un bug ? Signale-le en ticket.'],
  ['🔐', 'Protège ton compte', 'Ne partage jamais ton mot de passe Roblox. Le staff ne te le demandera **jamais**.'],
  ['🧭', 'Chaque salon a son cap', 'Utilise les salons pour leur usage et parle principalement français.'],
  ['🎖️', 'Les officiers ont le dernier mot', 'Pour contester une décision, ouvre un ticket « Contester une sanction ».'],
];

const panels = {
  welcome: (guild) => ({
    embeds: [oceanEmbed({
      title: '🌊  Bienvenue au port d’Ocean Quest !',
      description: paragraphs(
        '> Ici se retrouvent tous les pêcheurs, capitaines et chasseurs de légendes du jeu **Ocean Quest** sur Roblox.',
        '### 🧭  Pour bien embarquer',
        `**1 ・ 📜 Lis le Code des Marins**\n-# ➜ ${channelMention(guild, 'rules', '#reglement')}`,
        `**2 ・ ✅ Monte à bord**\n-# ➜ ${channelMention(guild, 'verify', '#verification')}`,
        `**3 ・ 🎨 Choisis tes rôles**\n-# ➜ ${channelMention(guild, 'selfroles', '#roles')}`,
        `**4 ・ 🍻 Viens discuter avec l’équipage**\n-# ➜ ${channelMention(guild, 'general', '#taverne')}`,
        WAVE,
        `### 🛟  Besoin d’aide ?\nOuvre un ticket dans ${channelMention(guild, 'ticket_panel', '#ouvrir-un-ticket')}, on arrive ! 🚤`,
      ),
      color: colors.ocean,
      footer: 'Ocean Quest ・ Embarcadère',
      timestamp: false,
    })],
    components: linkButtons(),
  }),

  rules: () => ({
    embeds: [
      oceanEmbed({
        title: '📜  Le Code des Marins',
        description: paragraphs(
          '> Tout marin qui monte à bord accepte ce code.\n> L’ignorer ne te protège pas des sanctions.',
          ...RULES.map(([emoji, title, text], i) => `### ${emoji}  ${i + 1} ・ ${title}\n${text}`),
        ),
        color: colors.deep,
        footer: false,
        timestamp: false,
      }),
      oceanEmbed({
        title: '⚖️  Échelle des sanctions',
        description: paragraphs(
          '⚠️ **Avertissement**\n-# Un rappel à l’ordre. 3 avertissements = sourdine automatique.',
          '🔇 **Sourdine**\n-# Tu ne peux plus écrire pendant un moment.',
          '👢 **Expulsion**\n-# Tu es débarqué du serveur.',
          '🔨 **Bannissement**\n-# Tu es jeté par-dessus bord, définitivement.',
          WAVE,
          '-# En restant ici, tu acceptes aussi les [Conditions d’utilisation](https://discord.com/terms) et les [Règles de la communauté](https://discord.com/guidelines) de Discord, ainsi que les règles de Roblox.',
        ),
        color: colors.deep,
        footer: 'Ocean Quest ・ Code des Marins',
        timestamp: false,
      }),
    ],
  }),

  faq: (guild) => ({
    embeds: [oceanEmbed({
      title: '❓  Foire Aux Questions du port',
      description: paragraphs(
        '> Les réponses aux questions que tous les moussaillons se posent.',
        `### 🎮  Comment jouer à Ocean Quest ?\nLe lien est dans ${channelMention(guild, 'links', '#liens-utiles')} ou avec la commande \`/jouer\`.`,
        `### 🐛  J’ai trouvé un bug, je fais quoi ?\nOuvre un ticket **Signaler un bug** dans ${channelMention(guild, 'ticket_panel', '#ouvrir-un-ticket')}, avec une capture ou une vidéo.`,
        '### 💰  Mon achat n’est pas arrivé\nRelance le jeu. Si ça persiste, ouvre un ticket **Achats & Robux** avec la date de l’achat.',
        '### 🎣  Comment obtenir les rôles de pêcheur ?\nDiscute pour gagner de l’XP, puis vérifie ton niveau avec `/rang`.\n-# 🐠 niv. 5 ・ 🐡 niv. 15 ・ 🦈 niv. 30 ・ 🐋 niv. 50 ・ 🦑 niv. 75',
        `### 🐟  Il y a un mini-jeu sur Discord ?\nOui ! Tape \`/pecher\` dans ${channelMention(guild, 'bot_commands', '#commandes')}, puis \`/aquarium\` pour voir ta collection.`,
        '### ⚓  Comment rejoindre le staff ?\nQuand les recrutements sont ouverts, ouvre un ticket **Candidature Staff**.',
      ),
      color: colors.lagoon,
      footer: 'Ocean Quest ・ FAQ',
      timestamp: false,
    })],
  }),

  links: () => ({
    embeds: [oceanEmbed({
      title: '🔗  Liens utiles',
      description: paragraphs(
        '> Tout ce qu’il te faut pour prendre la mer.',
        `### 🎮  Jeu Roblox\n${robloxGame.gameUrl() || 'Bientôt disponible, garde un œil sur les annonces ! 👀'}`,
        `### 👥  Groupe Roblox\n${config.game.groupUrl || 'Bientôt disponible !'}`,
        WAVE,
        '-# 🔔 Rejoins le groupe Roblox pour recevoir des bonus exclusifs en jeu.',
      ),
      color: colors.ocean,
      footer: 'Ocean Quest ・ Liens',
      timestamp: false,
    })],
    components: linkButtons(),
  }),
};

async function onMemberAdd(member) {
  if (member.user.bot) return;
  const channel = findChannel(member.guild, 'welcome');
  if (!channel) return;
  const line = GREETINGS[Math.floor(Math.random() * GREETINGS.length)].replace('{user}', `${member}`);
  await channel.send({
    content: `${member}`,
    embeds: [oceanEmbed({
      title: `⚓  Matelot n°${member.guild.memberCount}`,
      description: paragraphs(
        `> ${line}`,
        `✅ **Monte à bord**\n-# ➜ ${channelMention(member.guild, 'verify', '#verification')}`,
        `📜 **Lis le Code des Marins**\n-# ➜ ${channelMention(member.guild, 'rules', '#reglement')}`,
      ),
      color: colors.lagoon,
      thumbnail: member.displayAvatarURL({ size: 256 }),
      footer: 'Ocean Quest ・ Nouveau marin',
    })],
    allowedMentions: { users: [member.id] },
  }).catch(() => null);
}

module.exports = {
  name: 'welcome',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  events: { [Events.GuildMemberAdd]: onMemberAdd },
  linkButtons,
  async panels(client, guild, ctx) {
    const targets = [['welcome', panels.welcome], ['rules', panels.rules], ['faq', panels.faq], ['links', panels.links]];
    for (const [key, build] of targets) {
      const channel = findChannel(guild, key);
      if (channel) await ensurePanel(client, channel, build(guild), { otherBotIds: ctx.otherBotIds() });
    }
    // Le propriétaire du serveur reçoit le rôle 🔱 Poséidon.
    const owner = await guild.members.fetch(guild.ownerId).catch(() => null);
    const founder = findRole(guild, 'founder');
    if (owner && founder && !owner.roles.cache.has(founder.id) && founder.editable) {
      await owner.roles.add(founder, 'Propriétaire du serveur').catch(() => null);
    }
  },
};
