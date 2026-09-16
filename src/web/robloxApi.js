// API appelée par les serveurs du jeu Roblox (en-tête X-Ocean-Secret) pour la liaison Discord.
//   POST /roblox/lien/attente   { joueurs: [{ userId, pseudo, affichage }] } → { demandes: [...] }
//   POST /roblox/lien/confirmer { id, userId, choix | refus, pseudo, affichage } → { resultat, message }
//   GET  /roblox/lien/<userId>  → { relie: true | false }

const aquariumStore = require('../lib/aquariumStore');
const robloxGame = require('../lib/robloxGame');
const robloxLinks = require('../lib/robloxLinks');
const requests = require('../lib/robloxLinkRequests');

const MAX_BODY = 64 * 1024;
const MESSAGES = {
  ok: '✅ Ton compte Discord est relié ! Tu peux fermer cette fenêtre.',
  mauvais: '❌ Ce n’est pas le bon animal. Recommence /lier sur Discord.',
  refuse: '🚫 Demande refusée. Personne ne pourra relier ton compte sans toi.',
  deja: '⚠️ Ce compte Roblox est déjà relié à un autre Discord. Ouvre un ticket si c’est une erreur.',
  expire: '⌛ Cette demande a expiré. Recommence /lier sur Discord.',
};

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('trop gros');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handle(req, res) {
  await aquariumStore.ensureSecret().catch(() => null);
  if (!aquariumStore.sameSecret(req.headers['x-ocean-secret'])) return reply(res, 401, { erreur: 'clé invalide' });
  robloxGame.notePlaceId(req.headers['roblox-id']).catch(() => null);
  const path = req.url.split('?')[0];

  if (req.method === 'POST' && path === '/roblox/lien/attente') {
    const body = await readJson(req).catch(() => null);
    if (!body) return reply(res, 400, { erreur: 'JSON invalide' });
    const players = Array.isArray(body.joueurs) ? body.joueurs.slice(0, 100) : [];
    return reply(res, 200, { demandes: requests.pendingFor(players) });
  }

  if (req.method === 'POST' && path === '/roblox/lien/confirmer') {
    const body = await readJson(req).catch(() => null);
    if (!body?.id || !Number.isSafeInteger(Number(body.userId))) return reply(res, 400, { erreur: 'requête invalide' });
    const { status } = await requests.confirm({
      userId: Number(body.userId), id: String(body.id), choice: String(body.choix ?? ''), refuse: body.refus === true,
      pseudo: body.pseudo, affichage: body.affichage,
      taken: async (request) => {
        const owner = await robloxLinks.ownerOf(request.account.id);
        return Boolean(owner && owner !== request.discordId);
      },
    });
    return reply(res, 200, { resultat: status, message: MESSAGES[status] });
  }

  if (req.method === 'GET') {
    const robloxId = path.split('/').pop();
    if (!/^\d{1,20}$/.test(robloxId)) return reply(res, 400, { erreur: 'identifiant Roblox invalide' });
    return reply(res, 200, { relie: Boolean(await robloxLinks.ownerOf(robloxId)) });
  }
  return reply(res, 404, { erreur: 'route inconnue' });
}

module.exports = { handle };
