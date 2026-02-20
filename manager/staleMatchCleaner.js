const { redisClient } = require("../utils/cache");
const ApostadoLog = require("../database/models/ApostadoLog");
const { EmbedBuilder, Colors } = require("discord.js");
const Emojis = require("../Emojis.json");
const { getLogChannel } = require("../services/logService");

const TIMEOUT_AFK_SECONDS = 600;

module.exports = {
  startMatchCleaner: (client) => {
    setInterval(async () => {
      if (!redisClient || !redisClient.isReady) return;

      const pattern = "${process.env.REDIS_NAMESPACE}:*:match:*";

      try {
        const iterator = redisClient.scanIterator({
          MATCH: pattern,
          COUNT: 100,
        });

        for await (const rawKey of iterator) {
          const key = String(rawKey);

          if (key.endsWith(":lock")) continue;

          try {
            const dataJson = await redisClient.get(key);
            if (!dataJson) continue;

            let matchData;
            try {
              matchData = JSON.parse(dataJson);
            } catch {
              await redisClient.del(key);
              continue;
            }

            if (matchData.status === "ENCERRADA") {
              if (matchData.guildId) {
                const guild = await client.guilds
                  .fetch(String(matchData.guildId))
                  .catch(() => null);

                if (guild) {
                  const threadId = key.split(":").pop();
                  if (threadId) {
                    const thread = await guild.channels
                      .fetch(threadId)
                      .catch(() => null);

                    if (thread) {
                      await thread.delete().catch(() => { });
                    }
                  }
                }
              }
              await redisClient.unlink(key);
              continue;
            }

            if (!matchData.timestamp) continue;

            const now = Math.floor(Date.now() / 1000);
            const timeDiff = now - matchData.timestamp;

            const isFull =
              matchData.confirmed &&
              matchData.maxPlayers &&
              matchData.confirmed.length >= matchData.maxPlayers;

            if (timeDiff > TIMEOUT_AFK_SECONDS && !isFull) {
              if (matchData.guildId) {
                const guild = await client.guilds
                  .fetch(String(matchData.guildId))
                  .catch(() => null);

                if (guild) {
                  const threadId = key.split(":").pop();
                  if (threadId) {
                    const thread = await guild.channels
                      .fetch(threadId)
                      .catch(() => null);

                    if (thread) {
                      await thread
                        .send(
                          "### ⏰ Tempo Esgotado!\n- Nem todos os jogadores confirmaram presença em 10 minutos.\n- Cancelando sala por inatividade..."
                        )
                        .catch(() => { });

                      const logChannelCancelada = await getLogChannel(
                        guild,
                        "logApostaCanceladaId"
                      );

                      if (logChannelCancelada) {
                        const playersStringLog =
                          matchData.players
                            ?.map((id) => `> <@${id}> \`[${id}]\``)
                            .join("\n") || "N/A";

                        const logEmbed = new EmbedBuilder()
                          .setTitle("APOSTA CANCELADA (AFK)")
                          .setColor(process.env.botcolor || Colors.Red)
                          .setDescription(
                            "[AUTO CANCELAMENTO] Após iniciar a partida, passaram-se 10 minutos e não houve as 2 confirmações. Por isso, finalizei esta aposta."
                          )
                          .addFields(
                            {
                              name: `${Emojis.espada || "⚔️"} Modo:`,
                              value: "> " + (matchData.modoDisplay || "N/A"),
                            },
                            {
                              name: `${Emojis.dinheiro || "💰"} Valor:`,
                              value:
                                "> " +
                                (matchData.valorBase
                                  ? matchData.valorBase.toLocaleString(
                                    "pt-BR",
                                    {
                                      style: "currency",
                                      currency: "BRL",
                                    }
                                  )
                                  : "N/A"),
                            },
                            {
                              name: `${Emojis.Sky_preview || "👥"
                                } Jogadores previstos:`,
                              value: playersStringLog,
                            },
                            {
                              name: "📅 Data:",
                              value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                            }
                          )
                          .setFooter({ text: `Thread ID: ${threadId}` });

                        await logChannelCancelada
                          .send({ embeds: [logEmbed] })
                          .catch((err) =>
                            console.error(
                              "[Faxineiro] Erro ao enviar log:",
                              err
                            )
                          );
                      }

                      await thread.delete().catch(() => { });
                    }
                  }
                }
              }

              await redisClient.unlink(key);

              if (matchData.matchId) {
                await ApostadoLog.update(
                  { status: "CANCELADA_AFK" },
                  { where: { matchId: String(matchData.matchId) } }
                );
              }
            }
          } catch (innerErr) {
            console.error(
              `[Faxineiro] Erro ao processar chave ${key}:`,
              innerErr.message
            );
          }
        }
      } catch (scanError) {
        console.error(
          "❌ [Faxineiro] Erro fatal durante a varredura (SCAN):",
          scanError
        );
      }
    }, 60 * 1000);
  },
};
