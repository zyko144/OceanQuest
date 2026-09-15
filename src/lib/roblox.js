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

module.exports = { userByName, headshot, assetImages };
