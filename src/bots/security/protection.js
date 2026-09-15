// Anti-raid, anti-spam, anti-arnaque, anti-pub et anti-nuke.

const { AuditLogEvent, Events, GatewayIntentBits, PermissionFlagsBits: P } = require('discord.js');
const config = require('../../config');
const db = require('../../lib/db');
const { isStaff, roleMention } = require('../../lib/guild');
const { oceanEmbed, colors } = require('../../lib/embeds');
const { sendLog, unix, truncate, formatDuration } = require('../../lib/util');
const { isRaid, activateRaid, deactivateRaid, FOOTER } = require('./state');

const S = config.security;
const joins = [];
const floods = new Map(); // userId -> { stamps: [], last: '', repeats: 0, lastAt: 0 }
const nukeCounters = new Map(); // executorId -> [{ at, action }]

const SCAM_PATTERNS = [
  /(free|gratuit|gift|cadeau).{0,25}(nitro|robux)/i,
  /(nitro|robux).{0,25}(free|gratuit|gift|offert)/i,
  /\b(dlscord|disc0rd|discorcl|dicsord|discord-?nitro|discordgift|steamcomrnunity|steamcommunlty)\.[a-z]{2,}/i,
  /\b(roblox|rbx|robux)[-.]?(free|gift|gen|claim|promo)\.[a-z]{2,}/i,
  /\b(r0blox|robIox|rob1ox|roblox-?login)\.[a-z]{2,}/i,
  /https?:\/\/(bit\.ly|tinyurl\.com|grabify\.link|iplogger\.[a-z]+)\//i,
];
const INVITE_RE = /(?:discord(?:app)?\.com\/invite|discord\.gg|dsc\.gg)\/([\w-]{2,32})/gi;

const trusted = (guild, userId, ctx) => userId === guild.ownerId
  || S.whitelist.includes(userId)
  || ctx.registry.some((b) => b.client?.user?.id === userId);

async function punishMessage(message, { reason, timeoutMs, deleteRecent = false }) {
  const { member, channel, guild, author } = message;
  if (deleteRecent) {
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const toDelete = recent?.filter((m) => m.author.id === author.id && Date.now() - m.createdTimestamp < 60_000);
    if (toDelete?.size) await channel.bulkDelete(toDelete, true).catch(() => null);
  } else {
    await message.delete().catch(() => null);
  }
  let timedOut = false;
  if (timeoutMs && member?.moderatable) {
    timedOut = await member.timeout(timeoutMs, `Ocean Guard : ${reason}`).then(() => true).catch(() => false);
  }
  const notice = await channel.send({
    content: `🌊 ${author}, ${reason.toLowerCase()}${timedOut ? ` — mis aux fers pour ${formatDuration(timeoutMs)}.` : '.'}`,
    allowedMentions: { users: [author.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => null), 8000);

  if (timedOut) {
    await db.modActions.log({ guild_id: guild.id, action: 'automod_timeout', user_id: author.id, moderator_id: message.client.user.id, reason, duration_ms: timeoutMs }).catch(() => null);
  }
  await sendLog(guild, 'log_security', oceanEmbed({
    title: '🛡️ Automod',
    color: colors.warning,
    fields: [
      { name: 'Membre', value: `${author} \`${author.id}\``, inline: true },
      { name: 'Salon', value: `${channel}`, inline: true },
      { name: 'Sanction', value: timedOut ? `Sourdine ${formatDuration(timeoutMs)}` : 'Message supprimé', inline: true },
      { name: 'Raison', value: reason },
      { name: 'Contenu', value: truncate(message.content || '*vide*', 1000) },
    ],
    footer: FOOTER,
  }));
}

async function onMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId || !message.member) return;
  if (isStaff(message.member, 'helper') || message.member.permissions.has(P.ManageMessages)) return;
  const content = message.content ?? '';

  if (S.blockScamLinks && SCAM_PATTERNS.some((re) => re.test(content))) {
    return punishMessage(message, { reason: 'Lien suspect / arnaque détecté', timeoutMs: 60 * 60_000 });
  }

  if (S.blockInvites) {
    const codes = [...content.matchAll(INVITE_RE)].map((m) => m[1]);
    for (const code of codes) {
      const invite = await message.client.fetchInvite(code).catch(() => null);
      if (invite?.guild?.id !== message.guild.id) {
        return punishMessage(message, { reason: 'Les invitations vers d’autres serveurs sont interdites' });
      }
    }
  }

  const mentions = message.mentions.users.size + message.mentions.roles.size;
  if (mentions >= S.maxMentions) {
    return punishMessage(message, { reason: `Mentions de masse (${mentions})`, timeoutMs: 10 * 60_000 });
  }

  const now = Date.now();
  const entry = floods.get(message.author.id) ?? { stamps: [], last: '', repeats: 0, lastAt: 0 };
  entry.stamps = entry.stamps.filter((t) => now - t < S.spamWindowSec * 1000);
  entry.stamps.push(now);
  const normalized = content.toLowerCase().trim();
  if (normalized && normalized === entry.last && now - entry.lastAt < 30_000) entry.repeats += 1;
  else entry.repeats = 0;
  entry.last = normalized;
  entry.lastAt = now;
  floods.set(message.author.id, entry);

  if (entry.stamps.length >= S.spamMessageLimit || entry.repeats >= 3) {
    floods.delete(message.author.id);
    return punishMessage(message, {
      reason: entry.repeats >= 3 ? 'Messages répétés' : 'Spam / flood',
      timeoutMs: S.spamTimeoutMin * 60_000,
      deleteRecent: true,
    });
  }
  return null;
}

