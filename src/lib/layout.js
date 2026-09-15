// Plan complet du serveur Ocean Quest : rôles, catégories, salons et permissions.
// Les noms sont stylisés automatiquement (voir theme dans fonts.js).

const { PermissionFlagsBits: P, ChannelType } = require('discord.js');
const { theme } = require('./fonts');

// ───────────────────────── Rôles (du plus haut au plus bas) ─────────────────────────

// Capitaine = modérateur des tickets : supprime des messages, gère le vocal,
// mais ne touche ni aux salons, ni aux rôles, ni aux annonces.
const TICKET_MOD_PERMS = [P.ManageMessages, P.MoveMembers, P.MuteMembers];
const MODERATOR_PERMS = [
  P.ViewAuditLog, P.ManageMessages, P.ManageNicknames, P.ManageThreads, P.KickMembers,
  P.ModerateMembers, P.MuteMembers, P.MoveMembers,
];
const HELPER_PERMS = [P.ManageMessages, P.ModerateMembers, P.MoveMembers];

const roles = [
  // Direction & équipage
  { key: 'founder', name: '🔱 Poséidon', color: 0x00e5ff, hoist: true, permissions: [P.Administrator], about: 'Fondateur du jeu' },
  { key: 'admin', name: '🌊 Amiral', color: 0x0091ea, hoist: true, permissions: [P.Administrator], about: 'Administrateur' },
  { key: 'manager', name: '⚓ Capitaine', color: 0x1565c0, hoist: true, permissions: TICKET_MOD_PERMS, about: 'Modérateur des tickets' },
  { key: 'moderator', name: '🧭 Quartier-Maître', color: 0x26a69a, hoist: true, permissions: MODERATOR_PERMS, about: 'Modérateur' },
  { key: 'helper', name: '🛟 Garde-Côte', color: 0x4dd0e1, hoist: true, permissions: HELPER_PERMS, about: 'Support / helper' },
  { key: 'dev', name: '🛠️ Charpentier de Marine', color: 0x8d6e63, hoist: true, permissions: [], about: 'Développeur du jeu' },
  { key: 'builder', name: '🗺️ Cartographe', color: 0xa1887f, hoist: false, permissions: [], about: 'Builder / designer' },
  { key: 'bots', name: '🤖 Équipage Mécanique', color: 0x607d8b, hoist: false, permissions: [], about: 'Bots du serveur' },

  // Rôles spéciaux
  { key: 'partner', name: '🤝 Armateur Partenaire', color: 0xffb300, hoist: true, about: 'Partenaire' },
  { key: 'creator', name: '🎥 Sirène des Médias', color: 0xe040fb, hoist: true, about: 'Créateur de contenu' },
  { key: 'booster', name: '💎 Trésor des Profondeurs', color: 0xf47fff, hoist: true, about: 'Booster du serveur' },
  { key: 'legend', name: '🏆 Légende des Sept Mers', color: 0xffd700, hoist: true, about: 'Gagnant d’événement' },
  { key: 'tester', name: '🧪 Plongeur d’Essai', color: 0x7c4dff, hoist: false, about: 'Bêta-testeur' },

  // Rangs de pêcheur (gagnés en discutant — système de niveaux)
  { key: 'lvl75', name: '🦑 Kraken des Abysses', color: 0x5e35b1, hoist: true, level: 75, about: 'Niveau 75' },
  { key: 'lvl50', name: '🐋 Chasseur de Léviathans', color: 0x3949ab, hoist: true, level: 50, about: 'Niveau 50' },
  { key: 'lvl30', name: '🦈 Maître Pêcheur', color: 0x1e88e5, hoist: true, level: 30, about: 'Niveau 30' },
  { key: 'lvl15', name: '🐡 Pêcheur Confirmé', color: 0x29b6f6, hoist: false, level: 15, about: 'Niveau 15' },
  { key: 'lvl5', name: '🐠 Pêcheur Amateur', color: 0x81d4fa, hoist: false, level: 5, about: 'Niveau 5' },
  { key: 'member', name: '🎣 Moussaillon', color: 0xb3e5fc, hoist: false, about: 'Membre vérifié' },

  // Plateformes (auto-rôles)
  { key: 'pc', name: '💻 Marin PC', color: 0, about: 'Joue sur PC' },
  { key: 'mobile', name: '📱 Marin Mobile', color: 0, about: 'Joue sur mobile' },
  { key: 'console', name: '🎮 Marin Console', color: 0, about: 'Joue sur console' },

  // Notifications (auto-rôles)
  { key: 'ping_news', name: '📢 Cloche du Port', color: 0, mentionable: false, about: 'Ping annonces' },
  { key: 'ping_updates', name: '🆕 Nouvelle Marée', color: 0, about: 'Ping mises à jour' },
  { key: 'ping_events', name: '🎉 Corne de Brume', color: 0, about: 'Ping événements' },
  { key: 'ping_giveaways', name: '🎁 Coffre au Trésor', color: 0, about: 'Ping giveaways' },
  { key: 'ping_rare', name: '🐟 Banc Rare', color: 0, about: 'Ping poissons rares / events en jeu' },
];

