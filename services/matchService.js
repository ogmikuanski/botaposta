const {
  EmbedBuilder,
  Colors,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageType,
  PermissionFlagsBits,
  MessageFlags,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const {
  redisClient,
  incrementGlobalMatchCount,
  getMediatorsOnlineKey,
  getMatchKey,
  decrementPlayerMatchCount,
  setMatchLock,
  releaseMatchLock,
} = require("../utils/cache");

const { sequelize } = require("../database/sequelize");
const CargosConfig = require("../database/models/CargosConfig");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const FilaConfig = require("../database/models/FilaConfig");
const PlayerProfile = require("../database/models/PlayerProfile");
const MediatorStats = require("../database/models/MediatorStats");
const ApostadoLog = require("../database/models/ApostadoLog");
const Emojis = require("../Emojis.json");
const LogService = require("./logService");
const PixService = require("./pixService");

function hasMediatorPermission({
  member,
  userId,
  assignedMediatorId,
  cargosConfig,
}) {
  try {
    const permMaxRoleId = cargosConfig?.cargoPermMaxId;
    const isPermMax = permMaxRoleId && member?.roles?.cache?.has(permMaxRoleId);
    return userId === assignedMediatorId || !!isPermMax;
  } catch (e) {
    return false;
  }
}

async function replyEphemeral(interaction, options) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ ...options, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ ...options, flags: MessageFlags.Ephemeral });
    }
  } catch (e) { }
}

async function replyPermissionDenied(interaction, description) {
  const embed = new EmbedBuilder()
    .setColor(process.env.botcolor || Colors.Red)
    .setDescription(
      description ||
      `${Emojis.circlecross} Você não tem a permissão necessária para continuar esta ação.`
    );
  applyBotFooter(embed, interaction);
  await replyEphemeral(interaction, { embeds: [embed] });
}

async function handleServiceError(error, interaction, client) {
  if (error.code === 10003) return;
  if (error.code === 50035) return;
  if (error.code === 10008) return;
  if (error.code === 10062) return;
  if (error.code === 10007) return;
  console.error(`[MatchService] Erro:`, error);

  const errorEmbed = new EmbedBuilder()
    .setColor(process.env.botcolor || Colors.Red)
    .setDescription(process.env.MSGERROBOT);

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (e) { }
}

function applyBotFooter(embed, interaction) {
  if (process.env.BOT_MARCACOES_APOSTAS === "true") {
    embed.setFooter({
      text: process.env.DEFAULT_FOOTER_TEXT,
      iconURL: process.env.DEFAULT_FOOTER_ICON || null,
    });
  }
  return embed;
}

