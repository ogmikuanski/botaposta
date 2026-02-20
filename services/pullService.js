const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  Colors,
  ChannelType,
} = require("discord.js");
const { redisClient, getMatchKey } = require("../utils/cache");
const CargosConfig = require("../database/models/CargosConfig");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const Emojis = require("../Emojis.json");

async function checkPermission(guild, member, user, assignedMediatorId) {
  if (user.id === assignedMediatorId) return true;

  const [cargosConfig] = await CargosConfig.findOrCreate({
    where: { guildId: guild.id },
  });
  const permMaxRoleId = cargosConfig.cargoPermMaxId;

  if (permMaxRoleId && member.roles.cache.has(permMaxRoleId)) {
    return true;
  }
  return false;
}

function applyBotFooter(embed) {
  if (process.env.DEFAULT_FOOTER_TEXT) {
    embed.setFooter({
      text: process.env.DEFAULT_FOOTER_TEXT,
      iconURL: process.env.DEFAULT_FOOTER_ICON || null,
    });
  }
  return embed;
}

function getTeams(players) {
  const half = Math.ceil(players.length / 2);
  const time1 = players.slice(0, half);
  const time2 = players.slice(half);
  return { time1, time2 };
}

async function deleteOldResultEmbeds(channel, client) {
  try {
    const messages = await channel.messages.fetch({ limit: 50 });

    const targetMessages = messages.filter((m) => {
      if (m.author.id !== client.user.id) return false;
      if (m.embeds.length === 0) return false;

      const authorName = m.embeds[0].author?.name || "";
      return (
        authorName.includes("Aposta Finalizada") ||
        authorName.includes("Iniciar Apostado")
      );
    });

    if (targetMessages.size > 0) {
      try {
        await channel.bulkDelete(targetMessages, true);
      } catch {
        for (const msg of targetMessages.values()) {
          await msg.delete().catch(() => { });
        }
      }
    }
  } catch (err) {
    console.error(
      "[PullService] Falha ao limpar embeds antigos de resultado:",
      err
    );
  }
}

async function disableOldComponents(channel, client) {
  try {
    const messages = await channel.messages.fetch({ limit: 20 });
    const botMessages = messages.filter(
      (m) => m.author.id === client.user.id && m.components.length > 0
    );

    for (const [id, msg] of botMessages) {
      const hasControlButtons = msg.components.some((row) =>
        row.components.some(
          (btn) =>
            btn.customId &&
            (btn.customId.startsWith("alterar_valor") ||
              btn.customId.startsWith("definir_vencedor") ||
              btn.customId.startsWith("cancelar_apostado") ||
              btn.customId.startsWith("finalizar_apostado") ||
              btn.customId.startsWith("alterar_vencedor"))
        )
      );

      if (hasControlButtons) {
        const newRows = [];
        for (const row of msg.components) {
          const newRow = new ActionRowBuilder();
          for (const comp of row.components) {
            const btn = ButtonBuilder.from(comp);
            btn.setDisabled(true);
            newRow.addComponents(btn);
          }
          newRows.push(newRow);
        }
        await msg.edit({ components: newRows }).catch(() => { });
      }
    }
  } catch (err) {
    console.error("[PullService] Erro ao desativar componentes antigos:", err);
  }
}

