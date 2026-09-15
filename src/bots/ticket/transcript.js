// Génère un transcript HTML (thème océan) de tous les messages d'un ticket.

const { AttachmentBuilder } = require('discord.js');

const escape = (text = '') => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function fetchAllMessages(channel, max = 2000) {
  const all = [];
  let before;
  while (all.length < max) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.reverse();
}

function renderMessage(message) {
  const time = new Date(message.createdTimestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const content = escape(message.content).replace(/\n/g, '<br>');
  const embeds = message.embeds.map((embed) => `
    <div class="embed" style="border-color:${embed.hexColor ?? '#00b4d8'}">
      ${embed.title ? `<div class="embed-title">${escape(embed.title)}</div>` : ''}
      ${embed.description ? `<div>${escape(embed.description).replace(/\n/g, '<br>')}</div>` : ''}
      ${embed.fields.map((f) => `<div class="field"><b>${escape(f.name)}</b><br>${escape(f.value).replace(/\n/g, '<br>')}</div>`).join('')}
    </div>`).join('');
  const files = [...message.attachments.values()]
    .map((a) => `<a class="file" href="${escape(a.url)}" target="_blank">📎 ${escape(a.name)}</a>`).join('');
  return `
  <div class="msg">
    <img class="avatar" src="${escape(message.author.displayAvatarURL({ size: 64 }))}" alt="">
    <div>
      <div class="meta"><span class="author ${message.author.bot ? 'bot' : ''}">${escape(message.member?.displayName ?? message.author.username)}</span>
      ${message.author.bot ? '<span class="tag">BOT</span>' : ''}<span class="time">${time}</span></div>
      ${content ? `<div class="content">${content}</div>` : ''}${embeds}${files}
    </div>
  </div>`;
}

async function buildTranscript(channel, ticket) {
  const messages = await fetchAllMessages(channel);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Transcript ticket #${ticket.number}</title>
<style>
body{margin:0;background:#021024;color:#dbeafe;font:15px/1.5 system-ui,sans-serif}
header{padding:28px 32px;background:linear-gradient(135deg,#03045e,#0077b6);border-bottom:3px solid #00b4d8}
header h1{margin:0 0 6px;font-size:22px}header p{margin:2px 0;opacity:.85}
main{padding:16px 32px 48px}.msg{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #0b2545}
.avatar{width:40px;height:40px;border-radius:50%}.meta{display:flex;gap:8px;align-items:center}
.author{font-weight:600;color:#90e0ef}.author.bot{color:#ffd60a}.tag{font-size:10px;background:#0077b6;padding:1px 5px;border-radius:4px}
.time{font-size:12px;opacity:.6}.content{white-space:normal;word-break:break-word}
.embed{margin-top:6px;padding:8px 12px;background:#0b2545;border-left:4px solid;border-radius:4px;max-width:640px}
.embed-title{font-weight:600;margin-bottom:4px}.field{margin-top:6px}.file{display:inline-block;margin-top:6px;color:#48cae4}
</style></head><body>
<header><h1>🌊 Ocean Quest — Ticket #${ticket.number}</h1>
<p>Type : ${escape(ticket.typeLabel)} · Ouvert par ${escape(ticket.ownerTag)} (${escape(ticket.user_id)})</p>
<p>Salon : #${escape(channel.name)} · ${messages.length} messages · généré le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>
</header><main>${messages.map(renderMessage).join('')}</main></body></html>`;

  return {
    count: messages.length,
    participants: [...new Set(messages.filter((m) => !m.author.bot).map((m) => m.author.id))],
    attachment: new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `transcript-ticket-${ticket.number}.html` }),
  };
}

module.exports = { buildTranscript };
