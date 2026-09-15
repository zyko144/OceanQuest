const config = require('./config');
const db = require('./lib/db');
const { startWebServer } = require('./web');
const { startBot } = require('./bots/createBot');
const { buildServer } = require('./setup/buildServer');
const { getMainGuild } = require('./lib/guild');

const GROUPS = {
  ticket: { label: 'Ocean Ticket', modules: require('./bots/ticket') },
  security: { label: 'Ocean Guard', modules: require('./bots/security') },
  main: { label: 'Ocean Quest', modules: require('./bots/main') },
};
// Ordre de repli : un groupe sans token est hébergé par le premier bot disponible.
const HOST_ORDER = ['ticket', 'main', 'security'];

const registry = [];

function planBots() {
  const byToken = new Map();
  for (const group of HOST_ORDER) {
    const { token, name } = config.bots[group];
    if (!token) continue;
    if (!byToken.has(token)) byToken.set(token, { token, name, label: GROUPS[group].label, groups: [], modules: [] });
    byToken.get(token).groups.push(group);
  }
  const bots = [...byToken.values()];
  if (!bots.length) throw new Error('Aucun token de bot : renseigne au moins TICKET_BOT_TOKEN dans .env');
  for (const group of HOST_ORDER) {
    if (!bots.some((b) => b.groups.includes(group))) bots[0].groups.push(group);
  }
  for (const bot of bots) bot.modules = bot.groups.flatMap((g) => GROUPS[g].modules);
  return bots;
}

const allBotIds = () => registry.filter((b) => b.client?.user).map((b) => b.client.user.id);

async function refreshPanels() {
  for (const bot of registry) {
    if (!bot.client?.isReady()) continue;
    const guild = await getMainGuild(bot.client);
    if (!guild) continue;
    for (const mod of bot.modules) {
      await Promise.resolve(mod.panels?.(bot.client, guild, bot.ctx)).catch((e) => console.error(`[${bot.label}:${mod.name}] panneaux`, e));
    }
  }
}

async function runSetup(client) {
  const guild = await getMainGuild(client);
  if (!guild) throw new Error('Serveur introuvable');
  const report = await buildServer(guild, { botIds: allBotIds() });
  await refreshPanels();
  return report;
}

function makeCtx(bot) {
  bot.ctx = {
    bot,
    registry,
    otherBotIds: () => allBotIds().filter((id) => id !== bot.client?.user?.id),
    refreshPanels,
    runSetup: () => runSetup(bot.client),
    hosts: (group) => bot.groups.includes(group),
  };
  return bot.ctx;
}

// `npm run panels` : met à jour les panneaux puis s'arrête (sans serveur web).
const PANELS_ONLY = process.argv.includes('--panels');

async function main() {
  if (!PANELS_ONLY) startWebServer(registry);
  await db.init();

  const bots = planBots();
  for (const bot of bots) {
    console.log(`[boot] ${bot.label} → ${bot.groups.join(', ')}`);
    registry.push(bot);
    await startBot(bot, makeCtx);
  }

  // Attend que tous les bots soient prêts avant les panneaux (un bouton appartient au bot qui l'a posté).
  const waitReady = () => new Promise((resolve) => {
    const timer = setInterval(() => {
      if (registry.every((b) => b.ready)) { clearInterval(timer); resolve(); }
    }, 500);
  });
  await waitReady();

  if (PANELS_ONLY) {
    await refreshPanels();
    console.log('[panels] Panneaux mis à jour ✔');
    await shutdown('fin');
    return;
  }

  if (config.setupOnStart) {
    console.log('[boot] SETUP_ON_START → construction du serveur');
    const report = await runSetup(registry[0].client);
    console.log(`[setup] ${report.rolesCreated.length} rôles, ${report.categoriesCreated.length} catégories, ${report.channelsCreated.length} salons créés`);
  } else if (config.autoPanels) {
    await refreshPanels();
  }
  console.log('[boot] Tous les bots sont à flot 🌊');
}

async function shutdown(signal) {
  console.log(`[boot] ${signal} reçu, on jette l'ancre…`);
  await Promise.allSettled(registry.map((b) => b.client?.destroy()));
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => console.error('[unhandledRejection]', error));

main().catch((error) => {
  console.error('[boot] échec du démarrage :', error);
  process.exit(1);
});