async function handlePullPanel(interaction, client) {
  const { guild, channel, user, member } = interaction;

  if (!channel) return;

  const silentExit = async () => {
    if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.deleteReply();
      } catch (e) { }
    }
    return;
  };

  if (
    channel.type !== ChannelType.PublicThread &&
    channel.type !== ChannelType.PrivateThread
  ) {
    return await silentExit();
  }

  const channelName = channel.name;
  if (
    (!channelName.startsWith("Filas-") && !channelName.startsWith("Pagar-")) ||
    channelName.toLowerCase().includes("aguardando")
  ) {
    return await silentExit();
  }

  const reply = async (payload) => {
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload);
    } else {
      return interaction.reply(payload);
    }
  };

  try {
    const matchKey = getMatchKey(guild.id, channel.id);
    const matchDataJSON = await redisClient.get(matchKey);

    if (!matchDataJSON) {
      return reply({
        content: `${Emojis.circlecross} **Erro:** Este canal não parece ser uma partida ativa ou expirou.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const matchData = JSON.parse(matchDataJSON);
    const hasPerm = await checkPermission(
      guild,
      member,
      user,
      matchData.assignedMediatorId
    );

    if (!hasPerm) {
      return await silentExit();
    }

    let msgLoading;
    const loadingContent = {
      content: `${Emojis.loading} Atualizando interface...`,
      flags: MessageFlags.Ephemeral
    };

    if (interaction.replied || interaction.deferred) {
      msgLoading = await interaction.followUp(loadingContent);
    } else {
      const response = await interaction.reply({ ...loadingContent, withResponse: true });
      msgLoading = response.resource ? response.resource.message : response;
    }

    await disableOldComponents(channel, client);

    const valorBaseFloat = parseFloat(matchData.valorBase);
    const premiacao = (Math.round(valorBaseFloat * 100) * matchData.maxPlayers) / 100;

    const valorFormatado = matchData.valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const premiacaoFormatada = premiacao.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    const threadId = channel.id;
    const hasWinnerDefined = !!matchData.pendingWinnerTeamId;
    let finalEmbed;
    let finalRow;

    if (hasWinnerDefined) {
      await deleteOldResultEmbeds(channel, client);

      const { time1, time2 } = getTeams(matchData.players);
      const winnerTeamId = matchData.pendingWinnerTeamId;

      let winners = winnerTeamId === "time1" ? time1 : time2;
      let losers = winnerTeamId === "time1" ? time2 : time1;

      const winnerString = winners
        .map((id) => `> <@${id}> \`[${id}]\``)
        .join("\n");
      const loserString = losers
        .map((id) => `> <@${id}> \`[${id}]\``)
        .join("\n");

      finalEmbed = new EmbedBuilder()
        .setAuthor({
          name: `${guild.name} | Aposta Finalizada`,
          iconURL: client.user.displayAvatarURL(),
        })
        .setColor(process.env.botcolor || Colors.Gold)
        .setThumbnail(guild.iconURL({ dynamic: true }) || null)
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
            value: winnerString || "> N/A",
          },
          {
            name: `${Emojis.circlecross} ∙ Perdedor:`,
            value: loserString || "> N/A",
          }
        );

      finalRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`alterar_vencedor:${threadId}`)
          .setLabel("Alterar Vencedor")
          .setEmoji(Emojis.atualizar || "🔄")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`notify_member:${threadId}`)
          .setLabel("Notificar Jogadores")
          .setEmoji(Emojis.sino || "🔔")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`finalizar_apostado:${threadId}`)
          .setLabel("Finalizar Apostado")
          .setEmoji(Emojis.Lixeira || "🗑️")
          .setStyle(ButtonStyle.Danger)
      );
    } else {
      const playersStringFinal = matchData.players
        .map((id) => `> <@${id}>`)
        .join("\n");

      finalEmbed = new EmbedBuilder()
        .setAuthor({
          name: `${guild.name} | Iniciar Apostado`,
          iconURL: guild.iconURL({ dynamic: true }),
        })
        .setColor(process.env.botcolor || Colors.Blue)
        .setThumbnail(matchData.thumbnailUrl)
        .addFields(
          {
            name: `${Emojis.espada}  Modo:`,
            value: "> " + matchData.modoDisplay,
          },
          {
            name: `${Emojis.dinheiro}  Valor`,
            value: `> ${valorFormatado}`,
          },
          {
            name: `${Emojis.money} Premiação:`,
            value: `> ${premiacaoFormatada}`,
          },
          {
            name: `${Emojis.Sky_preview}  Jogadores:`,
            value: playersStringFinal || "> Vazio",
          },
          {
            name: "⚡  Mediador:",
            value: "> " + `<@${matchData.assignedMediatorId}>`,
          }
        );

      finalRow = new ActionRowBuilder().addComponents(
        /*new ButtonBuilder()
          .setCustomId(`alterar_valor:${threadId}`)
          .setLabel("Alterar Valor")
          .setEmoji(Emojis.dinheiro)
          .setStyle(ButtonStyle.Secondary),*/
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
    }

    applyBotFooter(finalEmbed);

    const playersMention = matchData.players.map((id) => `<@${id}>`).join(" ");

    await channel.send({
      content: playersMention,
      embeds: [finalEmbed],
      components: [finalRow],
    });

    try {
      if (msgLoading) {
        if (typeof msgLoading.delete === 'function') {
          await msgLoading.delete();
        } else {
          await interaction.deleteReply().catch(() => { });
        }
      }
    } catch (e) { }

  } catch (err) {
    console.error("[HandlePullPanel] Erro:", err);
    return reply({
      content: process.env.MSGERROBOT || "Erro interno.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { handlePullPanel };