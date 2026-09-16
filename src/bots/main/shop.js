// /boutique et /inventaire : dépenser ses doublons (cannes, appâts, filets, couleurs de pseudo).

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const db = require('../../lib/db');
const shop = require('../../lib/shop');
const { findRole } = require('../../lib/guild');
const { oceanEmbed, colors, WAVE, paragraphs } = require('../../lib/embeds');
const { truncate } = require('../../lib/util');

const FOOTER = 'Ocean Quest ・ Boutique';
const { fr } = shop;
const plain = (text) => text.replace(/\*\*/g, '');

function itemLine(item, inventory, coins) {
  const owned = shop.owns(inventory, item);
  const stock = item.category === 'bait' ? inventory.baits[item.id] ?? 0 : item.category === 'net' ? inventory.nets : null;
  const status = owned ? '✅ possédé' : stock ? `🎒 ${stock} en stock` : coins >= item.price ? '🟢 abordable' : '🔒 trop cher';
  return `${item.emoji}  **${item.name}**${item.quantity ? ` ×${item.quantity}` : ''} ・ 🪙 **${fr(item.price)}**\n-# ${plain(item.effect)} ・ ${status}`;
}

async function homePayload(guildId, userId, notice) {
  const [fisher, inventory] = await Promise.all([db.fishers.get(guildId, userId), shop.getInventory(userId)]);
  const coins = fisher.coins ?? 0;
  const sections = Object.entries(shop.CATEGORIES).map(([key, cat]) => paragraphs(
    `### ${cat.label}\n-# ${cat.hint}`,
    shop.ITEMS.filter((i) => i.category === key).map((i) => itemLine(i, inventory, coins)),
  ));
  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop:pick')
    .setPlaceholder('🛒 Choisis un objet à acheter…')
    .addOptions(shop.ITEMS.map((i) => ({
      label: truncate(`${i.name}${i.quantity ? ` ×${i.quantity}` : ''} — ${fr(i.price)} doublons`, 100),
      description: truncate(plain(i.effect), 100),
      value: i.id,
      emoji: i.emoji,
    })));
  return {
    embeds: [oceanEmbed({
      title: '🛒  La boutique du port',
      description: paragraphs(
        notice,
        `> 🪙 Ta bourse : **${fr(coins)} doublons**\n> Gagne des doublons avec \`/pecher\` !`,
        sections,
        WAVE,
        '-# 🎒 Retrouve tes objets avec `/inventaire`.',
      ),
      color: colors.gold,
      footer: FOOTER,
    })],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

async function confirmPayload(guildId, userId, itemId) {
  const item = shop.itemById(itemId);
  const [fisher, inventory] = await Promise.all([db.fishers.get(guildId, userId), shop.getInventory(userId)]);
  const coins = fisher.coins ?? 0;
  const owned = shop.owns(inventory, item);
  const affordable = coins >= item.price;
  return {
    embeds: [oceanEmbed({
      title: `${item.emoji}  ${item.name}${item.quantity ? ` ×${item.quantity}` : ''}`,
      description: paragraphs(
        `> ${item.effect}`,
        `💰 Prix : **🪙 ${fr(item.price)}**\n🪙 Ta bourse : **${fr(coins)}**${affordable ? ` → **${fr(coins - item.price)}** après l’achat` : ''}`,
        owned ? '✅ Tu possèdes déjà cet objet.' : affordable ? null : `🔒 Il te manque **🪙 ${fr(item.price - coins)}**. Va pêcher !`,
      ),
      color: owned || !affordable ? colors.warning : colors.success,
      footer: FOOTER,
    })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop:buy:${item.id}`).setStyle(ButtonStyle.Success).setEmoji('🛒')
        .setLabel(`Acheter (${fr(item.price)} doublons)`).setDisabled(owned || !affordable),
      new ButtonBuilder().setCustomId('shop:home').setStyle(ButtonStyle.Secondary).setEmoji('↩️').setLabel('Retour'),
    )],
  };
}

// Donne la couleur choisie et retire les autres couleurs de la boutique.
async function applyColor(member, inventory) {
  const colorItems = shop.ITEMS.filter((i) => i.category === 'color');
  const add = [];
  const remove = [];
  for (const item of colorItems) {
    const role = findRole(member.guild, item.role);
    if (!role?.editable) continue;
    const wanted = inventory.color === item.id && inventory.colors.includes(item.id);
    if (wanted && !member.roles.cache.has(role.id)) add.push(role);
    if (!wanted && member.roles.cache.has(role.id)) remove.push(role);
  }
  if (remove.length) await member.roles.remove(remove, 'Couleur boutique').catch(() => null);
  if (add.length) await member.roles.add(add, 'Couleur boutique').catch(() => null);
}

async function inventoryPayload(guildId, userId) {
  const [fisher, inventory] = await Promise.all([db.fishers.get(guildId, userId), shop.getInventory(userId)]);
  const rod = shop.bestRod(inventory);
  const baits = shop.ITEMS.filter((i) => i.category === 'bait')
    .map((i) => `${i.emoji}  ${i.name} ・ **${inventory.baits[i.id] ?? 0}**`).join('\n');
  const colorsOwned = shop.ITEMS.filter((i) => i.category === 'color' && inventory.colors.includes(i.id));
  const components = [];
  if (colorsOwned.length) {
    components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('shop:color')
      .setPlaceholder('🎨 Choisis ta couleur de pseudo…')
      .addOptions([
        ...colorsOwned.map((i) => ({ label: i.name, value: i.id, emoji: i.emoji, default: inventory.color === i.id })),
        { label: 'Aucune couleur', value: 'none', emoji: '🚫', default: !inventory.color },
      ])));
  }
  return {
    embeds: [oceanEmbed({
      title: '🎒  Ton inventaire',
      description: paragraphs(
        `> 🪙 Bourse : **${fr(fisher.coins ?? 0)} doublons**`,
        `### 🎣  Canne utilisée\n${rod.emoji}  **${rod.name}**\n-# ${rod.id === 'rod_bamboo' ? 'La canne de départ. Améliore-la dans `/boutique` !' : `Attente entre deux lancers : ${Math.round(rod.cooldown * 100)} %`}`,
        `### 🪱  Appâts\n${baits}\n-# Utilisés automatiquement, le plus puissant d’abord.`,
        `### 🥅  Filets anti-bottes\n**${inventory.nets}** filet(s)`,
        `### 🎨  Couleurs\n${colorsOwned.length ? colorsOwned.map((i) => `${i.emoji} ${i.name}${inventory.color === i.id ? ' ・ ✅ active' : ''}`).join('\n') : 'Aucune couleur pour l’instant.'}`,
      ),
      color: colors.lagoon,
      footer: FOOTER,
    })],
    components,
  };
}

