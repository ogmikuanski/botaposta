const {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const Emojis = require("../../Emojis.json");
const {
  GUILD_LOG_SERVER_ID,
  GUILD_CATEGORIA_DENUNCIA_ID,
  GUILD_STAFFS_DENUNCIA_IDS,
} = process.env;
const { getServerConfig } = require("../../manager/configManager");
const { isBlacklisted } = require("../../manager/blacklistManager");
const { isDev } = require("../../manager/devManager");
const {
  isMaintenanceMode,
  getRemainingCooldown,
  setCooldown,
} = require("../../utils/cache");
const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportar")
    .setDescription(
      "Envia uma denúncia (usuário, bug, abuso, etc.) para a equipe."
    ),

  execute: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.warn(`[reportar] Falha ao deferir: ${e.message}`);
      return;
    }

    try {
      const userIsDev = await isDev(interaction.user.id);
      const userIsOnEquipe = ownerIdSet.has(interaction.user.id) || userIsDev;

      if (!userIsOnEquipe) {
        const maintenance = await isMaintenanceMode();
        if (maintenance) {
          return interaction.editReply({
            content: "",
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Yellow)
                .setDescription(
                  `- ${Emojis.verifybot || "🤖"
                  } ${process.env.MSGMANUTENCAO}`
                )
                .setFooter({
                  text: client.user.username,
                  iconURL:
                    client.user.displayAvatarURL() || undefined
                      ? process.env.DEFAULT_FOOTER_ICON
                      : undefined,
                }),
            ],
          });
        }

        const userBlocked = await isBlacklisted(interaction.user.id, "user");
        if (userBlocked) {
          const embed = new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
            .setDescription(
              process.env.MSGBLACKLISTMEMBERBOT
            )
            .setFooter({
              text: client.user.username,
              iconURL: client.user.displayAvatarURL(),
            });

          return interaction.editReply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
        }

        const guildBlocked = await isBlacklisted(interaction.guild.id, "guild");
        if (guildBlocked) {
          const embed = new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
            .setDescription(
              process.env.MSGBLACKLISTSERVIDORBOT
            )
            .setFooter({
              text: client.user.username,
              iconURL: client.user.displayAvatarURL(),
            });

          return interaction.editReply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
        }

        const server = await getServerConfig(
          interaction.guild.id,
          interaction.guild.name
        );
        const remaining = await getRemainingCooldown(
          interaction.guild.id,
          interaction.user.id,
          module.exports.data.name
        );
        if (remaining > 0) {
          return interaction.editReply({
            content: `## ${Emojis.aviso
              } Calma aí!\n- Você precisa esperar **${remaining.toFixed(1)}s**.`,
          });
        }
        await setCooldown(
          interaction.guild.id,
          interaction.user.id,
          module.exports.data.name,
          server.cooldown || 5
        );
      }

      if (
        !GUILD_LOG_SERVER_ID ||
        !GUILD_CATEGORIA_DENUNCIA_ID ||
        !GUILD_STAFFS_DENUNCIA_IDS
      ) {
        console.error(
          "[Reportar] Variáveis de denúncia (...) não configuradas no .env"
        );
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross || "❌"
                } Sistema Indisponível\n- O sistema de denúncias está temporariamente offline.`
              ),
          ],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`${Emojis.aviso || "⚠️"} Central de Denúncias`)
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(
          `**O que você gostaria de fazer?**\n\n` +
          `> ${Emojis.usersss || "👤"
          } **Reportar Usuário:**\n> Denuncie um jogador por quebra de regras, abuso, etc.\n\n` +
          `> ${Emojis.bot || "🤖"
          } **Reportar Bug:**\n> Envie um relatório de bug ou falha no sistema para a equipe.`
        )
        .setFooter({
          text: "Obrigado por nos ajudar a manter a comunidade segura!",
        });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("open_report_denuncia_modal")
          .setLabel("Reportar Usuário")
          .setStyle(ButtonStyle.Danger)
          .setEmoji(Emojis.usersss || "👤"),
        new ButtonBuilder()
          .setCustomId("open_report_bug_modal")
          .setLabel("Reportar Bug")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(Emojis.bot || "🤖")
      );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } catch (err) {
      console.error(`Erro no /${module.exports.data.name}:`, err);
      const errorEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(process.env.MSGERROBOT);

      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({ embeds: [errorEmbed], content: "" })
          .catch(() => { });
      }
    }
  },
};
