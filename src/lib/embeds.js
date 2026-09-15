const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const colors = {
  ocean: 0x0077b6,
  deep: 0x03045e,
  lagoon: 0x00b4d8,
  foam: 0x90e0ef,
  success: 0x2ec4b6,
  warning: 0xffb703,
  danger: 0xe63946,
  gold: 0xffd60a,
  purple: 0x7b2cbf,
};

const WAVE = '〰〰〰〰〰〰〰〰〰〰〰〰';
const SPACE = '​';

// Assemble des paragraphes séparés par une ligne vide (les null/false sont ignorés).
const paragraphs = (...parts) => parts.flat().filter((p) => p !== null && p !== undefined && p !== false && p !== '').join('\n\n');

function oceanEmbed({ title, description, color = colors.ocean, footer, fields, thumbnail, image, timestamp = true } = {}) {
  const embed = new EmbedBuilder().setColor(color);
  if (title) embed.setTitle(title.slice(0, 256));
  if (description) embed.setDescription(description.slice(0, 4096));
  if (fields?.length) embed.addFields(fields.slice(0, 25));
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (footer !== false) embed.setFooter({ text: footer ?? `${config.game.name} ・ 🌊` });
  if (timestamp) embed.setTimestamp();
  return embed;
}

const ok = (description, title = '✅ Cap validé') => oceanEmbed({ title, description, color: colors.success });
const fail = (description, title = '🌊 Mauvaise marée') => oceanEmbed({ title, description, color: colors.danger });

module.exports = { colors, WAVE, SPACE, paragraphs, oceanEmbed, ok, fail };