async function onMemberAdd(member) {
  const now = Date.now();
  joins.push(now);
  while (joins.length && now - joins[0] > S.raidJoinWindowSec * 1000) joins.shift();
  if (joins.length >= S.raidJoinThreshold && !isRaid()) {
    await activateRaid(member.guild, `${joins.length} arrivées en ${S.raidJoinWindowSec} secondes`);
  }
  if (isRaid() && !member.user.bot && now - member.user.createdTimestamp < 7 * 864e5 && member.kickable) {
    await member.send('🌪️ Ocean Quest subit une tempête (raid). Les comptes récents ne peuvent pas rejoindre pour le moment, réessaie plus tard !').catch(() => null);
    await member.kick('Mode raid : compte de moins de 7 jours').catch(() => null);
    await sendLog(member.guild, 'log_security', oceanEmbed({
      description: `🌪️ ${member.user.tag} \`${member.id}\` expulsé à l’arrivée (mode raid, compte créé <t:${unix(member.user.createdTimestamp)}:R>).`,
      color: colors.danger,
      footer: FOOTER,
    }));
  }
}

// ───────── Anti-nuke (journal d'audit en temps réel) ─────────

const NUKE_ACTIONS = {
  [AuditLogEvent.ChannelDelete]: { label: 'Suppression de salon', weight: 1 },
  [AuditLogEvent.RoleDelete]: { label: 'Suppression de rôle', weight: 1 },
  [AuditLogEvent.MemberBanAdd]: { label: 'Bannissement', weight: 1 },
  [AuditLogEvent.MemberKick]: { label: 'Expulsion', weight: 1 },
  [AuditLogEvent.WebhookCreate]: { label: 'Création de webhook', weight: 1 },
  [AuditLogEvent.ChannelCreate]: { label: 'Création de salon', weight: 0.5 },
  [AuditLogEvent.RoleCreate]: { label: 'Création de rôle', weight: 0.5 },
};

async function neutralize(guild, executorId, reason) {
  const member = await guild.members.fetch(executorId).catch(() => null);
  let result = 'aucune action possible (rôle trop haut ?)';
  if (member?.user.bot && member.kickable) {
    await member.kick(`Anti-nuke : ${reason}`).then(() => { result = 'bot expulsé'; }).catch(() => null);
  } else if (member) {
    const removable = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.editable);
    if (removable.size) await member.roles.remove(removable, `Anti-nuke : ${reason}`).then(() => { result = `${removable.size} rôle(s) retiré(s)`; }).catch(() => null);
    if (member.moderatable) await member.timeout(28 * 864e5, `Anti-nuke : ${reason}`).then(() => { result += ' + sourdine 28 j'; }).catch(() => null);
  }
  await sendLog(guild, 'log_security', {
    content: `${roleMention(guild, 'founder')} ${roleMention(guild, 'admin')}`.trim() || undefined,
    allowedMentions: { parse: ['roles'] },
    embeds: [oceanEmbed({
      title: '🚨 ANTI-NUKE — Activité destructrice bloquée',
      description: `**Auteur :** <@${executorId}> \`${executorId}\`\n**Détection :** ${reason}\n**Mesure :** ${result}\n\nVérifie le journal d’audit du serveur.`,
      color: colors.danger,
      footer: FOOTER,
    })],
  });
}

async function onAuditEntry(entry, guild, ctx) {
  const { executorId, action } = entry;
  if (!executorId || trusted(guild, executorId, ctx)) return;

  // Octroi de la permission Administrateur à un rôle → annulé.
  if (action === AuditLogEvent.RoleUpdate) {
    const change = entry.changes.find((c) => c.key === 'permissions');
    if (change && (BigInt(change.new ?? 0) & P.Administrator) && !(BigInt(change.old ?? 0) & P.Administrator)) {
      const role = guild.roles.cache.get(entry.targetId);
      if (role?.editable) await role.setPermissions(BigInt(change.old ?? 0), 'Anti-nuke : ajout Administrateur non autorisé').catch(() => null);
      await neutralize(guild, executorId, `Ajout de la permission Administrateur au rôle ${role?.name ?? entry.targetId}`);
    }
    return;
  }

  if (action === AuditLogEvent.BotAdd) {
    await sendLog(guild, 'log_security', oceanEmbed({
      description: `🤖 Le bot <@${entry.targetId}> a été ajouté par <@${executorId}>.`,
      color: colors.warning,
      footer: FOOTER,
    }));
    return;
  }

  const watched = NUKE_ACTIONS[action];
  if (!watched) return;
  const now = Date.now();
  const history = (nukeCounters.get(executorId) ?? []).filter((h) => now - h.at < S.antiNukeWindowSec * 1000);
  history.push({ at: now, weight: watched.weight, label: watched.label });
  nukeCounters.set(executorId, history);
  const score = history.reduce((sum, h) => sum + h.weight, 0);
  if (score >= S.antiNukeThreshold) {
    nukeCounters.delete(executorId);
    const summary = [...new Set(history.map((h) => h.label))].join(', ');
    await neutralize(guild, executorId, `${history.length} actions en ${S.antiNukeWindowSec}s (${summary})`);
  }
}

module.exports = {
  name: 'protection',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration],
  events: {
    [Events.MessageCreate]: onMessage,
    [Events.GuildMemberAdd]: onMemberAdd,
    [Events.GuildAuditLogEntryCreate]: onAuditEntry,
  },
  components: {
    guard: async (interaction, [action]) => {
      if (action !== 'raidoff') return null;
      if (!isStaff(interaction.member, 'manager')) {
        return interaction.reply({ content: 'Réservé aux Capitaines.', flags: 64 });
      }
      await deactivateRaid(interaction.guild, `${interaction.member}`);
      return interaction.update({ components: [] });
    },
  },
};
