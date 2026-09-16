// Liaison vérifiée Discord ↔ Roblox : /lier, /delier, /profil, /recompense-roblox.
// Vérification : le joueur colle une phrase de 4 mots marins dans sa description Roblox
// (des mots plutôt que des chiffres, que Roblox masque chez les moins de 13 ans).

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder,
} = require('discord.js');
const config = require('../../config');
const db = require('../../lib/db');
const roblox = require('../../lib/roblox');
const robloxLinks = require('../../lib/robloxLinks');
const aquariumStore = require('../../lib/aquariumStore');
const { findRole, isStaff } = require('../../lib/guild');
const { oceanEmbed, colors, ok, fail, paragraphs } = require('../../lib/embeds');
const { ephemeral, sendLog, sleep, pick, unix } = require('../../lib/util');
const { levelFromXp } = require('./levels');

const FOOTER = 'Ocean Quest ・ Compte Roblox';
const WORDS = ['requin', 'corail', 'vague', 'ancre', 'phare', 'perle', 'marin', 'dauphin', 'baleine', 'boussole',
  'voilier', 'lagon', 'epave', 'tresor', 'mouette', 'crabe', 'poulpe', 'meduse', 'algue', 'recif', 'hublot', 'sirene', 'coquillage', 'tortue'];
const PENDING_MS = 20 * 60 * 1000;
const DANGEROUS = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.BanMembers, P.KickMembers,
  P.ModerateMembers, P.ManageMessages, P.MentionEveryone, P.ManageWebhooks];
const REWARD_TYPES = {
  badge: { label: '🏅 Badge du jeu', describe: (r) => `badge \`${r.value}\`` },
  gamepass: { label: '🎟️ Game pass', describe: (r) => `game pass \`${r.value}\`` },
  especes: { label: '📖 Espèces à l’index', describe: (r) => `${r.value} espèces à l’index` },
};
const pending = new Map(); // discordId -> { account, phrase, expires }

const normalize = (text) => String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const profileUrl = (id) => `https://www.roblox.com/users/${id}/profile`;

// ───────── Récompenses ─────────

async function qualifies(link, reward) {
  if (reward.type === 'especes') {
    const player = await aquariumStore.getPlayer(Number(link.id));
    return (player?.especes ?? 0) >= Number(reward.value);
  }
  return roblox.ownsItem(link.id, reward.type, reward.value);
}

// Ajoute / retire les rôles d'un membre selon son lien et les récompenses. Une erreur Roblox ne retire rien.
async function syncMember(guild, discordId, rewards) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return { added: [], removed: [] };
  const link = await robloxLinks.get(discordId);
  const wanted = new Map(); // roleId -> true | false | null (inconnu)
  const linkedRole = findRole(guild, 'roblox_linked');
  if (linkedRole) wanted.set(linkedRole.id, Boolean(link));

  for (const reward of rewards) {
    const role = guild.roles.cache.get(reward.roleId);
    if (!role?.editable) continue;
    const result = link ? await qualifies(link, reward).catch(() => null) : false;
    const current = wanted.get(role.id);
    if (current === true) continue;
    wanted.set(role.id, result === null ? (current ?? null) : result || Boolean(current));
    if (link && reward.type !== 'especes') await sleep(250);
  }

  const added = [];
  const removed = [];
  for (const [roleId, give] of wanted) {
    if (give === null) continue;
    const has = member.roles.cache.has(roleId);
    if (give && !has) added.push(roleId);
    if (!give && has) removed.push(roleId);
  }
  if (added.length) await member.roles.add(added, 'Récompenses Roblox').catch(() => null);
  if (removed.length) await member.roles.remove(removed, 'Récompenses Roblox').catch(() => null);
  return { added, removed };
}

async function syncAll(guild) {
  const [links, rewards] = await Promise.all([robloxLinks.list(), robloxLinks.rewards()]);
  let changes = 0;
  for (const link of links) {
    const { added, removed } = await syncMember(guild, link.discordId, rewards);
    changes += added.length + removed.length;
    await sleep(500);
  }
  return { members: links.length, changes };
}

