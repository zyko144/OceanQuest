// Tableau de bord staff : https://…/dashboard (lecture seule).

const config = require('../config');
const db = require('../lib/db');
const shop = require('../lib/shop');
const robloxGame = require('../lib/robloxGame');
const robloxLinks = require('../lib/robloxLinks');
const TICKET_TYPES = require('../bots/ticket/types');
const { getMainGuild, isStaff } = require('../lib/guild');
const auth = require('./auth');

const STAFF_CACHE_MS = 2 * 60 * 1000;
const staffCache = new Map(); // discordId -> { ok, name, avatar, at }

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fr = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const date = (value) => (value ? new Date(value).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—');
const ago = (value) => {
  if (!value) return '—';
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
};

async function mainGuild(registry) {
  const bot = registry.find((b) => b.groups.includes('main') && b.client?.isReady()) ?? registry.find((b) => b.client?.isReady());
  return bot ? getMainGuild(bot.client) : null;
}

async function staffInfo(registry, discordId) {
  const cached = staffCache.get(discordId);
  if (cached && Date.now() - cached.at < STAFF_CACHE_MS) return cached;
  const guild = await mainGuild(registry);
  const member = guild ? await guild.members.fetch(discordId).catch(() => null) : null;
  const info = { ok: Boolean(member && isStaff(member, 'helper')), name: member?.displayName, avatar: member?.displayAvatarURL({ size: 64 }), at: Date.now() };
  staffCache.set(discordId, info);
  return info;
}

// Noms Discord pour une liste d'identifiants (membres en cache, puis Discord).
async function nameResolver(guild, ids) {
  const unique = [...new Set(ids.filter((id) => /^\d{15,22}$/.test(String(id))))];
  const missing = unique.filter((id) => !guild?.members.cache.has(id));
  if (guild && missing.length) await guild.members.fetch({ user: missing.slice(0, 100) }).catch(() => null);
  return (id) => {
    if (!id) return '—';
    const member = guild?.members.cache.get(id);
    return member ? member.displayName : `#${String(id).slice(-5)}`;
  };
}

async function collect(registry) {
  const guild = await mainGuild(registry);
  const guildId = config.guildId;
  const [ticketStats, tickets, actions, warningCount, economy, richest, topLevels, purchases, links, rewards, players] = await Promise.all([
    db.tickets.stats(guildId).catch(() => null),
    db.reports.recentTickets(guildId, 25).catch(() => []),
    db.reports.recentModActions(guildId, 25).catch(() => []),
    db.reports.warningCount(guildId).catch(() => 0),
    db.reports.economy(guildId).catch(() => ({ fishers: 0, coins: 0, catches: 0 })),
    db.fishers.top(guildId, 'coins', 10).catch(() => []),
    db.levels.top(guildId, 10).catch(() => []),
    shop.recentPurchases(300).catch(() => []),
    robloxLinks.list().catch(() => []),
    robloxLinks.rewards().catch(() => []),
    db.guildConfig.list(guildId, 'aquarium_ig:joueur:', 15).catch(() => []),
  ]);
  const counts = guild ? await guild.client.guilds.fetch({ guild: guild.id, withCounts: true, force: true }).catch(() => null) : null;
  const ids = [
    ...(tickets ?? []).flatMap((t) => [t.user_id, t.claimed_by]),
    ...(actions ?? []).flatMap((a) => [a.user_id, a.moderator_id]),
    ...(richest ?? []).map((r) => r.user_id), ...(topLevels ?? []).map((r) => r.user_id),
    ...purchases.slice(0, 15).map((p) => p.userId), ...links.map((l) => l.discordId),
  ];
  const name = await nameResolver(guild, ids);
  return {
    guild, counts, name, ticketStats, tickets: tickets ?? [], actions: actions ?? [], warningCount, economy,
    richest: richest ?? [], topLevels: topLevels ?? [], purchases, links, rewards, players,
    game: robloxGame.getStatus(),
    bots: registry.map((b) => ({ label: b.label, tag: b.client?.user?.tag, ready: Boolean(b.client?.isReady()), ping: b.client?.ws?.ping, groups: b.groups })),
    database: db.status(),
  };
}

// ───────── HTML ─────────

const card = (icon, label, value, sub = '') => `<div class="card"><div class="card-icon">${icon}</div><div><div class="card-value">${value}</div><div class="card-label">${esc(label)}</div>${sub ? `<div class="card-sub">${sub}</div>` : ''}</div></div>`;
const table = (headers, rows, empty) => (rows.length
  ? `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  : `<p class="empty">${esc(empty)}</p>`);
function bars(entries) {
  const max = Math.max(1, ...entries.map((e) => e.value));
  if (!entries.some((e) => e.value)) return '<p class="empty">Pas encore de données.</p>';
  return `<div class="bars">${entries.map((e) => `<div class="bar-row"><span class="bar-label">${esc(e.label)}</span><span class="bar"><span style="width:${Math.round((e.value / max) * 100)}%"></span></span><span class="bar-value">${fr(e.value)}</span></div>`).join('')}</div>`;
}
const pill = (text, tone = '') => `<span class="pill ${tone}">${esc(text)}</span>`;

function renderPage(data, viewer) {
  const { game, ticketStats: ts, name } = data;
  const info = game.info;
  const ticketType = (id) => TICKET_TYPES.find((t) => t.id === id);
  const statusPill = { open: pill('Ouvert', 'green'), closed: pill('Fermé', 'amber'), deleted: pill('Supprimé', 'muted') };
  const popularity = Object.values(data.purchases.reduce((acc, p) => {
    if (!p.item) return acc;
    acc[p.item.id] = acc[p.item.id] ?? { label: `${p.item.emoji} ${p.item.name}`, value: 0 };
    acc[p.item.id].value += 1;
    return acc;
  }, {})).sort((a, b) => b.value - a.value).slice(0, 8);
  const spent = data.purchases.reduce((sum, p) => sum + (p.price ?? 0), 0);

  const sections = {
    apercu: `
      <div class="cards">
        ${card('👥', 'Membres Discord', fr(data.counts?.approximateMemberCount ?? data.guild?.memberCount), data.counts?.approximatePresenceCount ? `${fr(data.counts.approximatePresenceCount)} en ligne` : '')}
        ${card('🎮', 'Joueurs en jeu', info ? fr(info.playing) : '—', info ? `${fr(info.visits)} visites` : 'Jeu pas encore détecté')}
        ${card('🎫', 'Tickets ouverts', fr(ts?.open), `${fr(ts?.total)} au total`)}
        ${card('⭐', 'Satisfaction tickets', ts?.rating ? `${ts.rating.toFixed(1)}/5` : '—')}
        ${card('🔗', 'Comptes Roblox reliés', fr(data.links.length))}
        ${card('🪙', 'Doublons en circulation', fr(data.economy.coins), `${fr(data.economy.fishers)} pêcheurs`)}
      </div>
      <div class="grid-2">
        <section class="panel"><h3>🤖 Bots</h3>${table(['Bot', 'État', 'Ping', 'Modules'], data.bots.map((b) => [
          `<strong>${esc(b.label)}</strong><div class="muted">${esc(b.tag ?? '')}</div>`, b.ready ? pill('En ligne', 'green') : pill('Hors ligne', 'red'), b.ping >= 0 ? `${b.ping} ms` : '—', esc(b.groups.join(', ')),
        ]), 'Aucun bot.')}</section>
        <section class="panel"><h3>🗄️ Système</h3><ul class="facts">
          <li><span>Base de données</span><strong>${data.database.tables.length ? `Supabase · ${data.database.tables.length} tables` : 'Mémoire (non persistant)'}</strong></li>
          <li><span>Jeu Roblox</span><strong>${game.configured ? (info ? esc(info.name) : `Lieu ${esc(game.placeId)}${game.error ? ` · ${esc(game.error)}` : ''}`) : 'En attente de détection'}</strong></li>
          <li><span>Dernière mise à jour du jeu</span><strong>${info ? `${date(info.updated)} (${ago(info.updated)})` : '—'}</strong></li>
          <li><span>Avertissements enregistrés</span><strong>${fr(data.warningCount)}</strong></li>
        </ul></section>
      </div>`,

    tickets: `
      <div class="cards">
        ${card('📨', 'Total', fr(ts?.total))}${card('🟢', 'Ouverts', fr(ts?.open))}${card('🔒', 'Fermés', fr(ts?.closed))}${card('⭐', 'Note moyenne', ts?.rating ? `${ts.rating.toFixed(2)}/5` : '—')}
      </div>
      <div class="grid-2">
        <section class="panel"><h3>Par type</h3>${bars(TICKET_TYPES.map((t) => ({ label: `${t.emoji} ${t.label}`, value: ts?.byType?.[t.id] ?? 0 })))}</section>
        <section class="panel"><h3>Derniers tickets</h3>${table(['N°', 'Type', 'Membre', 'Statut', 'Pris par', 'Ouvert', 'Note', ''], data.tickets.map((t) => [
          `<strong>${String(t.number ?? t.id).padStart(4, '0')}</strong>`, esc(`${ticketType(t.type)?.emoji ?? '🎫'} ${ticketType(t.type)?.label ?? t.type}`), esc(name(t.user_id)),
          statusPill[t.status] ?? esc(t.status), esc(name(t.claimed_by)), `<span title="${esc(date(t.created_at))}">${ago(t.created_at)}</span>`,
          t.rating ? '⭐'.repeat(t.rating) : '—', t.transcript_url ? `<a href="${esc(t.transcript_url)}" target="_blank" rel="noopener">Transcript ↗</a>` : '',
        ]), 'Aucun ticket pour l’instant.')}</section>
      </div>`,

    moderation: `
      <section class="panel"><h3>Dernières sanctions</h3>${table(['Action', 'Membre', 'Par', 'Raison', 'Durée', 'Date'], data.actions.map((a) => [
        pill(a.action, a.action.includes('ban') ? 'red' : a.action.includes('expul') ? 'amber' : ''), esc(name(a.user_id)), esc(a.moderator_id === data.guild?.client.user.id ? 'Automod' : name(a.moderator_id)),
        esc(a.reason ?? '—'), a.duration_ms ? esc(`${Math.round(a.duration_ms / 60000)} min`) : '—', `<span title="${esc(date(a.created_at))}">${ago(a.created_at)}</span>`,
      ]), 'Aucune sanction enregistrée. L’océan est calme. 🌊')}</section>`,

    economie: `
      <div class="cards">
        ${card('🪙', 'Doublons en circulation', fr(data.economy.coins))}${card('🐟', 'Poissons pêchés', fr(data.economy.catches))}${card('🛒', 'Achats en boutique', fr(data.purchases.length))}${card('💸', 'Doublons dépensés', fr(spent))}
      </div>
      <div class="grid-2">
        <section class="panel"><h3>🏆 Les plus riches</h3>${table(['#', 'Marin', 'Doublons', 'Prises'], data.richest.map((r, i) => [i + 1, esc(name(r.user_id)), fr(r.coins), fr(r.catches)]), 'Personne n’a encore pêché.')}</section>
        <section class="panel"><h3>🎣 Meilleurs niveaux</h3>${table(['#', 'Marin', 'XP', 'Messages'], data.topLevels.map((r, i) => [i + 1, esc(name(r.user_id)), fr(r.xp), fr(r.messages)]), 'Pas encore d’XP.')}</section>
        <section class="panel"><h3>🛒 Objets les plus achetés</h3>${bars(popularity)}</section>
        <section class="panel"><h3>🧾 Derniers achats</h3>${table(['Marin', 'Objet', 'Prix', 'Date'], data.purchases.slice(0, 15).map((p) => [
          esc(name(p.userId)), esc(p.item ? `${p.item.emoji} ${p.item.name}` : p.itemId), `🪙 ${fr(p.price)}`, ago(p.at),
        ]), 'Aucun achat pour l’instant.')}</section>
      </div>`,

    roblox: `
      <section class="panel game">
        ${game.images?.thumbnail ? `<img src="${esc(game.images.thumbnail)}" alt="">` : ''}
        <div>
          <h3>${info ? esc(info.name) : '🎮 Jeu Roblox'}</h3>
          ${info ? `<div class="cards small">${card('🟢', 'En jeu', fr(info.playing))}${card('👣', 'Visites', fr(info.visits))}${card('⭐', 'Favoris', fr(info.favorites))}${card('🆕', 'Mis à jour', ago(info.updated))}</div>`
    : `<p class="empty">${game.configured ? `Lieu ${esc(game.placeId)} : ${esc(game.error ?? 'chargement…')}` : 'Le jeu sera détecté automatiquement dès que ses serveurs contactent le bot, ou renseigne <code>ROBLOX_GAME_URL</code> sur Render.'}</p>`}
          ${game.url ? `<a class="button" href="${esc(game.url)}" target="_blank" rel="noopener">Ouvrir sur Roblox ↗</a>` : ''}
        </div>
      </section>
      <div class="grid-2">
        <section class="panel"><h3>🔗 Comptes reliés (${fr(data.links.length)})</h3>${table(['Discord', 'Roblox', 'Relié'], data.links.slice(0, 30).map((l) => [
          esc(name(l.discordId)), `<a href="https://www.roblox.com/users/${esc(l.id)}/profile" target="_blank" rel="noopener">${esc(l.displayName ?? l.name)} <span class="muted">@${esc(l.name)}</span></a>`, ago(l.linkedAt),
        ]), 'Aucun compte relié. Les joueurs utilisent /lier.')}</section>
        <section class="panel"><h3>🎁 Récompenses de rôles</h3>${table(['Condition', 'Rôle'], data.rewards.map((r) => [
          esc(`${{ badge: '🏅 Badge', gamepass: '🎟️ Game pass', especes: '📖 Index' }[r.type]} · ${r.label ?? r.value}`), esc(`@${data.guild?.roles.cache.get(r.roleId)?.name ?? 'rôle supprimé'}`),
        ]), 'Aucune récompense. Ajoute-en avec /recompense-roblox ajouter.')}</section>
        <section class="panel"><h3>🐠 Vus en jeu récemment</h3>${table(['Joueur', 'Index', 'Meilleure prise', 'Vu'], data.players.map((p) => [
          esc(p.value?.affichage ?? p.value?.pseudo), p.value?.especes ?? '—', esc(p.value?.poissons?.[0]?.nom ?? '—'), ago(p.value?.vuEnJeu),
        ]), 'Le jeu n’a encore envoyé aucun joueur.')}</section>
      </div>`,
  };

  const nav = [['apercu', '🌊 Aperçu'], ['tickets', '🎫 Tickets'], ['moderation', '🛡️ Modération'], ['economie', '🪙 Économie'], ['roblox', '🎮 Roblox']];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ocean Quest · Tableau de bord</title><meta name="robots" content="noindex">
<style>
:root{--bg:#020b1a;--panel:#07182f;--panel2:#0b2344;--line:#12345c;--text:#dcefff;--muted:#7fa3c7;--accent:#00b4d8;--gold:#ffd166;--green:#2ec4b6;--amber:#ffb703;--red:#ef476f}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1200px 600px at 10% -10%,#0a3b6b 0,transparent 60%),var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
header{position:sticky;top:0;z-index:5;background:rgba(2,11,26,.85);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top{max-width:1200px;margin:auto;display:flex;align-items:center;gap:16px;padding:14px 20px;flex-wrap:wrap}
.brand{font-weight:700;font-size:18px;margin-right:auto}.brand small{color:var(--muted);font-weight:500;margin-left:8px}
nav{display:flex;gap:6px;flex-wrap:wrap}nav a{color:var(--muted);text-decoration:none;padding:7px 12px;border-radius:999px}nav a:hover{background:var(--panel2);color:var(--text)}
.viewer{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}.viewer img{width:28px;height:28px;border-radius:50%}.viewer a{color:var(--muted)}
main{max-width:1200px;margin:auto;padding:24px 20px 60px}
h2{margin:36px 0 14px;font-size:22px;scroll-margin-top:80px}h3{margin:0 0 12px;font-size:16px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px}
.card{display:flex;gap:12px;align-items:center;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.card-icon{font-size:26px}.card-value{font-size:22px;font-weight:700}.card-label{color:var(--muted);font-size:13px}.card-sub{color:var(--accent);font-size:12px}
.cards.small .card{padding:10px 12px}.cards.small .card-value{font-size:18px}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}
.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;color:var(--muted);font-weight:600;padding:8px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:8px;border-bottom:1px solid rgba(18,52,92,.5);vertical-align:top}tr:last-child td{border-bottom:0}
a{color:var(--accent)}.muted{color:var(--muted);font-size:12px}.empty{color:var(--muted);margin:8px 0}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);font-size:12px;white-space:nowrap}
.pill.green{color:var(--green);border-color:rgba(46,196,182,.4)}.pill.amber{color:var(--amber);border-color:rgba(255,183,3,.4)}.pill.red{color:var(--red);border-color:rgba(239,71,111,.4)}.pill.muted{color:var(--muted)}
.bars{display:grid;gap:8px}.bar-row{display:grid;grid-template-columns:minmax(120px,1fr) 2fr auto;gap:10px;align-items:center;font-size:14px}
.bar{height:10px;background:var(--panel2);border-radius:99px;overflow:hidden}.bar span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--green));border-radius:99px}
.facts{list-style:none;margin:0;padding:0}.facts li{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(18,52,92,.5)}.facts li:last-child{border:0}.facts span{color:var(--muted)}
.game{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.game img{width:min(384px,100%);border-radius:12px;border:1px solid var(--line)}.game>div{flex:1;min-width:260px}
.button{display:inline-block;margin-top:8px;padding:8px 14px;border-radius:10px;background:var(--accent);color:#001;text-decoration:none;font-weight:600}
footer{color:var(--muted);text-align:center;font-size:12px;padding:20px}
@media (max-width:520px){.grid-2{grid-template-columns:1fr}.bar-row{grid-template-columns:1fr auto}.bar{grid-column:1/-1}}
</style></head><body>
<header><div class="top"><div class="brand">🌊 Ocean Quest <small>Tableau de bord</small></div>
<nav>${nav.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>
<div class="viewer">${viewer.avatar ? `<img src="${esc(viewer.avatar)}" alt="">` : ''}${esc(viewer.name ?? '')} · <a href="/dashboard/sortir">Déconnexion</a></div></div></header>
<main>${nav.map(([id, label]) => `<h2 id="${id}">${label}</h2>${sections[id]}`).join('')}</main>
<footer>Données en direct · généré le ${esc(date(new Date()))} · lecture seule</footer>
</body></html>`;
}

function messagePage(title, body, status = 200) {
  return {
    status,
    html: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ocean Quest · ${esc(title)}</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(180deg,#023e8a,#03045e);color:#caf0f8;font:16px/1.6 system-ui,sans-serif}main{max-width:460px;padding:32px;text-align:center}h1{margin:0 0 10px}code{background:rgba(255,255,255,.1);padding:2px 6px;border-radius:6px}</style></head>
<body><main><h1>${esc(title)}</h1><p>${body}</p></main></body></html>`,
  };
}

const SECURITY_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

async function handle(req, res, registry) {
  const url = new URL(req.url, 'http://local');
  const send = (status, html, headers = {}) => {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
    res.end(html);
  };

  if (url.pathname === '/dashboard/entrer') {
    const discordId = await auth.consumeLoginToken(url.searchParams.get('jeton'));
    if (!discordId) {
      const page = messagePage('🔒 Lien expiré', 'Ce lien de connexion n’est plus valable.<br>Tape <code>/tableau-de-bord</code> sur Discord pour en recevoir un nouveau.', 401);
      return send(page.status, page.html);
    }
    return send(302, '', { location: '/dashboard', 'set-cookie': await auth.sessionCookie(discordId) });
  }

  if (url.pathname === '/dashboard/sortir') {
    return send(302, '', { location: '/dashboard', 'set-cookie': auth.clearCookie() });
  }

  const discordId = await auth.sessionUser(req);
  if (!discordId) {
    const page = messagePage('🌊 Tableau de bord', 'Réservé à l’équipage.<br>Tape <code>/tableau-de-bord</code> sur le serveur Discord pour recevoir ton lien de connexion.', 401);
    return send(page.status, page.html);
  }
  const viewer = await staffInfo(registry, discordId);
  if (!viewer.ok) {
    const page = messagePage('⛔ Accès refusé', 'Ton compte ne fait plus partie de l’équipage du serveur.', 403);
    return send(page.status, page.html, { 'set-cookie': auth.clearCookie() });
  }
  return send(200, renderPage(await collect(registry), viewer));
}

module.exports = { handle, renderPage, collect };
