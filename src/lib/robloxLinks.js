// Comptes Roblox reliés et vérifiés (/lier), et récompenses de rôles liées au jeu.
// Rangé dans guild_config : « roblox:lien:<discordId> », « roblox:compte:<robloxId> », « roblox:recompenses ».

const crypto = require('node:crypto');
const config = require('../config');
const db = require('./db');

const KEY = {
  link: (discordId) => `roblox:lien:${discordId}`,
  account: (robloxId) => `roblox:compte:${robloxId}`,
  rewards: 'roblox:recompenses',
};
const cache = new Map(); // discordId -> lien (ou null)

async function get(discordId) {
  if (cache.has(discordId)) return cache.get(discordId);
  const value = await db.guildConfig.get(config.guildId, KEY.link(discordId)).catch(() => null);
  cache.set(discordId, value ?? null);
  return value ?? null;
}

const ownerOf = (robloxId) => db.guildConfig.get(config.guildId, KEY.account(robloxId)).catch(() => null);

async function set(discordId, account) {
  const previous = await get(discordId);
  if (previous && String(previous.id) !== String(account.id)) await db.guildConfig.remove(config.guildId, KEY.account(previous.id));
  const value = { id: account.id, name: account.name, displayName: account.displayName, verified: true, linkedAt: new Date().toISOString() };
  await db.guildConfig.set(config.guildId, KEY.link(discordId), value);
  await db.guildConfig.set(config.guildId, KEY.account(account.id), discordId);
  cache.set(discordId, value);
  return value;
}

async function remove(discordId) {
  const previous = await get(discordId);
  if (!previous) return null;
  await db.guildConfig.remove(config.guildId, KEY.link(discordId));
  await db.guildConfig.remove(config.guildId, KEY.account(previous.id));
  cache.set(discordId, null);
  return previous;
}

async function list() {
  const rows = await db.guildConfig.list(config.guildId, 'roblox:lien:');
  return rows.map((r) => ({ discordId: r.key.slice('roblox:lien:'.length), ...r.value }));
}

// ───────── Récompenses : badge / game pass possédé, ou nombre d'espèces à l'index du jeu ─────────

async function rewards() {
  const value = await db.guildConfig.get(config.guildId, KEY.rewards).catch(() => null);
  return Array.isArray(value) ? value : [];
}

async function addReward({ type, value, roleId, label }) {
  const all = await rewards();
  const reward = { id: crypto.randomBytes(3).toString('hex'), type, value: String(value), roleId, label };
  const next = [...all.filter((r) => !(r.type === type && r.value === String(value) && r.roleId === roleId)), reward];
  await db.guildConfig.set(config.guildId, KEY.rewards, next);
  return reward;
}

async function removeReward(id) {
  const all = await rewards();
  const removed = all.find((r) => r.id === id);
  if (removed) await db.guildConfig.set(config.guildId, KEY.rewards, all.filter((r) => r.id !== id));
  return removed ?? null;
}

module.exports = { get, ownerOf, set, remove, list, rewards, addReward, removeReward };