async function updateMatchState(interaction, threadId) {
  const matchKey = getMatchKey(interaction.guild.id, threadId);
  const message = interaction.message;
  if (!message) {
    console.warn("updateMatchState: 'interaction.message' é nulo.");
    return;
  }

  const matchDataJSON = await redisClient.get(matchKey);
  if (!matchDataJSON) return;
  const matchData = JSON.parse(matchDataJSON);
  const {
    modoDisplay,
    valor,
    players,
    tag,
    confirmed,
    maxPlayers,
    thumbnailUrl,
    assignedMediatorId,
  } = matchData;
  const confirmedCount = confirmed.length;
  const playerString = players
    .map((id) => {
      const pTag = tag === "Padrão" ? "" : ` | ${tag}`;
      return `<@${id}>${pTag}`;
    })
    .join("\n");
  const confirmedString =
    confirmedCount > 0
      ? confirmed.map((id) => `> <@${id}>`).join("\n")
      : "Ninguém confirmou presença.";
  const embed = new EmbedBuilder()
    .setAuthor({
      name: ` Aguardando Confirmação `,
      iconURL: interaction.guild.iconURL({ dynamic: true }),
    })
    .setColor(process.env.botcolor)
    .setThumbnail(thumbnailUrl)
    .addFields(
      {
        name: `${Emojis.espada}  Modo:`,
        value: "> " + modoDisplay,
      },
      {
        name: `${Emojis.dinheiro}  Valor:`,
        value:
          "> " +
          valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      },
      { name: `${Emojis.Sky_preview}  Jogadores:`, value: playerString },
      { name: `${Emojis.sim}  Confirmaram Presença:`, value: confirmedString }
    );

  applyBotFooter(embed, interaction);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_presence:${threadId}`)
      .setLabel(`Confirmar Presença (${confirmedCount}/${maxPlayers})`)
      .setEmoji(Emojis.sim)
      .setStyle(ButtonStyle.Success)
      .setDisabled(confirmedCount >= maxPlayers),
    new ButtonBuilder()
      .setCustomId(`notify_member:${threadId}`)
      .setLabel("Notificar Jogadores")
      .setEmoji(Emojis.sino || "🔔")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(confirmedCount >= maxPlayers),
    new ButtonBuilder()
      .setCustomId(`cancel_match:${threadId}`)
      .setLabel("Cancelar")
      .setEmoji(Emojis.circlecross)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(confirmedCount >= maxPlayers)
  );
  await message.edit({ embeds: [embed], components: [row] });
}

async function purgeThread(thread) {
  let fetched;
  do {
    fetched = await thread.messages.fetch({ limit: 100 });
    const messagesArray = Array.from(fetched.values());
    if (messagesArray.length === 0) break;

    const twoWeeksAgo = Date.now() - 1209600000;
    const messagesToDelete = messagesArray.filter(
      (msg, index) =>
        index !== 0 &&
        (msg.type === MessageType.Default || msg.type === MessageType.Reply) &&
        !msg.system &&
        msg.createdTimestamp > twoWeeksAgo
    );
    if (messagesToDelete.length > 0) {
      await thread.bulkDelete(messagesToDelete, true);
    }

    if (fetched.size < 100 || messagesToDelete.length === 0) {
      fetched = 0;
    }
  } while (fetched.size > 0);
}

function getTeams(players) {
  const half = Math.ceil(players.length / 2);
  const time1 = players.slice(0, half);
  const time2 = players.slice(half);
  return { time1, time2 };
}

async function handleConfirmPresence(interaction, client) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (e) {
    return;
  }

  const [action, threadId] = interaction.customId.split(":");
  const user = interaction.user;
  const thread = interaction.channel;
  const guild = interaction.guild;
  const matchKey = getMatchKey(guild.id, threadId);

  const lockAcquired = await setMatchLock(matchKey, 5);
  if (!lockAcquired) {
    return interaction.editReply({
      content:
        "Alguém já está confirmando. Tente novamente em alguns segundos.",
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const [cargosConfig] = await CargosConfig.findOrCreate({
      where: { guildId: guild.id },
    });

    if (!redisClient.isReady) {
      return interaction.editReply({
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `- ${Emojis.circlecross} O cache da partida está offline.`
              ),
            interaction
          ),
        ],
      });
    }

    const matchDataJSON = await redisClient.get(matchKey);
    if (!matchDataJSON) {
      return interaction.editReply({
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `- ${Emojis.circlecross} Esta partida expirou ou foi cancelada.`
              ),
            interaction
          ),
        ],
      });
    }
    const matchData = JSON.parse(matchDataJSON);

    const missingPlayers = [];
    for (const pid of matchData.players) {
      try {
        await guild.members.fetch({ user: pid, force: true });
      } catch (err) {
        missingPlayers.push(pid);
      }
    }

    if (missingPlayers.length > 0) {
      const missingMentions = missingPlayers.map((id) => `<@${id}>`).join(", ");
      const alertEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Yellow)
        .setTitle(`${Emojis.aviso || "⚠️"} ALERTA DE JOGADOR AUSENTE`)
        .setDescription(
          `- Atenção! Os seguintes jogadores saíram do servidor, mas a partida **NÃO** foi cancelada automaticamente:\n> **${missingMentions}**`
        );
      await thread.send({ embeds: [alertEmbed] });
    }

    if (!matchData.players.includes(user.id)) {
      return interaction.editReply({
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Você não é um jogador desta partida.`
              ),
            interaction
          ),
        ],
      });
    }
    if (matchData.confirmed.includes(user.id)) {
      return interaction.editReply({
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Você já confirmou sua presença.`
              ),
            interaction
          ),
        ],
      });
    }

    const mediatorsKey = getMediatorsOnlineKey(guild.id);
    const mediatorIds = await redisClient.hKeys(mediatorsKey);
    if (mediatorIds.length === 0) {
      await interaction.editReply({
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `- ${Emojis.circlecross} **Não há mediadores Online.**\n- Não é possível confirmar a partida agora. Tente novamente mais tarde.`
              ),
            interaction
          ),
        ],
      });
      if (matchData.confirmed.length > 0) {
        matchData.confirmed = [];
        await redisClient.set(matchKey, JSON.stringify(matchData), {
          KEEPTTL: true,
        });
        await thread.send(
          `⚠️ **ALERTA!** Todos os mediadores deste servidor ficaram offline. A partida foi travada e as confirmações de presença foram **resetadas**.`
        );
        await updateMatchState(interaction, threadId);
      }
      return;
    }

    matchData.confirmed.push(user.id);
    const newCount = matchData.confirmed.length;
    await redisClient.set(matchKey, JSON.stringify(matchData), {
      KEEPTTL: true,
    });

    await interaction.channel.send({
      content: `${Emojis.sim || "✅"} **${user.globalName || user.username
        }** confirmou presença! (${newCount}/${matchData.maxPlayers})`,
    });

    await interaction.editReply({
      content: "Você confirmou sua presença.",
    });

    await updateMatchState(interaction, threadId);

    if (newCount >= matchData.maxPlayers) {
      let assignedMediatorId = matchData.assignedMediatorId;
      let mediatorJson;
      let assignedMediatorData;

      if (!assignedMediatorId) {
        const mediatorsKey = getMediatorsOnlineKey(guild.id);
        const mediatorIds = await redisClient.hKeys(mediatorsKey);

        if (mediatorIds.length === 0) {
          matchData.confirmed = [];
          await redisClient.set(matchKey, JSON.stringify(matchData), {
            KEEPTTL: true,
          });
          await thread.send(
            `⚠️ **ALERTA!** Todos os mediadores deste servidor ficaram offline. A partida foi travada e as confirmações de presença foram **resetadas**.`
          );
          await updateMatchState(interaction, threadId);
          return;
        }

        assignedMediatorId =
          mediatorIds[Math.floor(Math.random() * mediatorIds.length)];
        matchData.assignedMediatorId = assignedMediatorId;

        await redisClient.set(matchKey, JSON.stringify(matchData), {
          KEEPTTL: true,
        });
      }

      await LogService.sendLogConfirmada(
        guild,
        thread,
        matchData,
        assignedMediatorId
      );

      try {
        await ApostadoLog.update(
          { mediatorId: assignedMediatorId, updatedAt: new Date() },
          { where: { matchId: matchData.matchId } }
        );
      } catch (logErr) {
        console.error(
          "Falha ao ATUALIZAR Log 'Mediador Atribuído' no ApostadoLog:",
          logErr
        );
      }

      mediatorJson = await redisClient.hGet(
        getMediatorsOnlineKey(guild.id),
        assignedMediatorId
      );

      if (!mediatorJson) {
        const mediatorsKey = getMediatorsOnlineKey(guild.id);
        const mediatorIds = await redisClient.hKeys(mediatorsKey);
        if (mediatorIds.length === 0) {
          matchData.confirmed = [];
          await redisClient.set(matchKey, JSON.stringify(matchData), {
            KEEPTTL: true,
          });
          await thread.send(
            `⚠️ **ALERTA!** O mediador designado saiu e não há outros online. A partida foi travada e as confirmações de presença foram **resetadas**.`
          );
          await updateMatchState(interaction, threadId);
          return;
        }

        assignedMediatorId =
          mediatorIds[Math.floor(Math.random() * mediatorIds.length)];
        matchData.assignedMediatorId = assignedMediatorId;
        await redisClient.set(matchKey, JSON.stringify(matchData), {
          KEEPTTL: true,
        });

        mediatorJson = await redisClient.hGet(mediatorsKey, assignedMediatorId);

        try {
          await ApostadoLog.update(
            { mediatorId: assignedMediatorId, updatedAt: new Date() },
            { where: { matchId: matchData.matchId } }
          );
        } catch (logErr) {
          console.error(
            "Falha ao ATUALIZAR Log 'Mediador Atribuído' no ApostadoLog:",
            logErr
          );
        }
      }

      if (mediatorJson) {
        assignedMediatorData = JSON.parse(mediatorJson);
      } else {
        console.error(
          `[matchConfirm] CRÍTICO: Não foi possível obter dados de NENHUM mediador.`
        );
        await thread.send(
          `⚠️ **ALERTA!** Erro crítico ao buscar dados do mediador. A partida não pode continuar.`
        );
        return;
      }

      try {
        const globalCount = await incrementGlobalMatchCount();
        await thread.setName(`Filas-${globalCount}`);
      } catch (err) {
        console.warn("[THREAD CONTER]: " + err);
      }

      await purgeThread(thread);

      const acessoRoleId = cargosConfig?.cargoAcessoApostadoId;

      const premiacao =
        (Math.round(matchData.valorBase * 100) * matchData.maxPlayers) / 100;

      const playersStringFinal = matchData.players
        .map((id) => `> <@${id}>`)
        .join("\n");
      const playersMention = matchData.players
        .map((id) => `<@${id}>`)
        .join(" ");
      const mediatorMention = `<@${assignedMediatorId}>`;
      const roleMention = acessoRoleId ? `<@&${acessoRoleId}>` : "";

      const mentionContent = cargosConfig?.assignMediatorOnMatchCreate
        ? `${playersMention} ${roleMention}`
        : `${playersMention} ${mediatorMention} ${roleMention}`;

      const finalEmbed = new EmbedBuilder()
        .setAuthor({
          name: `${guild.name} | Iniciar Apostado`,
          iconURL: guild.iconURL({ dynamic: true }),
        })
        .setColor(process.env.botcolor)
        .setThumbnail(matchData.thumbnailUrl)
        .addFields(
          {
            name: `${Emojis.espada}  Modo:`,
            value: "> " + matchData.modoDisplay,
          },
          {
            name: `${Emojis.dinheiro}  Valor`,
            value:
              "> " +
              matchData.valor.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              }),
          },
          {
            name: `${Emojis.money} Premiação:`,
            value:
              "> " +
              premiacao.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              }),
          },
          {
            name: `${Emojis.Sky_preview}  Jogadores:`,
            value: playersStringFinal || "> Vazio",
          },
          { name: "⚡  Mediador:", value: "> " + `<@${assignedMediatorId}>` }
        );
      applyBotFooter(finalEmbed, interaction);

      const matchRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`alterar_valor:${threadId}`)
          .setLabel("Alterar Valor")
          .setEmoji(Emojis.dinheiro)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`definir_vencedor:${threadId}`)
          .setLabel("Definir Vencedor")
          .setEmoji(Emojis.trofeu || "🏆")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`notify_member:${threadId}`)
          .setLabel("Notificar Jogadores")
          .setEmoji(Emojis.sino || "🔔")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`cancelar_apostado:${threadId}`)
          .setLabel("Cancelar Aposta")
          .setEmoji(Emojis.circlecross)
          .setStyle(ButtonStyle.Danger)
      );
      await thread.send({
        content: mentionContent,
        embeds: [finalEmbed],
        components: [matchRow],
      });
      const mediatorMember = await interaction.guild.members.fetch(
        assignedMediatorId
      );
      const pixPayload = await PixService.generatePixEmbed(
        assignedMediatorData,
        matchData,
        mediatorMember,
        interaction
      );

      try {
        await thread.send(pixPayload);
      } catch (err) {
        if (
          err.rawError?.message ===
          "Access to file uploads has been limited for this guild" ||
          err.code === 400001
        ) {
          if (pixPayload.files) delete pixPayload.files;

          if (pixPayload.content) {
            pixPayload.content +=
              "\n⚠️ **O servidor restringiu envio de imagens (QR Code). Use a chave Pix acima.**";
          } else if (pixPayload.embeds && pixPayload.embeds.length > 0) {
            const warningEmbed = new EmbedBuilder(
              pixPayload.embeds[0]
            ).setFooter({
              text: "⚠️ QR Code não carregou devido a restrições do servidor.",
            });
            pixPayload.embeds[0] = warningEmbed;
          }

          await thread
            .send(pixPayload)
            .catch((e) => console.error("Falha ao enviar PIX fallback:", e));
        } else {
          throw err;
        }
      }
    }
  } catch (err) {
    await handleServiceError(err, interaction, client);
  } finally {
    await releaseMatchLock(matchKey);
  }
}

async function handleNotifyMember(interaction, client) {
  try {
    const [action, threadId] = interaction.customId.split(":");
    const { guild, user, channel: thread, member } = interaction;
    const matchKey = getMatchKey(guild.id, threadId);

    const matchDataJSON = await redisClient.get(matchKey);
    if (!matchDataJSON) {
      return replyEphemeral(interaction, {
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Erro ao ler dados da partida. Partida pode ter expirado.`
              ),
            interaction
          ),
        ],
      });
    }

    const matchData = JSON.parse(matchDataJSON);
    const assignedMediatorId = matchData.assignedMediatorId;
    const [cargosConfig] = await CargosConfig.findOrCreate({
      where: { guildId: guild.id },
    });

    if (
      !hasMediatorPermission({
        member,
        userId: user.id,
        assignedMediatorId,
        cargosConfig,
      })
    ) {
      return replyPermissionDenied(interaction);
    }

    const players = matchData.players || [];
    const embed = new EmbedBuilder()
      .setAuthor({
        name: guild.name,
        iconURL: guild.iconURL({ dynamic: true }),
      })
      .setDescription(
        `## ${Emojis.sino} NOTIFICAÇÃO APOSTA\n` +
        `Você possui uma aposta aberta no servidor **${guild.name}**.\n` +
        `Estamos aguardando a sua resposta!`
      )
      .setColor(process.env.botcolor);
    applyBotFooter(embed, interaction);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Acessar Canal do apostado")
        .setStyle(ButtonStyle.Link)
        .setURL(thread.url)
        .setEmoji(Emojis.foguete)
    );
    let successCount = 0;
    let failCount = 0;
    for (const userId of players) {
      try {
        const userToDM = await client.users.fetch(userId);
        await userToDM.send({ embeds: [embed], components: [row] });
        successCount++;
      } catch (e) {
        failCount++;
      }
    }

    let replyContent = `${Emojis.sino} **${successCount}** jogadores notificados com sucesso via DM!`;
    if (failCount > 0) {
      replyContent = `${Emojis.sino} **${successCount}** jogadores notificados via DM.\n⚠️ **${failCount}** jogadores não puderam ser notificados (provavelmente estão com DMs fechadas).`;
    }

    await replyEphemeral(interaction, { content: replyContent });
  } catch (err) {
    await handleServiceError(err, interaction, client);
  }
}

