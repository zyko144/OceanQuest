// Construit (ou complète) le serveur selon layout.js. Idempotent : ce qui existe déjà
// (retrouvé par nom) est conservé, rien n'est supprimé.

const {
  ChannelType, OverwriteType, GuildVerificationLevel, GuildExplicitContentFilter,
  GuildDefaultMessageNotifications, GuildSystemChannelFlags,
} = require('discord.js');
const layout = require('../lib/layout');
const { normalizeName } = require('../lib/fonts');
const { loadStoredIds, saveStoredIds } = require('../lib/guild');

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
  // Ce qui a déjà été créé une fois puis supprimé à la main n'est pas recréé.
  const stored = (await loadStoredIds(guild.id)) ?? { channels: {}, roles: {} };
  const removedByAdmin = (kind, key) => Boolean(stored[kind]?.[key]) && !guild[kind].cache.has(stored[kind][key]);

  // ───── Rôles ─────
  const roleIds = {};
  const skippedRoles = {};
  for (const def of layout.roles) {
    const target = normalizeName(def.name);
    let role = guild.roles.cache.find((r) => !r.managed && normalizeName(r.name) === target);
    if (!role && removedByAdmin('roles', def.key)) {
      report.warnings.push(`Rôle « ${def.name} » supprimé à la main : pas recréé.`);
      skippedRoles[def.key] = stored.roles[def.key];
      continue;
    }
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

  // Ordre : bot exécutant > autres bots > rôles du plan > autres rôles.
  // Un bot ne peut ranger que les rôles situés sous son propre rôle.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await guild.roles.fetch();
    const myTop = (await guild.members.fetchMe({ force: true })).roles.highest;
    const movable = guild.roles.cache.filter((r) => r.id !== guild.id && r.comparePositionTo(myTop) < 0);
    const planIds = layout.roles.map((r) => roleIds[r.key]).filter(Boolean);
    // Tous les rôles de bots restent en haut (même ceux dont on n'a pas le token ici),
    // sinon ils perdraient le droit de gérer les rôles du plan.
    const otherBots = movable.filter((r) => r.managed && r.tags?.botId)
      .sort((a, b) => Number(botIds.includes(a.tags.botId)) - Number(botIds.includes(b.tags.botId)) || a.comparePositionTo(b))
      .map((r) => r.id);
    const rest = movable.filter((r) => !planIds.includes(r.id) && !otherBots.includes(r.id))
      .sort((a, b) => a.comparePositionTo(b)).map((r) => r.id);
    const bottomToTop = [...rest, ...[...planIds].reverse(), ...otherBots];
    if (planIds.some((id) => !movable.has(id))) {
      report.warnings.push(`Rôles non réordonnés : glisse le rôle « ${myTop.name} » tout en haut (Paramètres du serveur > Rôles) puis relance /setup.`);
      break;
    }
    // Les rôles tout juste créés partagent la position 1 : un premier déplacement fait
    // renuméroter les positions par Discord, puis l'ordre complet peut être appliqué.
    if (myTop.position <= bottomToTop.length) {
      if (attempt === 0) {
        const first = movable.sort((a, b) => b.comparePositionTo(a)).first();
        if (first) await guild.roles.setPositions([{ role: first.id, position: first.position }]).catch(() => null);
        continue;
      }
      report.warnings.push(`Rôles non réordonnés : glisse le rôle « ${myTop.name} » tout en haut (Paramètres du serveur > Rôles) puis relance /setup.`);
      break;
    }
    try {
      await guild.roles.setPositions(bottomToTop.map((id, index) => ({ role: id, position: index + 1 })));
    } catch (error) {
      report.warnings.push(`Ordre des rôles non appliqué : ${error.message}`);
    }
    break;
  }

  // Les bots Ocean reçoivent le rôle 🤖
  for (const botId of [me.id, ...botIds]) {
    const member = await guild.members.fetch(botId).catch(() => null);
    if (member && roleIds.bots && !member.roles.cache.has(roleIds.bots)) await member.roles.add(roleIds.bots, REASON).catch(() => null);
  }

  // ───── Catégories & salons ─────
  const channelIds = {};
  const categoryOrder = [];
  for (const catDef of layout.categories) {
    const catTarget = normalizeName(layout.categoryName(catDef));
    let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && normalizeName(c.name) === catTarget);
    if (!category && removedByAdmin('channels', catDef.key)) {
      report.warnings.push(`Catégorie « ${layout.categoryName(catDef)} » supprimée à la main : pas recréée.`);
      channelIds[catDef.key] = stored.channels[catDef.key];
      for (const chDef of catDef.channels) if (stored.channels[chDef.key]) channelIds[chDef.key] = stored.channels[chDef.key];
      continue;
    }
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
      if (!channel && removedByAdmin('channels', chDef.key)) {
        report.warnings.push(`Salon « ${layout.channelName(chDef, chDef.dynamic ? '…' : undefined)} » supprimé à la main : pas recréé.`);
        channelIds[chDef.key] = stored.channels[chDef.key];
        continue;
      }
      if (!channel) {
        const options = {
          name: layout.channelName(chDef, chDef.dynamic ? (chDef.key === 'stats_members' ? guild.memberCount : '—') : undefined),
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
      afkChannel: guild.channels.cache.has(channelIds.vc_afk) ? channelIds.vc_afk : undefined,
      afkTimeout: 900,
      systemChannel: guild.channels.cache.has(channelIds.welcome) ? channelIds.welcome : undefined,
      systemChannelFlags: [GuildSystemChannelFlags.SuppressJoinNotifications, GuildSystemChannelFlags.SuppressJoinNotificationReplies],
      reason: REASON,
    });
  } catch (error) {
    report.warnings.push(`Réglages du serveur non appliqués : ${error.message}`);
  }

  await saveStoredIds(guild.id, { channels: channelIds, roles: { ...skippedRoles, ...roleIds } });
  return report;
}

module.exports = { buildServer, resolveOverwrites };
