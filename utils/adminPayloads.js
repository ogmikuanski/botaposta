const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    Colors,
    MessageFlags
} = require("discord.js");
const Emojis = require("../Emojis.json");
const { isMaintenanceMode } = require("./cache");


async function getAdminPanelPayload(client, user) {
    const maintenance = await isMaintenanceMode();
    const statusEmoji = maintenance ? "🔴" : "🟢";
    const statusText = maintenance ? "Manutenção Ativa" : "Sistema Online";

    const embed = new EmbedBuilder()
        .setTitle(`${Emojis.verifybot || "🛡️"} Painel de Controle `)
        .setDescription(`Olá, **${user.username}**! Bem-vindo ao centro de comando.\n\nSelecione uma categoria abaixo para gerenciar o sistema.`)
        .addFields(
            {
                name: "📊 Status Atual",
                value: `> **Sistema:** ${statusText} ${statusEmoji}\n> **Ping:** \`${client.ws.ping}ms\``,
                inline: true
            },
            {
                name: "👥 Usuários",
                value: `> \`${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0).toLocaleString()}\` usuários`,
                inline: true
            },
            {
                name: "🏰 Servidores",
                value: `> \`${client.guilds.cache.size}\` conectados`,
                inline: true
            }
        )
        .setColor(process.env.botcolor || Colors.Blue)
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: "🔒 Acesso Restrito à Equipe", iconURL: user.displayAvatarURL() })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("rkadmin_main_menu_select")
            .setPlaceholder("Selecione um módulo de gerenciamento...")
            .setOptions([
                {
                    label: "Monitoramento",
                    description: "Ver uso de CPU, RAM e Status do Banco",
                    value: "rkadmin_monitoramento",
                    emoji: Emojis.status || "📊"
                },
                {
                    label: "Equipe",
                    description: "Gerenciar desenvolvedores e acessos",
                    value: "rkadmin_equipe_menu",
                    emoji: Emojis.emojireact || "👨‍💻"
                },
                {
                    label: "Gerenciar (Blacklist)",
                    description: "Bloquear/Desbloquear usuários e servidores",
                    value: "rkadmin_gerenciar_menu",
                    emoji: Emojis.bloqueado || "🚫"
                },
                {
                    label: "Servidores",
                    description: "Listar, sair ou gerar convites de guilds",
                    value: "rkadmin_servidores_menu",
                    emoji: Emojis.server || "🏰"
                },
                {
                    label: "Manutenção",
                    description: "Ativar ou desativar o modo de manutenção",
                    value: "rkadmin_manutencao_menu",
                    emoji: Emojis.verifybot || "⚠️"
                }
            ])
    );

    return {
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
    };
}

module.exports = { getAdminPanelPayload };