async function handleCancelMatch(interaction, client) {
  try {
    await interaction.deferReply();
  } catch (e) {
    return;
  }

  try {
    const [action, threadId] = interaction.customId.split(":");
    const thread = interaction.channel;
    const user = interaction.user;
    const guild = interaction.guild;
    const matchKey = getMatchKey(guild.id, threadId);
    const matchDataJSON = await redisClient.get(matchKey);
    if (!matchDataJSON) {
      return replyEphemeral(interaction, {
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Erro ao ler dados da partida. Partida pode ter expirado.`
              ),
            interaction
          ),
        ],
      });
    }

    const matchData = JSON.parse(matchDataJSON);
    const isAdmin = interaction.member.permissions.has(
      PermissionFlagsBits.Administrator
    );
    const isPlayer = matchData.players.includes(user.id);
    if (!isPlayer && !isAdmin) {
      return replyPermissionDenied(interaction);
    }

    await interaction.editReply({
      content: `${Emojis.loading} **${user.globalName || user.username
        }** iniciou o cancelamento da partida.`,
    });
    const embed = new EmbedBuilder()
      .setDescription(
        `### ${Emojis.loading} PARTIDA CANCELADA\nEste tópico será **deletado** em 10 segundos.`
      )
      .setColor(process.env.botcolor);
    applyBotFooter(embed, interaction);

    await thread.send({ embeds: [embed] });

    await LogService.sendLogCancelada(
      guild,
      thread,
      matchData,
      user,
      "APOSTADO CANCELADO (ANTES DA CONFIRMAÇÃO)",
      `Aposta cancelada por: <@${user.id}>.`
    );

    try {
      await ApostadoLog.update(
        {
          status: "CANCELADA",
          updatedAt: new Date(),
        },
        {
          where: { matchId: matchData.matchId },
        }
      );
    } catch (logErr) {
      console.error(
        "Falha ao ATUALIZAR Log 'CANCELADA-MANUAL' no ApostadoLog:",
        logErr.message
      );
    }

    try {
      await ApostadoLog.destroy({
        where: { matchId: matchData.matchId },
      });
    } catch (logErr) {
      console.error(
        "Falha ao DELETAR Log 'CANCELADA-MANUAL' no ApostadoLog:",
        logErr.message
      );
    }

    await redisClient.del(matchKey);
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await thread.delete().catch(() => { });
  } catch (err) {
    await handleServiceError(err, interaction, client);
  }
}

async function handleCancelPostConfirm(interaction, client) {
  try {
    const { guild, user, channel: thread, member } = interaction;
    const [action, threadId] = interaction.customId.split(":");
    const matchKey = getMatchKey(guild.id, threadId);
    const matchDataJSON = await redisClient.get(matchKey);
    if (!matchDataJSON)
      return replyEphemeral(interaction, {
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Partida não encontrada no cache.`
              ),
            interaction
          ),
        ],
      });
    const matchData = JSON.parse(matchDataJSON);
    const assignedMediatorId = matchData.assignedMediatorId;
    if (!assignedMediatorId) {
      return replyEphemeral(interaction, {
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Erro: O mediador ainda não foi atribuído.`
              ),
            interaction
          ),
        ],
      });
    }
    const [cargosConfig] = await CargosConfig.findOrCreate({
      where: { guildId: guild.id },
    });

    if (
      !hasMediatorPermission({
        member,
        userId: user.id,
        assignedMediatorId,
        cargosConfig,
      })
    ) {
      return replyPermissionDenied(
        interaction,
        ` ${Emojis.circlecross} Você não tem a permissão necessária para continuar esta ação.`
      );
    }

    await interaction.deferReply();

    await interaction.editReply({
      content: `${Emojis.loading} **${user.globalName || user.username
        }** forçou o cancelamento da partida sem definir vencedor.`,
    });
    const cancelEmbed = new EmbedBuilder()
      .setDescription(
        `### ${Emojis.carregando} PARTIDA FORÇADA A CANCELAR\nEste tópico será **deletado** em 10 segundos.`
      )
      .setColor(process.env.botcolor);
    applyBotFooter(cancelEmbed, interaction);

    await thread.send({ embeds: [cancelEmbed] });

    await LogService.sendLogCancelada(
      guild,
      thread,
      matchData,
      user,
      "APOSTADO CANCELADO (PÓS-CONFIRMAÇÃO)",
      `O Mediador: <@${user.id}>, cancelou a aposta sem definir um vencedor.`
    );

    try {
      await ApostadoLog.update(
        {
          status: "ENCERRADA",
          updatedAt: new Date(),
        },
        {
          where: { matchId: matchData.matchId },
        }
      );
    } catch (logErr) {
      console.error(
        "Falha ao ATUALIZAR Log 'CANCELADA-MEDIADOR' no ApostadoLog:",
        logErr.message
      );
    }

    try {
      await ApostadoLog.destroy({
        where: { matchId: matchData.matchId },
      });
    } catch (logErr) {
      console.error(
        "Falha ao DELETAR Log 'CANCELADA-MEDIADOR' no ApostadoLog:",
        logErr.message
      );
    }

    matchData.status = "ENCERRADA";
    await redisClient.set(matchKey, JSON.stringify(matchData));

    await new Promise((resolve) => setTimeout(resolve, 10000));

    await thread
      .delete()
      .then(async () => {
        await redisClient.del(matchKey);
      })
      .catch(() => { });
  } catch (err) {
    await handleServiceError(err, interaction, client);
  }
}

