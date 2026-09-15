// Niveaux d'XP et rangs de pêcheur (rôles lvl5 → lvl75 de layout.js).

const { Events, GatewayIntentBits, MessageFlags, SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const db = require('../../lib/db');
const layout = require('../../lib/layout');
const { findChannel, findRole } = require('../../lib/guild');
const { oceanEmbed, colors } = require('../../lib/embeds');
const { randomInt } = require('../../lib/util');

const cooldowns = new Map();
const RANK_ROLES = layout.roles.filter((r) => r.level).sort((a, b) => b.level - a.level);

const xpToNext = (level) => 5 * level ** 2 + 50 * level + 100;
function levelFromXp(xp) {
  let level = 0;
  let remaining = xp;
  while (remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level += 1;
  }
  return { level, current: remaining, needed: xpToNext(level) };
}

function progressBar(current, needed, size = 12) {
  const filled = Math.round((current / needed) * size);
  return '🟦'.repeat(filled) + '⬛'.repeat(size - filled);
}

async function syncRankRoles(member, level) {
  const target = RANK_ROLES.find((r) => level >= r.level);
  const targetRole = target ? findRole(member.guild, target.key) : null;
  const toRemove = RANK_ROLES.map((r) => findRole(member.guild, r.key))
    .filter((role) => role && role.id !== targetRole?.id && member.roles.cache.has(role.id));
  if (toRemove.length) await member.roles.remove(toRemove, 'Rang de pêcheur').catch(() => null);
  if (targetRole && !member.roles.cache.has(targetRole.id)) {
    await member.roles.add(targetRole, 'Rang de pêcheur').catch(() => null);
    return targetRole;
  }
  return null;
}

async function onMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId || !message.member) return;
  const key = message.author.id;
  const now = Date.now();
  if (now - (cooldowns.get(key) ?? 0) < config.levels.cooldownSec * 1000) return;
  cooldowns.set(key, now);

  const row = { ...(await db.levels.get(message.guild.id, key)) };
  row.xp += randomInt(config.levels.xpMin, config.levels.xpMax);
  row.messages = (row.messages ?? 0) + 1;
  const { level } = levelFromXp(row.xp);
  const leveledUp = level > row.level;
  row.level = level;
  await db.levels.save(row).catch((e) => console.warn('[levels]', e.message));
  if (!leveledUp) return;

  const newRole = await syncRankRoles(message.member, level);
  const channel = findChannel(message.guild, 'bot_commands') ?? message.channel;
  await channel.send({
    content: `${message.author}`,
    embeds: [oceanEmbed({
      title: '🎉 Niveau supérieur !',
      description: `GG ${message.author}, tu passes **niveau ${level}** ! 🎣${newRole ? `\nNouveau grade débloqué : ${newRole}` : ''}`,
      color: newRole ? colors.gold : colors.lagoon,
      thumbnail: message.author.displayAvatarURL({ size: 128 }),
      footer: 'Ocean Quest ・ Niveaux',
    })],
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
}

const commands = [
  {
    data: new SlashCommandBuilder().setName('rang').setDescription('🎣 Voir ton niveau de pêcheur')
      .addUserOption((o) => o.setName('membre').setDescription('Voir le rang d’un autre marin')),
    async execute(interaction) {
      const user = interaction.options.getUser('membre') ?? interaction.user;
      const row = await db.levels.get(interaction.guild.id, user.id);
      const { level, current, needed } = levelFromXp(row.xp);
      const position = await db.levels.rank(interaction.guild.id, row.xp);
      const currentRank = RANK_ROLES.find((r) => level >= r.level);
      const nextRank = [...RANK_ROLES].reverse().find((r) => r.level > level);
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [oceanEmbed({
          title: `🎣 Carnet de bord de ${user.displayName ?? user.username}`,
          thumbnail: user.displayAvatarURL({ size: 256 }),
          color: colors.ocean,
          fields: [
            { name: 'Niveau', value: `**${level}**`, inline: true },
            { name: 'Classement', value: `#${position}`, inline: true },
            { name: 'XP totale', value: `${row.xp}`, inline: true },
            { name: `Progression (${current}/${needed} XP)`, value: progressBar(current, needed) },
            { name: 'Grade', value: currentRank ? `${findRole(interaction.guild, currentRank.key) ?? currentRank.name}` : '🎣 Moussaillon', inline: true },
            { name: 'Prochain grade', value: nextRank ? `${nextRank.name} (niv. ${nextRank.level})` : 'Tu es au sommet des océans 👑', inline: true },
          ],
          footer: 'Ocean Quest ・ Niveaux',
        })],
      });
    },
  },
];

module.exports = {
  name: 'levels',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  events: { [Events.MessageCreate]: onMessage },
  commands,
  levelFromXp,
};
