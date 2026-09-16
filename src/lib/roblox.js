// API publiques de Roblox (sans compte) : pseudo → compte, photo d'avatar, images d'assets.
// Chaque appel a un délai court : Discord n'attend que 3 s avant l'accusé de réception.

const { loadImage } = require('@napi-rs/canvas');

async function getJson(url, { method = 'GET', body, timeoutMs = 2500 } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Roblox ${res.status} sur ${new URL(url).pathname}`);
  return res.json();
}

// → { id, name, displayName } ou null si le pseudo n'existe pas.
async function userByName(username) {
  const data = await getJson('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    body: { usernames: [username], excludeBannedUsers: true },
    timeoutMs: 2000,
  });
  const user = data?.data?.[0];
  return user ? { id: user.id, name: user.name, displayName: user.displayName || user.name } : null;
}

async function loadRemoteImage(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`image ${res.status}`);
  return loadImage(Buffer.from(await res.arrayBuffer()));
}

// Photo d'avatar du joueur, ou null (l'aquarium s'en passe très bien).
async function headshot(userId, timeoutMs = 3000) {
  try {
    const data = await getJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`, { timeoutMs });
    const url = data?.data?.[0]?.imageUrl;
    return url ? await loadRemoteImage(url, timeoutMs) : null;
  } catch {
    return null;
  }
}

// Images d'assets (décalcomanies, icônes du jeu) → Map(assetId → Image). Les absentes sont ignorées.
async function assetImages(assetIds, timeoutMs = 3000) {
  const ids = [...new Set(assetIds.filter(Boolean).map(String))];
  const images = new Map();
  if (!ids.length) return images;
  try {
    const data = await getJson(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`, { timeoutMs });
    await Promise.all((data?.data ?? []).map(async (item) => {
      if (item.state !== 'Completed' || !item.imageUrl) return;
      const image = await loadRemoteImage(item.imageUrl, timeoutMs).catch(() => null);
      if (image) images.set(String(item.targetId), image);
    }));
  } catch {
    // Pas d'image : les poissons sont dessinés.
  }
  return images;
}

// ───────── Profils, jeu, badges et game pass ─────────

// → { id, name, displayName, description, created } ou null.
async function userById(userId, timeoutMs = 4000) {
  try {
    const user = await getJson(`https://users.roblox.com/v1/users/${userId}`, { timeoutMs });
    return { id: user.id, name: user.name, displayName: user.displayName || user.name, description: user.description ?? '', created: user.created };
  } catch (error) {
    if (/ 404 /.test(error.message)) return null;
    throw error;
  }
}

async function headshotUrl(userId, timeoutMs = 3000) {
  const data = await getJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`, { timeoutMs }).catch(() => null);
  return data?.data?.[0]?.imageUrl ?? null;
}

async function universeFromPlace(placeId) {
  const data = await getJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, { timeoutMs: 5000 });
  return data?.universeId ?? null;
}

// → { name, playing, visits, favorites, maxPlayers, created, updated, rootPlaceId } ou null.
async function gameInfo(universeId) {
  const data = await getJson(`https://games.roblox.com/v1/games?universeIds=${universeId}`, { timeoutMs: 5000 });
  const g = data?.data?.[0];
  if (!g) return null;
  return {
    name: g.name, playing: g.playing ?? 0, visits: g.visits ?? 0, favorites: g.favoritedCount ?? 0,
    maxPlayers: g.maxPlayers, created: g.created, updated: g.updated, rootPlaceId: g.rootPlaceId,
  };
}

async function gameImages(universeId) {
  const [thumb, icon] = await Promise.all([
    getJson(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeId}&countPerUniverse=1&size=768x432&format=Png`, { timeoutMs: 5000 }).catch(() => null),
    getJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png`, { timeoutMs: 5000 }).catch(() => null),
  ]);
  return {
    thumbnail: thumb?.data?.[0]?.thumbnails?.[0]?.imageUrl ?? null,
    icon: icon?.data?.[0]?.imageUrl ?? null,
  };
}

const ITEM_TYPES = { gamepass: 'GamePass', badge: 'Badge' };

// Le joueur possède-t-il ce badge / game pass ? (inventaires publics de Roblox)
async function ownsItem(userId, type, itemId) {
  const data = await getJson(`https://inventory.roblox.com/v1/users/${userId}/items/${ITEM_TYPES[type]}/${itemId}`, { timeoutMs: 5000 });
  return Array.isArray(data?.data) && data.data.length > 0;
}

// Nom d'un badge ou d'un game pass, ou null s'il n'existe pas.
async function itemName(type, itemId) {
  try {
    if (type === 'badge') return (await getJson(`https://badges.roblox.com/v1/badges/${itemId}`, { timeoutMs: 5000 }))?.displayName ?? null;
    return (await getJson(`https://apis.roblox.com/game-passes/v1/game-passes/${itemId}/product-info`, { timeoutMs: 5000 }))?.Name ?? null;
  } catch {
    return null;
  }
}

module.exports = {
  userByName, headshot, assetImages, userById, headshotUrl, universeFromPlace, gameInfo, gameImages, ownsItem, itemName,
};
