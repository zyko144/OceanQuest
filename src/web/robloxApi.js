// GET /roblox/lien/<robloxId> — appelé par les serveurs du jeu (en-tête X-Ocean-Secret) pour savoir
// si un joueur a relié et vérifié son compte Discord avec /lier (ex. : donner une récompense en jeu).

const aquariumStore = require('../lib/aquariumStore');
const robloxGame = require('../lib/robloxGame');
const robloxLinks = require('../lib/robloxLinks');

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleLinkStatus(req, res) {
  if (req.method !== 'GET') return reply(res, 405, { erreur: 'GET uniquement' });
  await aquariumStore.ensureSecret().catch(() => null);
  if (!aquariumStore.sameSecret(req.headers['x-ocean-secret'])) return reply(res, 401, { erreur: 'clé invalide' });
  robloxGame.notePlaceId(req.headers['roblox-id']).catch(() => null);

  const robloxId = req.url.split('?')[0].split('/').pop();
  if (!/^\d{1,20}$/.test(robloxId)) return reply(res, 400, { erreur: 'identifiant Roblox invalide' });
  const discordId = await robloxLinks.ownerOf(robloxId);
  return reply(res, 200, { relie: Boolean(discordId) });
}

module.exports = { handleLinkStatus };
