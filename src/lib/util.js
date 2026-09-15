const { MessageFlags } = require('discord.js');
const { findChannel } = require('./guild');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (array) => array[Math.floor(Math.random() * array.length)];
const shuffle = (array) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const unix = (date = Date.now()) => Math.floor(new Date(date).getTime() / 1000);
const truncate = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text ?? '');

// « 10m », « 2h », « 3j », « 1d30m » -> millisecondes
function parseDuration(input) {
  const units = { s: 1e3, m: 6e4, h: 36e5, j: 864e5, d: 864e5, w: 6048e5, sem: 6048e5 };
  const matches = String(input).toLowerCase().replace(/\s+/g, '').matchAll(/(\d+(?:[.,]\d+)?)(sem|s|m|h|j|d|w)/g);
  let total = 0;
  for (const [, value, unit] of matches) total += parseFloat(value.replace(',', '.')) * units[unit];
  return total > 0 ? Math.round(total) : null;
}

function formatDuration(ms) {
  const parts = [];
  const days = Math.floor(ms / 864e5);
  const hours = Math.floor((ms % 864e5) / 36e5);
  const minutes = Math.floor((ms % 36e5) / 6e4);
  const seconds = Math.floor((ms % 6e4) / 1e3);
  if (days) parts.push(`${days} j`);
  if (hours) parts.push(`${hours} h`);
  if (minutes) parts.push(`${minutes} min`);
  if (!parts.length) parts.push(`${seconds} s`);
  return parts.join(' ');
}

async function sendLog(guild, key, payload) {
  if (!guild) return null;
  const channel = findChannel(guild, key);
  if (!channel?.isTextBased()) return null;
  const body = payload?.data || payload?.toJSON ? { embeds: [payload] } : payload;
  return channel.send({ allowedMentions: { parse: [] }, ...body }).catch((e) => {
    console.warn(`[log:${key}]`, e.message);
    return null;
  });
}

// Publie (ou met à jour) un message « panneau » identifié par le footer de son dernier embed.
// Les boutons d'un message sont liés au bot qui l'a posté : si un autre bot Ocean possède
// l'ancien panneau, il est remplacé.
async function ensurePanel(client, channel, payload, { otherBotIds = [] } = {}) {
  if (!channel?.isTextBased()) return null;
  const last = payload.embeds?.at(-1);
  const footer = last?.data?.footer?.text ?? last?.footer?.text;
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const matches = messages ? [...messages.values()].filter((m) => m.author.bot && m.embeds.at(-1)?.footer?.text === footer) : [];
  const mine = matches.find((m) => m.author.id === client.user.id);
  for (const stale of matches) {
    if (stale !== mine && (otherBotIds.includes(stale.author.id))) await stale.delete().catch(() => null);
  }
  if (mine) return mine.edit(payload).catch(() => channel.send(payload));
  return channel.send(payload);
}

const ephemeral = (payload) => ({ ...(typeof payload === 'string' ? { content: payload } : payload), flags: MessageFlags.Ephemeral });

async function safeReply(interaction, payload) {
  const body = ephemeral(payload);
  try {
    if (interaction.deferred || interaction.replied) return await interaction.followUp(body);
    return await interaction.reply(body);
  } catch (error) {
    console.warn('[reply]', error.message);
    return null;
  }
}

module.exports = { sleep, randomInt, pick, shuffle, unix, truncate, parseDuration, formatDuration, sendLog, ensurePanel, ephemeral, safeReply };
