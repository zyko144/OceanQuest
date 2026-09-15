// Vérification « Monter à bord » : captcha marin + âge minimum du compte.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits } = require('discord.js');
const config = require('../../config');
const { findChannel, findRole, channelMention } = require('../../lib/guild');
const { oceanEmbed, colors, ok, fail, WAVE } = require('../../lib/embeds');
const { ensurePanel, ephemeral, sendLog, shuffle, pick, unix } = require('../../lib/util');
const { isRaid, FOOTER } = require('./state');

const PANEL_FOOTER = 'Ocean Guard ・ Vérification';
const CREATURES = [
  ['🦈', 'le requin'], ['🐙', 'le poulpe'], ['🦀', 'le crabe'], ['🐢', 'la tortue'], ['🐬', 'le dauphin'],
  ['🐳', 'la baleine'], ['🦞', 'le homard'], ['🐡', 'le poisson-globe'], ['🦑', 'le calmar'], ['🦭', 'le phoque'],
  ['🐚', 'le coquillage'], ['🪸', 'le corail'],
];
const MAX_ATTEMPTS = 3;
const LOCK_MS = 5 * 60_000;
const pending = new Map();

function panelPayload(guild) {
  return {
    embeds: [oceanEmbed({
      title: '✅ Monter à bord d’Ocean Quest',
      description: [
        'Bienvenue sur le quai, moussaillon ! 🌊',
        '',
        `Avant d’embarquer, lis le ${channelMention(guild, 'rules', 'règlement')} puis prouve que tu n’es pas un robot des profondeurs.`,
        '',
        WAVE,
        '🎣 Clique sur **Monter à bord** et trouve la bonne créature marine.',
        `🔓 Tu débloqueras tout le serveur et le rôle ${findRole(guild, 'member') ?? '🎣 Moussaillon'}.`,
      ].join('\n'),
      color: colors.lagoon,
      footer: PANEL_FOOTER,
      timestamp: false,
    })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify:start').setStyle(ButtonStyle.Success).setEmoji('🌊').setLabel('Monter à bord'),
    )],
  };
}

function captcha(userId, attemptsLeft) {
  const options = shuffle(CREATURES).slice(0, 5);
  const [emoji, name] = pick(options);
  const previous = pending.get(userId);
  pending.set(userId, { answer: emoji, attempts: previous?.attempts ?? 0, expires: Date.now() + 2 * 60_000 });
  return {
    embeds: [oceanEmbed({
      title: '🧭 Épreuve du marin',
      description: `Clique sur **${name}** pour monter à bord.\n*Essais restants : ${attemptsLeft}*`,
      color: colors.ocean,
      footer: FOOTER,
    })],
    components: [new ActionRowBuilder().addComponents(options.map(([e]) => new ButtonBuilder()
      .setCustomId(`verify:answer:${CREATURES.findIndex(([c]) => c === e)}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(e)))],
  };
}

async function onStart(interaction) {
  const { guild, member } = interaction;
  const role = findRole(guild, 'member');
  if (!role) return interaction.reply(ephemeral({ embeds: [fail('Le rôle Moussaillon est introuvable. Un admin doit lancer `/setup`.')] }));
  if (member.roles.cache.has(role.id)) return interaction.reply(ephemeral({ embeds: [ok('Tu es déjà à bord, matelot ! 🎣')] }));

  const ageDays = (Date.now() - interaction.user.createdTimestamp) / 864e5;
  if (ageDays < config.security.minAccountAgeDays) {
    await sendLog(guild, 'log_security', oceanEmbed({
      description: `⛔ Vérification refusée pour ${interaction.user} \`${interaction.user.id}\` : compte créé <t:${unix(interaction.user.createdTimestamp)}:R>.`,
      color: colors.warning,
      footer: FOOTER,
    }));
    return interaction.reply(ephemeral({ embeds: [fail(`Ton compte Discord est trop récent pour embarquer (minimum **${config.security.minAccountAgeDays} jours**).\nReviens <t:${unix(interaction.user.createdTimestamp + config.security.minAccountAgeDays * 864e5)}:R> !`)] }));
  }
  if (isRaid() && ageDays < 30) {
    return interaction.reply(ephemeral({ embeds: [fail('🌪️ Une tempête frappe le port : les vérifications sont suspendues quelques minutes. Réessaie bientôt !')] }));
  }

  const entry = pending.get(interaction.user.id);
  if (entry?.lockedUntil > Date.now()) {
    return interaction.reply(ephemeral({ embeds: [fail(`Trop d’essais ratés. Réessaie <t:${unix(entry.lockedUntil)}:R>.`)] }));
  }
  if (entry?.lockedUntil) pending.delete(interaction.user.id);
  return interaction.reply(ephemeral(captcha(interaction.user.id, MAX_ATTEMPTS - (pending.get(interaction.user.id)?.attempts ?? 0))));
}

async function onAnswer(interaction, index) {
  const entry = pending.get(interaction.user.id);
  if (!entry || entry.expires < Date.now() || entry.lockedUntil) {
    return interaction.update({ embeds: [fail('Cette épreuve a expiré. Reclique sur **Monter à bord**.')], components: [] });
  }
  const chosen = CREATURES[Number(index)]?.[0];
  if (chosen === entry.answer) {
    pending.delete(interaction.user.id);
    const role = findRole(interaction.guild, 'member');
    await interaction.member.roles.add(role, 'Vérification réussie');
    await interaction.update({
      embeds: [ok(`Bienvenue à bord, ${interaction.user} ! 🎣\nFile saluer l’équipage dans ${channelMention(interaction.guild, 'general', 'la taverne')} et choisis tes rôles dans ${channelMention(interaction.guild, 'selfroles', 'les rôles')}.`, '⚓ Tu es à bord !')],
      components: [],
    });
    return sendLog(interaction.guild, 'log_members', oceanEmbed({
      description: `✅ ${interaction.user} \`${interaction.user.id}\` est monté à bord (vérifié).`,
      color: colors.success,
      footer: FOOTER,
    }));
  }

  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    await sendLog(interaction.guild, 'log_security', oceanEmbed({
      description: `🤖 ${interaction.user} \`${interaction.user.id}\` a raté la vérification ${MAX_ATTEMPTS} fois.`,
      color: colors.warning,
      footer: FOOTER,
    }));
    return interaction.update({ embeds: [fail(`Raté ! Tu pourras réessayer <t:${unix(entry.lockedUntil)}:R>.`)], components: [] });
  }
  return interaction.update(captcha(interaction.user.id, MAX_ATTEMPTS - entry.attempts));
}

module.exports = {
  name: 'verification',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  components: {
    verify: (interaction, [action, index]) => (action === 'start' ? onStart(interaction) : onAnswer(interaction, index)),
  },
  async panels(client, guild, ctx) {
    const channel = findChannel(guild, 'verify');
    if (channel) await ensurePanel(client, channel, panelPayload(guild), { otherBotIds: ctx.otherBotIds() });
  },
};
