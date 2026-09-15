// Photo de profil des bots : assets/avatars/<ocean-ticket|ocean-guard|ocean-quest>.png
// Envoyée à Discord seulement quand l'image change (empreinte gardée dans Supabase).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../lib/db');

const FILES = { ticket: 'ocean-ticket', security: 'ocean-guard', main: 'ocean-quest' };
const DIR = path.join(__dirname, '..', '..', 'assets', 'avatars');

async function syncAvatar(client, group, label) {
  const file = ['png', 'jpg', 'jpeg', 'gif']
    .map((ext) => path.join(DIR, `${FILES[group]}.${ext}`))
    .find((candidate) => fs.existsSync(candidate));
  if (!file) return;

  const image = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(image).digest('hex').slice(0, 32);
  const key = `avatar:${client.user.id}`;
  if (await db.guildConfig.get(config.guildId, key).catch(() => null) === hash) return;

  try {
    await client.user.setAvatar(image);
    await db.guildConfig.set(config.guildId, key, hash);
    console.log(`[${label}] photo de profil mise à jour (${path.basename(file)})`);
  } catch (error) {
    console.warn(`[${label}] photo de profil non modifiée : ${error.message}`);
  }
}

module.exports = { syncAvatar };