// ───────── /lier ─────────

function verifyPayload(entry) {
  return {
    embeds: [oceanEmbed({
      title: '🔗  Relie ton compte Roblox',
      description: paragraphs(
        `> Compte trouvé : **${entry.account.displayName}** (@${entry.account.name})`,
        '### 1️⃣  Ouvre ton profil Roblox\nClique sur le bouton **Mon profil Roblox** ci-dessous.',
        `### 2️⃣  Colle cette phrase dans ta description\n\`\`\`${entry.phrase}\`\`\`\n-# Sur Roblox : modifie la partie « À propos » de ton profil, puis enregistre.`,
        '### 3️⃣  Reviens ici et clique sur ✅ Vérifier',
        `-# ⏳ Cette phrase expire <t:${unix(entry.expires)}:R>. Tu pourras l’enlever après la vérification.`,
      ),
      thumbnail: entry.headshot ?? undefined,
      color: colors.ocean,
      footer: FOOTER,
    })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(profileUrl(entry.account.id)).setEmoji('👤').setLabel('Mon profil Roblox'),
      new ButtonBuilder().setCustomId('rlink:verify').setStyle(ButtonStyle.Success).setEmoji('✅').setLabel('Vérifier'),
      new ButtonBuilder().setCustomId('rlink:cancel').setStyle(ButtonStyle.Secondary).setLabel('Annuler'),
    )],
  };
}

async function onVerify(interaction) {
  const entry = pending.get(interaction.user.id);
  if (!entry || entry.expires < Date.now()) {
    pending.delete(interaction.user.id);
    return interaction.update({ embeds: [fail('Cette vérification a expiré. Recommence avec `/lier`.')], components: [] });
  }
  await interaction.deferUpdate();
  const user = await roblox.userById(entry.account.id).catch(() => undefined);
  if (user === undefined) {
    return interaction.followUp(ephemeral({ embeds: [fail('Roblox ne répond pas pour l’instant. Réessaie dans une minute.', '📡 Pas de signal')] }));
  }
  if (!user || !normalize(user.description).includes(normalize(entry.phrase))) {
    return interaction.followUp(ephemeral({ embeds: [fail(paragraphs(
      'Je ne trouve pas la phrase dans ta description Roblox. 🔎',
      '• Vérifie que tu as bien cliqué sur **Enregistrer** sur Roblox\n• Attends quelques secondes, puis reclique sur ✅ Vérifier',
    ), '❌  Pas encore')] }));
  }

  const owner = await robloxLinks.ownerOf(user.id);
  if (owner && owner !== interaction.user.id) {
    pending.delete(interaction.user.id);
    return interaction.editReply({ embeds: [fail('Ce compte Roblox est déjà relié à un autre membre du serveur.\n-# Si c’est une erreur, ouvre un ticket.')], components: [] });
  }

  pending.delete(interaction.user.id);
  await robloxLinks.set(interaction.user.id, user);
  const rewards = await robloxLinks.rewards();
  const { added } = await syncMember(interaction.guild, interaction.user.id, rewards);
  await interaction.editReply({
    embeds: [oceanEmbed({
      title: '🎉  Compte Roblox relié !',
      description: paragraphs(
        `> Bienvenue à bord, **${user.displayName}** ! Ton compte est vérifié. ✅`,
        added.length ? `🎁 Rôles obtenus : ${added.map((id) => `<@&${id}>`).join(' ')}` : null,
        '🧹 Tu peux maintenant **retirer la phrase** de ta description Roblox.',
        '-# Tape `/profil` pour voir ta fiche de marin.',
      ),
      thumbnail: entry.headshot ?? undefined,
      color: colors.success,
      footer: FOOTER,
    })],
    components: [],
  });
  return sendLog(interaction.guild, 'log_members', oceanEmbed({
    description: `🔗 ${interaction.user} \`${interaction.user.id}\` a relié le compte Roblox [${user.name}](${profileUrl(user.id)}) \`${user.id}\``,
    color: colors.lagoon,
    footer: FOOTER,
  }));
}

