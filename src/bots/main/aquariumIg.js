// /aquariumig : un GIF d'aquarium avec les 3 meilleurs poissons pêchés DANS le jeu Roblox.
// Les index arrivent du jeu toutes les minutes (voir lib/aquariumStore.js) ; la commande
// s'utilise dans #aquarium-ig, que ce module crée s'il manque.

const { AttachmentBuilder, GatewayIntentBits, MessageFlags, SlashCommandBuilder } = require('discord.js');
const layout = require('../../lib/layout');
const store = require('../../lib/aquariumStore');
const roblox = require('../../lib/roblox');
const { renderAquariumGif, rarityColor } = require('../../lib/aquariumGif');
const { findChannel, findRole, loadStoredIds, saveStoredIds } = require('../../lib/guild');
const { resolveOverwrites } = require('../../setup/buildServer');
const { oceanEmbed, colors, fail, paragraphs } = require('../../lib/embeds');
const { ensurePanel, unix } = require('../../lib/util');

const FOOTER = 'Ocean Quest ・ Aquarium IG';
const COOLDOWN_MS = 15 * 1000;
const MEDALS = ['🥇', '🥈', '🥉'];
const cooldowns = new Map();
const gifCache = new Map(); // signature -> Buffer (les 20 derniers)

const RARITY_EMOJIS = [
  [/secret|divin|exotique|c[ée]leste/i, '✨'], [/mythi/i, '🔴'], [/l[ée]gend/i, '🟡'],
  [/[ée]pique/i, '🟣'], [/peu commun|uncommon/i, '🟢'], [/rare/i, '🔵'], [/commun|common/i, '⚪'],
];
const rarityEmoji = (label) => RARITY_EMOJIS.find(([re]) => re.test(label ?? ''))?.[1] ?? '🐟';

function formatWeight(kg) {
  if (kg === null || kg === undefined) return null;
  const fr = (value, digits) => value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
  if (kg >= 1000) return `${fr(kg / 1000, 2)} t`;
  return `${fr(kg, kg < 1 ? 3 : 1)} kg`;
}

const fishDetail = (fish) => [fish.mutation, formatWeight(fish.poids)].filter(Boolean).join(' · ');

function panelPayload() {
  return {
    embeds: [oceanEmbed({
      title: '🐠  Aquarium IG',
      description: paragraphs(
        '> Montre les **3 plus beaux poissons que tu as vraiment pêchés dans Ocean Quest** sur Roblox, en aquarium animé !',
        '### `/aquariumig pseudo:TonPseudoRoblox`\nLa première fois, donne ton pseudo Roblox : il est mémorisé.\n-# Ensuite, `/aquariumig` tout court suffit.',
        '### `/aquariumig membre:@quelqu’un`\nVisite l’aquarium d’un autre marin.',
        '### 🔄  Toujours à jour\nPendant que tu joues, le jeu envoie ton index au bot **toutes les minutes**.\n-# Pas encore de poissons ? Lance Ocean Quest, pêche, puis refais la commande.',
      ),
      color: colors.lagoon,
      footer: FOOTER,
      timestamp: false,
    })],
  };
}

// Le salon est au plan (layout.js) : /setup le crée aussi, mais on n'attend pas qu'un admin le lance.
async function ensureChannel(guild) {
  if (findChannel(guild, 'aquarium_ig')) return;
  const def = layout.allChannels().find((c) => c.key === 'aquarium_ig');
  const parent = findChannel(guild, def.category);
  const roleIds = Object.fromEntries(layout.roles.map((r) => [r.key, findRole(guild, r.key)?.id]).filter(([, id]) => id));
  const channel = await guild.channels.create({
    name: layout.channelName(def),
    type: def.type,
    parent: parent?.id,
    topic: def.topic,
    permissionOverwrites: resolveOverwrites(guild, roleIds, def.access),
    reason: 'Ocean Quest • salon Aquarium IG',
  });
  const bestiary = findChannel(guild, 'bestiary');
  if (bestiary && bestiary.parentId === channel.parentId) await channel.setPosition(bestiary.position + 1).catch(() => null);

  const ids = (await loadStoredIds(guild.id)) ?? { channels: {}, roles: {} };
  await saveStoredIds(guild.id, { ...ids, channels: { ...ids.channels, aquarium_ig: channel.id } });
  console.log(`[aquarium] salon ${channel.name} créé`);
}

async function renderFor(account, player) {
  const fishes = player.poissons.slice(0, 3);
  const title = `Aquarium de ${player.affichage || account.displayName || account.name}`;
  const count = player.especes !== null && player.especes !== undefined
    ? `${player.especes}${player.totalEspeces ? ` / ${player.totalEspeces}` : ''} espèces à l’index`
    : `@${player.pseudo || account.name}`;
  const signature = JSON.stringify([title, count, fishes]);
  if (gifCache.has(signature)) return gifCache.get(signature);

  const [avatar, images] = await Promise.all([
    roblox.headshot(account.id),
    roblox.assetImages(fishes.map((f) => f.image)),
  ]);
  const gif = renderAquariumGif({
    title,
    subtitle: `${count} · Ocean Quest`,
    avatar,
    fishes: fishes.map((f) => ({
      name: f.nom, rarity: f.rarete, color: f.couleur, detail: fishDetail(f), image: images.get(f.image) ?? null,
    })),
  });
  gifCache.set(signature, gif);
  if (gifCache.size > 20) gifCache.delete(gifCache.keys().next().value);
  return gif;
}

