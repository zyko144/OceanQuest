// Journal de bord : messages, membres, rôles, bannissements et vocal.

const { Events, GatewayIntentBits } = require('discord.js');
const config = require('../../config');
const { findChannel } = require('../../lib/guild');
const { oceanEmbed, colors } = require('../../lib/embeds');
const { sendLog, truncate, unix } = require('../../lib/util');

const FOOTER = 'Ocean Guard ・ Journal de bord';

const isLogChannel = (guild, channelId) => ['log_tickets', 'log_security', 'log_moderation', 'log_messages', 'log_members', 'log_voice']
  .some((key) => findChannel(guild, key)?.id === channelId);

async function onMessageDelete(message) {
  if (!message.guild || message.author?.bot || isLogChannel(message.guild, message.channelId)) return;
  if (message.partial && !message.author) return; // message d'avant le démarrage du bot : rien d'utile à journaliser
  const files = message.attachments?.map((a) => a.name).join(', ');
  await sendLog(message.guild, 'log_messages', oceanEmbed({
    title: '🗑️ Message supprimé',
    color: colors.danger,
    fields: [
      { name: 'Auteur', value: message.author ? `${message.author} \`${message.author.id}\`` : '*inconnu (message non mis en cache)*', inline: true },
      { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
      { name: 'Contenu', value: truncate(message.content || '*vide ou non disponible*', 1024) },
      ...(files ? [{ name: 'Pièces jointes', value: truncate(files, 1024) }] : []),
    ],
    footer: FOOTER,
  }));
}

async function onBulkDelete(messages, channel) {
  if (isLogChannel(channel.guild, channel.id)) return;
  const authors = [...new Set(messages.filter((m) => m.author).map((m) => `${m.author}`))].slice(0, 15).join(' ');
  await sendLog(channel.guild, 'log_messages', oceanEmbed({
    title: '🧹 Suppression groupée',
    description: `**${messages.size}** messages supprimés dans ${channel}\n${authors ? `Auteurs : ${authors}` : ''}`,
    color: colors.danger,
    footer: FOOTER,
  }));
}

async function onMessageUpdate(oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot || isLogChannel(newMessage.guild, newMessage.channelId)) return;
  if (oldMessage.partial || oldMessage.content === newMessage.content) return;
  await sendLog(newMessage.guild, 'log_messages', oceanEmbed({
    title: '✏️ Message modifié',
    description: `[Aller au message](${newMessage.url})`,
    color: colors.warning,
    fields: [
      { name: 'Auteur', value: `${newMessage.author} \`${newMessage.author.id}\``, inline: true },
      { name: 'Salon', value: `<#${newMessage.channelId}>`, inline: true },
      { name: 'Avant', value: truncate(oldMessage.content || '*vide*', 1024) },
      { name: 'Après', value: truncate(newMessage.content || '*vide*', 1024) },
    ],
    footer: FOOTER,
  }));
}

async function onMemberAdd(member) {
  const ageDays = (Date.now() - member.user.createdTimestamp) / 864e5;
  const young = ageDays < config.security.minAccountAgeDays;
  await sendLog(member.guild, 'log_members', oceanEmbed({
    title: member.user.bot ? '🤖 Bot arrivé' : '📥 Nouveau marin sur le quai',
    description: `${member} \`${member.id}\`\nCompte créé <t:${unix(member.user.createdTimestamp)}:R>${young ? '\n⚠️ **Compte très récent**' : ''}`,
    color: young ? colors.warning : colors.success,
    thumbnail: member.displayAvatarURL(),
    fields: [{ name: 'Membres', value: `${member.guild.memberCount}`, inline: true }],
    footer: FOOTER,
  }));
}

async function onMemberRemove(member) {
  const roles = member.roles?.cache?.filter((r) => r.id !== member.guild.id).map((r) => `${r}`).join(' ');
  await sendLog(member.guild, 'log_members', oceanEmbed({
    title: '📤 Un marin a quitté le port',
    description: `${member.user?.tag ?? 'Inconnu'} \`${member.id}\`${member.joinedTimestamp ? `\nArrivé <t:${unix(member.joinedTimestamp)}:R>` : ''}`,
    color: colors.danger,
    thumbnail: member.displayAvatarURL?.(),
    fields: roles ? [{ name: 'Rôles', value: truncate(roles, 1024) }] : [],
    footer: FOOTER,
  }));
}

async function onMemberUpdate(oldMember, newMember) {
  if (oldMember.partial) return;
  const lines = [];
  const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
  if (added.size) lines.push(`➕ Rôles ajoutés : ${added.map((r) => `${r}`).join(' ')}`);
  if (removed.size) lines.push(`➖ Rôles retirés : ${removed.map((r) => `${r}`).join(' ')}`);
  if (oldMember.nickname !== newMember.nickname) lines.push(`🏷️ Pseudo : \`${oldMember.nickname ?? 'aucun'}\` → \`${newMember.nickname ?? 'aucun'}\``);
  const oldTimeout = oldMember.communicationDisabledUntilTimestamp ?? 0;
  const newTimeout = newMember.communicationDisabledUntilTimestamp ?? 0;
  if (oldTimeout !== newTimeout) {
    lines.push(newTimeout > Date.now() ? `🔇 Sourdine jusqu’à <t:${unix(newTimeout)}:f>` : '🔊 Sourdine levée');
  }
  if (!lines.length) return;
  await sendLog(newMember.guild, 'log_members', oceanEmbed({
    title: '🧾 Membre modifié',
    description: `${newMember} \`${newMember.id}\`\n\n${lines.join('\n')}`,
    color: colors.lagoon,
    footer: FOOTER,
  }));
}

async function onBan(ban) {
  const full = await ban.fetch().catch(() => ban);
  await sendLog(ban.guild, 'log_moderation', oceanEmbed({
    title: '🔨 Marin banni du port',
    description: `${ban.user.tag} \`${ban.user.id}\`\n**Raison :** ${full.reason ?? 'non précisée'}`,
    color: colors.danger,
    footer: FOOTER,
  }));
}

async function onUnban(ban) {
  await sendLog(ban.guild, 'log_moderation', oceanEmbed({
    title: '🕊️ Bannissement levé',
    description: `${ban.user.tag} \`${ban.user.id}\``,
    color: colors.success,
    footer: FOOTER,
  }));
}

async function onVoice(oldState, newState) {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot || oldState.channelId === newState.channelId) return;
  let description;
  if (!oldState.channelId) description = `🔊 ${member} a rejoint <#${newState.channelId}>`;
  else if (!newState.channelId) description = `🔇 ${member} a quitté <#${oldState.channelId}>`;
  else description = `🔀 ${member} : <#${oldState.channelId}> → <#${newState.channelId}>`;
  await sendLog(newState.guild, 'log_voice', oceanEmbed({ description, color: colors.foam, footer: FOOTER }));
}

module.exports = {
  name: 'logs',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildVoiceStates],
  events: {
    [Events.MessageDelete]: onMessageDelete,
    [Events.MessageBulkDelete]: onBulkDelete,
    [Events.MessageUpdate]: onMessageUpdate,
    [Events.GuildMemberAdd]: onMemberAdd,
    [Events.GuildMemberRemove]: onMemberRemove,
    [Events.GuildMemberUpdate]: onMemberUpdate,
    [Events.GuildBanAdd]: onBan,
    [Events.GuildBanRemove]: onUnban,
    [Events.VoiceStateUpdate]: onVoice,
  },
};
