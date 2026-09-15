// Mini-jeu de pêche Discord : /pecher, /aquarium, /classement.

const { GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const db = require('../../lib/db');
const { findChannel } = require('../../lib/guild');
const { oceanEmbed, colors, fail } = require('../../lib/embeds');
const { ephemeral, sleep, unix } = require('../../lib/util');
const { levelFromXp } = require('./levels');

const RARITIES = {
  commun: { label: 'Commun', emoji: '⚪', weight: 55, color: 0x9e9e9e },
  peu: { label: 'Peu commun', emoji: '🟢', weight: 25, color: 0x4caf50 },
  rare: { label: 'Rare', emoji: '🔵', weight: 12, color: 0x2196f3 },
  epique: { label: 'Épique', emoji: '🟣', weight: 5.5, color: 0x9c27b0 },
  legendaire: { label: 'Légendaire', emoji: '🟡', weight: 2, color: 0xffc107 },
  mythique: { label: 'Mythique', emoji: '🔴', weight: 0.5, color: 0xf44336 },
};
const RARITY_ORDER = Object.keys(RARITIES);

const ZONES = {
  cote: { label: 'La Côte', emoji: '🏖️', level: 0, boost: {} },
  recif: { label: 'Le Récif corallien', emoji: '🪸', level: 5, boost: { rare: 1.4, epique: 1.4, legendaire: 1.2 } },
  large: { label: 'La Haute mer', emoji: '🌊', level: 15, boost: { rare: 1.8, epique: 2, legendaire: 2, mythique: 1.5 } },
  abysses: { label: 'Les Abysses', emoji: '🌑', level: 30, boost: { epique: 3, legendaire: 3.5, mythique: 4 } },
};

// [id, nom, emoji, rareté, zones, kg min, kg max, valeur de base]
const FISH = [
  ['sardine', 'Sardine', '🐟', 'commun', ['cote', 'recif'], 0.05, 0.2, 5],
  ['maquereau', 'Maquereau', '🐟', 'commun', ['cote', 'large'], 0.3, 1.5, 8],
  ['crevette', 'Crevette grise', '🦐', 'commun', ['cote', 'recif'], 0.01, 0.05, 4],
  ['crabe', 'Crabe vert', '🦀', 'commun', ['cote'], 0.1, 0.5, 6],
  ['clown', 'Poisson-clown', '🐠', 'commun', ['recif'], 0.1, 0.3, 6],
  ['hareng', 'Hareng argenté', '🐟', 'commun', ['large'], 0.2, 0.8, 7],
  ['lanterne', 'Poisson-lanterne', '🏮', 'commun', ['abysses'], 0.05, 0.3, 10],
  ['bar', 'Bar de ligne', '🐟', 'peu', ['cote', 'large'], 1, 6, 15],
  ['poulpe', 'Poulpe commun', '🐙', 'peu', ['cote', 'recif'], 1, 8, 18],
  ['chirurgien', 'Poisson-chirurgien bleu', '🐠', 'peu', ['recif'], 0.3, 1, 16],
  ['globe', 'Poisson-globe', '🐡', 'peu', ['recif'], 0.5, 2, 20],
  ['thon', 'Thon rouge', '🐟', 'peu', ['large'], 50, 300, 25],
  ['vipere', 'Poisson-vipère', '🐍', 'peu', ['abysses'], 0.1, 0.5, 24],
  ['homard', 'Homard bleu', '🦞', 'rare', ['cote'], 1, 4, 45],
  ['raie', 'Raie pastenague', '🐟', 'rare', ['recif', 'large'], 10, 60, 55],
  ['tortue', 'Tortue caouanne', '🐢', 'rare', ['recif'], 20, 80, 60],
  ['espadon', 'Espadon', '🗡️', 'rare', ['large'], 50, 400, 70],
  ['calmar', 'Calmar géant', '🦑', 'rare', ['abysses'], 90, 275, 80],
  ['murene', 'Murène émeraude', '🐍', 'epique', ['recif', 'cote'], 5, 25, 130],
  ['marteau', 'Requin-marteau', '🦈', 'epique', ['large'], 100, 450, 150],
  ['marlin', 'Marlin bleu', '🎣', 'epique', ['large'], 90, 600, 170],
  ['baudroie', 'Baudroie abyssale', '🐡', 'epique', ['abysses'], 5, 50, 180],
  ['lune', 'Poisson-lune royal', '🌕', 'legendaire', ['cote', 'recif'], 200, 1000, 450],
  ['hippocampe', 'Hippocampe d’or', '✨', 'legendaire', ['recif'], 0.01, 0.05, 520],
  ['requinblanc', 'Grand requin blanc', '🦈', 'legendaire', ['large', 'abysses'], 400, 1100, 500],
  ['coelacanthe', 'Cœlacanthe', '🦴', 'legendaire', ['abysses'], 60, 90, 600],
  ['tresor', 'Coffre de Davy Jones', '💰', 'mythique', ['cote', 'recif', 'large', 'abysses'], 30, 80, 2000],
  ['leviathan', 'Léviathan des Profondeurs', '🐉', 'mythique', ['abysses', 'large'], 5000, 20000, 2500],
  ['kraken', 'Kraken ancestral', '🦑', 'mythique', ['abysses'], 8000, 30000, 3000],
].map(([id, name, emoji, rarity, zones, min, max, value]) => ({ id, name, emoji, rarity, zones, min, max, value }));

const JUNK = [
  { name: 'Vieille botte', emoji: '👢' }, { name: 'Boîte de conserve', emoji: '🥫' },
  { name: 'Algue gluante', emoji: '🌿' }, { name: 'Chaussette trempée', emoji: '🧦' },
];

const cooldowns = new Map();

function rollCatch(zoneKey) {
  const zone = ZONES[zoneKey];
  if (Math.random() < 0.06) return { junk: JUNK[Math.floor(Math.random() * JUNK.length)] };
  const available = RARITY_ORDER.filter((r) => FISH.some((f) => f.rarity === r && f.zones.includes(zoneKey)));
  const weights = available.map((r) => RARITIES[r].weight * (zone.boost[r] ?? 1));
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
  let rarity = available[0];
  for (const [i, r] of available.entries()) {
    roll -= weights[i];
    if (roll <= 0) { rarity = r; break; }
  }
  const pool = FISH.filter((f) => f.rarity === rarity && f.zones.includes(zoneKey));
  const fish = pool[Math.floor(Math.random() * pool.length)];
  const ratio = Math.random() ** 2; // les petits spécimens sont plus fréquents
  const weight = +(fish.min + (fish.max - fish.min) * ratio).toFixed(fish.max < 1 ? 3 : 1);
  const coins = Math.round(fish.value * (0.75 + ratio * 0.75));
  return { fish, weight, coins, ratio };
}

const formatKg = (kg) => (kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${kg} kg`);

const commands = [
  {
    data: new SlashCommandBuilder().setName('pecher').setDescription('🎣 Lance ta ligne et tente ta chance')
      .addStringOption((o) => o.setName('zone').setDescription('Où pêcher ?')
        .addChoices(...Object.entries(ZONES).map(([value, z]) => ({ name: `${z.emoji} ${z.label}${z.level ? ` (niv. ${z.level})` : ''}`, value })))),
    async execute(interaction) {
      const zoneKey = interaction.options.getString('zone') ?? 'cote';
      const zone = ZONES[zoneKey];
      const { guild, user } = interaction;

      const last = cooldowns.get(user.id) ?? 0;
      const readyAt = last + config.fishing.cooldownSec * 1000;
      if (Date.now() < readyAt) {
        return interaction.reply(ephemeral({ embeds: [fail(`Ta ligne sèche encore… Relance <t:${unix(readyAt)}:R>.`, '⏳ Patience, marin')] }));
      }
      const levelRow = await db.levels.get(guild.id, user.id);
      const { level } = levelFromXp(levelRow.xp);
      if (level < zone.level) {
        return interaction.reply(ephemeral({ embeds: [fail(`${zone.emoji} **${zone.label}** se débloque au **niveau ${zone.level}** (tu es niveau ${level}). Discute sur le serveur pour gagner de l’XP !`, '🔒 Zone verrouillée')] }));
      }
      cooldowns.set(user.id, Date.now());

      await interaction.reply({ embeds: [oceanEmbed({ description: `🎣 ${user} lance sa ligne vers **${zone.emoji} ${zone.label}**…\n〰〰〰〰〰〰 🪝`, color: colors.foam, footer: 'Ocean Quest ・ Pêche' })] });
      await sleep(1800);

      const result = rollCatch(zoneKey);
      const fisher = await db.fishers.get(guild.id, user.id);
      fisher.catches = (fisher.catches ?? 0) + 1;

      if (result.junk) {
        await db.fishers.save(fisher).catch(() => null);
        return interaction.editReply({ embeds: [oceanEmbed({
          title: `${result.junk.emoji} Oups…`,
          description: `${user} remonte… **${result.junk.name}**. La mer a de l’humour. 🙃`,
          color: 0x795548,
          footer: 'Ocean Quest ・ Pêche',
        })] });
      }

      const { fish, weight, coins } = result;
      const rarity = RARITIES[fish.rarity];
      const collection = { ...(fisher.collection ?? {}) };
      const firstTime = !collection[fish.id];
      collection[fish.id] = (collection[fish.id] ?? 0) + 1;
      fisher.collection = collection;
      fisher.coins = (fisher.coins ?? 0) + coins;
      const bestValue = fisher.best_catch?.coins ?? 0;
      const record = coins > bestValue;
      if (record) fisher.best_catch = { id: fish.id, name: fish.name, emoji: fish.emoji, rarity: fish.rarity, weight, coins, at: new Date().toISOString() };
      await db.fishers.save(fisher).catch((e) => console.warn('[fishing]', e.message));

      const badges = [firstTime ? '📖 Nouvelle espèce !' : null, record ? '🏆 Record personnel !' : null].filter(Boolean).join(' ・ ');
      await interaction.editReply({ embeds: [oceanEmbed({
        title: `${fish.emoji} ${fish.name}`,
        description: `${user} a pêché un **${fish.name}** ${rarity.emoji} *${rarity.label}* !${badges ? `\n${badges}` : ''}`,
        color: rarity.color,
        fields: [
          { name: 'Poids', value: formatKg(weight), inline: true },
          { name: 'Valeur', value: `🪙 ${coins} doublons`, inline: true },
          { name: 'Bourse', value: `🪙 ${fisher.coins}`, inline: true },
        ],
        footer: `Ocean Quest ・ ${zone.emoji} ${zone.label}`,
      })] });

      if (['legendaire', 'mythique'].includes(fish.rarity)) {
        const channel = findChannel(guild, 'rare_catches');
        await channel?.send({ embeds: [oceanEmbed({
          title: `${rarity.emoji} Prise ${rarity.label.toLowerCase()} !`,
          description: `🌊 ${user} vient de remonter **${fish.emoji} ${fish.name}** (${formatKg(weight)}) depuis ${zone.emoji} ${zone.label} !`,
          color: rarity.color,
          thumbnail: user.displayAvatarURL({ size: 128 }),
          footer: 'Ocean Quest ・ Prises rares',
        })] }).catch(() => null);
      }
      return null;
    },
  },
  {
    data: new SlashCommandBuilder().setName('aquarium').setDescription('🐠 Voir ta collection de poissons')
      .addUserOption((o) => o.setName('membre').setDescription('Voir l’aquarium d’un autre marin')),
    async execute(interaction) {
      const user = interaction.options.getUser('membre') ?? interaction.user;
      const fisher = await db.fishers.get(interaction.guild.id, user.id);
      const collection = fisher.collection ?? {};
      const byRarity = RARITY_ORDER.map((r) => {
        const species = FISH.filter((f) => f.rarity === r);
        const owned = species.filter((f) => collection[f.id]);
        return `${RARITIES[r].emoji} **${RARITIES[r].label}** : ${owned.length}/${species.length} ${owned.map((f) => f.emoji).join('')}`;
      });
      const best = fisher.best_catch;
      return interaction.reply({ embeds: [oceanEmbed({
        title: `🐠 Aquarium de ${user.displayName ?? user.username}`,
        thumbnail: user.displayAvatarURL({ size: 256 }),
        color: colors.lagoon,
        description: byRarity.join('\n'),
        fields: [
          { name: 'Prises', value: `${fisher.catches ?? 0}`, inline: true },
          { name: 'Espèces', value: `${Object.keys(collection).length}/${FISH.length}`, inline: true },
          { name: 'Doublons', value: `🪙 ${fisher.coins ?? 0}`, inline: true },
          { name: 'Plus belle prise', value: best ? `${best.emoji} ${best.name} — ${formatKg(best.weight)} (🪙 ${best.coins})` : 'Aucune pour l’instant' },
        ],
        footer: 'Ocean Quest ・ Aquarium',
      })] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('classement').setDescription('🏆 Les meilleurs marins du serveur')
      .addStringOption((o) => o.setName('type').setDescription('Classement à afficher')
        .addChoices({ name: '🎣 Niveaux', value: 'levels' }, { name: '🪙 Doublons', value: 'coins' }, { name: '🐟 Nombre de prises', value: 'catches' })),
    async execute(interaction) {
      const type = interaction.options.getString('type') ?? 'levels';
      const medals = ['🥇', '🥈', '🥉'];
      let lines;
      if (type === 'levels') {
        const rows = await db.levels.top(interaction.guild.id, 10);
        lines = rows.map((r, i) => `${medals[i] ?? `**${i + 1}.**`} <@${r.user_id}> — niveau **${levelFromXp(r.xp).level}** (${r.xp} XP)`);
      } else {
        const rows = await db.fishers.top(interaction.guild.id, type, 10);
        lines = rows.map((r, i) => `${medals[i] ?? `**${i + 1}.**`} <@${r.user_id}> — ${type === 'coins' ? `🪙 **${r.coins}** doublons` : `🐟 **${r.catches}** prises`}`);
      }
      const titles = { levels: '🎣 Classement des niveaux', coins: '🪙 Les plus riches armateurs', catches: '🐟 Les pêcheurs les plus acharnés' };
      return interaction.reply({ embeds: [oceanEmbed({
        title: titles[type],
        description: lines.length ? lines.join('\n') : 'Personne n’a encore pris la mer… sois le premier ! 🌊',
        color: colors.gold,
        footer: 'Ocean Quest ・ Classements',
      })], allowedMentions: { parse: [] } });
    },
  },
];

module.exports = { name: 'fishing', intents: [GatewayIntentBits.Guilds], commands, FISH, RARITIES, ZONES };