// ───────── /profil ─────────

async function profilePayload(guild, target) {
  const link = await robloxLinks.get(target.id) ?? await aquariumStore.getLink(target.id);
  const [levelRow, fisher] = await Promise.all([db.levels.get(guild.id, target.id), db.fishers.get(guild.id, target.id)]);
  const fields = [
    { name: '🎣 Niveau Discord', value: `${levelFromXp(levelRow.xp).level}`, inline: true },
    { name: '🪙 Doublons', value: Number(fisher.coins ?? 0).toLocaleString('fr-FR'), inline: true },
    { name: '🐟 Prises Discord', value: `${fisher.catches ?? 0}`, inline: true },
  ];
  if (!link) {
    return {
      embeds: [oceanEmbed({
        title: `🧭  Fiche de ${target.displayName ?? target.username}`,
        description: paragraphs('> Aucun compte Roblox relié.', '-# Tape `/lier` pour relier ton compte et débloquer ta fiche complète !'),
        thumbnail: target.displayAvatarURL({ size: 256 }),
        fields,
        color: colors.foam,
        footer: FOOTER,
      })],
      components: [],
    };
  }
  const [user, headshot, player] = await Promise.all([
    roblox.userById(link.id).catch(() => null),
    roblox.headshotUrl(link.id).catch(() => null),
    aquariumStore.getPlayer(Number(link.id)),
  ]);
  if (player?.especes !== null && player?.especes !== undefined) {
    fields.push({ name: '📖 Index en jeu', value: `${player.especes}${player.totalEspeces ? ` / ${player.totalEspeces}` : ''} espèces`, inline: true });
  }
  if (player?.poissons?.[0]) fields.push({ name: '🏆 Plus belle prise en jeu', value: `${player.poissons[0].nom} (${player.poissons[0].rarete || '?'})`, inline: true });
  if (player?.vuEnJeu) fields.push({ name: '🎮 Vu en jeu', value: `<t:${unix(player.vuEnJeu)}:R>`, inline: true });
  if (user?.created) fields.push({ name: '📅 Compte Roblox créé', value: `<t:${unix(user.created)}:D>`, inline: true });

  return {
    embeds: [oceanEmbed({
      title: `🧭  Fiche de ${link.displayName ?? link.name}`,
      description: paragraphs(
        `> 🎮 **@${link.name}** sur Roblox ・ ${target}`,
        link.verified ? '✅ Compte **vérifié**' : '⚠️ Compte **non vérifié** — tape `/lier` pour le vérifier',
      ),
      thumbnail: headshot ?? target.displayAvatarURL({ size: 256 }),
      fields,
      color: link.verified ? colors.success : colors.warning,
      footer: FOOTER,
    })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(profileUrl(link.id)).setEmoji('👤').setLabel('Profil Roblox'),
    )],
  };
}

// ───────── Commandes ─────────

