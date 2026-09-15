// Accès Supabase avec repli en mémoire si une table n'existe pas encore
// (exécute supabase/schema.sql pour activer la persistance).

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const TABLES = ['tickets', 'warnings', 'mod_actions', 'levels', 'fishers', 'giveaways', 'guild_config'];

let supabase = null;
const remote = new Set();
const mem = Object.fromEntries(TABLES.map((t) => [t, []]));
const seq = Object.fromEntries(TABLES.map((t) => [t, 0]));

async function init() {
  if (!config.supabase.url || !config.supabase.key) {
    console.warn('[db] SUPABASE_URL / SUPABASE_KEY absents → stockage en mémoire uniquement.');
    return;
  }
  supabase = createClient(config.supabase.url, config.supabase.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const missing = [];
  await Promise.all(TABLES.map(async (table) => {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (error) missing.push(`${table} (${error.code ?? error.message})`);
    else remote.add(table);
  }));
  if (missing.length) {
    console.warn(`[db] Tables Supabase indisponibles : ${missing.join(', ')}`);
    console.warn('[db] → Exécute supabase/schema.sql dans le SQL Editor de Supabase. Repli en mémoire en attendant.');
  } else {
    console.log('[db] Supabase connecté ✔');
  }
}

const status = () => ({ supabase: Boolean(supabase), tables: [...remote] });

// Exécute la requête Supabase si la table est dispo, sinon (ou en cas d'erreur) la version mémoire.
async function run(table, remoteQuery, memoryQuery) {
  if (supabase && remote.has(table)) {
    const { data, error } = await remoteQuery(supabase.from(table));
    if (!error) return data;
    console.warn(`[db] ${table}: ${error.message} → repli mémoire`);
  }
  return memoryQuery(mem[table]);
}

const now = () => new Date().toISOString();
const insertMem = (table, row) => {
  const full = { id: ++seq[table], created_at: now(), ...row };
  mem[table].push(full);
  return full;
};
const patchMem = (rows, predicate, patch) => {
  const found = rows.filter(predicate);
  found.forEach((row) => Object.assign(row, patch));
  return found;
};
const upsertMem = (rows, keys, row) => {
  const existing = rows.find((r) => keys.every((k) => r[k] === row[k]));
  if (existing) return Object.assign(existing, row);
  rows.push(row);
  return row;
};

// ───────── Tickets ─────────

const tickets = {
  create: (row) => run('tickets',
    (q) => q.insert(row).select().single(),
    () => insertMem('tickets', { status: 'open', ...row })),
  update: (id, patch) => run('tickets',
    (q) => q.update(patch).eq('id', id).select().maybeSingle(),
    (rows) => patchMem(rows, (r) => r.id === id, patch)[0] ?? null),
  byChannel: (channelId) => run('tickets',
    (q) => q.select('*').eq('channel_id', channelId).maybeSingle(),
    (rows) => rows.find((r) => r.channel_id === channelId) ?? null),
  byId: (id) => run('tickets',
    (q) => q.select('*').eq('id', id).maybeSingle(),
    (rows) => rows.find((r) => r.id === Number(id)) ?? null),
  openByUser: (guildId, userId) => run('tickets',
    (q) => q.select('*').eq('guild_id', guildId).eq('user_id', userId).eq('status', 'open'),
    (rows) => rows.filter((r) => r.guild_id === guildId && r.user_id === userId && r.status === 'open')),
  stats: async (guildId) => {
    const rows = await run('tickets',
      (q) => q.select('status, rating, type').eq('guild_id', guildId),
      (all) => all.filter((r) => r.guild_id === guildId));
    const rated = rows.filter((r) => r.rating);
    return {
      total: rows.length,
      open: rows.filter((r) => r.status === 'open').length,
      closed: rows.filter((r) => r.status !== 'open').length,
      rating: rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null,
      byType: rows.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] ?? 0) + 1 }), {}),
    };
  },
};

// ───────── Modération ─────────

const warnings = {
  add: (row) => run('warnings', (q) => q.insert(row).select().single(), () => insertMem('warnings', row)),
  list: (guildId, userId) => run('warnings',
    (q) => q.select('*').eq('guild_id', guildId).eq('user_id', userId).order('created_at', { ascending: true }),
    (rows) => rows.filter((r) => r.guild_id === guildId && r.user_id === userId)),
  remove: (guildId, id) => run('warnings',
    (q) => q.delete().eq('guild_id', guildId).eq('id', id).select(),
    (rows) => {
      const idx = rows.findIndex((r) => r.guild_id === guildId && r.id === Number(id));
      return idx === -1 ? [] : rows.splice(idx, 1);
    }),
  clear: (guildId, userId) => run('warnings',
    (q) => q.delete().eq('guild_id', guildId).eq('user_id', userId).select(),
    (rows) => {
      const removed = rows.filter((r) => r.guild_id === guildId && r.user_id === userId);
      mem.warnings = rows.filter((r) => !removed.includes(r));
      return removed;
    }),
};

