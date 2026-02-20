const {
  EmbedBuilder,
  AttachmentBuilder,
  ChannelType,
  MessageFlags,
  Colors,
} = require("discord.js");
const discordTranscripts = require("discord-html-transcripts");
const LogsConfig = require("../database/models/LogsConfig");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const Emojis = require("../Emojis.json");

const MAX_DISCORD_UPLOAD_BYTES = 8000000;
const transcriptOptions = {
  limit: -1,
  saveImages: true,
  poweredBy: false,
  footerText: "Transcript • All rights reserved",
};

async function getLogChannel(guild, channelType) {
  try {
    const [logsConfig] = await LogsConfig.findOrCreate({
      where: { guildId: guild.id },
    });
    const channelId = logsConfig[channelType];
    if (!channelId) return null;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel && channel.type === ChannelType.GuildText) {
      return channel;
    }
    return null;
  } catch (err) {
    console.error(`Erro ao buscar canal de log (${channelType}):`, err);
    return null;
  }
}

async function generateSafeTranscript(thread, filename) {
  let attachment;
  try {
    const optionsWithImages = {
      ...transcriptOptions,
      filename,
      returnType: "buffer",
    };
    const buffer = await discordTranscripts.createTranscript(
      thread,
      optionsWithImages
    );

    if (buffer.length > MAX_DISCORD_UPLOAD_BYTES) {
      const optionsNoImages = {
        ...transcriptOptions,
        filename,
        saveImages: false,
        returnType: "buffer",
      };
      const smallerBuffer = await discordTranscripts.createTranscript(
        thread,
        optionsNoImages
      );
      attachment = new AttachmentBuilder(smallerBuffer, { name: filename });
    } else {
      attachment = new AttachmentBuilder(buffer, { name: filename });
    }
  } catch (err) {
     if (err.code === 10003) return;
    console.error(`[Transcript] Falha catastrófica ao gerar ${filename}:`, err);
    attachment = null;
  }
  return attachment;
}

async function sendLogConfirmada(guild, thread, matchData, assignedMediatorId) {
  const logChannel = await getLogChannel(guild, "logApostaConfirmadoId");
  if (!logChannel) return;

  try {
    const filename = `transcript-confirmacao-${thread.id}.html`;
    const transcriptAttachment = await generateSafeTranscript(thread, filename);
    const playersStringLog = matchData.players
      .map((id) => `> <@${id}> \`[${id}]\``)
      .join("\n");

    const logEmbed = new EmbedBuilder()
      .setTitle("APOSTA CONFIRMADA")
      .setColor(process.env.botcolor || Colors.Green)
      .addFields(
        {
          name: `${Emojis.espada || "⚔️"}  Modo:`,
          value: "> " + matchData.modoDisplay,
        },
        {
          name: `${Emojis.dinheiro || "💰"}  Valor:`,
          value:
            "> " +
            matchData.valorBase.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            }),
        },
        {
          name: `${Emojis.Sky_preview || "👥"}  Jogadores:`,
          value: playersStringLog,
        },
        {
          name: "⚡  Mediador:",
          value: "> " + `<@${assignedMediatorId}> \`[${assignedMediatorId}]\``,
        },
        { name: "📅  Data:", value: "> " + `<t:${matchData.timestamp}:F>` }
      )
      .setFooter({ text: `Thread ID: ${thread.id}` });

    try {
      await logChannel.send({
        embeds: [logEmbed],
        files: transcriptAttachment ? [transcriptAttachment] : [],
      });
    } catch (logErr) {
      if (logErr.message.includes("Access to file uploads has been limited")) {
        return await logChannel.send({ embeds: [logEmbed] }).catch(() => { });
      }
      console.error(
        `[logService] Falha ao enviar log 'Aposta Confirmada' (ID: ${logChannel.id}):`,
        logErr.message
      );
    }
  } catch (logErr) {
    console.error("Falha ao gerar log de 'Aposta Confirmada' (geral):", logErr);
    try {
      await thread
        .send("⚠️ Falha ao gerar o log de confirmação da partida.")
        .catch((e) => { });
    } catch (e) { }
  }
}

