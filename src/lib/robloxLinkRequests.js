// Demandes de liaison confirmées DANS le jeu : /lier crée une demande, le jeu affiche une fenêtre
// au joueur, qui clique sur l'animal montré sur Discord. Rien à écrire sur son profil Roblox.
// L'animal à choisir empêche d'accepter à l'aveugle une demande lancée par quelqu'un d'autre.

const crypto = require('node:crypto');

const REQUEST_TTL_MS = 15 * 60 * 1000;
const PLAYER_TTL_MS = 30 * 60 * 1000;
const ANIMALS = ['🐙', '🦀', '🐢', '🐬', '🦈', '🐳', '🐡', '🦑', '🦞', '🐠', '🦭', '🐚'];

const requests = new Map(); // robloxId -> demande
const recentPlayers = new Map(); // robloxId -> { userId, pseudo, affichage, seenAt }
const listeners = new Set();

const pick = (list, count) => [...list].sort(() => Math.random() - 0.5).slice(0, count);

function purge() {
  const now = Date.now();
  for (const [robloxId, request] of requests) if (request.expires < now) requests.delete(robloxId);
  for (const [robloxId, player] of recentPlayers) if (now - player.seenAt > PLAYER_TTL_MS) recentPlayers.delete(robloxId);
}

// Une seule demande en cours par membre Discord et par compte Roblox.
function create({ discordId, discordName, account }) {
  purge();
  for (const [robloxId, request] of requests) if (request.discordId === discordId) requests.delete(robloxId);
  const choices = pick(ANIMALS, 3);
  const request = {
    id: crypto.randomBytes(6).toString('hex'),
    discordId,
    discordName,
    account,
    answer: choices[Math.floor(Math.random() * choices.length)],
    choices,
    expires: Date.now() + REQUEST_TTL_MS,
  };
  requests.set(String(account.id), request);
  return request;
}

function cancelFor(discordId) {
  for (const [robloxId, request] of requests) if (request.discordId === discordId) requests.delete(robloxId);
}

const getFor = (discordId) => [...requests.values()].find((r) => r.discordId === discordId && r.expires > Date.now()) ?? null;

// Appelé par les serveurs du jeu avec la liste de leurs joueurs.
function pendingFor(players) {
  purge();
  const now = Date.now();
  const out = [];
  for (const raw of players) {
    const userId = Number(raw?.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) continue;
    recentPlayers.set(String(userId), {
      userId,
      pseudo: String(raw.pseudo ?? '').slice(0, 32),
      affichage: String(raw.affichage ?? raw.pseudo ?? '').slice(0, 40),
      seenAt: now,
    });
    const request = requests.get(String(userId));
    if (request) {
      out.push({ id: request.id, userId, discord: request.discordName, choix: request.choices, expireDans: Math.round((request.expires - now) / 1000) });
    }
  }
  return out;
}

// → { status: 'ok' | 'mauvais' | 'refuse' | 'deja' | 'expire', request }
// `taken(request)` : vrai si le compte Roblox est déjà relié à un autre membre.
async function confirm({ userId, id, choice, refuse = false, pseudo, affichage, taken }) {
  purge();
  const request = requests.get(String(userId));
  if (!request || request.id !== id) return { status: 'expire', request: null };
  requests.delete(String(userId));
  if (pseudo) request.account = { ...request.account, name: String(pseudo).slice(0, 32), displayName: String(affichage || pseudo).slice(0, 40) };
  let status = 'ok';
  if (refuse) status = 'refuse';
  else if (choice !== request.answer) status = 'mauvais';
  else if (taken && await taken(request)) status = 'deja';
  for (const listener of listeners) await Promise.resolve(listener(status, request)).catch((e) => console.error('[roblox] liaison', e));
  return { status, request };
}

const onResult = (listener) => listeners.add(listener);

// Joueurs vus en jeu récemment dont le pseudo ou le nom d'affichage contient `query`.
function searchPlayers(query, limit = 25) {
  purge();
  const q = String(query ?? '').toLowerCase();
  return [...recentPlayers.values()]
    .filter((p) => !q || p.pseudo.toLowerCase().includes(q) || p.affichage.toLowerCase().includes(q))
    .sort((a, b) => b.seenAt - a.seenAt)
    .slice(0, limit);
}

const recentPlayer = (robloxId) => recentPlayers.get(String(robloxId)) ?? null;

module.exports = { create, cancelFor, getFor, pendingFor, confirm, onResult, searchPlayers, recentPlayer, notePlayers: pendingFor };
