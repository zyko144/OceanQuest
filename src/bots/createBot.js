const { Client, GatewayIntentBits, Partials, Events, ActivityType, Guild } = require('discord.js');
const config = require('../config');
const { getMainGuild, loadStoredIds } = require('../lib/guild');
const { safeReply } = require('../lib/util');
const { fail } = require('../lib/embeds');

const PRIVILEGED = new Set([GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildPresences]);

const PRESENCES = {
  ticket: { name: '🎫 Secours en mer ・ /ticket', type: ActivityType.Custom },
  security: { name: '🛡️ Surveille les côtes', type: ActivityType.Custom },
  main: { name: '🎣 Ocean Quest sur Roblox', type: ActivityType.Custom },
};

// Ignore ce qui ne vient pas du serveur Ocean Quest.
function eventGuildId(args) {
  for (const arg of args) {
    if (arg instanceof Guild) return arg.id;
    const id = arg?.guildId ?? arg?.guild?.id;
    if (id) return id;
  }
  return null;
}

function buildClient(modules, privileged) {
  const intents = new Set([GatewayIntentBits.Guilds]);
  for (const mod of modules) for (const intent of mod.intents ?? []) intents.add(intent);
  const finalIntents = [...intents].filter((i) => privileged || !PRIVILEGED.has(i));
  return new Client({
    intents: finalIntents,
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
    allowedMentions: { parse: ['users'], repliedUser: false },
  });
}

function wire(client, bot, ctx) {
  const commands = new Map();
  const components = new Map();

  for (const mod of bot.modules) {
    for (const command of mod.commands ?? []) commands.set(command.data.name, command);
    for (const [prefix, handler] of Object.entries(mod.components ?? {})) components.set(prefix, handler);
    for (const [event, handler] of Object.entries(mod.events ?? {})) {
      client.on(event, (...args) => {
        const guildId = eventGuildId(args);
        if (config.guildId && guildId && guildId !== config.guildId) return;
        Promise.resolve(handler(...args, ctx)).catch((error) => console.error(`[${bot.label}:${mod.name}] ${event}`, error));
      });
    }
  }

  client.on(Events.InteractionCreate, async (interaction) => {
    if (config.guildId && interaction.guildId && interaction.guildId !== config.guildId) return;
    try {
      if (interaction.isChatInputCommand()) {
        await commands.get(interaction.commandName)?.execute(interaction, ctx);
      } else if (interaction.isAutocomplete()) {
        await commands.get(interaction.commandName)?.autocomplete?.(interaction, ctx);
      } else if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        const [prefix, ...args] = interaction.customId.split(':');
        await components.get(prefix)?.(interaction, args, ctx);
      }
    } catch (error) {
      console.error(`[${bot.label}] interaction ${interaction.customId ?? interaction.commandName}`, error);
      if (!interaction.isAutocomplete()) {
        await safeReply(interaction, { embeds: [fail('Une vague scélérate a emporté ta demande… Réessaie dans un instant.')] });
      }
    }
  });

  client.once(Events.ClientReady, async () => {
    console.log(`[${bot.label}] connecté en tant que ${client.user.tag} (${bot.groups.join(' + ')})`);
    const primary = bot.groups[0];
    client.user.setPresence({ activities: [PRESENCES[primary]], status: 'online' });

    if (config.syncBotNames && bot.name && client.user.username !== bot.name) {
      await client.user.setUsername(bot.name)
        .then(() => console.log(`[${bot.label}] renommé en « ${bot.name} »`))
        .catch((e) => console.warn(`[${bot.label}] renommage impossible : ${e.message}`));
    }

    const guild = await getMainGuild(client);
    if (!guild) {
      console.warn(`[${bot.label}] le bot n'est pas sur le serveur ${config.guildId}. Invite-le : https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`);
      bot.ready = true;
      return;
    }
    await loadStoredIds(guild.id);

    const body = [...commands.values()].map((c) => c.data.toJSON());
    await guild.commands.set(body)
      .then(() => console.log(`[${bot.label}] ${body.length} commandes slash enregistrées`))
      .catch((e) => console.error(`[${bot.label}] enregistrement des commandes :`, e.message));

    for (const mod of bot.modules) {
      await Promise.resolve(mod.onReady?.(client, guild, ctx)).catch((e) => console.error(`[${bot.label}:${mod.name}] onReady`, e));
    }
    bot.ready = true;
  });

  client.on(Events.Error, (error) => console.error(`[${bot.label}] erreur client`, error));
  client.on(Events.ShardDisconnect, () => console.warn(`[${bot.label}] déconnecté du gateway`));
}

async function startBot(bot, ctxFactory) {
  let privileged = true;
  for (;;) {
    const client = buildClient(bot.modules, privileged);
    bot.client = client;
    bot.privileged = privileged;
    const ctx = ctxFactory(bot);
    wire(client, bot, ctx);
    try {
      await client.login(bot.token);
      return bot;
    } catch (error) {
      await client.destroy();
      const disallowed = error.code === 'DisallowedIntents' || /intent/i.test(error.message);
      if (privileged && disallowed) {
        console.warn(`[${bot.label}] Intents privilégiés refusés → active « Server Members Intent » et « Message Content Intent » dans le Developer Portal. Démarrage en mode limité.`);
        privileged = false;
        continue;
      }
      throw error;
    }
  }
}

module.exports = { startBot, PRESENCES };
