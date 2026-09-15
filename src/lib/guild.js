// Retrouve les salons et rôles du plan (layout.js) sur le serveur :
// d'abord via les IDs enregistrés au /setup, sinon par leur nom stylisé.

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const layout = require('./layout');
const { normalizeName } = require('./fonts');
const db = require('./db');
const config = require('../config');

const storedIds = new Map(); // guildId -> { channels: {key: id}, roles: {key: id} }

async function loadStoredIds(guildId) {
  const value = await db.guildConfig.get(guildId, 'layout_ids').catch(() => null);
  if (value) storedIds.set(guildId, value);
  return value;
}

async function saveStoredIds(guildId, ids) {
  storedIds.set(guildId, ids);
  await db.guildConfig.set(guildId, 'layout_ids', ids).catch((e) => console.warn('[guild] save ids:', e.message));
}

function findRole(guild, key) {
  const def = layout.roles.find((r) => r.key === key);
  if (!def) return null;
  const id = storedIds.get(guild.id)?.roles?.[key];
  if (id && guild.roles.cache.has(id)) return guild.roles.cache.get(id);
  const target = normalizeName(def.name);
  return guild.roles.cache.find((r) => normalizeName(r.name) === target) ?? null;
}

function findChannel(guild, key) {
  const id = storedIds.get(guild.id)?.channels?.[key];
  if (id && guild.channels.cache.has(id)) return guild.channels.cache.get(id);

  const category = layout.categories.find((c) => c.key === key);
  if (category) {
    const target = normalizeName(layout.categoryName(category));
    return guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && normalizeName(c.name) === target) ?? null;
  }
  const def = layout.allChannels().find((c) => c.key === key);
  if (!def) return null;
  const target = normalizeName(def.dynamic ? def.label : layout.channelName(def));
  return guild.channels.cache.find((c) => c.type === def.type && (def.dynamic
    ? normalizeName(c.name).startsWith(target)
    : normalizeName(c.name) === target)) ?? null;
}

const channelMention = (guild, key, fallback = `#${key}`) => {
  const channel = findChannel(guild, key);
  return channel ? `<#${channel.id}>` : fallback;
};

const roleMention = (guild, key) => {
  const role = findRole(guild, key);
  return role ? `<@&${role.id}>` : '';
};

async function getMainGuild(client) {
  if (!config.guildId) return client.guilds.cache.first() ?? null;
  return client.guilds.cache.get(config.guildId) ?? client.guilds.fetch(config.guildId).catch(() => null);
}

// Niveau de staff : helper < moderator < manager < admin
function isStaff(member, level = 'helper') {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.guild?.ownerId === member.id) return true;
  return (layout.STAFF_LEVELS[level] ?? []).some((key) => {
    const role = findRole(member.guild, key);
    return role && member.roles.cache.has(role.id);
  });
}

module.exports = { findRole, findChannel, channelMention, roleMention, getMainGuild, isStaff, loadStoredIds, saveStoredIds };