async function handleAlterarValor(interaction, client) {
  try {
    const { guild, user, channel: thread, member } = interaction;
    const [action, threadId] = interaction.customId.split(":");
    const matchKey = getMatchKey(guild.id, threadId);
    const matchDataJSON = await redisClient.get(matchKey);
    if (!matchDataJSON) {
      return replyEphemeral(interaction, {
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Partida não encontrada no cache.`
              ),
            interaction
          ),
        ],
      });
    }
    const matchData = JSON.parse(matchDataJSON);
    const assignedMediatorId = matchData.assignedMediatorId;

    const [cargosConfig] = await CargosConfig.findOrCreate({
      where: { guildId: guild.id },
    });

    if (
      !hasMediatorPermission({
        member,
        userId: user.id,
        assignedMediatorId,
        cargosConfig,
      })
    ) {
      return replyPermissionDenied(interaction);
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal_alterar_valor_submit:${threadId}`)
      .setTitle("Alterar Valor da Partida");
    const valorInput = new TextInputBuilder()
      .setCustomId("novo_valor_input")
      .setLabel("Novo Valor (SEM A TAXA ). Ex: 5.50")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Digite o novo valor (ex: 5.50 para R$ 5,50)")
      .setValue(String(matchData.valorBase))
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(valorInput));

    await interaction.showModal(modal);
  } catch (err) {
    await handleServiceError(err, interaction, client);
  }
}

async function handleSubmitAlterarValor(interaction, client) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (e) {
    console.warn(`[submit_alterar_valor] Falha ao deferir: ${e.message}`);
    return;
  }

  try {
    const { guild, channel: thread } = interaction;
    const [action, threadId] = interaction.customId.split(":");
    const matchKey = getMatchKey(guild.id, threadId);

    const novoValorInput =
      interaction.fields.getTextInputValue("novo_valor_input");
    const novoValorBase = parseFloat(novoValorInput.replace(",", "."));
    if (isNaN(novoValorBase) || novoValorBase < 0) {
      return interaction.editReply({
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross} Valor inválido\n- Use apenas númeiros ( Exemplo: 1.10 )`
              ),
            interaction
          ),
        ],
      });
    }

    const matchDataJSON = await redisClient.get(matchKey);
    if (!matchDataJSON)
      return interaction.editReply({
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Partida não encontrada no cache. `
              ),
            interaction
          ),
        ],
      });
    const matchData = JSON.parse(matchDataJSON);
    const assignedMediatorId = matchData.assignedMediatorId;

    const [geraisConfigs] = await ConfigsGerais.findOrCreate({
      where: { guildId: guild.id },
    });
    const valorSalaFloat = parseFloat(geraisConfigs.valorSala) || 0;

    const novoValorTotal =
      (Math.round(novoValorBase * 100) + Math.round(valorSalaFloat * 100)) /
      100;
    const novaPremiacao =
      (Math.round(novoValorBase * 100) * matchData.maxPlayers) / 100;

    matchData.valorBase = novoValorBase;
    matchData.valor = novoValorTotal;
    await redisClient.set(matchKey, JSON.stringify(matchData), {
      KEEPTTL: true,
    });
    const valorFormatado = novoValorTotal.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const premiacaoFormatada = novaPremiacao.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    try {
      const messages = await thread.messages.fetch({ limit: 50 });
      const mainEmbedMsg = messages.find(
        (m) =>
          m.author.id === client.user.id &&
          m.embeds[0]?.fields?.some(
            (f) =>
              f.name &&
              (f.name.includes("Premiação") ||
                f.name.includes("Mediador") ||
                f.name.includes("Jogadores"))
          )
      );
      if (mainEmbedMsg) {
        const oldEmbed = mainEmbedMsg.embeds[0];
        const newFields = oldEmbed.fields.map((field) => {
          if (field.name.includes("Valor")) {
            return {
              name: `${Emojis.dinheiro}  Valor`,
              value: `> ${valorFormatado}`,
            };
          }
          if (field.name.includes("Premiação")) {
            return {
              name: `${Emojis.money} Premiação:`,
              value: `> ${premiacaoFormatada}`,
            };
          }
          return field;
        });
        const newEmbed = new EmbedBuilder(oldEmbed.toJSON()).setFields(
          newFields
        );
        applyBotFooter(newEmbed, interaction);
        await mainEmbedMsg.edit({ embeds: [newEmbed] });
      }

      const mediatorMember = await interaction.guild.members.fetch(
        assignedMediatorId
      );
      const pixEmbedMsg = messages.find(
        (m) =>
          m.author.id === client.user.id &&
          m.embeds[0]?.author?.name === mediatorMember.displayName
      );
      if (pixEmbedMsg) {
        const oldPixEmbed = pixEmbedMsg.embeds[0];
        const newPixFields = oldPixEmbed.fields.map((field) => {
          if (field.name.includes("Valor a Pagar")) {
            return {
              name: `${Emojis.dinheiro} Valor a Pagar:\n> \`${valorFormatado}\``,
              value: ` `,
            };
          }
          return field;
        });
        const newPixEmbed = new EmbedBuilder(oldPixEmbed.toJSON())
          .setTitle("PIX DO MEDIADOR")
          .setFields(newPixFields);
        applyBotFooter(newPixEmbed, interaction);
        await pixEmbedMsg.edit({ embeds: [newPixEmbed], files: [] });
      }

      await interaction.editReply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `### ${Emojis.check
              } Valor alterado com sucesso!\n- Valor: **${valorFormatado}**\n- Taxa: R$ ${valorSalaFloat.toFixed(
                2
              )}\n- Premiação: **${premiacaoFormatada}**`
            ),
        ],
      });
    } catch (err) {
      await handleServiceError(err, interaction, client);
    }
  } catch (err) {
    await handleServiceError(err, interaction, client);
  }
}

