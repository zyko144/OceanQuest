// Boutique à doublons : catalogue, inventaires (guild_config « boutique:inventaire:<id> ») et achats.

const config = require('../config');
const db = require('./db');

const CATEGORIES = {
  rod: { label: '🎣 Cannes à pêche', hint: 'Permanentes : la meilleure est utilisée automatiquement.' },
  bait: { label: '🪱 Appâts', hint: 'Un appât par lancer, le plus puissant d’abord.' },
  net: { label: '🥅 Filets', hint: 'Un filet est utilisé seulement quand il t’évite un déchet.' },
  color: { label: '🎨 Couleurs de pseudo', hint: 'Permanentes : choisis ta couleur dans /inventaire.' },
};

// cooldown : multiplicateur du temps d'attente ; boost : multiplicateurs de rareté.
const ITEMS = [
  { id: 'rod_reinforced', category: 'rod', emoji: '🪝', name: 'Canne renforcée', price: 750, cooldown: 0.8, boost: {},
    effect: 'Attente entre deux lancers **-20 %**' },
  { id: 'rod_captain', category: 'rod', emoji: '⚓', name: 'Canne de capitaine', price: 3000, cooldown: 0.65, boost: { rare: 1.15, epique: 1.15 },
    effect: 'Attente **-35 %** ・ un peu plus de Rares et Épiques' },
  { id: 'rod_trident', category: 'rod', emoji: '🔱', name: 'Trident de Poséidon', price: 15000, cooldown: 0.5,
    boost: { rare: 1.25, epique: 1.25, legendaire: 1.25, mythique: 1.25 }, effect: 'Attente **-50 %** ・ toutes les raretés boostées' },

  { id: 'bait_worm', category: 'bait', emoji: '🪱', name: 'Vers de terre', price: 200, quantity: 10, boost: { rare: 1.5, epique: 1.3 },
    effect: 'Plus de **Rares** et d’**Épiques**' },
  { id: 'bait_shrimp', category: 'bait', emoji: '🦐', name: 'Crevettes dorées', price: 800, quantity: 5, boost: { epique: 2, legendaire: 1.5 },
    effect: '**×2 Épiques** ・ plus de Légendaires' },
  { id: 'bait_abyssal', category: 'bait', emoji: '✨', name: 'Appâts abyssaux', price: 2500, quantity: 3, boost: { legendaire: 3, mythique: 3 },
    effect: '**×3 Légendaires et Mythiques**' },

  { id: 'net', category: 'net', emoji: '🥅', name: 'Filets anti-bottes', price: 300, quantity: 20, effect: 'Plus jamais de vieille botte 👢' },

  { id: 'color_coral', category: 'color', emoji: '🪸', name: 'Couleur Corail', price: 5000, role: 'color_coral', effect: 'Pseudo couleur corail' },
  { id: 'color_lagoon', category: 'color', emoji: '🏝️', name: 'Couleur Lagon', price: 5000, role: 'color_lagoon', effect: 'Pseudo couleur lagon' },
  { id: 'color_abyss', category: 'color', emoji: '🌌', name: 'Couleur Abysses', price: 5000, role: 'color_abyss', effect: 'Pseudo couleur abysses' },
  { id: 'color_gold', category: 'color', emoji: '🏴‍☠️', name: 'Couleur Or des Pirates', price: 8000, role: 'color_gold', effect: 'Pseudo doré de pirate' },
];
const BAIT_ORDER = ['bait_abyssal', 'bait_shrimp', 'bait_worm'];

const itemById = (id) => ITEMS.find((i) => i.id === id) ?? null;
const key = (userId) => `boutique:inventaire:${userId}`;
const locks = new Set();
const fr = (n) => Number(n ?? 0).toLocaleString('fr-FR');

const emptyInventory = () => ({ rods: [], baits: {}, nets: 0, colors: [], color: null });

async function getInventory(userId) {
  const value = await db.guildConfig.get(config.guildId, key(userId)).catch(() => null);
  return { ...emptyInventory(), ...(value ?? {}), baits: { ...(value?.baits ?? {}) } };
}

const saveInventory = (userId, inventory) => db.guildConfig.set(config.guildId, key(userId), inventory);

function bestRod(inventory) {
  const owned = ITEMS.filter((i) => i.category === 'rod' && inventory.rods.includes(i.id));
  return owned.sort((a, b) => a.cooldown - b.cooldown)[0] ?? { id: 'rod_bamboo', emoji: '🎋', name: 'Canne en bambou', cooldown: 1, boost: {} };
}

function owns(inventory, item) {
  if (item.category === 'rod') return inventory.rods.includes(item.id);
  if (item.category === 'color') return inventory.colors.includes(item.id);
  return false;
}

// Achat : vérifie le solde, débite les doublons et range l'objet. → { ok, error?, fisher, inventory }
async function buy(guildId, userId, itemId) {
  const item = itemById(itemId);
  if (!item) return { ok: false, error: 'Cet objet n’existe pas.' };
  if (locks.has(userId)) return { ok: false, error: 'Un achat est déjà en cours, patiente une seconde.' };
  locks.add(userId);
  try {
    const [fisher, inventory] = await Promise.all([db.fishers.get(guildId, userId), getInventory(userId)]);
    if (owns(inventory, item)) return { ok: false, error: 'Tu possèdes déjà cet objet.' };
    if ((fisher.coins ?? 0) < item.price) {
      return { ok: false, error: `Il te manque **🪙 ${fr(item.price - (fisher.coins ?? 0))}** doublons. Va pêcher avec \`/pecher\` !` };
    }
    fisher.coins -= item.price;
    if (item.category === 'rod') inventory.rods.push(item.id);
    if (item.category === 'bait') inventory.baits[item.id] = (inventory.baits[item.id] ?? 0) + item.quantity;
    if (item.category === 'net') inventory.nets += item.quantity;
    if (item.category === 'color') {
      inventory.colors.push(item.id);
      inventory.color = item.id;
    }
    await db.fishers.save(fisher);
    await saveInventory(userId, inventory);
    await db.guildConfig.set(guildId, `boutique:achat:${Date.now()}:${userId}`, { userId, itemId: item.id, price: item.price, at: new Date().toISOString() }).catch(() => null);
    return { ok: true, item, fisher, inventory };
  } finally {
    locks.delete(userId);
  }
}

// Effets pour un lancer : canne + meilleur appât disponible. `consume()` décompte ce qui a servi.
function fishingModifiers(inventory) {
  const rod = bestRod(inventory);
  const baitId = BAIT_ORDER.find((id) => (inventory.baits[id] ?? 0) > 0) ?? null;
  const bait = baitId ? itemById(baitId) : null;
  const boost = { ...rod.boost };
  for (const [rarity, mult] of Object.entries(bait?.boost ?? {})) boost[rarity] = (boost[rarity] ?? 1) * mult;
  return { rod, bait, boost, hasNet: inventory.nets > 0 };
}

async function recentPurchases(limit = 30) {
  const rows = await db.guildConfig.list(config.guildId, 'boutique:achat:', limit);
  return rows.map((r) => ({ ...r.value, item: itemById(r.value?.itemId) }));
}

module.exports = {
  CATEGORIES, ITEMS, itemById, getInventory, saveInventory, bestRod, owns, buy, fishingModifiers, recentPurchases, fr,
};
