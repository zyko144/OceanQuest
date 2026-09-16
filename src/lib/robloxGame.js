// Suivi du jeu Ocean Quest sur Roblox : joueurs en ligne, visites, dernière mise à jour.
// Le lieu (placeId) vient de ROBLOX_PLACE_ID, de ROBLOX_GAME_URL, ou de l'en-tête « Roblox-Id »
// que Roblox ajoute quand les serveurs du jeu contactent le bot (voir aquariumStore).

const config = require('../config');
const db = require('./db');
const roblox = require('./roblox');

const KEY = { place: 'roblox:place_id', lastUpdate: 'roblox:derniere_maj' };
const IMAGE_TTL_MS = 60 * 60 * 1000;

const state = {
  placeId: null,
  universeId: null,
  info: null, // { name, playing, visits, favorites, maxPlayers, created, updated }
  images: { thumbnail: null, icon: null },
  imagesAt: 0,
  checkedAt: 0,
  error: null,
};
const listeners = new Set();

const placeFromUrl = (url) => String(url ?? '').match(/games\/(\d+)/)?.[1] ?? null;

async function loadPlaceId() {
  const fromEnv = config.game.placeId || placeFromUrl(config.game.robloxUrl);
  if (fromEnv) {
    state.placeId = String(fromEnv);
    return state.placeId;
  }
  const stored = await db.guildConfig.get(config.guildId, KEY.place).catch(() => null);
  if (stored) state.placeId = String(stored);
  return state.placeId;
}

// Appelé à chaque requête du jeu : le premier contact configure tout automatiquement.
async function notePlaceId(header) {
  const placeId = String(header ?? '').match(/^\d{5,20}$/)?.[0];
  if (!placeId || placeId === state.placeId || config.game.placeId || placeFromUrl(config.game.robloxUrl)) return;
  console.log(`[roblox] jeu détecté automatiquement (lieu ${placeId})`);
  state.placeId = placeId;
  state.universeId = null;
  state.imagesAt = 0;
  await db.guildConfig.set(config.guildId, KEY.place, placeId).catch(() => null);
  refresh().catch(() => null);
}

async function refresh() {
  if (!state.placeId) await loadPlaceId();
  if (!state.placeId) return null;
  try {
    if (!state.universeId) state.universeId = await roblox.universeFromPlace(state.placeId);
    if (!state.universeId) throw new Error('lieu Roblox introuvable');
    const info = await roblox.gameInfo(state.universeId);
    if (!info) throw new Error('jeu introuvable');
    if (Date.now() - state.imagesAt > IMAGE_TTL_MS || info.updated !== state.info?.updated) {
      state.images = await roblox.gameImages(state.universeId);
      state.imagesAt = Date.now();
    }
    state.info = info;
    state.checkedAt = Date.now();
    state.error = null;
    for (const listener of listeners) await Promise.resolve(listener(getStatus())).catch((e) => console.error('[roblox] listener', e));
  } catch (error) {
    state.error = error.message;
  }
  return getStatus();
}

function getStatus() {
  return {
    configured: Boolean(state.placeId),
    placeId: state.placeId,
    universeId: state.universeId,
    info: state.info,
    images: state.images,
    checkedAt: state.checkedAt,
    error: state.error,
    url: gameUrl(),
  };
}

function gameUrl() {
  if (config.game.robloxUrl) return config.game.robloxUrl;
  return state.placeId ? `https://www.roblox.com/games/${state.placeId}` : null;
}

// Mémorise la date de mise à jour déjà annoncée.
const lastAnnounced = () => db.guildConfig.get(config.guildId, KEY.lastUpdate).catch(() => null);
const setLastAnnounced = (value) => db.guildConfig.set(config.guildId, KEY.lastUpdate, value);

const onRefresh = (listener) => listeners.add(listener);

module.exports = { loadPlaceId, notePlaceId, refresh, getStatus, gameUrl, lastAnnounced, setLastAnnounced, onRefresh };
