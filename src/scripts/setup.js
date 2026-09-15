// npm run setup — construit le serveur (rôles, catégories, salons) sans lancer les bots.
// Les panneaux (tickets, vérification, rôles…) sont publiés au démarrage des bots (npm start).

const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('../config');
const db = require('../lib/db');
const { buildServer } = require('../setup/buildServer');

async function botId(token) {
  const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` } });
  return res.ok ? (await res.json()).id : null;
}

(async () => {
  await db.init();
  const tokens = [...new Set([config.bots.ticket.token, config.bots.main.token, config.bots.security.token].filter(Boolean))];
  if (!tokens.length) throw new Error('Aucun token de bot dans .env');
  const botIds = (await Promise.all(tokens.map(botId))).filter(Boolean);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const ready = new Promise((resolve) => client.once(Events.ClientReady, resolve));
  await client.login(tokens[0]);
  await ready;
  const guild = await client.guilds.fetch(config.guildId);
  console.log(`⚓ Construction du serveur « ${guild.name} » avec ${client.user.tag}…`);

  const report = await buildServer(guild, { botIds, log: console.log });
  console.log(`\n✅ Terminé : ${report.rolesCreated.length} rôles, ${report.categoriesCreated.length} catégories, ${report.channelsCreated.length} salons créés.`);
  for (const warning of report.warnings) console.warn(`⚠️ ${warning}`);
  await client.destroy();
  process.exit(0);
})().catch((error) => {
  console.error('❌ Setup échoué :', error);
  process.exit(1);
});
