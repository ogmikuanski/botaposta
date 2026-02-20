const { EmbedBuilder, Colors } = require("discord.js");
const PlayerProfile = require("../../database/models/PlayerProfile");
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
  name: "p",
  description: "Mostra o perfil de estatísticas de um jogador.",

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

        if (targetUser.bot) {
          return responseMsg
            .delete()
            .catch(() => { })
            .then((msg) =>
              setTimeout(() => msg.delete().catch(() => { }), 5000)
            );
        }

        const [profile] = await PlayerProfile.findOrCreate({
          where: {
            guildId: message.guild.id,
            userId: targetUser.id,
          },
          defaults: {
            guildId: message.guild.id,
            userId: targetUser.id,
            partidasTotais: 0,
            coins: 0,
            wins: 0,
            losses: 0,
            wo: 0,
            maxWinStreak: 0,
            currentWinStreak: 0,
          },
        });

        const descriptionLines = [
          `### ${Emojis.raio} Estatísticas:`,
          `> Coins: ${profile.coins}`,
          `> Vitórias: **${profile.wins}**`,
          `> Derrotas: **${profile.losses}**`,
        ];

        const embed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Blue)
          .setAuthor({
            name: targetUser.globalName || targetUser.username,
            iconURL: targetUser.displayAvatarURL(),
          })
          .setThumbnail(
            message.guild?.iconURL({ dynamic: true, size: 256 }) ?? null
          )
          .setDescription(descriptionLines.join("\n"))
          .setFooter({
            text: `Partidas totais: ${profile.partidasTotais}`,
            iconURL: message.guild.iconURL({ dynamic: true })
          });

        await responseMsg.edit({ embeds: [embed], content: "" });
      } catch (err) {
        let errorContent = process.env.MSGERROBOT;
        if (err.code === 10013 || err.code === 50035) {
          errorContent = "❌ Usuário não encontrado. Verifique a menção ou ID.";
        }

        if (err.message.includes("Could not find the channel where this message came from in the cache!")) return;
        await responseMsg.edit({ content: errorContent }).then((msg) => setTimeout(() => msg.delete().catch(() => { }), 5000));
        console.error("Erro ao buscar perfil (.p):", err);
      }
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
