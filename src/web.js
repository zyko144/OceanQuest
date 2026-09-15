// Petit serveur HTTP requis par Render (Web Service) + auto-ping pour éviter la mise en veille.

const http = require('node:http');
const config = require('./config');
const db = require('./lib/db');

function snapshot(registry) {
  return {
    status: registry.length && registry.every((b) => b.client?.isReady()) ? 'ok' : 'starting',
    uptime: Math.round(process.uptime()),
    bots: registry.map((b) => ({
      label: b.label,
      user: b.client?.user?.tag ?? null,
      ready: Boolean(b.client?.isReady()),
      ping: b.client?.ws?.ping ?? null,
      groups: b.groups,
      privilegedIntents: b.privileged,
    })),
    database: db.status(),
  };
}

function page(data) {
  const rows = data.bots.map((b) => `<li><strong>${b.label}</strong> — ${b.ready ? '🟢 en ligne' : '🟠 démarrage'} ${b.user ? `(${b.user})` : ''} · ${b.groups.join(', ')}</li>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Ocean Quest • Bots</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:linear-gradient(180deg,#023e8a,#03045e);color:#caf0f8}
main{max-width:560px;padding:32px}h1{margin:0 0 8px}ul{padding-left:18px;line-height:1.8}small{opacity:.7}</style></head>
<body><main><h1>🌊 Ocean Quest</h1><p>Les bots du port sont à flot.</p><ul>${rows}</ul>
<small>Base de données : ${data.database.tables.length ? `Supabase (${data.database.tables.length} tables)` : 'mémoire'} · uptime ${data.uptime}s</small></main></body></html>`;
}

function startWebServer(registry) {
  const server = http.createServer((req, res) => {
    const data = snapshot(registry);
    if (req.url?.startsWith('/health')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page(data));
  });
  server.listen(config.web.port, () => console.log(`[web] écoute sur le port ${config.web.port}`));

  if (config.web.keepAlive && config.web.publicUrl) {
    setInterval(() => {
      fetch(`${config.web.publicUrl}/health`).catch(() => null);
    }, 10 * 60 * 1000).unref();
    console.log(`[web] auto-ping activé sur ${config.web.publicUrl}/health`);
  }
  return server;
}

module.exports = { startWebServer };
