const {
  EmbedBuilder,
  Colors,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const Emojis = require("../../Emojis.json");
const { getServerConfigKey, getServerConfig } = require("../../utils/cache");
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
  name: "help",
  description: "Mostra a lista de comandos de prefixo disponíveis.",

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

        const serverConfig = await getServerConfig(
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
          serverConfig.cooldown || 5
        );
      }

      const server = await getServerConfigKey(
        message.guild.id,
        message.guild.name
      );
      const prefix = server.prefix || process.env.DISCORD_PREFIX || ".";

      const canManageMessages = message.member.permissions.has(
        PermissionFlagsBits.ManageMessages
      );
      const canManageEmojis = message.member.permissions.has(
        PermissionFlagsBits.ManageGuildExpressions
      );
      const userIsAdmin = canManageMessages || canManageEmojis;

      const homeEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Blue)
        .setDescription(
          `### ${Emojis.livro || "📖"
          } Central de Ajuda\nMeu prefixo neste servidor é: \`${prefix}\``
        )
        .setThumbnail(message.guild.iconURL({ dynamic: true }))
        .addFields({
          name: "Comandos de Barra (Slash)",
          value:
            "Para ver a lista completa de comandos `/`, use o comando `/help`.",
        })
        .setFooter({
          text: message.guild.name,
          iconURL: message.guild.iconURL(),
        });

      const selectOptions = [
        {
          label: "Início",
          description: "Voltar para a página principal da ajuda.",
          value: "prefix_help_home",
          emoji: Emojis.verifybot || "🏠",
        },
        {
          label: "Comandos Gerais",
          description: "Comandos disponíveis para todos os usuários.",
          value: "prefix_help_geral",
          emoji: Emojis.livro || "📖",
        },
      ];

      if (userIsAdmin) {
        selectOptions.push({
          label: "Comandos de Moderação",
          description: "Comandos para administrar o servidor.",
          value: "prefix_help_admin",
          emoji: Emojis.server || "🛡️",
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("prefix_help_select_menu")
          .setPlaceholder("Selecione uma categoria...")
          .setOptions(selectOptions)
      );

      await responseMsg.edit({
        embeds: [homeEmbed],
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