async function handleDefineWinner(interaction, client) {
  try {
    const { guild, user, channel: thread, member } = interaction;
    const [action, threadId] = interaction.customId.split(":");
    const matchKey = getMatchKey(guild.id, threadId);

    const matchDataJSON = await redisClient.get(matchKey);
    if (!matchDataJSON) {
      return replyEphemeral(interaction, {
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Partida não encontrada no cache. `
              ),
            interaction
          ),
        ],
      });
    }
    const matchData = JSON.parse(matchDataJSON);
    const assignedMediatorId = matchData.assignedMediatorId;

    const [cargosConfig] = await CargosConfig.findOrCreate({
      where: { guildId: guild.id },
    });

    if (
      !hasMediatorPermission({
        member,
        userId: user.id,
        assignedMediatorId,
        cargosConfig,
      })
    ) {
      return replyPermissionDenied(
        interaction,
        `${Emojis.circlecross} Você não tem a permissão necessária para continuar esta ação.`
      );
    }

    await interaction.deferReply();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`select_vitoria:${threadId}`)
        .setLabel("Definir por Vitória")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(Emojis.vitoria || "🏆"),
      new ButtonBuilder()
        .setCustomId(`select_wo:${threadId}`)
        .setLabel("Definir por W.O.")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(Emojis.visualizar || "🚶‍♂️")
    );

    await interaction.editReply({
      content: ``,
      embeds: [
        applyBotFooter(
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Yellow)
            .setDescription(
              `⚡ **Mediador <@${user.id}>**, como esta partida terminou?`
            ),
          interaction
        ),
      ],
      components: [row],
    });
  } catch (err) {
    await handleServiceError(err, interaction, client);
  }
}

async function handleWinnerSelectionType(interaction, client, matchType) {
  try {
    const { guild, user, member, channel } = interaction;
    const [action, threadId] = interaction.customId.split(":");
    const matchKey = getMatchKey(guild.id, threadId);

    const matchDataJSON = await redisClient.get(matchKey);
    if (!matchDataJSON) {
      await interaction.deferUpdate().catch(() => { });
      return replyEphemeral(interaction, {
        content: `${Emojis.circlecross} Partida não encontrada no cache.`,
      });
    }
    const matchData = JSON.parse(matchDataJSON);
    const [cargosConfig] = await CargosConfig.findOrCreate({
      where: { guildId: guild.id },
    });

    if (
      !hasMediatorPermission({
        member,
        userId: user.id,
        assignedMediatorId: matchData.assignedMediatorId,
        cargosConfig,
      })
    ) {
      await interaction.deferUpdate().catch(() => { });
      return replyPermissionDenied(interaction);
    }

    await interaction.deferUpdate();
    await handleWinnerSelection(interaction, client, matchType);
  } catch (err) {
    await handleServiceError(err, interaction, client);
  }
}

async function handleSubmitWinner(interaction, client) {
  try {
    await interaction.deferUpdate();
  } catch (e) {
    return;
  }

  try {
    const { guild, user, channel: thread, member } = interaction;
    const [action, threadId, matchType] = interaction.customId.split(":");
    const selection = interaction.values[0];

    const matchDataJSON = await redisClient.get(
      getMatchKey(guild.id, threadId)
    );
    if (!matchDataJSON) return;
    const matchData = JSON.parse(matchDataJSON);
    const assignedMediatorId = matchData.assignedMediatorId;

    const [cargosConfig] = await CargosConfig.findOrCreate({
      where: { guildId: guild.id },
    });
    if (
      !hasMediatorPermission({
        member,
        userId: user.id,
        assignedMediatorId,
        cargosConfig,
      })
    ) {
      return replyPermissionDenied(
        interaction,
        "Você não tem permissão para selecionar o vencedor."
      );
    }

    const { time1, time2 } = getTeams(matchData.players);

    let winnerTeamId;
    if (time1.includes(selection)) {
      winnerTeamId = "time1";
    } else {
      winnerTeamId = "time2";
    }

    await showMatchEndScreen(
      interaction,
      client,
      threadId,
      winnerTeamId,
      matchType
    );

    try {
      const messages = await thread.messages.fetch({ limit: 50 });
      const mainPanelMsg = messages.find(
        (m) =>
          m.author.id === client.user.id &&
          m.embeds[0]?.fields?.some(
            (f) => f.name && f.name.includes("Mediador")
          )
      );

      if (mainPanelMsg) {
        const newRows = [];
        for (const row of mainPanelMsg.components) {
          const newRow = new ActionRowBuilder();
          for (const comp of row.components) {
            const newButton = ButtonBuilder.from(comp);
            const cid = comp.customId || "";

            if (cid.startsWith("alterar_valor")) {
              newButton.setDisabled(true);
            } else if (cid.startsWith("definir_vencedor")) {
              newButton.setCustomId(`alterar_vencedor:${threadId}`);
              newButton.setLabel("Alterar Vencedor");
              newButton.setEmoji(Emojis.atualizar || "🔄");
              newButton.setDisabled(false);
            } else if (cid.startsWith("cancelar_apostado")) {
              newButton.setCustomId(`finalizar_apostado:${threadId}`);
              newButton.setLabel("Finalizar Aposta");
              newButton.setEmoji(Emojis.Lixeira || "🗑️");
              newButton.setStyle(ButtonStyle.Danger);
              newButton.setDisabled(false);
            } else if (cid.startsWith("notify_member")) {
              newButton.setLabel("Notificar Jogadores");
              newButton.setDisabled(false);
            }

            newRow.addComponents(newButton);
          }
          newRows.push(newRow);
        }
        await mainPanelMsg.edit({ components: newRows });
      }
    } catch (err) {
      if (err.code === 10003) return;
      if (err.code === 10008) return;
      console.error("Falha ao atualizar painel mediador:", err);
    }

    try {
      if (interaction.message?.deletable)
        await interaction.message.delete().catch(() => { });
    } catch (e) { }
  } catch (err) {
    await handleServiceError(err, interaction, client);
  }
}

async function handleAlterWinner(interaction, client) {
  try {
    const { guild, user, channel: thread, member } = interaction;
    const [action, threadId] = interaction.customId.split(":");
    const matchKey = getMatchKey(guild.id, threadId);

    const matchDataJSON = await redisClient.get(matchKey);
    if (!matchDataJSON) {
      return replyEphemeral(interaction, {
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Partida não encontrada no cache. `
              ),
            interaction
          ),
        ],
      });
    }
    const matchData = JSON.parse(matchDataJSON);
    const assignedMediatorId = matchData.assignedMediatorId;

    const [cargosConfig] = await CargosConfig.findOrCreate({
      where: { guildId: guild.id },
    });

    if (
      !hasMediatorPermission({
        member,
        userId: user.id,
        assignedMediatorId,
        cargosConfig,
      })
    ) {
      return replyPermissionDenied(
        interaction,
        `${Emojis.circlecross} Você não tem a permissão necessária para continuar esta ação.`
      );
    }

    await interaction.deferReply();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`select_vitoria:${threadId}`)
        .setLabel("Definir por Vitória")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(Emojis.vitoria || "🏆"),
      new ButtonBuilder()
        .setCustomId(`select_wo:${threadId}`)
        .setLabel("Definir por W.O")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(Emojis.visualizar || "🚶‍♂️")
    );

    await interaction.editReply({
      content: ``,
      embeds: [
        applyBotFooter(
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Yellow)
            .setDescription(
              `⚡ **Mediador <@${user.id}>**, selecione o novo resultado:`
            ),
          interaction
        ),
      ],
      components: [row],
    });
  } catch (err) {
    await handleServiceError(err, interaction, client);
  }
}

