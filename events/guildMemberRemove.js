const { Events, EmbedBuilder, Colors } = require("discord.js");
const CargosConfig = require("../database/models/CargosConfig");
const SecurityManager = require("../manager/securityManager");
const { redisClient } = require("../utils/cache");
const {
  forceUpdateMediatorPanel,
} = require("../components/Apostas/mediatorHandler");
const Emojis = require("../Emojis.json");
const {
  GUILD_LOG_SERVER_ID,
  SUNDOBOT,
  GUILD_LOG_SERVERTESTE_IDS,
  NOMEMARCA
} = process.env;

module.exports = {
  name: Events.GuildMemberRemove,
  once: false,

  async execute(member) {
    const client = member.client;
    const guild = member.guild;

    if (!SUNDOBOT) return;

    if (member.id === client.user.id) {
      const allowedGuilds = [
        GUILD_LOG_SERVER_ID,
        ...(GUILD_LOG_SERVERTESTE_IDS?.split(",") || [])
      ].filter(Boolean);

      if (allowedGuilds.includes(guild.id)) {
        console.log(`[AntiDuplicate] 🛡️ Servidor Whitelist (${guild.name}). Tudo certo.`);
        return;
      }

      try {
        const rivalMember = await guild.members.fetch(SUNDOBOT).catch(() => null);
        if (rivalMember && rivalMember.id !== client.user.id) {
          console.warn(`[AntiDuplicate] 🚨 CONFLITO DETECTADO em ${guild.name}`);
          await guild.leave();
          return;
        }
      } catch (err) {
        console.error(`[AntiDuplicate] Erro:`, err);
      }

      return;
    }

    if (member.user.bot) return;

    const security = new SecurityManager(client);
    await security.checkGuildIntegrity(member.guild);

    const guildId = member.guild.id;
    const userId = member.user.id;

    if (!redisClient || !redisClient.isReady) return;

    try {
      const mediatorsKey = `${process.env.REDIS_NAMESPACE}:${guildId}:mediators:online`;
      const mediatorsQueueKey = mediatorsKey + ":queue";

      const wasOnline = await redisClient.hDel(mediatorsKey, userId);
      if (wasOnline) {
        await redisClient.lRem(mediatorsQueueKey, 0, userId);
        await forceUpdateMediatorPanel(client, guildId);
      }
    } catch (e) {
      console.error("[Exit] Erro ao limpar fila de mediador:", e);
    }

    const matchPattern = `${process.env.REDIS_NAMESPACE}:${guildId}:match:*`;

    const iterator = redisClient.scanIterator({
      MATCH: matchPattern,
      COUNT: 100,
    });

    for await (const rawKey of iterator) {
      const key = String(rawKey);
      if (key.endsWith(":lock")) continue;

      try {
        const dataJson = await redisClient.get(key);
        if (!dataJson) continue;

        const matchData = JSON.parse(dataJson);
        const threadId = key.split(":").pop();
        if (!threadId) continue;

        const isPlayer =
          matchData.players && matchData.players.includes(userId);
        const isMediator = matchData.assignedMediatorId === userId;

        if (isPlayer || isMediator) {
          const thread = await member.guild.channels
            .fetch(threadId)
            .catch(() => null);

          if (thread) {
            let alertContent = "";
            let embedColor = process.env.botcolor || Colors.Yellow;
            let title = `${Emojis.aviso || "⚠️"} USUÁRIO SAIU DO SERVIDOR`;
            let description = "";

            if (isMediator) {
              const [cargosConfig] = await CargosConfig.findOrCreate({
                where: { guildId },
              });
              const permMaxRole = cargosConfig.cargoPermMaxId
                ? `<@&${cargosConfig.cargoPermMaxId}>`
                : "@here";

              embedColor = process.env.botcolor || Colors.Red;
              title = `${Emojis.aviso || "🚨"} MEDIADOR SAIU!`;
              description =
                `- O Mediador responsável **<@${userId}>** saiu do servidor!\n` +
                `> A partida está pausada aguardando o retorno ou intervenção da administração.\n\n` +
                `🔧 **Staff:** Verifique a situação.`;

              alertContent = `${permMaxRole}`;
            } else {
              description =
                `- O Jogador **<@${userId}>** saiu do servidor.\n` +
                `> A partida continua aberta. Aguarde o retorno ou acione um mediador/staff se necessário.`;
            }

            const alertEmbed = new EmbedBuilder()
              .setColor(embedColor)
              .setTitle(title)
              .setDescription(description)
              .setTimestamp()
              .setFooter({ text: `ID: ${userId}` });

            await thread.send({
              content: alertContent,
              embeds: [alertEmbed],
            });
          }
        }
      } catch (err) {
        console.error(`[Exit] Erro ao processar partida ativa ${key}:`, err);
      }
    }
  },
};