const commands = [
  {
    data: new SlashCommandBuilder().setName('boutique').setDescription('🛒 Dépense tes doublons : cannes, appâts, filets, couleurs'),
    async execute(interaction) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, ...(await homePayload(interaction.guild.id, interaction.user.id)) });
    },
  },
  {
    data: new SlashCommandBuilder().setName('inventaire').setDescription('🎒 Tes objets de pêche et tes couleurs'),
    async execute(interaction) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, ...(await inventoryPayload(interaction.guild.id, interaction.user.id)) });
    },
  },
];

module.exports = {
  name: 'shop',
  intents: [GatewayIntentBits.Guilds],
  commands,
  components: {
    shop: async (interaction, [action, itemId]) => {
      const { guild, user } = interaction;
      if (action === 'home') return interaction.update(await homePayload(guild.id, user.id));
      if (action === 'pick' && interaction.isStringSelectMenu()) return interaction.update(await confirmPayload(guild.id, user.id, interaction.values[0]));
      if (action === 'buy') {
        const result = await shop.buy(guild.id, user.id, itemId);
        if (result.ok && result.item.category === 'color') await applyColor(interaction.member, result.inventory);
        const notice = result.ok
          ? `✅ **Achat réussi !** ${result.item.emoji} ${result.item.name}${result.item.quantity ? ` ×${result.item.quantity}` : ''} est dans ton inventaire.`
          : `❌ ${result.error}`;
        return interaction.update(await homePayload(guild.id, user.id, notice));
      }
      if (action === 'color' && interaction.isStringSelectMenu()) {
        const inventory = await shop.getInventory(user.id);
        const choice = interaction.values[0];
        inventory.color = choice === 'none' || !inventory.colors.includes(choice) ? null : choice;
        await shop.saveInventory(user.id, inventory);
        await applyColor(interaction.member, inventory);
        return interaction.update(await inventoryPayload(guild.id, user.id));
      }
      return null;
    },
  },
};