const modActions = {
  log: (row) => run('mod_actions', (q) => q.insert(row), () => insertMem('mod_actions', row)),
};

// ───────── Niveaux ─────────

const levelCache = new Map();
const levels = {
  get: async (guildId, userId) => {
    const key = `${guildId}:${userId}`;
    if (levelCache.has(key)) return levelCache.get(key);
    const row = await run('levels',
      (q) => q.select('*').eq('guild_id', guildId).eq('user_id', userId).maybeSingle(),
      (rows) => rows.find((r) => r.guild_id === guildId && r.user_id === userId) ?? null);
    const value = row ?? { guild_id: guildId, user_id: userId, xp: 0, level: 0, messages: 0 };
    levelCache.set(key, value);
    return value;
  },
  save: (row) => {
    levelCache.set(`${row.guild_id}:${row.user_id}`, row);
    const clean = { ...row, updated_at: now() };
    return run('levels',
      (q) => q.upsert(clean, { onConflict: 'guild_id,user_id' }),
      (rows) => upsertMem(rows, ['guild_id', 'user_id'], clean));
  },
  top: (guildId, limit = 10) => run('levels',
    (q) => q.select('*').eq('guild_id', guildId).order('xp', { ascending: false }).limit(limit),
    (rows) => rows.filter((r) => r.guild_id === guildId).sort((a, b) => b.xp - a.xp).slice(0, limit)),
  rank: async (guildId, xp) => {
    const count = await run('levels',
      async (q) => {
        const res = await q.select('*', { count: 'exact', head: true }).eq('guild_id', guildId).gt('xp', xp);
        return { data: res.count ?? 0, error: res.error };
      },
      (rows) => rows.filter((r) => r.guild_id === guildId && r.xp > xp).length);
    return count + 1;
  },
};

// ───────── Pêche ─────────

const fishers = {
  get: async (guildId, userId) => {
    const row = await run('fishers',
      (q) => q.select('*').eq('guild_id', guildId).eq('user_id', userId).maybeSingle(),
      (rows) => rows.find((r) => r.guild_id === guildId && r.user_id === userId) ?? null);
    return row ?? { guild_id: guildId, user_id: userId, coins: 0, catches: 0, collection: {}, best_catch: null };
  },
  save: (row) => {
    const clean = { ...row, updated_at: now() };
    return run('fishers',
      (q) => q.upsert(clean, { onConflict: 'guild_id,user_id' }),
      (rows) => upsertMem(rows, ['guild_id', 'user_id'], clean));
  },
  top: (guildId, column = 'coins', limit = 10) => run('fishers',
    (q) => q.select('*').eq('guild_id', guildId).order(column, { ascending: false }).limit(limit),
    (rows) => rows.filter((r) => r.guild_id === guildId).sort((a, b) => b[column] - a[column]).slice(0, limit)),
};

// ───────── Giveaways ─────────

const giveaways = {
  create: (row) => run('giveaways', (q) => q.insert(row).select().single(), () => insertMem('giveaways', row)),
  update: (id, patch) => run('giveaways',
    (q) => q.update(patch).eq('id', id),
    (rows) => patchMem(rows, (r) => r.id === id, patch)),
  byMessage: (messageId) => run('giveaways',
    (q) => q.select('*').eq('message_id', messageId).maybeSingle(),
    (rows) => rows.find((r) => r.message_id === messageId) ?? null),
  active: (guildId) => run('giveaways',
    (q) => q.select('*').eq('guild_id', guildId).eq('ended', false),
    (rows) => rows.filter((r) => r.guild_id === guildId && !r.ended)),
};

// ───────── Configuration du serveur (IDs des salons, compteurs…) ─────────

const guildConfig = {
  get: async (guildId, key) => {
    const row = await run('guild_config',
      (q) => q.select('value').eq('guild_id', guildId).eq('key', key).maybeSingle(),
      (rows) => rows.find((r) => r.guild_id === guildId && r.key === key) ?? null);
    return row?.value ?? null;
  },
  set: (guildId, key, value) => {
    const row = { guild_id: guildId, key, value, updated_at: now() };
    return run('guild_config',
      (q) => q.upsert(row, { onConflict: 'guild_id,key' }),
      (rows) => upsertMem(rows, ['guild_id', 'key'], row));
  },
};

module.exports = { init, status, tickets, warnings, modActions, levels, fishers, giveaways, guildConfig };
