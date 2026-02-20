const { EmbedBuilder, Colors } = require("discord.js");
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
  name: "avatar",
  description: "Mostra o avatar de um usuário ou o seu próprio.",

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

      let targetUser;
      try {
        if (args.length > 0) {
          const mention = message.mentions.users.first();
          const userId = args[0].replace(/<@!?|>/g, "");

          if (mention) {
            targetUser = mention;
          } else if (/^\d{17,19}$/.test(userId)) {
            targetUser = await client.users.fetch(userId);
          } else {
            targetUser = message.author;
          }
        } else {
          targetUser = message.author;
        }
      } catch (err) {
        console.error("Erro ao buscar usuário no .avatar:", err);
        return responseMsg
          .edit({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `### ${Emojis.circlecross || "❌"
                  } Usuário Não Encontrado!\n- Não consegui encontrar um usuário com o ID \`${args[0]
                  }\`.`
                ),
            ],
            content: "",
          })
          .then((msg) => setTimeout(() => msg.delete().catch(() => { }), 5000));
      }

      const avatarURL = targetUser.displayAvatarURL({
        dynamic: true,
        size: 1024,
      });

      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Blue)
        .setImage(avatarURL)
        .setDescription(`> [Clique aqui para baixar a imagem.](${avatarURL})`);

      await responseMsg.edit({ embeds: [embed], content: "" });
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
