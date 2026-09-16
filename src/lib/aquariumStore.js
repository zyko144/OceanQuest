// Aquarium IG : les index envoyés par le jeu Roblox, et le lien compte Discord ↔ compte Roblox.
//
// Le jeu (script serveur « AquariumDiscord ») envoie toutes les minutes l'index des joueurs
// en ligne à POST /roblox/aquarium, avec l'en-tête X-Ocean-Secret. Tout est rangé dans
// guild_config (clés « aquarium_ig:… ») : aucune table à créer dans Supabase.

const crypto = require('node:crypto');
const config = require('../config');
const db = require('./db');
const robloxGame = require('./robloxGame');
const robloxLinks = require('./robloxLinks');

const KEY = {
  secret: 'aquarium_ig:secret',
  player: (robloxId) => `aquarium_ig:joueur:${robloxId}`,
  link: (discordId) => `aquarium_ig:lien:${discordId}`,
};
const MAX_BODY = 512 * 1024;
const MAX_PLAYERS = 100;
const MAX_FISHES = 10;
// Un index inchangé n'est réécrit que de temps en temps, pour rafraîchir « vu en jeu ».
const REFRESH_UNCHANGED_MS = 10 * 60 * 1000;

let secret = config.aquarium.secret || null;
const players = new Map(); // robloxId -> index normalisé
const links = new Map(); // discordId -> compte Roblox
const lastWrite = new Map(); // robloxId -> { signature, at }

// Clé partagée avec le jeu : AQUARIUM_SECRET si fourni, sinon créée une fois et gardée en base.
async function ensureSecret() {
  if (secret) return secret;
  const stored = await db.guildConfig.get(config.guildId, KEY.secret).catch(() => null);
  if (typeof stored === 'string' && stored.length >= 32) {
    secret = stored;
    return secret;
  }
  secret = crypto.randomBytes(32).toString('base64url');
  await db.guildConfig.set(config.guildId, KEY.secret, secret);
  console.log('[aquarium] clé du jeu créée et enregistrée (guild_config « aquarium_ig:secret »)');
  return secret;
}

function sameSecret(given) {
  if (!secret || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const text = (value, max) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, max) : '');
const number = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

function assetId(value) {
  const match = String(value ?? '').match(/(\d{3,20})/);
  return match ? match[1] : null;
}

// Valide ce qu'envoie le jeu. Le jeu classe ses poissons ; « rang » (rareté) puis la valeur
// et le poids départagent si l'ordre reçu n'est pas déjà le bon.
function normalizePlayer(raw) {
  const userId = Number(raw?.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const fishes = (Array.isArray(raw.poissons) ? raw.poissons : [])
    .slice(0, 200)
    .map((f, order) => ({
      nom: text(f?.nom, 60),
      rarete: text(f?.rarete, 30),
      couleur: /^#[0-9a-f]{6}$/i.test(f?.couleur ?? '') ? f.couleur : null,
      rang: number(f?.rang),
      poids: number(f?.poids),
      valeur: number(f?.valeur),
      mutation: text(f?.mutation, 30) || null,
      image: assetId(f?.image),
      order,
    }))
    .filter((f) => f.nom)
    .sort((a, b) => (b.rang ?? 0) - (a.rang ?? 0) || (b.valeur ?? 0) - (a.valeur ?? 0) || (b.poids ?? 0) - (a.poids ?? 0) || a.order - b.order)
    .slice(0, MAX_FISHES)
    .map(({ order, ...f }) => f);

  return {
    userId,
    pseudo: text(raw.pseudo, 32),
    affichage: text(raw.affichage, 40) || text(raw.pseudo, 32),
    especes: number(raw.especes),
    totalEspeces: number(raw.totalEspeces),
    poissons: fishes,
  };
}

async function savePlayers(rawPlayers) {
  const now = Date.now();
  let saved = 0;
  for (const raw of rawPlayers.slice(0, MAX_PLAYERS)) {
    const player = normalizePlayer(raw);
    if (!player) continue;
    const signature = JSON.stringify(player);
    const previous = lastWrite.get(player.userId);
    const value = { ...player, vuEnJeu: new Date(now).toISOString() };
    players.set(player.userId, value);
    if (previous?.signature === signature && now - previous.at < REFRESH_UNCHANGED_MS) continue;
    await db.guildConfig.set(config.guildId, KEY.player(player.userId), value);
    lastWrite.set(player.userId, { signature, at: now });
    saved += 1;
  }
  return saved;
}

async function getPlayer(robloxId) {
  if (players.has(robloxId)) return players.get(robloxId);
  const value = await db.guildConfig.get(config.guildId, KEY.player(robloxId)).catch(() => null);
  if (value) players.set(robloxId, value);
  return value;
}

async function getLink(discordId) {
  // Un compte vérifié avec /lier passe avant le pseudo simplement mémorisé.
  const verified = await robloxLinks.get(discordId);
  if (verified) return verified;
  if (links.has(discordId)) return links.get(discordId);
  const value = await db.guildConfig.get(config.guildId, KEY.link(discordId)).catch(() => null);
  if (value) links.set(discordId, value);
  return value;
}

async function setLink(discordId, account) {
  const value = { id: account.id, name: account.name, displayName: account.displayName, linkedAt: new Date().toISOString() };
  links.set(discordId, value);
  await db.guildConfig.set(config.guildId, KEY.link(discordId), value);
  return value;
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// POST /roblox/aquarium — appelé par les serveurs du jeu.
async function handleHttp(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { erreur: 'POST uniquement' });
  if (!secret) await ensureSecret().catch(() => null);
  if (!sameSecret(req.headers['x-ocean-secret'])) return reply(res, 401, { erreur: 'clé invalide' });
  // Roblox ajoute l'ID du lieu à chaque requête de ses serveurs : le jeu se configure tout seul.
  robloxGame.notePlaceId(req.headers['roblox-id']).catch(() => null);

  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) return reply(res, 413, { erreur: 'trop gros' });
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const list = Array.isArray(body?.joueurs) ? body.joueurs : [];
    const saved = await savePlayers(list);
    return reply(res, 200, { recus: list.length, enregistres: saved });
  } catch (error) {
    console.warn('[aquarium] envoi du jeu refusé :', error.message);
    return reply(res, 400, { erreur: 'JSON invalide' });
  }
}

module.exports = { ensureSecret, sameSecret, normalizePlayer, savePlayers, getPlayer, getLink, setLink, handleHttp };