async function sendLogCancelada(
  guild,
  thread,
  matchData,
  user,
  reasonTitle,
  reasonDesc
) {
  const logChannel = await getLogChannel(guild, "logApostaCanceladaId");
  if (!logChannel) return;

  try {
    const filename = `transcript-cancel-${thread.id}.html`;
    const transcriptAttachment = await generateSafeTranscript(thread, filename);
    const playersStringLog = matchData.players
      .map((id) => `> <@${id}> \`[${id}]\``)
      .join("\n");

    const logEmbed = new EmbedBuilder()
      .setTitle(reasonTitle)
      .setColor(process.env.botcolor || Colors.Red)
      .setDescription(reasonDesc)
      .addFields(
        {
          name: `${Emojis.espada || "⚔️"}  Modo:`,
          value: "> " + matchData.modoDisplay,
        },
        {
          name: `${Emojis.dinheiro || "💰"}  Valor:`,
          value:
            "> " +
            matchData.valor.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            }),
        },
        {
          name: `${Emojis.Sky_preview || "👥"}  Jogadores:`,
          value: playersStringLog,
        },
        {
          name: "⚡  Mediador:",
          value: matchData.assignedMediatorId
            ? `<@${matchData.assignedMediatorId}>`
            : "> Não Selecionado",
        },
        { name: "📅  Data:", value: `<t:${matchData.timestamp}:F>` }
      );

    try {
      await logChannel.send({
        embeds: [logEmbed],
        files: transcriptAttachment ? [transcriptAttachment] : [],
      });
    } catch (logErr) {
      if (logErr.message.includes("Access to file uploads has been limited")) {
        return await logChannel.send({ embeds: [logEmbed] }).catch(() => { });
      }
      console.error(
        `[logService] Falha ao enviar log '${reasonTitle}' (ID: ${logChannel.id}):`,
        logErr.message
      );
    }
  } catch (logErr) {
    console.error(`Falha ao gerar log de '${reasonTitle}':`, logErr);
  }
}

async function sendLogFinalizada(
  guild,
  thread,
  user,
  matchData,
  winners,
  losers,
  mediatorId,
  matchType
) {
  const logChannel = await getLogChannel(guild, "logApostaFinalizadaId");
  if (!logChannel) return;

  try {
    const transcriptAttachment = await generateSafeTranscript(
      thread,
      `transcript-finalizada-${thread.id}.html`
    );
    const winnerString = winners.map((id) => `<@${id}> \`[${id}]\``).join("\n");
    const loserString = losers.map((id) => `<@${id}> \`[${id}]\``).join("\n");

    const [geraisConfigs] = await ConfigsGerais.findOrCreate({
      where: { guildId: guild.id },
    });
    const valorSalaFloat = parseFloat(geraisConfigs.valorSala) || 0;
    const valorBaseFloat = parseFloat(matchData.valorBase) || 0;

    const premiacao =
      (Math.round(valorBaseFloat * 100) * matchData.maxPlayers) / 100;

    const logTitle = matchType === "wo" ? "VITÓRIA POR W.O." : "VITÓRIA NORMAL";

    const logEmbed = new EmbedBuilder()
      .setTitle(logTitle)
      .setColor(process.env.botcolor || Colors.Gold)
      .addFields(
        {
          name: `${Emojis.espada || "⚔️"}  Modo:`,
          value: "> " + matchData.modoDisplay,
        },
        {
          name: "⚡  Mediador:",
          value: mediatorId ? `> <@${mediatorId}>` : "> Não Selecionado",
        },
        {
          name: (Emojis.dinheiro || "💰") + " Valor da Fila:",
          value:
            "> " +
            valorBaseFloat.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            }),
        },
        {
          name: (Emojis.raio || "⚡") + " Taxa de Sala:",
          value:
            "> " +
            valorSalaFloat.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            }),
        },
        {
          name: (Emojis.money || "💵") + " Premiação:",
          value:
            "> " +
            premiacao.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            }),
        },
        {
          name: (Emojis.trofeu || "🏆") + " Vencedor:",
          value: "> " + winnerString || "N/A",
        },
        {
          name: (Emojis.circlecross || "❌") + " Perdedor:",
          value: "> " + loserString || "N/A",
        },
        {
          name: (Emojis.usersss || "❌") + " Finalizado por:",
          value: `> <@${user.id}> [\`${user.id}]\``

        }
      )
      .setFooter({
        text: user.tag,
        iconURL: user.displayAvatarURL(),
      })

    try {
      await logChannel.send({
        embeds: [logEmbed],
        files: transcriptAttachment ? [transcriptAttachment] : [],
      });
    } catch (logErr) {
      if (logErr.message.includes("Access to file uploads has been limited")) {
        return await logChannel.send({ embeds: [logEmbed] }).catch(() => { });
      }
      console.error(
        `[logService] Falha ao enviar log '${logTitle}' (ID: ${logChannel.id}):`,
        logErr.message
      );
    }
  } catch (logErr) {
    console.error(`Falha ao gerar log de '${logTitle}':`, logErr);
  }
}

