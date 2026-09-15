// npm run check — vérifie les tokens, la présence sur le serveur, les intents et Supabase.

const config = require('../config');
const db = require('../lib/db');

const API = 'https://discord.com/api/v10';
const FLAGS = { members: (1 << 14) | (1 << 15), content: (1 << 18) | (1 << 19) };

async function checkBot(group, { token }) {
  if (!token) {
    console.log(`➖ ${group} : pas de token → modules hébergés par un autre bot`);
    return;
  }
  const headers = { Authorization: `Bot ${token}` };
  const me = await fetch(`${API}/users/@me`, { headers });
  if (!me.ok) {
    console.log(`❌ ${group} : token invalide (${me.status})`);
    return;
  }
  const user = await me.json();
  const app = await (await fetch(`${API}/applications/@me`, { headers })).json();
  const guilds = await (await fetch(`${API}/users/@me/guilds`, { headers })).json();
  const inGuild = guilds.find((g) => g.id === config.guildId);
  const admin = inGuild && (BigInt(inGuild.permissions) & 8n) === 8n;
  console.log(`${inGuild ? '✅' : '❌'} ${group} : ${user.username} (${user.id})`);
  console.log(`   Sur le serveur : ${inGuild ? 'oui' : 'NON'}${inGuild ? ` ・ Administrateur : ${admin ? 'oui' : 'non'}` : ''}`);
  console.log(`   Intent Server Members : ${app.flags & FLAGS.members ? 'activé' : 'DÉSACTIVÉ'} ・ Intent Message Content : ${app.flags & FLAGS.content ? 'activé' : 'DÉSACTIVÉ'}`);
  if (!inGuild) console.log(`   Invitation : https://discord.com/oauth2/authorize?client_id=${user.id}&permissions=8&scope=bot%20applications.commands`);
}

(async () => {
  console.log(`🌊 Serveur cible : ${config.guildId || 'NON DÉFINI'}\n`);
  for (const [group, bot] of Object.entries(config.bots)) await checkBot(group, bot);
  console.log('');
  await db.init();
  console.log(`Base : ${JSON.stringify(db.status())}`);
})();