async function handleFinalizarApostado(interaction, client) {
  try {
    const { guild, user, channel: thread, member } = interaction;
    const [action, threadId] = interaction.customId.split(":");
    const matchKey = getMatchKey(guild.id, threadId);

    const matchDataJSON = await redisClient.get(matchKey);
    if (!matchDataJSON) {
      try {
        return await replyEphemeral(interaction, {
          content: "",
          embeds: [
            applyBotFooter(
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `${Emojis.circlecross} Esta partida já foi finalizada ou expirou.`
                ),
              interaction
            ),
          ],
        });
      } catch (e) {
        return;
      }
    }

    const matchData = JSON.parse(matchDataJSON);
    const assignedMediatorId = matchData.assignedMediatorId;
    const [cargosConfig] = await CargosConfig.findOrCreate({
      where: { guildId: guild.id },
    });

    if (
      !hasMediatorPermission({
        member,
        userId: user.id,
        assignedMediatorId,
        cargosConfig,
      })
    ) {
      return replyPermissionDenied(
        interaction,
        ` ${Emojis.circlecross} Você não tem a permissão necessária para continuar esta ação.`
      );
    }

    await interaction.deferReply();

    await interaction.editReply({
      content: `${Emojis.loading} ${user.username} iniciou a finalização da partida. Por favor, aguarde...`,
    });

    await processMatchEnd(interaction, client);
  } catch (err) {
    await handleServiceError(err, interaction, client);
  }
}

