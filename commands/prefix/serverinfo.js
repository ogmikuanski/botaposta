const { EmbedBuilder, Colors, ChannelType } = require("discord.js");
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
  name: "serverinfo",
  description: "Mostra informações detalhadas sobre o servidor atual.",

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

      const guild = message.guild;

      let owner;
      try {
        owner = await guild.fetchOwner();
      } catch (err) {
        console.error(
          `Falha ao buscar owner (prefix serverinfo) em ${guild.id}: ${err.message}`
        );
      }

      const textChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildText
      ).size;
      const voiceChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildVoice
      ).size;
      const categories = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildCategory
      ).size;
      const members = guild.memberCount;
      const bots = guild.members.cache.filter((m) => m.user.bot).size;
      const humans = members - bots;

      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Blue)
        .setAuthor({
          name: guild.name,
          iconURL: guild.iconURL({ dynamic: true }),
        })
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          {
            name: `Dono`,
            value: owner
              ? `> <@${owner.id}> [\`${owner.id}\`]`
              : "`Não foi possível buscar`",
          },
          { name: "ID do Servidor", value: `> (\`${guild.id}\`)` },
          {
            name: "Criado em",
            value: `> <t:${Math.floor(guild.createdAt.getTime() / 1000)}:F>`,
            inline: false,
          },
          {
            name: `Membros (\` ${members} \`)`,
            value: `> **Humanos:** \`${humans}\`\n> **Bots:** \`${bots}\``,
          },
          {
            name: `Canais (\` ${textChannels + voiceChannels} \`)`,
            value: `> **Texto:** \`${textChannels}\`\n> **Voz:** \`${voiceChannels}\`\n> **Categorias:** \`${categories}\``,
          },
          {
            name: `Emojis e Cargos`,
            value: `> **Emojis:** \`${guild.emojis.cache.size}\`\n> **Cargos:** \`${guild.roles.cache.size}\``,
          }
        )
        .setTimestamp();

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