const commands = [
  {
    data: new SlashCommandBuilder().setName('lier').setDescription('🔗 Relier ton compte Roblox à Discord')
      .addStringOption((o) => o.setName('pseudo').setDescription('Ton pseudo Roblox (pas le nom d’affichage)').setRequired(true).setMinLength(3).setMaxLength(20)),
    async execute(interaction) {
      const pseudo = interaction.options.getString('pseudo').trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(pseudo)) {
        return interaction.reply(ephemeral({ embeds: [fail('Un pseudo Roblox fait 3 à 20 caractères : lettres, chiffres et `_`.', '🔎 Pseudo invalide')] }));
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const account = await roblox.userByName(pseudo).catch(() => undefined);
      if (account === undefined) return interaction.editReply({ embeds: [fail('Roblox ne répond pas pour l’instant. Réessaie dans une minute.', '📡 Pas de signal')] });
      if (!account) return interaction.editReply({ embeds: [fail(`Aucun compte Roblox ne s’appelle **${pseudo}**.\n-# Utilise ton pseudo (@…), pas ton nom d’affichage.`, '🔎 Introuvable')] });

      const current = await robloxLinks.get(interaction.user.id);
      if (current && String(current.id) === String(account.id)) {
        return interaction.editReply({ embeds: [ok(`Ton compte **${account.name}** est déjà relié et vérifié. ✅`)] });
      }
      const phrase = Array.from({ length: 4 }, () => pick(WORDS)).join(' ');
      const entry = { account, phrase, expires: Date.now() + PENDING_MS, headshot: await roblox.headshotUrl(account.id).catch(() => null) };
      pending.set(interaction.user.id, entry);
      return interaction.editReply(verifyPayload(entry));
    },
  },
  {
    data: new SlashCommandBuilder().setName('delier').setDescription('✂️ Retirer la liaison avec ton compte Roblox'),
    async execute(interaction) {
      const removed = await robloxLinks.remove(interaction.user.id);
      if (!removed) return interaction.reply(ephemeral({ embeds: [fail('Aucun compte Roblox vérifié n’est relié à ton Discord.')] }));
      await syncMember(interaction.guild, interaction.user.id, await robloxLinks.rewards());
      return interaction.reply(ephemeral({ embeds: [ok(`Ton compte **${removed.name}** n’est plus relié. Les rôles liés au jeu ont été retirés.`, '✂️ Liaison retirée')] }));
    },
  },
  {
    data: new SlashCommandBuilder().setName('profil').setDescription('🧭 Ta fiche de marin : compte Roblox, niveau, doublons, index')
      .addUserOption((o) => o.setName('membre').setDescription('Voir la fiche d’un autre marin')),
    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser('membre') ?? interaction.user;
      return interaction.editReply(await profilePayload(interaction.guild, target));
    },
  },
  {
    data: new SlashCommandBuilder().setName('recompense-roblox').setDescription('🎁 Rôles donnés selon le jeu Roblox (admins)')
      .setDefaultMemberPermissions(P.ManageGuild)
      .addSubcommand((s) => s.setName('ajouter').setDescription('Donner un rôle pour un badge, un game pass ou un index')
        .addStringOption((o) => o.setName('type').setDescription('Condition').setRequired(true)
          .addChoices(...Object.entries(REWARD_TYPES).map(([value, t]) => ({ name: t.label, value }))))
        .addStringOption((o) => o.setName('valeur').setDescription('ID du badge / game pass, ou nombre d’espèces').setRequired(true).setMaxLength(20))
        .addRoleOption((o) => o.setName('role').setDescription('Rôle à donner').setRequired(true)))
      .addSubcommand((s) => s.setName('retirer').setDescription('Supprimer une récompense')
        .addStringOption((o) => o.setName('recompense').setDescription('Récompense à supprimer').setRequired(true).setAutocomplete(true)))
      .addSubcommand((s) => s.setName('liste').setDescription('Voir les récompenses configurées'))
      .addSubcommand((s) => s.setName('synchroniser').setDescription('Revérifier tout de suite les comptes reliés')),

    async autocomplete(interaction) {
      const all = await robloxLinks.rewards();
      const query = normalize(interaction.options.getFocused());
      const choices = all.map((r) => ({
        name: `${REWARD_TYPES[r.type].label} ・ ${r.label ?? r.value} → @${interaction.guild.roles.cache.get(r.roleId)?.name ?? 'rôle supprimé'}`.slice(0, 100),
        value: r.id,
      })).filter((c) => normalize(c.name).includes(query)).slice(0, 25);
      return interaction.respond(choices);
    },

    async execute(interaction) {
      if (!isStaff(interaction.member, 'admin')) return interaction.reply(ephemeral({ embeds: [fail('Réservé aux Amiraux.')] }));
      const sub = interaction.options.getSubcommand();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (sub === 'ajouter') {
        const type = interaction.options.getString('type');
        const value = interaction.options.getString('valeur').trim();
        const role = interaction.options.getRole('role');
        if (role.managed || role.id === interaction.guild.id) return interaction.editReply({ embeds: [fail('Ce rôle ne peut pas être donné automatiquement.')] });
        if (DANGEROUS.some((perm) => (BigInt(role.permissions.bitfield ?? role.permissions) & perm) !== 0n)) {
          return interaction.editReply({ embeds: [fail('Par sécurité, un rôle avec des permissions de modération ou d’administration ne peut pas être une récompense.')] });
        }
        const guildRole = interaction.guild.roles.cache.get(role.id);
        if (!guildRole?.editable) return interaction.editReply({ embeds: [fail(`Je ne peux pas donner ${role} : place mon rôle au-dessus dans *Paramètres → Rôles*.`)] });
        if (!/^\d+$/.test(value) || Number(value) <= 0) return interaction.editReply({ embeds: [fail('La valeur doit être un nombre (ID ou nombre d’espèces).')] });

        let label = type === 'especes' ? `${value} espèces` : null;
        if (type !== 'especes') {
          label = await roblox.itemName(type, value);
          if (!label) return interaction.editReply({ embeds: [fail(`Aucun ${type === 'badge' ? 'badge' : 'game pass'} Roblox trouvé avec l’ID \`${value}\`.`)] });
        }
        const reward = await robloxLinks.addReward({ type, value, roleId: role.id, label });
        return interaction.editReply({ embeds: [ok(paragraphs(
          `${role} sera donné aux comptes reliés qui ont : **${label}** (${REWARD_TYPES[type].describe(reward)}).`,
          `-# Vérification automatique toutes les ${config.roblox.rewardSyncMin} min, ou tout de suite avec \`/recompense-roblox synchroniser\`.`,
        ), '🎁 Récompense ajoutée')] });
      }

      if (sub === 'retirer') {
        const removed = await robloxLinks.removeReward(interaction.options.getString('recompense'));
        if (!removed) return interaction.editReply({ embeds: [fail('Récompense introuvable.')] });
        return interaction.editReply({ embeds: [ok(`Récompense **${removed.label ?? removed.value}** → <@&${removed.roleId}> supprimée.\n-# Les rôles déjà donnés restent jusqu’à la prochaine synchronisation.`)] });
      }

      if (sub === 'liste') {
        const [all, links] = await Promise.all([robloxLinks.rewards(), robloxLinks.list()]);
        return interaction.editReply({ embeds: [oceanEmbed({
          title: '🎁  Récompenses Roblox',
          description: paragraphs(
            `> 🔗 **${links.length}** compte(s) Roblox relié(s) et vérifié(s).`,
            all.length
              ? all.map((r) => `${REWARD_TYPES[r.type].label} ・ **${r.label ?? r.value}** → <@&${r.roleId}>`).join('\n')
              : 'Aucune récompense pour l’instant.\n-# Ajoute-en une avec `/recompense-roblox ajouter`.',
          ),
          color: colors.gold,
          footer: FOOTER,
        })] });
      }

      const result = await syncAll(interaction.guild);
      return interaction.editReply({ embeds: [ok(`${result.members} compte(s) vérifié(s), ${result.changes} changement(s) de rôle.`, '🔄 Synchronisation terminée')] });
    },
  },
];

module.exports = {
  name: 'robloxLink',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  commands,
  components: {
    rlink: async (interaction, [action]) => {
      if (action === 'verify') return onVerify(interaction);
      if (action === 'cancel') {
        pending.delete(interaction.user.id);
        return interaction.update({ embeds: [ok('Liaison annulée. Tu peux recommencer quand tu veux avec `/lier`.', '👋 Annulé')], components: [] });
      }
      return null;
    },
  },
  async onReady(client, guild) {
    const every = Math.max(10, config.roblox.rewardSyncMin) * 60 * 1000;
    setInterval(() => syncAll(guild).catch((e) => console.warn('[roblox] récompenses :', e.message)), every).unref();
  },
  syncMember,
};
