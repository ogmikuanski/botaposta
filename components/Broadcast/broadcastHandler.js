const { MessageFlags, EmbedBuilder } = require("discord.js");
const QueueMessageConfig = require("../../database/models/QueueMessageConfig");
const FilaConfig = require("../../database/models/FilaConfig");
const Emojis = require("../../Emojis.json");

const Embeds = require("./broadcastEmbeds");
const Comps = require("./broadcastComponents");

const builderCache = new Map();

async function getFooterData(guild) {
    const { DEFAULT_FOOTER_TEXT, DEFAULT_FOOTER_ICON, BOT_MARCACOES_INTERFACES } = process.env;
    const useDefault = BOT_MARCACOES_INTERFACES === 'true';
    return {
        text: useDefault ? (DEFAULT_FOOTER_TEXT || "Sistema de Filas") : guild.name,
        iconURL: useDefault ? (DEFAULT_FOOTER_ICON || null) : (guild.iconURL() || null)
    };
}

async function getAvailableModalityChannels(guildId) {
    const channels = [];
    try {
        const filaConfig = await FilaConfig.findOne({ where: { guildId } });
        if (!filaConfig) return [];

        let modalidades = filaConfig.modalidades;
        if (typeof modalidades === 'string') {
            try { modalidades = JSON.parse(modalidades); } catch (e) { return []; }
        }

        if (Array.isArray(modalidades)) {
            const seenIds = new Set();
            modalidades.forEach((modo) => {
                if (modo.canalId && String(modo.canalId).trim().length > 0) {
                    if (!seenIds.has(modo.canalId)) {
                        channels.push({
                            id: modo.canalId,
                            name: modo.nome || `Canal ${modo.canalId}`
                        });
                        seenIds.add(modo.canalId);
                    }
                }
            });
        }
    } catch (e) { console.error("[BROADCAST HANDLE]" + e); }
    return channels;
}

async function preparePayload(config, guild) {
    if (config.mode === 'text') {
        if (!config.textContent) return null;
        return { content: config.textContent };
    } else {
        if (!config.embedJSON || Object.keys(config.embedJSON).length === 0) return null;
        const embed = new EmbedBuilder(config.embedJSON);
        embed.setColor(process.env.botcolor || "Blue");
        const footer = await getFooterData(guild);
        if (!embed.data.footer) embed.setFooter(footer);
        return { embeds: [embed] };
    }
}

async function sendBroadcast(guild, targetIds, payload) {
    const sent = [];
    for (const channelId of targetIds) {
        try {
            let channel = guild.channels.cache.get(channelId);
            if (!channel) { try { channel = await guild.channels.fetch(channelId); } catch {} }

            if (channel) {
                const msg = await channel.send(payload);
                sent.push({ channelId: channelId, messageId: msg.id });
            }
        } catch (e) { }
    }
    return sent;
}

async function clearBroadcast(guild, activeMessages) {
    if (!activeMessages || !Array.isArray(activeMessages)) return;
    for (const record of activeMessages) {
        try {
            const ch = guild.channels.cache.get(record.channelId);
            if (ch) await ch.messages.delete(record.messageId).catch(() => {});
        } catch (e) {}
    }
}

async function reloadCentral(interaction, guild, config) {
    const available = await getAvailableModalityChannels(guild.id);
    const hasChannels = (config.targetChannels && config.targetChannels.length > 0);
    
    const embed = Embeds.MainDashboardEmbed(guild, config, available.length);
    const components = Comps.MainDashboardRows(config.status, hasChannels);

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "", embeds: [embed], components: components });
    } else {
        await interaction.update({ content: "", embeds: [embed], components: components });
    }
}

