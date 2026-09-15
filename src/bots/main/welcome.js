// Accueil des nouveaux marins + panneaux fixes (bienvenue, règlement, FAQ, liens).

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, GatewayIntentBits } = require('discord.js');
const config = require('../../config');
const { findChannel, findRole, channelMention } = require('../../lib/guild');
const { oceanEmbed, colors, WAVE } = require('../../lib/embeds');
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
  if (config.game.robloxUrl) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(config.game.robloxUrl).setLabel('Jouer à Ocean Quest').setEmoji('🎮'));
  if (config.game.groupUrl) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(config.game.groupUrl).setLabel('Groupe Roblox').setEmoji('👥'));
  return buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
}

const panels = {
  welcome: (guild) => ({
    embeds: [oceanEmbed({
      title: '🌊 Bienvenue au port d’Ocean Quest !',
      description: [
        'Ici se retrouvent tous les pêcheurs, capitaines et chasseurs de légendes du jeu **Ocean Quest** sur Roblox.',
        '',
        WAVE,
        `📜 **1.** Lis le ${channelMention(guild, 'rules', 'règlement')}`,
        `✅ **2.** Monte à bord dans ${channelMention(guild, 'verify', 'la vérification')}`,
        `🧭 **3.** Choisis tes rôles dans ${channelMention(guild, 'selfroles', 'les rôles')}`,
        `🍻 **4.** Viens discuter dans ${channelMention(guild, 'general', 'la taverne')}`,
        '',
        `🛟 Besoin d’aide ? ${channelMention(guild, 'ticket_panel', 'Ouvre un ticket')}`,
      ].join('\n'),
      color: colors.ocean,
      footer: 'Ocean Quest ・ Embarcadère',
      timestamp: false,
    })],
    components: linkButtons(),
  }),

  rules: () => ({
    embeds: [oceanEmbed({
      title: '📜 Le Code des Marins',
      description: [
        'Tout marin qui monte à bord accepte ce code. L’ignorer ne te protège pas des sanctions.',
        '',
        '**⚓ 1. Respect de l’équipage**\nAucune insulte, harcèlement, discrimination ou propos haineux.',
        '**🌊 2. Pas de tempête de messages**\nPas de spam, de flood, de mentions abusives ni de majuscules à outrance.',
        '**📢 3. Pas de publicité**\nInvitations Discord et autopromotion interdites sans accord du staff (ouvre un ticket partenariat).',
        '**🔞 4. Contenu tout public**\nPas de contenu NSFW, choquant, violent ou illégal — pseudo et photo de profil compris.',
        '**⚖️ 5. Échanges honnêtes**\nToute arnaque lors d’un échange = bannissement. Aucun échange contre de l’argent réel ou des Robux hors jeu.',
        '**🛠️ 6. Pas de triche**\nExploits, scripts et hacks sont interdits. Un bug ? Signale-le en ticket, ne l’exploite pas.',
        '**🔐 7. Protège ton compte**\nNe partage jamais ton mot de passe ou tes cookies Roblox. Le staff ne te les demandera **jamais**.',
        '**🧭 8. Chaque salon a son cap**\nUtilise les salons pour leur usage prévu et parle principalement français.',
        '**🎖️ 9. Les officiers ont le dernier mot**\nRespecte les décisions du staff. Pour contester, ouvre un ticket « Contester une sanction ».',
        '',
        WAVE,
        '**Échelle des sanctions :** ⚠️ Avertissement → 🔇 Sourdine → 👢 Expulsion → 🔨 Bannissement',
        'Tu dois aussi respecter les [Conditions d’utilisation](https://discord.com/terms) et les [Règles de la communauté](https://discord.com/guidelines) de Discord, ainsi que les règles de Roblox.',
      ].join('\n'),
      color: colors.deep,
      footer: 'Ocean Quest ・ Code des Marins',
      timestamp: false,
    })],
  }),

  faq: (guild) => ({
    embeds: [oceanEmbed({
      title: '❓ Foire Aux Questions du port',
      description: [
        '**🎮 Comment jouer à Ocean Quest ?**',
        `Le lien du jeu est dans ${channelMention(guild, 'links', 'les liens utiles')} ou avec la commande \`/jouer\`.`,
        '',
        '**🐛 J’ai trouvé un bug, je fais quoi ?**',
        `Ouvre un ticket « Signaler un bug » dans ${channelMention(guild, 'ticket_panel', 'le centre des tickets')} avec une capture ou une vidéo.`,
        '',
        '**💰 Mon achat (Game Pass / objet) n’est pas arrivé.**',
        'Relance le jeu. Si le problème persiste, ouvre un ticket « Achats & Robux » avec la date de l’achat.',
        '',
        '**🎣 Comment obtenir les rôles de pêcheur ?**',
        'Discute sur le serveur pour gagner de l’XP : 🐠 niveau 5, 🐡 15, 🦈 30, 🐋 50, 🦑 75. Vérifie ton niveau avec `/rang`.',
        '',
        '**🐟 Il y a un mini-jeu sur Discord ?**',
        `Oui ! Utilise \`/pecher\` dans ${channelMention(guild, 'bot_commands', 'les commandes')}, puis \`/aquarium\` pour voir ta collection.`,
        '',
        '**⚓ Comment rejoindre le staff ?**',
        'Quand les recrutements sont ouverts, ouvre un ticket « Candidature Staff ».',
      ].join('\n'),
      color: colors.lagoon,
      footer: 'Ocean Quest ・ FAQ',
      timestamp: false,
    })],
  }),

  links: () => ({
    embeds: [oceanEmbed({
      title: '🔗 Liens utiles',
      description: [
        config.game.robloxUrl ? `🎮 **Jeu Roblox :** ${config.game.robloxUrl}` : '🎮 **Jeu Roblox :** bientôt disponible !',
        config.game.groupUrl ? `👥 **Groupe Roblox :** ${config.game.groupUrl}` : null,
        '',
        '🔔 Rejoins le groupe Roblox pour recevoir des bonus exclusifs en jeu.',
      ].filter((line) => line !== null).join('\n'),
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
      title: `⚓ Matelot n°${member.guild.memberCount}`,
      description: `${line}\n\n✅ Passe par ${channelMention(member.guild, 'verify', 'la vérification')} pour débloquer le serveur.\n📜 N’oublie pas le ${channelMention(member.guild, 'rules', 'règlement')} !`,
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