async function handleWinnerSelection(interaction, client, matchType) {
  const { guild, channel: thread, member, user } = interaction;
  const [action, threadId] = interaction.customId.split(":");
  const matchKey = getMatchKey(guild.id, threadId);

  const matchDataJSON = await redisClient.get(matchKey);
  if (!matchDataJSON)
    return replyEphemeral(interaction, {
      content: "",
      embeds: [
        applyBotFooter(
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `${Emojis.circlecross} Partida não encontrada no cache. `
            ),
          interaction
        ),
      ],
      components: [],
    });
  const matchData = JSON.parse(matchDataJSON);

  const [cargosConfig] = await CargosConfig.findOrCreate({
    where: { guildId: guild.id },
  });
  if (
    !hasMediatorPermission({
      member,
      userId: user.id,
      assignedMediatorId: matchData.assignedMediatorId,
      cargosConfig,
    })
  ) {
    return replyPermissionDenied(
      interaction,
      "Você não tem permissão para selecionar o vencedor."
    );
  }

  const allPlayersData = await Promise.all(
    (matchData.players || []).map(async (id) => {
      const userObject = await client.users.fetch(id).catch(() => ({
        id: id,
        username: `ID: ${id}`,
      }));
      return userObject;
    })
  );

  const playerOptions = allPlayersData.map((playerUser, index) => ({
    label: playerUser.username,
    description: `ID: ${playerUser.id}`,
    value: playerUser.id,
    emoji: `${index + 1}️⃣`,
  }));

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`submit_vencedor_final:${threadId}:${matchType}`)
      .setPlaceholder("Selecione um jogador do time vencedor...")
      .addOptions(playerOptions)
  );

  const embed = new EmbedBuilder()
    .setColor(process.env.botcolor)
    .setTitle(
      `🏆 Quem venceu a partida por ${matchType === "vitoria" ? "Vitória" : "W.O."
      }?`
    )
    .setDescription(
      matchType === "vitoria"
        ? "> Selecione um jogador vencedor."
        : "> Selecione um jogador vencedor por W.O."
    );
  applyBotFooter(embed, interaction);

  try {
    await interaction.editReply({
      content: ``,
      embeds: [embed],
      components: [selectMenu],
    });
  } catch (error) {
    if (error.code === 10008) return;
    console.warn("[MATCH WIN]: " + error)
  }
}

async function showMatchEndScreen(
  interaction,
  client,
  threadId,
  winnerTeamId,
  matchType
) {
  const { guild, user, channel: thread } = interaction;
  const matchKey = getMatchKey(guild.id, threadId);

  const matchDataJSON = await redisClient.get(matchKey);
  if (!matchDataJSON) return;

  const matchData = JSON.parse(matchDataJSON);
  const { time1, time2 } = getTeams(matchData.players);

  let winners = winnerTeamId === "time1" ? time1 : time2;
  let losers = winnerTeamId === "time1" ? time2 : time1;
  matchData.pendingWinnerTeamId = winnerTeamId;
  matchData.pendingMatchType = matchType;
  await redisClient.set(matchKey, JSON.stringify(matchData), { KEEPTTL: true });

  const premiacao =
    (Math.round(matchData.valorBase * 100) * matchData.maxPlayers) / 100;

  const valorFormatado = matchData.valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const premiacaoFormatada = premiacao.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const winnerString =
    winners.map((id) => `> <@${id}> \`[${id}]\``).join("\n") || "> N/A";
  const loserString =
    losers.map((id) => `> <@${id}> \`[${id}]\``).join("\n") || "> N/A";
  const finalThreadEmbed = new EmbedBuilder()
    .setAuthor({
      name: `${interaction.guild.name} | Aposta Finalizada`,
      iconURL: client.user.displayAvatarURL(),
    })
    .setColor(process.env.botcolor)
    .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || null)
    .addFields(
      {
        name: `${Emojis.espada} ∙ Modo:`,
        value: `> ${matchData.modoDisplay}`,
      },
      {
        name: `${Emojis.dinheiro} ∙ Valor:`,
        value: `> ${valorFormatado}`,
      },
      {
        name: `${Emojis.money} ∙ Premiação:`,
        value: `> ${premiacaoFormatada}`,
      },
      {
        name: `${Emojis.vitoria} ∙ Vencedor:`,
        value: winnerString,
      },
      {
        name: `${Emojis.circlecross} ∙ Perdedor:`,
        value: loserString,
      }
    );
  applyBotFooter(finalThreadEmbed, interaction);

  const confirmationRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`alterar_vencedor:${threadId}`)
      .setLabel("Alterar Vencedor")
      .setEmoji(Emojis.atualizar || "🔄")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId(`notify_member:${threadId}`)
      .setLabel("Notificar Jogadores")
      .setEmoji(Emojis.sino || "🔔")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId(`finalizar_apostado:${threadId}`)
      .setLabel("Finalizar Apostado")
      .setEmoji(Emojis.Lixeira || "🗑️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(false)
  );

  const messages = await thread.messages.fetch({ limit: 10 });
  const existingEmbedMsg = messages.find(
    (m) =>
      m.author.id === client.user.id &&
      m.embeds[0] &&
      m.embeds[0].author &&
      m.embeds[0].author.name.includes("Aposta Finalizada")
  );
  const playersMention = matchData.players.map((id) => `<@${id}>`).join(" ");

  if (existingEmbedMsg) {
    await existingEmbedMsg.edit({
      content: playersMention,
      embeds: [finalThreadEmbed],
      components: [confirmationRow],
    });
  } else {
    await thread.send({
      content: playersMention,
      embeds: [finalThreadEmbed],
      components: [confirmationRow],
    });
  }
}