const STAFF_LEVELS = {
  helper: ['helper', 'moderator', 'manager', 'admin', 'founder'],
  moderator: ['moderator', 'admin', 'founder'],
  manager: ['manager', 'admin', 'founder'],
  admin: ['admin', 'founder'],
};

// Rôles qui voient et gèrent TOUS les tickets, quel que soit leur type.
const TICKET_MODERATORS = ['manager'];

// ───────────────────────── Permissions par type d'accès ─────────────────────────

const READ = [P.ViewChannel, P.ReadMessageHistory];
const TALK = [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.AddReactions, P.EmbedLinks, P.AttachFiles,
  P.UseExternalEmojis, P.SendMessagesInThreads, P.CreatePublicThreads, P.UseApplicationCommands];
const NO_TALK = [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads];
const VOICE = [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD, P.UseEmbeddedActivities, P.SendMessages, P.ReadMessageHistory];
const BOT = [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ManageMessages,
  P.ManageChannels, P.Connect];

// Chaque preset renvoie une liste { role: clé | '@everyone', allow, deny }.
const access = {
  public_readonly: () => [
    { role: '@everyone', allow: [...READ, P.AddReactions], deny: NO_TALK },
  ],
  verify: () => [
    { role: '@everyone', allow: READ, deny: [...NO_TALK, P.AddReactions] },
    { role: 'member', deny: [P.ViewChannel] },
  ],
  announce: () => [
    { role: '@everyone', deny: [P.ViewChannel] },
    { role: 'member', allow: [...READ, P.AddReactions], deny: NO_TALK },
  ],
  community: () => [
    { role: '@everyone', deny: [P.ViewChannel] },
    { role: 'member', allow: TALK },
  ],
  suggestions: () => [
    { role: '@everyone', deny: [P.ViewChannel] },
    { role: 'member', allow: [...READ, P.AddReactions, P.SendMessagesInThreads, P.UseApplicationCommands], deny: [P.SendMessages, P.CreatePublicThreads] },
  ],
  commands: () => [
    { role: '@everyone', deny: [P.ViewChannel] },
    { role: 'member', allow: [...TALK, P.UseApplicationCommands] },
  ],
  tester: () => [
    { role: '@everyone', deny: [P.ViewChannel] },
    { role: 'tester', allow: TALK },
    { role: 'dev', allow: TALK },
    { role: 'manager', allow: TALK },
  ],
  voice: () => [
    { role: '@everyone', deny: [P.ViewChannel] },
    { role: 'member', allow: VOICE },
  ],
  stat: () => [
    { role: '@everyone', allow: [P.ViewChannel], deny: [P.Connect] },
  ],
  tickets: () => [
    { role: '@everyone', deny: [P.ViewChannel] },
    { role: 'helper', allow: [...READ] },
    { role: 'moderator', allow: [...READ] },
    { role: 'manager', allow: [...READ] },
  ],
  staff: () => [
    { role: '@everyone', deny: [P.ViewChannel] },
    ...['helper', 'moderator', 'manager', 'dev'].map((role) => ({ role, allow: [...TALK, ...VOICE] })),
  ],
  dev: () => [
    { role: '@everyone', deny: [P.ViewChannel] },
    { role: 'dev', allow: [...TALK, ...VOICE] },
    { role: 'builder', allow: [...TALK, ...VOICE] },
    { role: 'manager', allow: [...TALK, ...VOICE] },
  ],
  logs: () => [
    { role: '@everyone', deny: [P.ViewChannel] },
    { role: 'moderator', allow: READ, deny: NO_TALK },
    { role: 'manager', allow: READ, deny: NO_TALK },
  ],
};

