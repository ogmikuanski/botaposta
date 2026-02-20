const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder } = require("discord.js");
const Emojis = require("../../Emojis.json");

module.exports = {
    MainDashboardRows: (status, hasChannels) => {
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("broadcast_toggle")
                .setLabel(status ? "Broadcast: OFF" : "Broadcast: ON")
                .setStyle(status ? ButtonStyle.Success : ButtonStyle.Danger)
                .setEmoji(status ? (Emojis.BotOffline || "🔴") : (Emojis.BotOnline || "🟢")),

            new ButtonBuilder()
                .setCustomId("broadcast_send")
                .setLabel("Aplicar Alterações")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(Emojis.foguete || "✅")
                .setDisabled(status && !hasChannels)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("broadcast_menu_channels")
                .setLabel("Canais")
                .setStyle(ButtonStyle.Primary)
                .setEmoji(Emojis.var || "📡"),
            new ButtonBuilder()
                .setCustomId("broadcast_menu_msg")
                .setLabel("Mensagem")
                .setStyle(ButtonStyle.Primary)
                .setEmoji(Emojis.visualizar ?? "📝")
        );

        return [row1, row2];
    },

    MessageConfigRows: () => {
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("broadcast_mode_text").setLabel("Normal").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("broadcast_mode_embed").setLabel("Criar Embed").setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("broadcast_back_main").setLabel("Voltar para Central").setStyle(ButtonStyle.Secondary).setEmoji(Emojis.Voltar || "↩️")
        );
        return [row1, row2];
    },

    ChannelConfigRows: (availableChannels, selectedIds) => {
        const options = availableChannels.slice(0, 25).map(channel => ({
            label: channel.name.substring(0, 100),
            value: channel.id,
            description: `ID: ${channel.id}`,
            emoji: Emojis.foguete || "📢",
            default: selectedIds.includes(channel.id)
        }));

        if (options.length === 0) {
            options.push({ label: "Nenhum canal encontrado", value: "none", emoji: "❌" });
        }

        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("broadcast_select_channels")
                .setPlaceholder("Selecione os canais...")
                .setMinValues(0)
                .setMaxValues(options.length > 0 && options[0].value !== "none" ? options.length : 1)
                .addOptions(options)
                .setDisabled(options.length === 0 || options[0].value === "none")
        );

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("broadcast_back_main").setLabel("Voltar para Central").setStyle(ButtonStyle.Secondary).setEmoji(Emojis.Voltar || "↩️")
        );

        return [menuRow, backRow];
    },

    BuilderRows: () => {
        const controls = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("broadcast_set_title").setLabel("Título").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("broadcast_set_desc").setLabel("Descrição").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("broadcast_set_thumb").setLabel("Thumbnail").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("broadcast_set_img").setLabel("Imagem").setStyle(ButtonStyle.Secondary)
        );
        const actions = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("broadcast_save_embed").setLabel("Salvar e Voltar").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("broadcast_menu_msg").setLabel("Cancelar").setStyle(ButtonStyle.Danger)
        );
        return [controls, actions];
    },

    createModal: (id, title, label, style, value) => {
        const modal = new ModalBuilder().setCustomId(id).setTitle(title);
        const input = new TextInputBuilder().setCustomId("input_val").setLabel(label).setStyle(style).setRequired(false).setValue(value ? String(value).substring(0, 4000) : "");
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return modal;
    }
};