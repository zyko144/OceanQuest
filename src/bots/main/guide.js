// Guide des commandes épinglé dans #commandes (pêche, niveaux, communauté).
// Construit à partir du code du jeu pour rester à jour (zones, raretés, grades, cooldowns).

const { GatewayIntentBits } = require('discord.js');
const config = require('../../config');
const layout = require('../../lib/layout');
const { findChannel, findRole, channelMention } = require('../../lib/guild');
const { oceanEmbed, colors, WAVE, paragraphs } = require('../../lib/embeds');
const { ensurePanel, formatDuration } = require('../../lib/util');
const { FISH, RARITIES, ZONES } = require('./fishing');

const FOOTER = 'Ocean Quest ・ Guide des commandes';

function guidePayload(guild) {
  const zones = Object.values(ZONES)
    .map((z) => `${z.emoji}  **${z.label}**  ・  ${z.level ? `niveau ${z.level}` : 'ouverte à tous'}`).join('\n');
  const rarities = Object.entries(RARITIES)
    .map(([key, r]) => `${r.emoji}  **${r.label}**  ・  ${FISH.filter((f) => f.rarity === key).length} espèces`).join('\n');
  const grades = layout.roles.filter((r) => r.level).sort((a, b) => a.level - b.level)
    .map((r) => `${findRole(guild, r.key) ?? r.name}  ・  niveau ${r.level}`).join('\n');

  return {
    embeds: [
      oceanEmbed({
        title: '🤖  Guide des commandes',
        description: paragraphs(
          '> Toutes les commandes commencent par **/**.\n> Tape `/` dans ce salon puis choisis la commande dans la liste 👆',
          '🤫 **Les réponses des commandes ne sont visibles que par toi**, pour garder le salon propre.',
          '-# 🔎 Ce message est épinglé : clique sur 📌 en haut du salon pour le retrouver.',
        ),
        color: colors.ocean,
        footer: false,
        timestamp: false,
      }),
      oceanEmbed({
        title: '🎣  La pêche',
        description: paragraphs(
          '> Lance ta ligne, attrape des poissons et deviens le plus riche armateur du port !',
          `### \`/pecher\`\nTu lances ta ligne et tu remontes un poisson qui te rapporte des 🪙 **doublons**.\n-# ⏳ Une fois toutes les ${formatDuration(config.fishing.cooldownSec * 1000)}`,
          '### 🗺️  Choisis ta zone',
          '-# Dans `/pecher`, choisis l’option **zone**. Plus tu vas profond, plus les poissons rares sont fréquents !',
          zones,
          '### ✨  Les raretés',
          rarities,
          `-# 🏆 Les légendaires et mythiques sont annoncés dans ${channelMention(guild, 'rare_catches', '#prises-rares')}\n-# 👢 Et parfois… tu remontes une vieille botte !`,
        ),
        color: colors.lagoon,
        footer: false,
        timestamp: false,
      }),
      oceanEmbed({
        title: '🛒  La boutique',
        description: paragraphs(
          '> Dépense tes 🪙 doublons pour devenir un vrai loup de mer !',
          '### `/boutique`\nAchète des objets qui t’aident à pêcher :\n🎣 **Cannes** : moins d’attente entre deux lancers\n🪱 **Appâts** : plus de poissons rares\n🥅 **Filets** : fini les vieilles bottes\n🎨 **Couleurs** : un pseudo coloré sur le serveur',
          '### `/inventaire`\nTes objets, tes appâts restants et le choix de ta couleur.\n-# Les cannes, appâts et filets s’utilisent **tout seuls** quand tu pêches.',
        ),
        color: colors.gold,
        footer: false,
        timestamp: false,
      }),
      oceanEmbed({
        title: '🎮  Ton compte Roblox',
        description: paragraphs(
          '### `/lier`\nLance le jeu, tape `/lier` et choisis ton pseudo dans la liste.\nDans le jeu, clique sur l’animal affiché sur Discord : c’est relié ! 🐙\n-# 🎁 Débloque le rôle 🔗 Matelot Roblox et des rôles selon ta progression en jeu.',
          '### `/profil`\nTa fiche de marin : compte Roblox, niveau, doublons et index du jeu.\n-# 👀 Ajoute un membre pour voir sa fiche',
          '### `/jouer`\nLe lien du jeu avec le nombre de joueurs **en direct**.',
        ),
        color: colors.success,
        footer: false,
        timestamp: false,
      }),
      oceanEmbed({
        title: '🐠  Collection & classements',
        description: paragraphs(
          `### \`/aquarium\`\nTa collection : espèces trouvées (sur ${FISH.length}), nombre de prises, doublons et ta plus belle prise.\n-# 👀 Ajoute un membre pour visiter son aquarium`,
          `### \`/aquariumig\`\nTes **3 meilleurs poissons pêchés dans le jeu Roblox**, en aquarium animé.\n-# 🐡 Dans ${channelMention(guild, 'aquarium_ig', '#aquarium-ig')} ・ la première fois : \`/aquariumig pseudo:TonPseudoRoblox\``,
          '### `/classement`\nLe top 10 du serveur. Choisis le type :\n🎣 **Niveaux**  ・  🪙 **Doublons**  ・  🐟 **Prises**',
        ),
        color: colors.gold,
        footer: false,
        timestamp: false,
      }),
      oceanEmbed({
        title: '📈  Les niveaux',
        description: paragraphs(
          '### `/rang`\nTon niveau, ton XP, ta place au classement et ton prochain grade.\n-# 👀 Ajoute un membre pour voir son rang',
          `### 💬  Comment gagner de l’XP ?\nDiscute sur le serveur ! Chaque message rapporte **${config.levels.xpMin} à ${config.levels.xpMax} XP**.\n-# ⏳ Une fois par ${formatDuration(config.levels.cooldownSec * 1000)} maximum : spammer ne sert à rien 😉`,
          '### 🎖️  Les grades',
          grades,
          '-# 🔓 Monter de niveau débloque aussi de nouvelles zones de pêche !',
        ),
        color: colors.purple,
        footer: false,
        timestamp: false,
      }),
      oceanEmbed({
        title: '🧭  Les autres commandes',
        description: paragraphs(
          `### \`/suggestion\`\nPropose une idée pour le jeu. Elle est publiée dans ${channelMention(guild, 'suggestions', '#suggestions')} et tout le monde peut voter ✅ ❌.`,
          '### `/serveur`\nLes infos du serveur : membres, boosts, salons…',
          '### `/aide`\nLa liste rapide de toutes les commandes.',
          `### \`/ticket fermer\`\nFerme ton ticket quand ton problème est réglé.\n-# 🛟 Pour ouvrir un ticket : ${channelMention(guild, 'ticket_panel', '#ouvrir-un-ticket')}`,
          WAVE,
          '-# Une commande ne marche pas ? Ouvre un ticket, l’équipage s’en occupe ! 🚤',
        ),
        color: colors.deep,
        footer: FOOTER,
        timestamp: false,
      }),
    ],
  };
}

module.exports = {
  name: 'guide',
  intents: [GatewayIntentBits.Guilds],
  guidePayload,
  async panels(client, guild, ctx) {
    const channel = findChannel(guild, 'bot_commands');
    if (channel) await ensurePanel(client, channel, guidePayload(guild), { otherBotIds: ctx.otherBotIds(), pin: true });
  },
};
