const { EmbedBuilder, Colors } = require("discord.js");
const Emojis = require("../../Emojis.json");
const { DEFAULT_FOOTER_TEXT, DEFAULT_FOOTER_ICON, BOT_MARCACOES_INTERFACES } = process.env;

function getFooterData(guild) {
    const useDefault = BOT_MARCACOES_INTERFACES === 'true';
    return {
        text: useDefault ? (DEFAULT_FOOTER_TEXT || "broadcast system") : guild.name,
        iconURL: useDefault ? (DEFAULT_FOOTER_ICON || null) : (guild.iconURL() || null)
    };
}

module.exports = {
    MainDashboardEmbed: (guild, config, totalAvailable) => {
        const statusIcon = config.status ? (Emojis.BotOnline || "✅") : (Emojis.BotOffline || "🔴");
        const statusText = config.status ? "**SISTEMA LIGADO**" : "**SISTEMA DESLIGADO**";
        
        const selectedCount = (config.targetChannels || []).length;
        
        let preview = "- Nenhuma mensagem configurada.";
        if (config.mode === 'text' && config.textContent) preview = `- Estilo com normal`;
        if (config.mode === 'embed') preview = "- Estilo com Embed";

        return new EmbedBuilder()
            .setColor(process.env.botcolor)
            .setDescription(
                `# ${Emojis.aviso || "📢"} Central de broadcast \n` +
                `### Status: ${statusIcon}\n` +
                `- ${statusText}\n` +
                `### Canal:\n` +
                `- Há \`${selectedCount}\` configurado.\n` +
                `- Há \`${totalAvailable}\` no sistema.\n` +
                `### Conteúdo:\n` +
                preview

            )
            .setFooter(getFooterData(guild));
    },

    MessageConfigEmbed: (guild, config) => {
        let content = config.mode === 'text' 
            ? `\`\`\`${config.textContent || "Vazio"}\`\`\`` 
            : "**Embed Configurada**";

        return new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Blue)
            .setDescription(`## Configurar Mensagem Broadcast\n- Escolha o tipo de mensagem e edite o conteúdo.\n\n**Atual:**\n${content}`)
            .setFooter(getFooterData(guild));
    },

    ChannelConfigEmbed: (guild, config, availableChannels) => {
        const selectedIds = config.targetChannels || [];
        
        const selectedNames = availableChannels
            .filter(c => selectedIds.includes(c.id))
            .map(c => `• ${c.name}`)
            .join("\n");

        return new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Orange)
            .setDescription(
                `## Seleção de Canais para Broadcast\n` + 
                `- O sistema encontrou **${availableChannels.length}** canais configurados nas Filas.\n` 
            )
            .addFields(
                { name: `Selecionados (${selectedIds.length}):`, value: selectedNames ? `\`\`\`\n${selectedNames.substring(0, 1000)}\n\`\`\`` : "- Nenhum canal selecionado." }
            )
            .setFooter(getFooterData(guild));
    },

    BuilderEmbed: (draft, guild) => {
        const embed = new EmbedBuilder(draft);
        embed.setColor(process.env.botcolor || Colors.Blue);
        if (!embed.data.footer) embed.setFooter(getFooterData(guild));
        return embed;
    }
};