const ephemeralFail = (interaction, description, title) => interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [fail(description, title)] });

const commands = [
  {
    data: new SlashCommandBuilder().setName('aquariumig').setDescription('🐠 Ton aquarium animé avec tes 3 meilleurs poissons pêchés en jeu')
      .addStringOption((o) => o.setName('pseudo').setDescription('Ton pseudo Roblox (mémorisé pour la prochaine fois)').setMaxLength(20))
      .addUserOption((o) => o.setName('membre').setDescription('Voir l’aquarium d’un autre marin')),
    async execute(interaction) {
      const { guild, user } = interaction;
      const channel = findChannel(guild, 'aquarium_ig');
      if (channel && interaction.channelId !== channel.id) {
        return ephemeralFail(interaction, `Les aquariums s’exposent dans ${channel} : tape \`/aquariumig\` là-bas !`, '🐠 Mauvais bassin');
      }

      const last = cooldowns.get(user.id) ?? 0;
      if (Date.now() < last + COOLDOWN_MS) {
        return ephemeralFail(interaction, `Les poissons se reposent… Réessaie <t:${unix(last + COOLDOWN_MS)}:R>.`, '⏳ Patience, marin');
      }

      const member = interaction.options.getUser('membre');
      const pseudo = interaction.options.getString('pseudo')?.trim();
      let account;
      let linked = false;
      if (member) {
        account = await store.getLink(member.id);
        if (!account) return ephemeralFail(interaction, `${member} n’a pas encore relié son compte Roblox.\n-# Il lui suffit de taper \`/aquariumig pseudo:SonPseudo\` ici.`, '🔗 Compte non relié');
      } else if (pseudo) {
        if (!/^[A-Za-z0-9_]{3,20}$/.test(pseudo)) return ephemeralFail(interaction, 'Un pseudo Roblox fait 3 à 20 caractères : lettres, chiffres et `_`.', '🔎 Pseudo invalide');
        account = await roblox.userByName(pseudo).catch(() => undefined);
        if (account === undefined) return ephemeralFail(interaction, 'Roblox ne répond pas pour l’instant. Réessaie dans un moment.', '📡 Pas de signal');
        if (!account) return ephemeralFail(interaction, `Aucun compte Roblox ne s’appelle **${pseudo}**.`, '🔎 Introuvable');
        await store.setLink(user.id, account);
        linked = true;
      } else {
        account = await store.getLink(user.id);
        if (!account) return ephemeralFail(interaction, 'Première fois ? Donne ton pseudo Roblox :\n`/aquariumig pseudo:TonPseudoRoblox`\n-# Il sera mémorisé pour les prochaines fois.', '🔗 Relie ton compte Roblox');
      }

      const player = await store.getPlayer(account.id);
      if (!player?.poissons?.length) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [oceanEmbed({
          title: linked ? '🔗 Compte relié !' : '🎣 Aquarium vide',
          description: paragraphs(
            `${linked ? `Ton compte Roblox **${account.name}** est bien relié. ` : ''}Aucun poisson reçu du jeu pour **${account.name}** pour l’instant.`,
            '> Lance **Ocean Quest** sur Roblox et pêche : ton index est envoyé au bot **toutes les minutes**, puis refais `/aquariumig`.',
          ),
          color: colors.foam,
          footer: FOOTER,
        })] });
      }

      cooldowns.set(user.id, Date.now());
      await interaction.deferReply();
      const gif = await renderFor(account, player);
      const best = player.poissons[0];
      const lines = player.poissons.slice(0, 3).map((f, i) => {
        const detail = fishDetail(f);
        return `${MEDALS[i]} **${f.nom}** ・ ${rarityEmoji(f.rarete)} ${f.rarete || 'Rareté inconnue'}${detail ? ` ・ ${detail}` : ''}`;
      });
      const fields = [];
      if (player.especes !== null && player.especes !== undefined) {
        fields.push({ name: '📖 Index', value: `${player.especes}${player.totalEspeces ? ` / ${player.totalEspeces}` : ''} espèces`, inline: true });
      }
      fields.push({ name: '🎮 Vu en jeu', value: `<t:${unix(player.vuEnJeu)}:R>`, inline: true });

      const file = new AttachmentBuilder(gif, { name: 'aquarium-ig.gif' });
      return interaction.editReply({
        content: member ? `${user} visite l’aquarium de ${member}` : '',
        embeds: [oceanEmbed({
          title: `🐠 Aquarium de ${player.affichage || account.displayName}`,
          description: paragraphs(lines.join('\n'), `-# 🎮 Compte Roblox : [${account.name}](https://www.roblox.com/users/${account.id}/profile)`),
          color: parseInt(rarityColor(best.rarete, best.couleur).slice(1), 16),
          fields,
          image: 'attachment://aquarium-ig.gif',
          footer: FOOTER,
        })],
        files: [file],
        allowedMentions: { parse: [] },
      });
    },
  },
];

module.exports = {
  name: 'aquariumIg',
  intents: [GatewayIntentBits.Guilds],
  commands,
  async onReady(client, guild) {
    await store.ensureSecret().catch((e) => console.warn('[aquarium] clé du jeu :', e.message));
    await ensureChannel(guild).catch((e) => console.error('[aquarium] création du salon :', e.message));
  },
  async panels(client, guild, ctx) {
    const channel = findChannel(guild, 'aquarium_ig');
    if (channel) await ensurePanel(client, channel, panelPayload(), { otherBotIds: ctx.otherBotIds(), pin: true });
  },
};
