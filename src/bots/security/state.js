// État partagé des modules de sécurité (mode raid, compteurs…).

const { GuildVerificationLevel, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const { oceanEmbed, colors } = require('../../lib/embeds');
const { sendLog, unix } = require('../../lib/util');
const { roleMention } = require('../../lib/guild');

const FOOTER = 'Ocean Guard ・ Sécurité';

const state = {
  raidUntil: 0,
  previousVerification: null,
  raidTimer: null,
};

const isRaid = () => Date.now() < state.raidUntil;

async function activateRaid(guild, reason, durationMin = config.security.raidDurationMin) {
  const already = isRaid();
  state.raidUntil = Date.now() + durationMin * 60_000;
  clearTimeout(state.raidTimer);
  state.raidTimer = setTimeout(() => deactivateRaid(guild, 'fin automatique'), durationMin * 60_000);
  if (already) return;

  state.previousVerification = guild.verificationLevel;
  await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, `Mode raid : ${reason}`).catch(() => null);
  await sendLog(guild, 'log_security', {
    content: `${roleMention(guild, 'moderator')} ${roleMention(guild, 'admin')}`.trim() || undefined,
    allowedMentions: { parse: ['roles'] },
    embeds: [oceanEmbed({
      title: '🌪️ ALERTE TEMPÊTE — Mode raid activé',
      description: `**Raison :** ${reason}\n**Fin prévue :** <t:${unix(state.raidUntil)}:R>\n\n• Niveau de vérification du serveur au maximum\n• Les comptes de moins de 7 jours sont expulsés à l’arrivée\n• La vérification est suspendue pour les comptes récents`,
      color: colors.danger,
      footer: FOOTER,
    })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guard:raidoff').setStyle(ButtonStyle.Success).setEmoji('🌤️').setLabel('Lever l’alerte'),
    )],
  });
}

async function deactivateRaid(guild, by) {
  if (!state.raidUntil) return;
  state.raidUntil = 0;
  clearTimeout(state.raidTimer);
  if (state.previousVerification !== null) {
    await guild.setVerificationLevel(state.previousVerification, 'Fin du mode raid').catch(() => null);
    state.previousVerification = null;
  }
  await sendLog(guild, 'log_security', oceanEmbed({
    title: '🌤️ Retour au calme — Mode raid désactivé',
    description: `Levé par : ${by}`,
    color: colors.success,
    footer: FOOTER,
  }));
}

module.exports = { state, isRaid, activateRaid, deactivateRaid, FOOTER };
