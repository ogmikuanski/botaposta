const { Op } = require("sequelize");
const ApostadoLog = require("../database/models/ApostadoLog");
const { redisClient, getMatchKey } = require("../utils/cache");

async function cleanupOrphanedLogs(client) {
  let deletedCount = 0;

  try {
    const activeLogs = await ApostadoLog.findAll({
      where: {
        status: {
          [Op.in]: [
            "ABERTA",
            "FINALIZADA",
            "CANCELADA",
            "CANCELADA_AFK",
            "ENCERRADA",
          ],
        },
        threadId: { [Op.ne]: null },
      },
    });

    if (activeLogs.length === 0) {
      return deletedCount;
    }

    const logsByGuild = activeLogs.reduce((acc, log) => {
      if (!acc.has(log.guildId)) {
        acc.set(log.guildId, []);
      }
      acc.get(log.guildId).push(log);
      return acc;
    }, new Map());

    for (const [guildId, logs] of logsByGuild.entries()) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);

      if (!guild) {
        const logIds = logs.map((log) => log.id);
        const count = await ApostadoLog.destroy({
          where: { id: { [Op.in]: logIds } },
        });
        deletedCount += count;
        continue;
      }

      const threadsToDelete = [];
      for (const log of logs) {
        const threadId = log.threadId;

        try {
          await guild.channels.fetch(threadId);

          const matchKey = getMatchKey(guildId, threadId);
          const matchDataJSON = await redisClient.get(matchKey);
          if (!matchDataJSON && log.status === "ABERTA") {
            threadsToDelete.push(log.id);
          }
        } catch (error) {
          if (error.code === 10003) {
            threadsToDelete.push(log.id);
            await redisClient.del(getMatchKey(guildId, threadId));
          } else {
            console.warn(
              `[Cleanup] Não foi possível verificar o tópico ${threadId} no servidor ${guild.name}: ${error.message}`
            );
          }
        }
      }

      if (threadsToDelete.length > 0) {
        const count = await ApostadoLog.destroy({
          where: { id: { [Op.in]: threadsToDelete } },
        });
        deletedCount += count;
      }
    }
    return deletedCount;
  } catch (err) {
    console.error("[Cleanup] Erro inesperado no processo de limpeza:", err);
    return deletedCount;
  }
}

module.exports = {
  cleanupOrphanedLogs,
};