async function sendLogPartidas(
  guild,
  user,
  matchData,
  winnersLog,
  losersLog,
  mediatorId
) {
  const logChannel = await getLogChannel(guild, "logPartidasId");
  if (!logChannel) return;

  try {
    const [geraisConfigs] = await ConfigsGerais.findOrCreate({
      where: { guildId: guild.id },
    });
    const valorSalaFloat = parseFloat(geraisConfigs.valorSala) || 0;
    const valorBaseFloat = parseFloat(matchData.valorBase) || 0;
    const premiacao =
      (Math.round(valorBaseFloat * 100) * matchData.maxPlayers) / 100;

    const logEmbed = new EmbedBuilder()
      .setAuthor({
        name: "ATUALIZAÇÃO DE PARTIDA",
        iconURL: guild.iconURL() || undefined,
      })
      .setColor(process.env.botcolor || Colors.Blue)
      .setDescription(
        `${Emojis.espada || "⚔️"} **Modo:**\n> \`${matchData.modoDisplay}\`\n` +
        `${Emojis.usersss || "👤"} **Mediado por:**\n> <@${user.id}> [\`${user.id}]\`\n` +
        `${Emojis.usersss || "👤"} **Finalizado por:**\n> <@${user.id}> [\`${user.id}]\`\n`
      )
      .addFields(
        {
          name: "Vencedores",
          value: winnersLog.join("\n") || "Nenhum",
          inline: true,
        },
        {
          name: "Perdedores",
          value: losersLog.join("\n") || "Nenhum",
          inline: true,
        },
        {
          name: "Valores",
          value:
            `${Emojis.dinheiro || "💰"
            } **Valor da aposta:** \`${valorBaseFloat.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}\`\n` +
            `${Emojis.raio || "⚡"
            } **Taxa de Sala:** \`${valorSalaFloat.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}\`\n` +
            `${Emojis.money || "💵"
            } **Premiação:** \`${premiacao.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}\``,
          inline: false,
        }
      )
      .setFooter({
        text: user.tag,
        iconURL: user.displayAvatarURL(),
      })
      .setTimestamp();

    try {
      await logChannel.send({ embeds: [logEmbed] });
    } catch (logErr) {
      console.error(
        `[logService] Falha ao enviar log 'Log Partidas' (ID: ${logChannel.id}):`,
        logErr.message
      );
    }
  } catch (logErr) {
    console.error("Falha ao gerar log de 'Log Partidas':", logErr);
  }
}

async function handleGetTranscript(interaction, client) {
  const [action, threadId] = interaction.customId.split(":");
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const thread = await client.channels.fetch(threadId).catch(() => null);
    if (!thread) {
      return interaction.editReply({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } Tópico não encontrado. Pode ter sido deletado.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    let filename = `transcript-${threadId}.html`;

    try {
      const attachment = await generateSafeTranscript(thread, filename);
      if (!attachment) {
        return interaction.editReply({
          content: ``,
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.verifybot} Falha grave ao gerar o transcript.`
              ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.editReply({
        content: "Transcript disponível para download.",
        files: [attachment],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      if (err.message.includes("Access to file uploads has been limited")) {
        return interaction.editReply({
          content: `⚠️ **Erro de Upload:** Este servidor tem restrições de envio de arquivos. Não foi possível enviar o HTML.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      console.error("Erro ao gerar transcript:", err);
      await interaction.editReply({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(`${Emojis.verifybot} Falha ao gerar o transcript.`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    console.error(`[handleGetTranscript] Erro: ${err.message}`);
  }
}

module.exports = {
  getLogChannel,
  generateSafeTranscript,
  sendLogConfirmada,
  sendLogCancelada,
  sendLogFinalizada,
  sendLogPartidas,
  handleGetTranscript,
};
