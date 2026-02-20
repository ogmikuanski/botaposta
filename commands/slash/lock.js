const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require("discord.js");
const Emojis = require("../../Emojis.json");

const { getServerConfig } = require("../../manager/configManager");
const { isBlacklisted } = require("../../manager/blacklistManager");
const { isDev } = require("../../manager/devManager");
const {
    isMaintenanceMode,
    getRemainingCooldown,
    setCooldown,
} = require("../../utils/cache");

const {
    EQUIPE_IDS,
    botcolor,
    DEFAULT_FOOTER_TEXT,
    DEFAULT_FOOTER_ICON,
    BOT_MARCACOES_INTERFACES,
    MSGERROBOT
} = process.env;

const ownerIdSet = new Set(
    EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

const createEmbed = (description, color = Colors.Red, footerText = null, footerIcon = null) => {
    const embed = new EmbedBuilder()
        .setColor(botcolor || color)
        .setDescription(description);

    if (footerText) {
        embed.setFooter({ 
            text: footerText, 
            iconURL: footerIcon || undefined 
        });
    }
    return embed;
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lock")
        .setDescription("Alterna entre trancar (Lock) e destrancar (Unlock) o canal atual.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    execute: async (interaction, client) => {
        await interaction.deferReply();

        try {
            const userIsDev = await isDev(interaction.user.id);
            const userIsOnEquipe = ownerIdSet.has(interaction.user.id) || userIsDev;

            if (!userIsOnEquipe) {
                const maintenance = await isMaintenanceMode();
                if (maintenance) {
                    return interaction.editReply({
                        embeds: [createEmbed(
                            `- ${Emojis.verifybot || "🤖"} ${process.env.MSGMANUTENCAO}`,
                            Colors.Yellow,
                            client.user.username,
                            DEFAULT_FOOTER_ICON || client.user.displayAvatarURL()
                        )]
                    });
                }
            }

            const userBlocked = await isBlacklisted(interaction.user.id, "user");
            if (userBlocked) {
                return interaction.editReply({
                    embeds: [createEmbed(
                        `${Emojis.circlecross || "🚫"} **ACESSO NEGADO!**\nVocê está na blacklist deste bot.`,
                        Colors.Red
                    )]
                });
            }

            const guildBlocked = await isBlacklisted(interaction.guild.id, "guild");
            if (guildBlocked) {
                return interaction.editReply({
                    embeds: [createEmbed(
                        `${Emojis.circlecross || "🚫"} **ACESSO NEGADO!**\nEste servidor está bloqueado.`,
                        Colors.Red
                    )]
                });
            }

            if (!userIsOnEquipe) {
                const server = await getServerConfig(interaction.guild.id, interaction.guild.name);
                const remaining = await getRemainingCooldown(interaction.guild.id, interaction.user.id, "lock");

                if (remaining > 0) {
                    return interaction.editReply({
                        content: `## ${Emojis.aviso || "⚠️"} Calma aí!\n- Você precisa esperar **${remaining.toFixed(1)}s**.`
                    });
                }
                await setCooldown(interaction.guild.id, interaction.user.id, "lock", server.cooldown || 5);
            }

            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.editReply({
                    embeds: [createEmbed(
                        `### ${Emojis.circlecross || "❌"} Eu não tenho permissão!\n- Preciso da permissão \`Gerenciar Canais\` para fazer isso.`,
                        Colors.Red
                    )]
                });
            }

            const channel = interaction.channel;
            const everyone = interaction.guild.roles.everyone;

            const isUnlocked = channel.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);

            const useMentions = BOT_MARCACOES_INTERFACES === "true";
            const actor = useMentions ? interaction.user : `**${interaction.user.username}**`;

            if (isUnlocked) {
                await channel.permissionOverwrites.edit(everyone, { 
                    [PermissionFlagsBits.SendMessages]: false 
                });

                const embed = createEmbed(
                    `## 🔒 Canal Trancado\nEste canal foi silenciado por ${actor}.`,
                    Colors.Red,
                    DEFAULT_FOOTER_TEXT || client.user.username,
                    interaction.guild.iconURL()
                ).setTimestamp();

                return interaction.editReply({ embeds: [embed] });

            } else {
                await channel.permissionOverwrites.edit(everyone, { 
                    [PermissionFlagsBits.SendMessages]: null 
                });

                const embed = createEmbed(
                    `## 🔓 Canal Destrancado\n- O canal foi reaberto por ${actor}.`,
                    Colors.Green,
                    DEFAULT_FOOTER_TEXT || client.user.username,
                    interaction.guild.iconURL()
                ).setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

        } catch (err) {
            console.error("[CMD Lock] Erro Crítico:", err);
            const errorMsg = MSGERROBOT || "❌ Ocorreu um erro interno ao executar o comando.";
            
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: errorMsg });
            } else if (!interaction.replied) {
                await interaction.reply({ content: errorMsg, ephemeral: true });
            }
        }
    },
};