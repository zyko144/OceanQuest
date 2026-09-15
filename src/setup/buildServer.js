// Construit (ou complète) le serveur selon layout.js. Idempotent : ce qui existe déjà
// (retrouvé par nom) est conservé, rien n'est supprimé.

const {
  ChannelType, OverwriteType, GuildVerificationLevel, GuildExplicitContentFilter,
  GuildDefaultMessageNotifications, GuildSystemChannelFlags,
} = require('discord.js');
const layout = require('../lib/layout');
const { normalizeName } = require('../lib/fonts');
const { saveStoredIds } = require('../lib/guild');

const REASON = 'Ocean Quest • construction du serveur';

function resolveOverwrites(guild, roleIds, presetKey, extra = []) {
  const preset = layout.access[presetKey];
  if (!preset) throw new Error(`Preset d'accès inconnu : ${presetKey}`);
  const merged = new Map();
  for (const rule of preset()) {
    const id = rule.role === '@everyone' ? guild.roles.everyone.id : roleIds[rule.role];
    if (!id) continue;
    const entry = merged.get(id) ?? { id, type: OverwriteType.Role, allow: 0n, deny: 0n };
    for (const bit of rule.allow ?? []) entry.allow |= bit;
    for (const bit of rule.deny ?? []) entry.deny |= bit;
    merged.set(id, entry);
  }
  // Les bots Ocean voient tout.
  if (roleIds.bots) {
    const entry = merged.get(roleIds.bots) ?? { id: roleIds.bots, type: OverwriteType.Role, allow: 0n, deny: 0n };
    for (const bit of layout.BOT_CHANNEL_PERMS) entry.allow |= bit;
    merged.set(roleIds.bots, entry);
  }
  for (const item of extra) merged.set(item.id, item);
  return [...merged.values()].map((e) => ({ ...e, deny: e.deny & ~e.allow }));
}