module.exports = {
    handleBroadcastInteraction: async (interaction) => {
        const { customId, guild, user, values } = interaction;
        
        const [config] = await QueueMessageConfig.findOrCreate({ 
            where: { guildId: guild.id }, 
            defaults: { mode: 'text', textContent: "# FILAS ON", embedJSON: {}, activeMessages: [], targetChannels: [] } 
        });

        if (customId === "broadcast_back_main") {
            return reloadCentral(interaction, guild, config);
        }

        if (customId === "broadcast_toggle") {
            await interaction.deferUpdate();
            await config.update({ status: !config.status });
            return reloadCentral(interaction, guild, config);
        }

        if (customId === "broadcast_send") {
            await interaction.deferUpdate();
            
            if (config.status === true) {
                if (!config.targetChannels?.length) return reloadCentral(interaction, guild, config);

                const payload = await preparePayload(config, guild);
                if (!payload) {
                    await interaction.followUp({ content: `${Emojis.bot || "✅"} Configure a mensagem antes de aplicar.`, flags: MessageFlags.Ephemeral });
                    return reloadCentral(interaction, guild, config);
                }

                if (config.activeMessages?.length) await clearBroadcast(guild, config.activeMessages);
                
                const sent = await sendBroadcast(guild, config.targetChannels, payload);
                await config.update({ activeMessages: sent });
                await interaction.followUp({ content: `- ${Emojis.Success || "✅"} Mensagens enviadas ou atualizadas!`, flags: MessageFlags.Ephemeral });

            } else {
                if (config.activeMessages?.length) {
                    await clearBroadcast(guild, config.activeMessages);
                    await config.update({ activeMessages: [] });
                    await interaction.followUp({ content: `- ${Emojis.Lixeira || "🗑️"} Todas mensagens removidas.`, flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.followUp({ content: `- Nenhuma mensagem para limpar.`, flags: MessageFlags.Ephemeral });
                }
            }

            return reloadCentral(interaction, guild, config);
        }

        if (customId === "broadcast_menu_msg") {
            return interaction.update({
                embeds: [Embeds.MessageConfigEmbed(guild, config)],
                components: Comps.MessageConfigRows()
            });
        }

        if (customId === "broadcast_mode_text") {
            return interaction.showModal(Comps.createModal("broadcast_submit_text", "Editar Texto", "Conteúdo", 2, config.textContent));
        }

        if (customId === "broadcast_mode_embed") {
            const draft = config.embedJSON && Object.keys(config.embedJSON).length ? config.embedJSON : { description: "# FILAS ON!" };
            builderCache.set(user.id, draft);
            return interaction.update({
                embeds: [Embeds.BuilderEmbed(draft, guild)],
                components: Comps.BuilderRows()
            });
        }

        if (["broadcast_set_title", "broadcast_set_desc", "broadcast_set_thumb", "broadcast_set_img"].includes(customId)) {
            let draft = builderCache.get(user.id) || {};
            const labels = {
                "broadcast_set_title": ["Título", 1, draft.title],
                "broadcast_set_desc": ["Descrição", 2, draft.description],
                "broadcast_set_thumb": ["Thumbnail URL", 1, draft.thumbnail?.url],
                "broadcast_set_img": ["Imagem URL", 1, draft.image?.url]
            };
            const [lbl, style, val] = labels[customId];
            return interaction.showModal(Comps.createModal(customId + "_modal", `Editar ${lbl}`, lbl, style, val));
        }

        if (customId === "broadcast_save_embed") {
            const draft = builderCache.get(user.id);
            if (draft) {
                await interaction.deferUpdate();
                delete draft.color; 
                await config.update({ mode: 'embed', embedJSON: draft });
                builderCache.delete(user.id);
            }
            return reloadCentral(interaction, guild, config);
        }

        if (customId === "broadcast_menu_channels") {
            const available = await getAvailableModalityChannels(guild.id);
            const selectedIds = config.targetChannels || [];
            
            return interaction.update({
                embeds: [Embeds.ChannelConfigEmbed(guild, config, available)],
                components: Comps.ChannelConfigRows(available, selectedIds)
            });
        }

        if (customId === "broadcast_select_channels") {
            //await interaction.deferUpdate();
            await config.update({ targetChannels: values });
            return reloadCentral(interaction, guild, config);
        }
    },

    handleBroadcastModal: async (interaction) => {
        const { customId, guild, user, fields } = interaction;
        const val = fields.getTextInputValue("input_val");
        const [config] = await QueueMessageConfig.findOrCreate({ where: { guildId: guild.id } });

        if (customId === "broadcast_submit_text") {
            await interaction.deferUpdate();
            await config.update({ mode: 'text', textContent: val });
            return reloadCentral(interaction, guild, config);
        }

        if (customId.includes("_set_")) {
            let draft = builderCache.get(user.id);
            if (!draft) return reloadCentral(interaction, guild, config);

            if (customId.includes("title")) draft.title = val;
            if (customId.includes("desc")) draft.description = val;
            if (customId.includes("thumb")) draft.thumbnail = val ? { url: val } : null;
            if (customId.includes("img")) draft.image = val ? { url: val } : null;

            builderCache.set(user.id, draft);
            return interaction.update({ embeds: [Embeds.BuilderEmbed(draft, guild)] });
        }
    }
};