async function processMatchEnd(interaction, client) {
  const { guild, user, channel: thread } = interaction;
  const [action, threadId] = interaction.customId.split(":");
  const matchKey = getMatchKey(guild.id, threadId);

  const matchDataJSON = await redisClient.get(matchKey);
  if (!matchDataJSON) {
    try {
      return await interaction.followUp({
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Esta partida já foi finalizada ou expirou.`
              ),
            interaction
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      return;
    }
  }

  const matchData = JSON.parse(matchDataJSON);
  const { pendingWinnerTeamId, pendingMatchType } = matchData;

  if (!pendingWinnerTeamId || !pendingMatchType) {
    return replyEphemeral(interaction, {
      content: "",
      embeds: [
        applyBotFooter(
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `${Emojis.circlecross} Erro crítico: O vencedor ainda não foi selecionado. Use "Alterar Vencedor" primeiro.`
            ),
          interaction
        ),
      ],
    });
  }

  const { time1, time2 } = getTeams(matchData.players);
  const assignedMediatorId = matchData.assignedMediatorId;
  let winners = pendingWinnerTeamId === "time1" ? time1 : time2;
  let losers = pendingWinnerTeamId === "time1" ? time2 : time1;
  let matchType = pendingMatchType;

  const winnersLog = [];
  const losersLog = [];

  const [geraisConfigs] = await ConfigsGerais.findOrCreate({
    where: { guildId: guild.id },
  });

  const valorSalaFloat = parseFloat(geraisConfigs.valorSala) || 0;
  const valorBaseFloat = parseFloat(matchData.valorBase) || 0;
  const premiacao =
    (Math.round(valorBaseFloat * 100) * matchData.maxPlayers) / 100;


  const t = await sequelize.transaction();

  try {
    const [filaConfig] = await FilaConfig.findOrCreate({
      where: { guildId: guild.id },
      defaults: { guildId: guild.id },
      transaction: t,
    });

    const coinsWinBase = filaConfig.coinsWinner || 0;
    const coinsLose = filaConfig.coinsLoser || 0;

    for (const winnerId of winners) {
      const [profile] = await PlayerProfile.findOrCreate({
        where: { guildId: guild.id, userId: winnerId },
        defaults: { guildId: guild.id, userId: winnerId },
        transaction: t,
        lock: true,
      });

      let multiplier = 1.0;
      try {
        const member =
          guild.members.cache.get(winnerId) ||
          (await guild.members.fetch(winnerId).catch(() => null));

      } catch (err) {
        console.warn(
          `[VIP Logic] Falha ao verificar VIP para ${winnerId}:`,
          err.message
        );
      }

      const finalCoinsWin = Math.floor(coinsWinBase * multiplier);

      let updateData;

      if (matchType === "wo") {
        const newCurrentStreak = profile.currentWinStreak + 1;
        const newMaxStreak = Math.max(profile.maxWinStreak, newCurrentStreak);
        updateData = {
          partidasTotais: profile.partidasTotais + 1,
          currentWinStreak: newCurrentStreak,
          maxWinStreak: newMaxStreak,
          wins: profile.wins + 1,
          coins: profile.coins + finalCoinsWin,
        };

        await profile.update(updateData, { transaction: t });

        winnersLog.push(`${Emojis.trofeu} <@${winnerId}>`);
        winnersLog.push(
          `> Vitória por W.O: \`+1\`\nCoins: \`+${finalCoinsWin}\` ${multiplier > 1 ? `(x${multiplier} VIP)` : ""
          }`
        );
      } else {
        const newCurrentStreak = profile.currentWinStreak + 1;
        const newMaxStreak = Math.max(profile.maxWinStreak, newCurrentStreak);
        updateData = {
          partidasTotais: profile.partidasTotais + 1,
          currentWinStreak: newCurrentStreak,
          maxWinStreak: newMaxStreak,
          wins: profile.wins + 1,
          coins: profile.coins + finalCoinsWin,
        };

        await profile.update(updateData, { transaction: t });

        winnersLog.push(`${Emojis.vitoria} <@${winnerId}>`);
        winnersLog.push(
          `> Vitória: \`+1\`\nCoins: \`+${finalCoinsWin}\` ${multiplier > 1 ? `(x${multiplier} VIP)` : ""
          }`
        );
      }
    }

    for (const loserId of losers) {
      const [profile] = await PlayerProfile.findOrCreate({
        where: { guildId: guild.id, userId: loserId },
        defaults: { guildId: guild.id, userId: loserId },
        transaction: t,
        lock: true,
      });

      let updateData;

      if (matchType === "wo") {
        updateData = {
          partidasTotais: profile.partidasTotais + 1,
          currentWinStreak: 0,
          losses: profile.losses + 1,
          coins: profile.coins + coinsLose,
        };

        await profile.update(updateData, { transaction: t });

        losersLog.push(`${Emojis.circlecross} <@${loserId}>`);
        losersLog.push(`> Derrota por W.O: \`+1\`\nCoins: \`+${coinsLose}\``);
      } else {
        updateData = {
          partidasTotais: profile.partidasTotais + 1,
          currentWinStreak: 0,
          losses: profile.losses + 1,
          coins: profile.coins + coinsLose,
        };

        await profile.update(updateData, { transaction: t });

        losersLog.push(`${Emojis.circlecross} <@${loserId}>`);
        losersLog.push(`> Derrota: \`+1\`\nCoins: \`+${coinsLose}\``);
      }
    }

    if (assignedMediatorId) {
      const [mediatorStats] = await MediatorStats.findOrCreate({
        where: { guildId: guild.id, userId: assignedMediatorId },
        defaults: { guildId: guild.id, userId: assignedMediatorId },
        transaction: t,
      });

      await mediatorStats.increment("matchesMediated", {
        by: 1,
        transaction: t,
      });
      await mediatorStats.update(
        { lastMediation: new Date() },
        { transaction: t }
      );
    }

    await ApostadoLog.update(
      {
        status: "ENCERRADA",
        winnerIds: winners,
        matchType: matchType,
        updatedAt: new Date(),
      },
      {
        where: { matchId: matchData.matchId },
        transaction: t,
      }
    );

    await ApostadoLog.destroy({
      where: { matchId: matchData.matchId },
      transaction: t,
    });

    await t.commit();
  } catch (err) {
    await t.rollback();

    console.error(
      "Erro CRÍTICO ao processar finalização da partida (Transação Falhou):",
      err
    );

    try {
      await thread.send({
        content: `### ⚠️ Erro grave ao salvar os dados no banco. A transação foi revertida e nenhum ponto foi computado. Tente novamente.\nErro: \`${err.message}\``,
      });
    } catch (e) { }

    return;
  }

  await LogService.sendLogFinalizada(
    guild,
    thread,
    user,
    matchData,
    winners,
    losers,
    assignedMediatorId,
    matchType
  );
  await LogService.sendLogPartidas(
    guild,
    user,
    matchData,
    winnersLog,
    losersLog,
    assignedMediatorId
  );

  matchData.status = "ENCERRADA";
  await redisClient.set(matchKey, JSON.stringify(matchData));

  await new Promise((resolve) => setTimeout(resolve, 5000));

  await thread
    .delete()
    .then(async () => {
      await redisClient.del(matchKey);
    })
    .catch(() => { });
}

module.exports = {
  handleConfirmPresence,
  handleNotifyMember,
  handleCancelMatch,
  handleCancelPostConfirm,
  finalizar_apostado_force: handleCancelPostConfirm,
  handleAlterarValor,
  handleSubmitAlterarValor,
  handleDefineWinner,
  handleWinnerSelectionType,
  handleSubmitWinner,
  handleAlterWinner,
  handleFinalizarApostado,
  select_vitoria: (i, c) => handleWinnerSelectionType(i, c, "vitoria"),
  select_wo: (i, c) => handleWinnerSelectionType(i, c, "wo"),
};
