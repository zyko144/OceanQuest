// Jeu en direct : salon « 🎮 En mer : N », statut du bot et annonce automatique des mises à jour.

const { ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, GatewayIntentBits } = require('discord.js');
const config = require('../../config');
const layout = require('../../lib/layout');
const robloxGame = require('../../lib/robloxGame');
const { findChannel, findRole } = require('../../lib/guild');
const { oceanEmbed, colors, paragraphs } = require('../../lib/embeds');
const { unix } = require('../../lib/util');
const { ensureLayoutChannel } = require('../../setup/ensureChannel');

// Discord limite le renommage d'un salon à 2 fois par 10 minutes.
const RENAME_EVERY_MS = 6 * 60 * 1000;
// Plusieurs publications rapprochées = une seule annonce.
const ANNOUNCE_GAP_MS = 15 * 60 * 1000;

const fr = (n) => Number(n ?? 0).toLocaleString('fr-FR');
let lastRename = 0;
let lastAnnounceAt = 0;

function playButton(label = 'Jouer maintenant') {
  const url = robloxGame.gameUrl();
  return url ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setEmoji('🎮').setLabel(label))] : [];
}

async function updatePlayersChannel(guild, status) {
  const def = layout.allChannels().find((c) => c.key === 'stats_players');
  const name = layout.channelName(def, status.info ? fr(status.info.playing) : '—');
  const channel = await ensureLayoutChannel(guild, 'stats_players', { name, after: 'stats_members' });
  if (!channel || channel.name === name || Date.now() - lastRename < RENAME_EVERY_MS) return;
  lastRename = Date.now();
  await channel.setName(name, 'Joueurs en ligne sur Roblox').catch(() => null);
}

function updatePresence(client, status) {
  const playing = status.info?.playing;
  const name = playing === undefined ? '🎣 Ocean Quest sur Roblox' : `🎮 ${fr(playing)} marin${playing > 1 ? 's' : ''} en mer`;
  client.user.setPresence({ activities: [{ name, type: ActivityType.Custom }], status: 'online' });
}

async function announceUpdate(guild, status) {
  const updated = status.info?.updated;
  if (!updated) return;
  const previous = await robloxGame.lastAnnounced();
  if (!previous) {
    // Première fois : on mémorise sans annoncer une vieille mise à jour.
    await robloxGame.setLastAnnounced(updated);
    return;
  }
  if (new Date(updated) <= new Date(previous)) return;
  await robloxGame.setLastAnnounced(updated);
  if (Date.now() - lastAnnounceAt < ANNOUNCE_GAP_MS) return;

  const channel = findChannel(guild, 'updates');
  if (!channel) return;
  lastAnnounceAt = Date.now();
  const ping = config.game.pingOnUpdate ? findRole(guild, 'ping_updates') : null;
  await channel.send({
    content: ping ? `${ping}` : undefined,
    embeds: [oceanEmbed({
      title: '🆕  Nouvelle marée sur Ocean Quest !',
      description: paragraphs(
        '> Le jeu vient d’être **mis à jour** ! 🌊',
        '🔄 **Relance le jeu** pour profiter des nouveautés.',
        `-# 🕒 Mise à jour publiée <t:${unix(updated)}:R> ・ 🎮 ${fr(status.info.playing)} marins en mer`,
      ),
      color: colors.lagoon,
      image: status.images.thumbnail ?? undefined,
      thumbnail: status.images.icon ?? undefined,
      footer: 'Ocean Quest ・ Mises à jour',
    })],
    components: playButton('Jouer à la nouvelle version'),
    allowedMentions: { roles: ping ? [ping.id] : [] },
  });
  console.log(`[roblox] mise à jour du ${updated} annoncée`);
}

module.exports = {
  name: 'robloxStatus',
  intents: [GatewayIntentBits.Guilds],
  playButton,
  async onReady(client, guild) {
    await robloxGame.loadPlaceId();
    robloxGame.onRefresh(async (status) => {
      updatePresence(client, status);
      await updatePlayersChannel(guild, status).catch((e) => console.warn('[roblox] salon joueurs :', e.message));
      await announceUpdate(guild, status).catch((e) => console.warn('[roblox] annonce :', e.message));
    });
    if (!robloxGame.getStatus().configured) {
      console.log('[roblox] jeu pas encore configuré : ROBLOX_GAME_URL vide, en attente du premier contact du jeu');
      await updatePlayersChannel(guild, robloxGame.getStatus()).catch(() => null);
    }
    await robloxGame.refresh();
    setInterval(() => robloxGame.refresh().catch(() => null), Math.max(60, config.game.pollSec) * 1000).unref();
  },
};
