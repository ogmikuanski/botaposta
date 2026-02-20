const { PermissionFlagsBits, EmbedBuilder, Colors } = require("discord.js");
const Emojis = require("../../Emojis.json");

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
  name: "clear",
  description: "Apaga uma quantidade de mensagens no canal.",

  execute: async (message, args, client) => {
    let responseMsg;
    try {
      responseMsg = await message.reply({
        content: `${Emojis.loading || "🔄"} Processando...`,
      });
    } catch (e) {
      return;
    }

    try {
      const userIsDev = await isDev(message.author.id);
      const userIsOnEquipe = ownerIdSet.has(message.author.id) || userIsDev;

      if (!userIsOnEquipe) {
        const maintenance = await isMaintenanceMode();
        if (maintenance) {
          return responseMsg.edit({
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

          return responseMsg.edit({
            embeds: [embed],
            content: "",
          });
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

          return responseMsg.edit({
            embeds: [embed],
            content: "",
          });
        }

        const server = await getServerConfig(
          message.guild.id,
          message.guild.name
        );
        const remaining = await getRemainingCooldown(
          message.guild.id,
          message.author.id,
          "clear"
        );
        if (remaining > 0) {
          return responseMsg.edit({
            content: `## ${Emojis.aviso
              } Calma aí!\n- Você precisa esperar **${remaining.toFixed(1)}s**.`,
          });
        }
        await setCooldown(
          message.guild.id,
          message.author.id,
          "clear",
          server.cooldown || 5
        );
      }

      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return responseMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross || "❌"
                } Sem Permissão!\n- Você precisa da permissão de \`Gerenciar Mensagens\`.`
              ),
          ],
          content: "",
        });
      }

      if (
        !message.guild.members.me.permissions.has(
          PermissionFlagsBits.ManageMessages
        )
      ) {
        return responseMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross || "❌"
                } Eu não tenho permissão!\n- Eu não tenho a permissão de \`Gerenciar Mensagens\`.`
              ),
          ],
          content: "",
        });
      }

      let amount = parseInt(args[0]);
      const targetUser = message.mentions.users.first();
      if (isNaN(amount) && targetUser && args[1]) {
        amount = parseInt(args[1]);
      }

      if (isNaN(amount) || amount < 2 || amount > 100) {
        return responseMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.naoentendi || "❓"
                } Uso Incorreto!\n- A quantidade deve ser um número entre 2 e 100.\n- \`.clear <2-100> [@usuario]\``
              ),
          ],
          content: "",
        });
      }

      await message.delete().catch(() => { });

      const messages = await message.channel.messages.fetch({ limit: amount });

      let messagesToDelete = messages.filter(
        (msg) => msg.id !== responseMsg.id
      );

      if (targetUser) {
        messagesToDelete = messagesToDelete.filter(
          (msg) => msg.author.id === targetUser.id
        );
      }

      if (messagesToDelete.size === 0) {
        return responseMsg
          .edit({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Yellow)
                .setDescription(
                  `### ${Emojis.aviso || "⚠️"
                  } Nenhuma mensagem encontrada para apagar (ou são muito antigas).`
                ),
            ],
            content: "",
          })
          .then((msg) => setTimeout(() => msg.delete().catch(() => { }), 5000));
      }

      const deletedMessages = await message.channel.bulkDelete(
        messagesToDelete,
        true
      );

      const replyEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Green)
        .setDescription(
          `### ${Emojis.check || "✅"} Sucesso!\n- **${deletedMessages.size
          }** mensagens foram apagadas.`
        );

      if (targetUser) {
        replyEmbed.setDescription(
          `### ${Emojis.check || "✅"} Sucesso!\n- **${deletedMessages.size
          }** mensagens de ${targetUser.tag} foram apagadas.`
        );
      }

      await responseMsg
        .edit({ embeds: [replyEmbed], content: "" })
        .then((msg) => setTimeout(() => msg.delete().catch(() => { }), 5000));
    } catch (err) { }
  },
};
