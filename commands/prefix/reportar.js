const {
  EmbedBuilder,
  Colors,
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
  name: "reportar",
  description: "Enviar uma denúncia ou reportar um bug.",

  execute: async (message, args, client) => {
    let responseMsg;
    try {
      responseMsg = await message.reply({
        content: `${Emojis.loading || "🔄"} Processando...`,
      });
    } catch (e) {
      return;
    }

    if (message.deletable) {
      message.delete().catch(() => { });
    }

    try {
      const userIsDev = await isDev(message.author.id);
      const userIsOnEquipe = ownerIdSet.has(message.author.id) || userIsDev;

      if (!userIsOnEquipe) {
        const maintenance = await isMaintenanceMode();
        if (maintenance) {
          return responseMsg
            .edit({
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
            })
            .then((msg) =>
              setTimeout(() => msg.delete().catch(() => { }), 5000)
            );
        }

        const userBlocked = await isBlacklisted(message.author.id, "user");
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

          return responseMsg
            .edit({
              embeds: [embed],
              content: "",
            })
            .then((msg) =>
              setTimeout(() => msg.delete().catch(() => { }), 5000)
            );
        }
        const guildBlocked = await isBlacklisted(message.guild.id, "guild");
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

          return responseMsg
            .edit({
              embeds: [embed],
              content: "",
            })
            .then((msg) =>
              setTimeout(() => msg.delete().catch(() => { }), 5000)
            );
        }

        const server = await getServerConfig(
          message.guild.id,
          message.guild.name
        );
        const remaining = await getRemainingCooldown(
          message.guild.id,
          message.author.id,
          module.exports.name
        );
        if (remaining > 0) {
          return responseMsg
            .edit({
              content: `## ${Emojis.aviso
                } Calma aí!\n- Você precisa esperar **${remaining.toFixed(
                  1
                )}s**.`,
            })
            .then((msg) =>
              setTimeout(() => msg.delete().catch(() => { }), 5000)
            );
        }
        await setCooldown(
          message.guild.id,
          message.author.id,
          module.exports.name,
          server.cooldown || 5
        );
      }

      if (
        !GUILD_LOG_SERVER_ID ||
        !GUILD_CATEGORIA_DENUNCIA_ID ||
        !GUILD_STAFFS_DENUNCIA_IDS
      ) {
        console.error(
          "[Reportar] Variáveis de denúncia (GUILD_LOG_SERVER_ID, GUILD_CATEGORIA_DENUNCIA_ID, GUILD_STAFFS_DENUNCIA_IDS) não configuradas no .env"
        );

        await responseMsg
          .edit({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `### ${Emojis.circlecross || "❌"
                  } Sistema Indisponível\n- O sistema de denúncias está temporariamente offline.`
                ),
            ],
            content: "",
          })
          .then((msg) => setTimeout(() => msg.delete().catch(() => { }), 5000));
        return;
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

      await responseMsg.edit({
        embeds: [embed],
        components: [row],
        content: "",
      });
    } catch (err) {
      console.error(`Erro no .${module.exports.name}:`, err);
      const errorEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(process.env.MSGERROBOT);

      if (responseMsg && !responseMsg.deleted) {
        await responseMsg
          .edit({ embeds: [errorEmbed], content: "" })
          .then((msg) => setTimeout(() => msg.delete().catch(() => { }), 5000))
          .catch(() => { });
      }
    }
  },
};
