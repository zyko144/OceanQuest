require('dotenv').config({ quiet: true });

const env = (key, fallback = '') => (process.env[key] ?? fallback).toString().trim();
const num = (key, fallback) => {
  const raw = env(key);
  const value = Number(raw);
  return raw !== '' && Number.isFinite(value) ? value : fallback;
};
const bool = (key, fallback) => {
  const raw = env(key).toLowerCase();
  if (raw === '') return fallback;
  return ['1', 'true', 'yes', 'oui', 'on'].includes(raw);
};
const list = (key) => env(key).split(',').map((s) => s.trim()).filter(Boolean);

module.exports = {
  guildId: env('DISCORD_GUILD_ID'),

  // Chaque groupe de modules tourne sur son propre bot si un token est fourni,
  // sinon il est hébergé par un autre bot disponible (ticket > main > security).
  bots: {
    ticket: { token: env('TICKET_BOT_TOKEN'), name: env('TICKET_BOT_NAME', 'Ocean Ticket') },
    security: { token: env('SECURITY_BOT_TOKEN'), name: env('SECURITY_BOT_NAME', 'Ocean Guard') },
    main: { token: env('MAIN_BOT_TOKEN'), name: env('MAIN_BOT_NAME', 'Ocean Quest') },
  },
  syncBotNames: bool('SYNC_BOT_NAMES', true),
  autoPanels: bool('AUTO_PANELS', true),
  setupOnStart: bool('SETUP_ON_START', false),

  supabase: {
    url: env('SUPABASE_URL'),
    key: env('SUPABASE_KEY'),
  },

  web: {
    port: num('PORT', 3000),
    publicUrl: (env('PUBLIC_URL') || env('RENDER_EXTERNAL_URL')).replace(/\/+$/, ''),
    keepAlive: bool('KEEP_ALIVE', true),
  },

  game: {
    name: env('GAME_NAME', 'Ocean Quest'),
    robloxUrl: env('ROBLOX_GAME_URL'),
    groupUrl: env('ROBLOX_GROUP_URL'),
  },

  tickets: {
    maxOpenPerUser: num('TICKET_MAX_OPEN', 2),
    deleteDelaySec: num('TICKET_DELETE_DELAY_SEC', 5),
  },

  security: {
    minAccountAgeDays: num('MIN_ACCOUNT_AGE_DAYS', 3),
    raidJoinThreshold: num('RAID_JOIN_THRESHOLD', 8),
    raidJoinWindowSec: num('RAID_JOIN_WINDOW_SEC', 20),
    raidDurationMin: num('RAID_DURATION_MIN', 10),
    spamMessageLimit: num('SPAM_MESSAGE_LIMIT', 6),
    spamWindowSec: num('SPAM_WINDOW_SEC', 5),
    spamTimeoutMin: num('SPAM_TIMEOUT_MIN', 10),
    maxMentions: num('MAX_MENTIONS', 5),
    blockInvites: bool('BLOCK_INVITES', true),
    blockScamLinks: bool('BLOCK_SCAM_LINKS', true),
    antiNukeThreshold: num('ANTINUKE_THRESHOLD', 3),
    antiNukeWindowSec: num('ANTINUKE_WINDOW_SEC', 60),
    whitelist: list('SECURITY_WHITELIST'),
  },

  levels: {
    xpMin: num('XP_MIN', 15),
    xpMax: num('XP_MAX', 25),
    cooldownSec: num('XP_COOLDOWN_SEC', 60),
  },

  fishing: {
    cooldownSec: num('FISHING_COOLDOWN_SEC', 30),
  },
};
