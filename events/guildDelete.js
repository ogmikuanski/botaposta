const { Events, EmbedBuilder, Colors, ChannelType } = require("discord.js");
const Server = require("../database/models/server");
const Emojis = require("../Emojis.json");
const { redisClient } = require("../utils/cache");
const { GUILD_LOG_SERVER_ID, GUILD_LOG_CHANNEL_LEAVE_ID } = process.env;

module.exports = {
  name: Events.GuildDelete,
  once: false,

  async execute(guild, client) {
    const guildId = guild.id;
    const guildName = guild.name || "Desconhecido";

    try {
      const server = await Server.findOne({ where: { guildId } });
      if (server) {
        await server.update({
          guildName: guildName,
          botLeftAt: new Date(),
        });
      }
    } catch (error) {
      console.error(
        `❌ Erro ao processar guildDelete (Soft DB) para ${guildName}:`,
        error
      );
    }

    if (redisClient && redisClient.isReady) {
      try {
        const guildKeyPattern = `${process.env.REDIS_NAMESPACE}:${guildId}:*`;
        const keys = await redisClient.keys(guildKeyPattern);
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      } catch (redisErr) {
        console.error(
          `⚠️ Erro ao limpar cache no guildDelete para ${guildId}:`,
          redisErr
        );
      }
    }

    if (!GUILD_LOG_SERVER_ID || !GUILD_LOG_CHANNEL_LEAVE_ID) return;

    try {
      const logGuild = await client.guilds
        .fetch(GUILD_LOG_SERVER_ID)
        .catch(() => null);
      if (!logGuild?.available) return;

      const logChannel = await logGuild.channels
        .fetch(GUILD_LOG_CHANNEL_LEAVE_ID)
        .catch(() => null);
      if (!logChannel?.isTextBased()) return;

      const timestampNow = Math.floor(Date.now() / 1000);
      const memberCount = guild.memberCount ?? "???";

      const ownerId = guild.ownerId || "Desconhecido";
      const ownerString =
        ownerId !== "Desconhecido"
          ? `<@${ownerId}> \`[${ownerId}]\``
          : "Desconhecido";

      const embed = new EmbedBuilder()
        .setDescription(
          `## BOT REMOVIDO\n` +
          `\n### ${Emojis.discord || "👑"
          } **Responsável pelo servidor:**\n> ${ownerString}` +
          `\n### ${Emojis.abrirticket || "🏛️"
          } **Informações do Servidor:**\n> \`${guildName}\` \`[${guildId}]\`` +
          `\n### ${Emojis.usersss || "📈"
          } **Quantidade de Membros:**\n> \`${memberCount}\`` +
          `\n### ${Emojis.calendario || "📅"
          } **Data:**\n> <t:${timestampNow}:f>`
        )
        .setColor(
          /^#?[0-9A-F]{6}$/i.test(process.env.botcolor)
            ? process.env.botcolor
            : Colors.Red
        )
        .setTimestamp();

      const icon = guild.iconURL({ dynamic: true });
      if (icon) embed.setThumbnail(icon);

      await new Promise(r => setTimeout(r, 1500));
      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      if (!err.message?.includes("other side closed")) {
        console.error("Erro real:", err);
      }
    }
  },
};