async function buildServer(guild, { botIds = [], log = console.log } = {}) {
  const report = { rolesCreated: [], channelsCreated: [], categoriesCreated: [], warnings: [] };
  await guild.roles.fetch();
  await guild.channels.fetch();
  const me = await guild.members.fetchMe();

  // ───── Rôles ─────
  const roleIds = {};
  for (const def of layout.roles) {
    const target = normalizeName(def.name);
    let role = guild.roles.cache.find((r) => !r.managed && normalizeName(r.name) === target);
    if (!role) {
      role = await guild.roles.create({
        name: def.name,
        colors: { primaryColor: def.color ?? 0 },
        hoist: Boolean(def.hoist),
        mentionable: def.mentionable ?? def.key.startsWith('ping_'),
        permissions: def.permissions ?? [],
        reason: REASON,
      });
      report.rolesCreated.push(def.name);
      log(`  + rôle ${def.name}`);
    }
    roleIds[def.key] = role.id;
  }

  // Ordre : bot exécutant > autres bots Ocean > rôles du plan > autres rôles.
  // Un bot ne peut ranger que les rôles situés sous son propre rôle.
  await guild.roles.fetch();
  const myTop = (await guild.members.fetchMe({ force: true })).roles.highest;
  const movable = guild.roles.cache.filter((r) => r.id !== guild.id && r.comparePositionTo(myTop) < 0);
  const planIds = layout.roles.map((r) => roleIds[r.key]);
  const otherBots = movable.filter((r) => r.managed && r.tags?.botId && botIds.includes(r.tags.botId)).map((r) => r.id);
  const rest = movable.filter((r) => !planIds.includes(r.id) && !otherBots.includes(r.id))
    .sort((a, b) => a.comparePositionTo(b)).map((r) => r.id);
  const bottomToTop = [...rest, ...[...planIds].reverse(), ...otherBots];
  if (planIds.some((id) => !movable.has(id)) || myTop.position <= bottomToTop.length) {
    report.warnings.push(`Rôles non réordonnés : glisse le rôle « ${myTop.name} » tout en haut (Paramètres du serveur > Rôles) puis relance /setup.`);
  } else {
    try {
      await guild.roles.setPositions(bottomToTop.map((id, index) => ({ role: id, position: index + 1 })));
    } catch (error) {
      report.warnings.push(`Ordre des rôles non appliqué : ${error.message}`);
    }
  }

  // Les bots Ocean reçoivent le rôle 🤖
  for (const botId of [me.id, ...botIds]) {
    const member = await guild.members.fetch(botId).catch(() => null);
    if (member && !member.roles.cache.has(roleIds.bots)) await member.roles.add(roleIds.bots, REASON).catch(() => null);
  }

  // ───── Catégories & salons ─────
  const channelIds = {};
  const categoryOrder = [];
  for (const catDef of layout.categories) {
    const catTarget = normalizeName(layout.categoryName(catDef));
    let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && normalizeName(c.name) === catTarget);
    if (!category) {
      category = await guild.channels.create({
        name: layout.categoryName(catDef),
        type: ChannelType.GuildCategory,
        permissionOverwrites: resolveOverwrites(guild, roleIds, catDef.access),
        reason: REASON,
      });
      report.categoriesCreated.push(category.name);
      log(`  + catégorie ${category.name}`);
    }
    channelIds[catDef.key] = category.id;
    categoryOrder.push(category.id);

    for (const [index, chDef] of catDef.channels.entries()) {
      const target = normalizeName(chDef.dynamic ? chDef.label : layout.channelName(chDef));
      let channel = guild.channels.cache.find((c) => c.type === chDef.type && (chDef.dynamic
        ? normalizeName(c.name).startsWith(target)
        : normalizeName(c.name) === target));
      if (!channel) {
        const options = {
          name: layout.channelName(chDef, chDef.dynamic ? guild.memberCount : undefined),
          type: chDef.type,
          parent: category.id,
          position: index,
          permissionOverwrites: resolveOverwrites(guild, roleIds, chDef.access),
          reason: REASON,
        };
        if (chDef.topic && chDef.type === ChannelType.GuildText) options.topic = chDef.topic;
        if (chDef.rateLimitPerUser) options.rateLimitPerUser = chDef.rateLimitPerUser;
        if (chDef.userLimit) options.userLimit = chDef.userLimit;
        channel = await guild.channels.create(options);
        report.channelsCreated.push(channel.name);
        log(`    + salon ${channel.name}`);
      }
      channelIds[chDef.key] = channel.id;
    }
  }

  // Catégories du plan en haut, dans l'ordre.
  await guild.channels.fetch();
  const extraCategories = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory && !categoryOrder.includes(c.id))
    .sort((a, b) => a.position - b.position).map((c) => c.id);
  try {
    await guild.channels.setPositions([...categoryOrder, ...extraCategories].map((id, position) => ({ channel: id, position })));
  } catch (error) {
    report.warnings.push(`Ordre des catégories non appliqué : ${error.message}`);
  }

  // ───── Réglages du serveur ─────
  try {
    await guild.edit({
      verificationLevel: Math.max(guild.verificationLevel, GuildVerificationLevel.Medium),
      explicitContentFilter: GuildExplicitContentFilter.AllMembers,
      defaultMessageNotifications: GuildDefaultMessageNotifications.OnlyMentions,
      afkChannel: channelIds.vc_afk,
      afkTimeout: 900,
      systemChannel: channelIds.welcome,
      systemChannelFlags: [GuildSystemChannelFlags.SuppressJoinNotifications, GuildSystemChannelFlags.SuppressJoinNotificationReplies],
      reason: REASON,
    });
  } catch (error) {
    report.warnings.push(`Réglages du serveur non appliqués : ${error.message}`);
  }

  await saveStoredIds(guild.id, { channels: channelIds, roles: roleIds });
  return report;
}

module.exports = { buildServer, resolveOverwrites };
