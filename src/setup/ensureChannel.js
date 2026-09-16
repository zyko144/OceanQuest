// Crée un salon du plan (layout.js) s'il manque, sans attendre qu'un admin lance /setup.
// Un salon déjà créé une fois puis supprimé à la main n'est pas recréé (renvoie null).

const layout = require('../lib/layout');
const { findChannel, findRole, loadStoredIds, saveStoredIds } = require('../lib/guild');
const { resolveOverwrites } = require('./buildServer');

async function ensureLayoutChannel(guild, key, { name, after } = {}) {
  const existing = findChannel(guild, key);
  if (existing) return existing;
  const stored = (await loadStoredIds(guild.id)) ?? { channels: {}, roles: {} };
  if (stored.channels?.[key]) return null;
  const def = layout.allChannels().find((c) => c.key === key);
  if (!def) throw new Error(`Salon inconnu dans le plan : ${key}`);
  const parent = findChannel(guild, def.category);
  const roleIds = Object.fromEntries(layout.roles.map((r) => [r.key, findRole(guild, r.key)?.id]).filter(([, id]) => id));
  const options = {
    name: name ?? layout.channelName(def),
    type: def.type,
    parent: parent?.id,
    permissionOverwrites: resolveOverwrites(guild, roleIds, def.access),
    reason: `Ocean Quest • salon ${def.label}`,
  };
  if (def.topic) options.topic = def.topic;
  const channel = await guild.channels.create(options);
  const previous = after ? findChannel(guild, after) : null;
  if (previous && previous.parentId === channel.parentId) await channel.setPosition(previous.position + 1).catch(() => null);

  await saveStoredIds(guild.id, { ...stored, channels: { ...stored.channels, [key]: channel.id } });
  console.log(`[setup] salon ${channel.name} créé`);
  return channel;
}

module.exports = { ensureLayoutChannel };