// ───────────────────────── Catégories & salons ─────────────────────────

const text = (key, emoji, label, accessKey, extra = {}) => ({ key, type: ChannelType.GuildText, emoji, label, access: accessKey, ...extra });
const voice = (key, emoji, label, accessKey = 'voice', extra = {}) => ({ key, type: ChannelType.GuildVoice, emoji, label, access: accessKey, ...extra });

const categories = [
  {
    key: 'cat_entry', emoji: '⚓', label: 'L’Embarcadère', access: 'public_readonly',
    channels: [
      text('welcome', '🌊', 'bienvenue', 'public_readonly', { topic: 'Chaque nouveau matelot qui pose le pied sur le quai est accueilli ici.' }),
      text('rules', '📜', 'reglement', 'public_readonly', { topic: 'Le Code des Marins — à lire avant de prendre la mer.' }),
      text('verify', '✅', 'verification', 'verify', { topic: 'Clique sur le bouton pour monter à bord.' }),
    ],
  },
  {
    key: 'cat_info', emoji: '📯', label: 'La Capitainerie', access: 'announce',
    channels: [
      text('announcements', '📢', 'annonces', 'announce', { topic: 'Les grandes nouvelles du port.' }),
      text('updates', '🆕', 'mises-a-jour', 'announce', { topic: 'Patch notes et nouvelles marées d’Ocean Quest.' }),
      text('events', '🎉', 'evenements', 'announce', { topic: 'Tournois de pêche, events et chasses au trésor.' }),
      text('giveaways', '🎁', 'giveaways', 'announce', { topic: 'Coffres au trésor à gagner.' }),
      text('selfroles', '🧭', 'roles', 'announce', { topic: 'Choisis tes notifications et ta plateforme.' }),
      text('links', '🔗', 'liens-utiles', 'announce', { topic: 'Jeu Roblox, groupe et réseaux.' }),
      voice('stats_members', '👥', 'Matelots', 'stat', { dynamic: true }),
    ],
  },
  {
    key: 'cat_community', emoji: '🍻', label: 'La Taverne', access: 'community',
    channels: [
      text('general', '💬', 'taverne', 'community', { topic: 'Discussion générale entre marins. Pas de spam, pas de pub.' }),
      text('screenshots', '📸', 'photos-de-peche', 'community', { topic: 'Montre tes plus belles prises en image !' }),
      text('rare_catches', '🐟', 'prises-rares', 'community', { topic: 'Légendaires, mythiques… les prises qui font trembler les océans.' }),
      text('memes', '🤣', 'memes', 'community'),
      text('fanart', '🎨', 'fan-art', 'community'),
      text('bot_commands', '🤖', 'commandes', 'commands', { topic: '/pecher, /rang, /aquarium, /classement…' }),
    ],
  },
  {
    key: 'cat_game', emoji: '🎣', label: 'Le Grand Large', access: 'community',
    channels: [
      text('guides', '🗺️', 'guides-et-astuces', 'community', { topic: 'Spots, appâts, cannes : partage tes astuces.' }),
      text('bestiary', '🐠', 'bestiaire', 'community', { topic: 'Tout savoir sur les poissons d’Ocean Quest.' }),
      text('trading', '⚖️', 'echanges', 'community', { topic: 'Échanges entre joueurs. Aucun échange contre de l’argent réel.', rateLimitPerUser: 30 }),
      text('leaderboard', '🏆', 'classements', 'announce', { topic: 'Les meilleurs pêcheurs du serveur.' }),
      text('suggestions', '💡', 'suggestions', 'suggestions', { topic: 'Utilise /suggestion pour proposer une idée.' }),
      text('bugs', '🐛', 'bugs-connus', 'announce', { topic: 'Bugs connus. Pour en signaler un : ouvre un ticket.' }),
      text('beta', '🧪', 'beta-testeurs', 'tester', { topic: 'Réservé aux Plongeurs d’Essai.' }),
    ],
  },
  {
    key: 'cat_voice', emoji: '🔊', label: 'Les Cabines', access: 'voice',
    channels: [
      voice('vc_main', '🌊', 'Pont principal'),
      voice('vc_fishing1', '🎣', 'Partie de pêche 1', 'voice', { userLimit: 4 }),
      voice('vc_fishing2', '🎣', 'Partie de pêche 2', 'voice', { userLimit: 4 }),
      voice('vc_music', '🎵', 'Chants de marins'),
      voice('vc_afk', '💤', 'Fond de cale'),
    ],
  },
  {
    key: 'cat_support', emoji: '🛟', label: 'Secours en Mer', access: 'public_readonly',
    channels: [
      text('ticket_panel', '🎫', 'ouvrir-un-ticket', 'public_readonly', { topic: 'Un souci ? Ouvre un ticket, l’équipage arrive.' }),
      text('faq', '❓', 'faq', 'public_readonly', { topic: 'Les questions les plus posées.' }),
    ],
  },
  { key: 'cat_tickets', emoji: '📨', label: 'Tickets en cours', access: 'tickets', channels: [] },
  {
    key: 'cat_staff', emoji: '🗝️', label: 'Quartier des Officiers', access: 'staff',
    channels: [
      text('staff_chat', '💼', 'officiers', 'staff'),
      text('staff_orders', '📋', 'ordres-du-capitaine', 'staff'),
      text('staff_commands', '⚙️', 'commandes-staff', 'staff'),
      text('dev', '🛠️', 'chantier-naval', 'dev', { topic: 'Développement du jeu.' }),
      voice('vc_staff', '🔒', 'Salle des cartes', 'staff'),
    ],
  },
  {
    key: 'cat_logs', emoji: '📡', label: 'Journal de Bord', access: 'logs',
    channels: [
      text('log_tickets', '🎫', 'logs-tickets', 'logs'),
      text('log_security', '🛡️', 'logs-securite', 'logs'),
      text('log_moderation', '🔨', 'logs-moderation', 'logs'),
      text('log_messages', '✉️', 'logs-messages', 'logs'),
      text('log_members', '👥', 'logs-membres', 'logs'),
      text('log_voice', '🎙️', 'logs-vocal', 'logs'),
    ],
  },
];

function channelName(channel, suffix) {
  if (channel.type === ChannelType.GuildVoice) {
    return theme.voiceName(channel.emoji, suffix === undefined ? channel.label : `${channel.label} : ${suffix}`);
  }
  return theme.textName(channel.emoji, channel.label);
}

const categoryName = (category) => theme.categoryName(category.emoji, category.label);

const allChannels = () => categories.flatMap((cat) => cat.channels.map((ch) => ({ ...ch, category: cat.key })));

module.exports = { roles, categories, access, STAFF_LEVELS, TICKET_MODERATORS, BOT_CHANNEL_PERMS: BOT, channelName, categoryName, allChannels };
