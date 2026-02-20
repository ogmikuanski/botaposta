const { createPublicStoreEmbed } = require("../components/Embeds/storeEmbeds");
const { createPublicShopMenu } = require("../components/Components/storeMenus");
const Server = require("../database/models/server");
const StoreItem = require("../database/models/StoreItem");

async function refreshStore(client, guildId) {
    try {
        const server = await Server.findOne({ where: { guildId } });
        if (!server || !server.storeChannelId || !server.storeMessageId) return;

        const channel = await client.channels.fetch(server.storeChannelId).catch(() => null);
        if (!channel) return;

        const message = await channel.messages.fetch(server.storeMessageId).catch(() => null);
        if (!message) return;

        const items = await StoreItem.findAll({ where: { guildId } });

        const fakeInteraction = { guild: message.guild, user: client.user, guildId: guildId };

        const embed = createPublicStoreEmbed(fakeInteraction, items);
        const rows = items.length > 0 ? [createPublicShopMenu(items)] : [];

        await message.edit({ content: null, embeds: [embed], components: rows });

    } catch (e) {
        console.error("Erro ao atualizar interface pública:", e.message);
    }
}

module.exports = { refreshStore };