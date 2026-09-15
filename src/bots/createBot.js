const { Client, GatewayIntentBits, Partials, Events, ActivityType, Guild } = require('discord.js');
const config = require('../config');
const { getMainGuild, loadStoredIds } = require('../lib/guild');
const { safeReply } = require('../lib/util');
const { fail } = require('../lib/embeds');
const { syncAvatar } = require('./avatar');

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

const compact = (name) => String(name ?? '').toLowerCase().replace(/\s+/g, '');

// Un groupe hébergé en secours (sans token ici) est désactivé si son vrai bot est déjà
// sur le serveur : il tourne ailleurs (Render) et on éviterait les messages en double.
async function disableHostedGroups(client, bot, guild) {
  for (const group of bot.groups.filter((g) => !bot.ownGroups.includes(g))) {
    const name = config.bots[group].name;
    const found = await guild.members.search({ query: name.split(' ')[0], limit: 20 }).catch(() => null);
    const dedicated = found?.find((m) => m.user.bot && m.id !== client.user.id && compact(m.user.username) === compact(name));
    if (dedicated) {
      bot.disabledGroups.add(group);
      console.warn(`[${bot.label}] ${name} est déjà sur le serveur → modules « ${group} » désactivés ici pour éviter les doublons.`);
    }
  }
}

function wire(client, bot, ctx) {
  const commands = new Map();
  const components = new Map();
  const active = (mod) => !bot.disabledGroups.has(bot.moduleGroup.get(mod));

  for (const mod of bot.modules) {
    for (const command of mod.commands ?? []) commands.set(command.data.name, { ...command, mod });
    for (const [prefix, handler] of Object.entries(mod.components ?? {})) components.set(prefix, { handler, mod });
    for (const [event, handler] of Object.entries(mod.events ?? {})) {
      client.on(event, (...args) => {
        if (!bot.ready || !active(mod)) return;
        const guildId = eventGuildId(args);
        if (config.guildId && guildId && guildId !== config.guildId) return;
        Promise.resolve(handler(...args, ctx)).catch((error) => console.error(`[${bot.label}:${mod.name}] ${event}`, error));
      });
    }
  }

  client.on(Events.InteractionCreate, async (interaction) => {
    if (config.guildId && interaction.guildId && interaction.guildId !== config.guildId) return;
    try {
      if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
        const command = commands.get(interaction.commandName);
        if (!command || !active(command.mod)) return;
        if (interaction.isAutocomplete()) await command.autocomplete?.(interaction, ctx);
        else await command.execute(interaction, ctx);
      } else if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        const [prefix, ...args] = interaction.customId.split(':');
        const component = components.get(prefix);
        if (component && active(component.mod)) await component.handler(interaction, args, ctx);
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
    await disableHostedGroups(client, bot, guild);
    await syncAvatar(client, bot.ownGroups[0], bot.label);

    const body = [...commands.values()].filter((c) => active(c.mod)).map((c) => c.data.toJSON());
    await guild.commands.set(body)
      .then(() => console.log(`[${bot.label}] ${body.length} commandes slash enregistrées`))
      .catch((e) => console.error(`[${bot.label}] enregistrement des commandes :`, e.message));

    for (const mod of bot.modules.filter(active)) {
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
