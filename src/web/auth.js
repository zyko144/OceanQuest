// Connexion au tableau de bord par lien magique : /tableau-de-bord donne un lien signé valable
// 5 minutes et utilisable une seule fois, qui ouvre une session de 12 h (cookie signé).
// Le statut staff est revérifié sur Discord à chaque visite.

const crypto = require('node:crypto');
const config = require('../config');
const db = require('../lib/db');

const LINK_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'oq_session';

let secret = null;
const usedNonces = new Map(); // nonce -> expiration

async function getSecret() {
  if (secret) return secret;
  const stored = await db.guildConfig.get(config.guildId, 'dashboard:secret').catch(() => null);
  if (typeof stored === 'string' && stored.length >= 32) {
    secret = stored;
  } else {
    secret = crypto.randomBytes(48).toString('base64url');
    await db.guildConfig.set(config.guildId, 'dashboard:secret', secret);
  }
  return secret;
}

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function verify(token) {
  const [data, signature] = String(token ?? '').split('.');
  if (!data || !signature || !secret) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

async function createLoginLink(discordId) {
  await getSecret();
  const data = b64({ uid: discordId, exp: Date.now() + LINK_TTL_MS, n: crypto.randomBytes(9).toString('base64url'), t: 'lien' });
  return `${config.web.publicUrl}/dashboard/entrer?jeton=${data}.${sign(data)}`;
}

// → identifiant Discord si le lien est valide et jamais utilisé.
async function consumeLoginToken(token) {
  await getSecret();
  const payload = verify(token);
  if (!payload || payload.t !== 'lien' || usedNonces.has(payload.n)) return null;
  usedNonces.set(payload.n, payload.exp);
  for (const [nonce, exp] of usedNonces) if (exp < Date.now()) usedNonces.delete(nonce);
  return payload.uid;
}

async function sessionCookie(discordId) {
  await getSecret();
  const data = b64({ uid: discordId, exp: Date.now() + SESSION_TTL_MS, t: 'session' });
  const secure = config.web.publicUrl.startsWith('https') ? '; Secure' : '';
  return `${COOKIE}=${data}.${sign(data)}; HttpOnly; SameSite=Lax; Path=/dashboard; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/dashboard; Max-Age=0`;

async function sessionUser(req) {
  await getSecret();
  const cookie = String(req.headers.cookie ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  const payload = cookie ? verify(cookie.slice(COOKIE.length + 1)) : null;
  return payload?.t === 'session' ? payload.uid : null;
}

module.exports = { getSecret, createLoginLink, consumeLoginToken, sessionCookie, clearCookie, sessionUser };
