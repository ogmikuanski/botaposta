const { Events, ChannelType, EmbedBuilder, Colors } = require("discord.js");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const FilaConfig = require("../database/models/FilaConfig");
const LogsConfig = require("../database/models/LogsConfig");
const ApostadoLog = require("../database/models/ApostadoLog");
const Emojis = require("../Emojis.json");
const { redisClient, getMatchKey, decrementPlayerMatchCount } = require("../utils/cache");
const { ensurePersistentChannel } = require("../manager/persistentChannelManager");

const LOG_COLUMNS = [
  "logApostaAbertaId",
  "logApostaConfirmadoId",
  "logApostaFinalizadaId",
  "logApostaCanceladaId",
  "logPartidasId",
  "logMediadorId",
  "logBlacklistId",
  "logLojaId",
  "logLojaComprarId",
  "logRoletaId",
  "logRoletaPublicId"
];

module.exports = {
  name: Events.ChannelDelete,
  once: false,

  async execute(channel) {
    if (!channel.guild) return;
    const guildId = channel.guild.id;

    try {
      const configsGerais = await ConfigsGerais.findOne({ where: { guildId } });
      let isPersistentChannel = false;

      if (configsGerais) {
        const updates = {};

        if (configsGerais.persistentChannelId === channel.id) {
          isPersistentChannel = true;
          updates.persistentChannelId = null;
          updates.persistentMessageId = null;
        }

        if (configsGerais.apostadosChannelId === channel.id) updates.apostadosChannelId = null;
        if (configsGerais.mediatorPanelChannelId === channel.id) {
          updates.mediatorPanelChannelId = null;
          updates.mediatorPanelMessageId = null;
        }
        if (configsGerais.blacklistPanelChannelId === channel.id) {
          updates.blacklistPanelChannelId = null;
          updates.blacklistPanelMessageId = null;
        }
        if (configsGerais.perfilPanelChannelId === channel.id) {
          updates.perfilPanelChannelId = null;
          updates.perfilPanelMessageId = null;
        }
        if (configsGerais.roletaPanelChannelId === channel.id) {
          updates.roletaPanelChannelId = null;
        }

        if (Object.keys(updates).length > 0) {
          await configsGerais.update(updates);
        }
      }

      const logsConfig = await LogsConfig.findOne({ where: { guildId } });
      if (logsConfig) {
        const logUpdates = {};
        let updatedLog = false;

        for (const col of LOG_COLUMNS) {
          if (logsConfig[col] === channel.id) {
            logUpdates[col] = null;
            updatedLog = true;
          }
        }

        if (updatedLog) {
          await logsConfig.update(logUpdates);
        }
      }

      const filaConfig = await FilaConfig.findOne({ where: { guildId } });
      if (filaConfig && filaConfig.modalidades) {
        let mudouModalidade = false;

        const novasModalidades = filaConfig.modalidades.map((modo) => {
          if (modo.canalId === channel.id) {
            mudouModalidade = true;
            return { ...modo, canalId: null, ativo: false };
          }
          return modo;
        });

        if (mudouModalidade) {
          await FilaConfig.update(
            { modalidades: novasModalidades },
            { where: { guildId }, individualHooks: true }
          );
        }
      }

      if (
        channel.type === ChannelType.PublicThread ||
        channel.type === ChannelType.PrivateThread
      ) {
        const matchKey = getMatchKey(guildId, channel.id);

        if (redisClient && redisClient.isReady) {
          const matchDataJSON = await redisClient.get(matchKey);

          if (matchDataJSON) {
            const matchData = JSON.parse(matchDataJSON);

            const isAguardando = channel.name.toLowerCase().startsWith("aguardando-");

            let logChannelCancelada = null;
            if (logsConfig && logsConfig.logApostaCanceladaId) {
              logChannelCancelada = await channel.guild.channels
                .fetch(logsConfig.logApostaCanceladaId)
                .catch(() => null);
            }

            if (logChannelCancelada) {
              const playersStringLog = matchData.players
                ?.map((id) => `> <@${id}> \`[${id}]\``)
                .join("\n") || "> N/A";

              const valorFormatado = matchData.valor
                ? matchData.valor.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })
                : "R$ 0,00";

              const mediadorInfo = matchData.assignedMediatorId
                ? `<@${matchData.assignedMediatorId}>`
                : "> *Não Selecionado*";

              let logTitle = "🚫 TÓPICO DELETADO MANUALMENTE";
              let statusDesc = "";

              if (isAguardando) {
                statusDesc = `Pré-Confirmação (Aguardando)`;
              } else {
                logTitle = "⚠️ PARTIDA FORÇADA A ENCERRAR";
                statusDesc = `Em Andamento (Filas/Pagar)`;
              }

              const logEmbed = new EmbedBuilder()
                .setTitle(logTitle)
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `O tópico da partida foi deletado manualmente da lista de canais.\n\n` +
                  `### ${Emojis.config || "⚙️"} Status Anterior\n> ${statusDesc}\n` +
                  `### ${Emojis.espada || "⚔️"} Modo\n> ${matchData.modoDisplay || "N/A"}\n` +
                  `### ${Emojis.dinheiro || "💰"} Valor Total\n> ${valorFormatado}\n` +
                  `### ⚡ Mediador\n> ${mediadorInfo}\n` +
                  `### ${Emojis.Sky_preview || "👥"} Jogadores\n${playersStringLog}\n\n`
                )
                .setFooter({
                  text: process.env.DEFAULT_FOOTER_TEXT || "Apostado Free",
                  iconURL: process.env.DEFAULT_FOOTER_ICON || null
                })
                .setTimestamp();

              await logChannelCancelada
                .send({ content: `> ⚠️ *Transcript indisponível (Canal deletado)*`, embeds: [logEmbed] })
                .catch((err) =>
                  console.error("Erro ao enviar log de canal deletado:", err)
                );
            }

            if (matchData.players && Array.isArray(matchData.players)) {
              for (const playerId of matchData.players) {
                await decrementPlayerMatchCount(guildId, playerId);
              }
            }

            if (matchData.matchId) {
              await ApostadoLog.update(
                { status: "CANCELADA_CANAL_DELETADO", updatedAt: new Date() },
                { where: { matchId: matchData.matchId } }
              );
            }

            await redisClient.unlink(matchKey);
          }
        }
      }

      if (isPersistentChannel) {
        await ensurePersistentChannel(channel.guild).catch();
      }
    } catch (err) {
      console.error(
        `❌ [ChannelDelete] Erro ao processar limpeza: ${err.message}`
      );
    }
  },
};