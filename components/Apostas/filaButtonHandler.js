const {
  EmbedBuilder,
  Colors,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const ApostadoLog = require("../../database/models/ApostadoLog");
const LogsConfig = require("../../database/models/LogsConfig");
const Emojis = require("../../Emojis.json");

const {
  redisClient,
  getMediatorsOnlineKey,
  getRemainingCooldown,
  setCooldown,
  getQueueKey,
  getMatchKey,
  incrementPlayerMatchCount,
  decrementPlayerMatchCount,
  getPlayerMatchCount,
  setUserLock,
  releaseUserLock,
  setMatchLock,
  releaseMatchLock,
} = require("../../utils/cache");
const {
  getServerConfig,
  getGeraisConfig,
  getFilaConfig,
  getCargosConfig,
} = require("../../manager/configManager");
const { randomUUID } = require("crypto");

function applyBotFooter(embed) {
  if (process.env.DEFAULT_FOOTER_TEXT) {
    embed.setFooter({
      text: process.env.DEFAULT_FOOTER_TEXT,
      iconURL: null,
    });
  }
  return embed;
}

async function getQueue(queueKey) {
  if (!redisClient.isReady) return [];
  return redisClient.lRange(queueKey, 0, -1);
}

async function removePlayerFromQueue(queueKey, userId) {
  if (!redisClient.isReady) return 0;
  return redisClient.lRem(queueKey, 0, userId);
}

async function findUserInQueues(
  guildId,
  modoId,
  valor,
  userId,
  modo,
  configTimestamp
) {
  if (!redisClient.isReady || !modo || !modo.botoes) return null;
  const tags = modo.botoes.filter(
    (b) => b !== "Sair da Fila" && b !== "Entrar na Fila"
  );
  if (modo.botoes.includes("Entrar na Fila")) {
    tags.push("Padrão");
  }
  for (const tag of tags) {
    const key = getQueueKey(guildId, modoId, valor, tag);
    const position = await redisClient.lPos(key, userId);
    if (position !== null) return tag;
  }
  return null;
}

function getMaxPlayers(modoId) {
  return 2;
}

function buildQueueString(allQueues, maxPlayers) {
  let output = [];
  let totalPlayers = 0;
  for (const tag in allQueues) {
    const players = allQueues[tag];
    if (players.length > 0) {
      totalPlayers += players.length;
      for (const id of players) {
        if (tag === "Padrão") {
          output.push(` <@${id}>`);
        } else {
          output.push(` <@${id}> | ${tag}`);
        }
      }
    }
  }
  if (totalPlayers === 0) {
    return "Nenhum jogador na fila";
  }
  return output.join("\n");
}

async function updateEmbed(message, guildId, modoId, valor, configTimestamp) {
  const filaConfigs = await getFilaConfig(guildId);
  const geraisConfigs = await getGeraisConfig(guildId);

  if (!filaConfigs || !geraisConfigs) {
    console.error(
      `[updateEmbed] Falha ao ler configs do cache para ${guildId}.`
    );
    return;
  }

  const modo = filaConfigs.modalidades.find((m) => m.id === modoId);
  if (!modo) throw new Error(`Modo ${modoId} não encontrado no cache`);

  const allQueues = {};
  const tags = modo.botoes.filter(
    (b) => b !== "Sair da Fila" && b !== "Entrar na Fila"
  );
  if (modo.botoes.includes("Entrar na Fila")) {
    tags.push("Padrão");
  }

  for (const tag of tags) {
    const key = getQueueKey(guildId, modoId, valor, tag);
    allQueues[tag] = await getQueue(key);
  }

  const maxPlayers = getMaxPlayers(modoId);
  const newFieldString = buildQueueString(allQueues, maxPlayers);
  const valorSala = geraisConfigs.valorSala;
  let description =
    modo.templateDescription || "### Descrição padrão não definida.";
  const valorFormatado = parseFloat(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  description = description.replace(/\[\[modo_jogo\]\]/g, modo.nome);
  description = description.replace(/\[\[valor_partida\]\]/g, valorFormatado);
  description = description.replace(/\[\[jogadores_fila\]\]/g, newFieldString);
  const newEmbed = new EmbedBuilder()
    .setColor(modo.templateColor || Colors.Default)
    .setDescription(description)
    .setThumbnail(modo.templateAvatarUrl);
  applyBotFooter(newEmbed);
  await message.edit({ embeds: [newEmbed] });
}

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
    return null;
  }
}

async function createMatchThread(
  interaction,
  players,
  modoId,
  valor,
  tag,
  queueKey
) {
  const guild = interaction.guild;
  const client = interaction.client;

  const geraisConfigs = await getGeraisConfig(guild.id);
  const filaConfigs = await getFilaConfig(guild.id);
  const cargoAcesso = await getCargosConfig(guild.id);

  if (!geraisConfigs || !filaConfigs || !cargoAcesso) {
    throw new Error(
      `${Emojis.circlecross} **Erro de Configuração!**\n- Não foi possível ler as configurações do servidor.`
    );
  }

  const apostadosChannelId = geraisConfigs.apostadosChannelId;
  const modo = filaConfigs.modalidades.find((m) => m.id === modoId);

  if (!apostadosChannelId) {
    throw new Error(
      `${Emojis.circlecross} **Apostas Indisponiveis!**\n- O canal de apostas não foi definido.`
    );
  }

  const parentChannel = await guild.channels
    .fetch(apostadosChannelId)
    .catch(() => null);

  if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
    throw new Error(
      `${Emojis.circlecross} **Apostas Indisponiveis!**\n- O canal de apostas (<#${apostadosChannelId}>) não foi encontrado.`
    );
  }

  const MAX_THREADS_PER_SERVER =
    parseInt(process.env.MAX_THREADS_PER_SERVER) || 50;
  let activeThreads;

  try {
    activeThreads = await parentChannel.threads.fetchActive();
  } catch (fetchErr) {
    console.error(`[ThreadLimit] Falha ao buscar threads: ${fetchErr.message}`);
    throw new Error(
      `${Emojis.circlecross} **Erro Interno!**\n- Não consegui verificar o número de apostas ativas.`
    );
  }

  if (activeThreads.size >= MAX_THREADS_PER_SERVER) {
    for (const id of players) {
      await decrementPlayerMatchCount(guild.id, id);
    }

    await interaction.followUp({
      content: ``,
      embeds: [
        applyBotFooter(
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `### ${Emojis.circlecross} **Servidor Lotado!**\n- O servidor atingiu o limite de **${MAX_THREADS_PER_SERVER}** apostas ativas.\n- Novas entradas na fila foram bloqueadas temporariamente.`
            )
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }

  const playerMentions = players.map((id) => `<@${id}>`).join(" ");
  const playerString = players
    .map((id) => {
      if (tag === "Padrão") {
        return ` <@${id}>`;
      }
      return ` <@${id}> | ${tag}`;
    })
    .join("\n");
  const valorFloat = parseFloat(valor);
  const valorSalaFloat = parseFloat(geraisConfigs.valorSala) || 0;
  const valorTotal = valorFloat + valorSalaFloat;
  const valorFormatado = valorTotal.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const modoNome = modo ? modo.nome : `${modoId.replace("_", " ")}`;
  const modoDisplay = tag === "Padrão" ? modoNome : `${modoNome} (${tag})`;

  const matchId = randomUUID().split("-")[0];
  const timestamp = Math.floor(Date.now() / 1000);

  const logChannelIniciada = await getLogChannel(guild, "logApostaAbertaId");
  if (logChannelIniciada) {
    try {
      const playersStringLog = players
        .map((id) => `> <@${id}> \`[${id}]\``)
        .join("\n");
      const logEmbed = new EmbedBuilder()
        .setAuthor({
          name: ` APOSTA INICIADA`,
          iconURL: interaction.guild.iconURL({ dynamic: true }),
        })
        .setColor(process.env.botcolor)
        .addFields(
          { name: `${Emojis.espada}  Modo:`, value: modoDisplay },
          {
            name: `${Emojis.dinheiro}  Valor:`,
            value:
              "> " +
              valorFloat.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              }),
          },
          { name: `${Emojis.Sky_preview}  Jogadores:`, value: playersStringLog }
        )
        .setTimestamp();
      await logChannelIniciada.send({ embeds: [logEmbed] });
    } catch (logErr) {
      console.error("Falha ao gerar log de 'Aposta Iniciada':", logErr);
    }
  }

  try {
    const thread = await parentChannel.threads.create({
      name: `aguardando-confirmacao`,
      autoArchiveDuration: 60,
      type: ChannelType.PrivateThread,
      invitable: false,
    });
    const matchEmbed = new EmbedBuilder()
      .setAuthor({
        name: `Aguardando Confirmação `,
        iconURL: interaction.guild.iconURL({ dynamic: true }),
      })
      .setColor(process.env.botcolor)
      .setThumbnail(guild.iconURL({ dynamic: true }) || null)
      .addFields(
        {
          name: `${Emojis.espada}  Modo:`,
          value: "> " + modoDisplay,
        },
        {
          name: `${Emojis.dinheiro}  Valor:`,
          value: `> ${valorFormatado}`,
        },
        {
          name: `${Emojis.Sky_preview}  Jogadores:`,
          value: playerString,
        },
        {
          name: `${Emojis.sim} Confirmaram Presença:`,
          value: "> Ninguém confirmou presença.",
        }
      );
    applyBotFooter(matchEmbed);

    let assignedMediatorId = null;
    let mediatorMention = "";

    if (geraisConfigs.assignMediatorOnMatchCreate) {
      const mediatorsKey = getMediatorsOnlineKey(guild.id);
      const mediatorsQueueKey = mediatorsKey + ":queue";

      assignedMediatorId = await redisClient.rPopLPush(
        mediatorsQueueKey,
        mediatorsQueueKey
      );

      if (assignedMediatorId) {
        mediatorMention = `<@${assignedMediatorId}>`;
      } else {
        await interaction.followUp({
          content: "",
          embeds: [
            applyBotFooter(
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `- ${Emojis.circlecross} **Não há mediadores Online.**\n- Não é possível iniciar a partida agora. Tente novamente mais tarde.`
                ),
              interaction
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_presence:${thread.id}`)
        .setLabel(`Confirmar Presença (0/${players.length})`)
        .setEmoji(Emojis.sim)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`notify_member:${thread.id}`)
        .setLabel("Notificar Membro")
        .setEmoji(Emojis.sino || "🔔")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`cancel_match:${thread.id}`)
        .setLabel("Cancelar")
        .setEmoji(Emojis.circlecross)
        .setStyle(ButtonStyle.Danger)
    );
    const matchData = {
      guildId: guild.id,
      modoId: modoId,
      modoDisplay: modoDisplay,
      valor: valorTotal,
      valorBase: valorFloat,
      tag: tag,
      players: players,
      maxPlayers: players.length,
      confirmed: [],
      assignedMediatorId: assignedMediatorId,
      thumbnailUrl: guild.iconURL({ dynamic: true }) || null,
      matchId: matchId,
      timestamp: timestamp,
    };
    try {
      await ApostadoLog.create({
        guildId: guild.id,
        matchId: matchId,
        threadId: thread.id,
        status: "ABERTA",
        modoDisplay: modoDisplay,
        valorBase: valorFloat,
        valorSala: valorSalaFloat,
        mediatorId: assignedMediatorId,
        createdAt: new Date(timestamp * 1000),
      });
    } catch (logErr) {
      console.error("Falha ao criar Log 'ABERTA' no ApostadoLog:", logErr);
    }

    const matchKey = getMatchKey(guild.id, thread.id);
    await redisClient.set(matchKey, JSON.stringify(matchData), { EX: 86400 });
    const acessoRoleId = cargoAcesso.cargoAcessoApostadoId;
    await thread.send({
      content: `${playerMentions} ${mediatorMention} ${acessoRoleId ? `<@&${acessoRoleId}>` : ""
        }`,
      embeds: [matchEmbed],
      components: [row],
    });

    const missingPlayers = [];
    for (const id of players) {
      try {
        await guild.members.fetch({ user: id, force: true });
        await thread.members.add(id);
      } catch (err) {
        missingPlayers.push(id);
      }
    }

    if (assignedMediatorId) {
      await thread.members.add(assignedMediatorId).catch((err) => {
      });
    }

    if (missingPlayers.length > 0) {
      const missingMentions = missingPlayers.map((id) => `<@${id}>`).join(", ");

      const alertEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setTitle(`${Emojis.circlecross || "🚨"} JOGADOR SAIU DO SERVIDOR`)
        .setDescription(
          `### Aposta Cancelada Automaticamente!\n` +
          `- Identifiquei que o(s) jogador(es) abaixo não estão mais no servidor:\n> **${missingMentions}**\n\n` +
          `> ❌ **Este tópico será excluído em 10 segundos.**`
        )
        .setTimestamp();

      await thread.send({ embeds: [alertEmbed] });

      try {
        await ApostadoLog.update(
          {
            status: "CANCELADA",
            updatedAt: new Date(),
          },
          { where: { matchId: matchId } }
        );
      } catch (e) {
        console.error(
          "Erro ao atualizar log de cancelamento (saída do server):",
          e
        );
      }

      const logChannelCancelada = await getLogChannel(
        guild,
        "logApostaCanceladaId"
      );
      if (logChannelCancelada) {
        const logEmbedCancel = new EmbedBuilder()
          .setTitle("APOSTA CANCELADA (JOGADOR SAIU)")
          .setColor(process.env.botcolor || Colors.Red)
          .setDescription(
            `A aposta foi cancelada automaticamente pois um ou mais jogadore saiu do servidor.`
          )
          .addFields({ name: "Jogadores Ausentes", value: missingMentions })
          .setTimestamp();
        await logChannelCancelada.send({ embeds: [logEmbedCancel] });
      }

      await redisClient.del(matchKey);

      for (const id of players) {
        await decrementPlayerMatchCount(guild.id, id);
      }

      setTimeout(async () => {
        await thread.delete().catch(() => { });
      }, 10000);

      return null;
    }

    return thread;
  } catch (err) {
     if (err.code === 50001) return;
    console.error("Erro em createMatchThread:", err);
    throw err;
  }
}

async function handleJoinQueue(interaction, client, clickedTag) {
  try {
    await interaction.deferUpdate();
  } catch (e) {
    return;
  }

  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  const userLockAcquired = await setUserLock(userId, 3);
  if (!userLockAcquired) return;

  try {
    const remaining = await getRemainingCooldown(
      guildId,
      userId,
      "fila_button"
    );
    if (remaining > 0) {
      await interaction.followUp({
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Yellow)
              .setDescription(
                `${Emojis.time} Calma! Aguarde ${remaining.toFixed(1)}s.`
              )
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await setCooldown(guildId, userId, "fila_button", 3);

    const [action, valor, modoId, buttonTimestamp] =
      interaction.customId.split(":");

    const serverConfig = await getServerConfig(guildId, interaction.guild.name);
    if (!serverConfig)
      throw new Error("Erro ao carregar configurações do servidor.");

    const configTimestamp = Math.max(
      new Date(serverConfig.createdAt).getTime(),
    ).toString();

    if (buttonTimestamp !== configTimestamp) {
      throw new Error(
        `${Emojis.verifybot} Interface inválida. O bot foi removido do servidor ou a configuração foi resetada.`
      );
    }

    const geraisConfigs = await getGeraisConfig(guildId);

    if (!geraisConfigs || !geraisConfigs.apostadosChannelId) {
      throw new Error(
        `${Emojis.circlecross} **Sistema Indisponível!**\n- O canal para criar as partidas (Apostados) não foi configurado na \`/central\`.`
      );
    }

    const canalDestino = interaction.guild.channels.cache.get(
      geraisConfigs.apostadosChannelId
    );
    if (!canalDestino) {
      throw new Error(
        `${Emojis.circlecross} **Erro Crítico!**\n- O canal onde as partidas são criadas foi deletado ou não está acessível.\n- Avise um administrador.`
      );
    }

    if (!redisClient.isReady) throw new Error("Sistema de cache offline.");

    const mediatorsKey = getMediatorsOnlineKey(guildId);
    const mediatorCount = await redisClient.hLen(mediatorsKey);

    if (mediatorCount === 0) {
      throw new Error(
        `${Emojis.circlecross} **Sem Mediadores!**\n- Não há nenhum mediador online no momento.\n- A fila está travada até que alguém entre.`
      );
    }

    const matchLimit = parseInt(process.env.PartidasSimutaneas, 10) || 1;
    const currentMatchCount = await getPlayerMatchCount(guildId, userId);

    if (currentMatchCount >= matchLimit) {
      throw new Error(
        `${Emojis.aviso} **Limite Atingido!**\n- Você já está em **${currentMatchCount}** filas.\n- O limite deste servidor é **${matchLimit}** filas simultâneas.`
      );
    }

    const filaConfigs = await getFilaConfig(guildId);
    if (!filaConfigs) throw new Error("Erro de configuração de fila.");
    const modo = filaConfigs.modalidades.find((m) => m.id === modoId);
    if (!modo) throw new Error("Modalidade não encontrada.");

    const inQueueTag = await findUserInQueues(
      guildId,
      modoId,
      valor,
      userId,
      modo,
      configTimestamp
    );
    if (inQueueTag) {
      throw new Error(`${Emojis.circlecross} Você já está nesta fila.`);
    }

    const queueKey = getQueueKey(guildId, modoId, valor, clickedTag);
    let playersToMatch = [];
    let matchCreated = false;

    try {
      await incrementPlayerMatchCount(guildId, userId);
      await redisClient.lPush(queueKey, userId);

      const currentSize = await redisClient.lLen(queueKey);
      const maxPlayers = getMaxPlayers(modoId);

      if (currentSize >= maxPlayers) {
        for (let i = 0; i < maxPlayers; i++) {
          playersToMatch.push(await redisClient.rPop(queueKey));
        }
        playersToMatch.reverse();
        matchCreated = true;
      }

      await updateEmbed(
        interaction.message,
        guildId,
        modoId,
        valor,
        configTimestamp
      );

      if (matchCreated) {
        const newThread = await createMatchThread(
          interaction,
          playersToMatch,
          modoId,
          valor,
          clickedTag,
          queueKey
        );

        if (newThread) {
          for (const pid of playersToMatch) {
            await decrementPlayerMatchCount(guildId, pid);
          }
        }
      } else {
      }
    } catch (err) {
      await decrementPlayerMatchCount(guildId, userId);
      await removePlayerFromQueue(queueKey, userId);
      if (playersToMatch && playersToMatch.length > 0) {
        for (const pid of playersToMatch) {
          if (pid !== userId) {
            await decrementPlayerMatchCount(guildId, pid);
          }
        }
      }

      throw err;
    }
  } catch (err) {
    const errorMsg = err.message || "Erro desconhecido.";
    await interaction.followUp({
      content: "",
      embeds: [
        applyBotFooter(
          new EmbedBuilder().setColor(process.env.botcolor || Colors.Red).setDescription(errorMsg)
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  } finally {
    await releaseUserLock(userId);
  }
}

async function handleLeaveQueue(interaction, client) {
  try {
    await interaction.deferUpdate();
  } catch (e) {
    return;
  }

  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  const lockAcquired = await setUserLock(userId, 5);
  if (!lockAcquired) {
    return interaction.followUp({
      content: "Ação em progresso, aguarde...",
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const remaining = await getRemainingCooldown(
      guildId,
      userId,
      "fila_button"
    );
    if (remaining > 0) {
      await interaction.followUp({
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Yellow)
              .setDescription(
                `- ${Emojis.time
                } Você está clicando muito rápido! Tente novamente em ${remaining.toFixed(
                  1
                )} segundos.`
              )
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      await releaseUserLock(userId);
      return;
    }
    await setCooldown(guildId, userId, "fila_button", 3);

    const [action, valor, modoId, buttonTimestamp] =
      interaction.customId.split(":");
    const serverConfig = await getServerConfig(guildId, interaction.guild.name);
    if (!serverConfig) {
      await interaction.followUp({
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Erro crítico ao ler a configuração do servidor. Tente novamente.`
              )
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      await releaseUserLock(userId);
      return;
    }

    const configTimestamp = Math.max(
      new Date(serverConfig.createdAt).getTime(),
    ).toString();

    if (buttonTimestamp !== configTimestamp) {
      await interaction.followUp({
        content: "",
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross} Painel Inválido!\n- Este painel pertence a uma configuração antiga do servidor.\n- O bot pode ter sido removido do servidor ou as configurações foram resetadas.\n- Peça a um administrador para gerar um novo painel.`
              )
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });

      await releaseUserLock(userId);
      return;
    }


    const { guild, user, message } = interaction;
    const me = interaction.guild.members.me;
    const channel = interaction.channel;
    const perms = me.permissionsIn(channel);
    if (
      !perms.has(PermissionsBitField.Flags.ManageMessages) ||
      !perms.has(PermissionsBitField.Flags.ViewChannel)
    ) {
      await interaction.followUp({
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder().setColor(process.env.botcolor || Colors.Red)
              .setDescription(`### ${Emojis.circlecross} Falha de Permissão!
- Eu não tenho permissão de \`Ver Canal\` e \`Gerenciar Mensagens\` neste canal.
- Não posso atualizar a fila pois não consigo editar a embed.
- Ação cancelada. Por favor, avise um administrador.`)
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      await releaseUserLock(userId);
      return;
    }

    if (!redisClient.isReady) {
      await interaction.followUp({
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `- ${Emojis.circlecross} O cache da fila está offline.`
              )
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      await releaseUserLock(userId);
      return;
    }

    const filaConfigs = await getFilaConfig(guild.id);
    if (!filaConfigs) {
      await interaction.followUp({
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross} **Erro de Configuração!**\n- Não foi possível ler as configurações de fila no cache.`
              )
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      await releaseUserLock(userId);
      return;
    }

    const modo = filaConfigs.modalidades.find((m) => m.id === modoId);
    if (!modo) {
      await releaseUserLock(userId);
      return;
    }
    const inQueueTag = await findUserInQueues(
      guildId,
      modoId,
      valor,
      user.id,
      modo,
      configTimestamp
    );
    if (!inQueueTag) {
      await interaction.followUp({
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Você não esta presente em nenhuma fila desta modalidade com este valor.`
              )
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      await releaseUserLock(userId);
      return;
    }

    const queueKey = getQueueKey(guild.id, modoId, valor, inQueueTag);
    try {
      const removedCount = await removePlayerFromQueue(queueKey, user.id);
      if (removedCount > 0) {
        await decrementPlayerMatchCount(guildId, userId);
      } else {
        throw new Error(
          "Falha ao remover jogador do cache (removedCount = 0)."
        );
      }

      await updateEmbed(message, guild.id, modoId, valor, configTimestamp);
    } catch (err) {
      await redisClient.lPush(queueKey, user.id);
      await incrementPlayerMatchCount(guildId, userId);

      await interaction.followUp({
        content: ``,
        embeds: [
          applyBotFooter(
            new EmbedBuilder().setColor(process.env.botcolor || Colors.Red)
              .setDescription(`### ${Emojis.circlecross} Falha na Ação!
- Não consegui atualizar a interface da fila (talvez por falta de permissão).
- A sua ação foi **automaticamente cancelada** para evitar erros.`)
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  } finally {
    await releaseUserLock(userId);
  }
}

module.exports = {
  LV: handleLeaveQueue,
  MB: (interaction, client) => handleJoinQueue(interaction, client, "Mobile"),
  EMU: (interaction, client) =>
    handleJoinQueue(interaction, client, "Emulador"),
  MS: (interaction, client) => handleJoinQueue(interaction, client, "Misto"),
  GN: (interaction, client) =>
    handleJoinQueue(interaction, client, "Gelo Normal"),
  GI: (interaction, client) =>
    handleJoinQueue(interaction, client, "Gelo Infinito"),
  "1E": (interaction, client) => handleJoinQueue(interaction, client, "1 Emu"),
  "2E": (interaction, client) => handleJoinQueue(interaction, client, "2 Emu"),
  "3E": (interaction, client) => handleJoinQueue(interaction, client, "3 Emu"),
  JN: (interaction, client) => handleJoinQueue(interaction, client, "Padrão"),
  UEX: (interaction, client) =>
    handleJoinQueue(interaction, client, "Ump e Xm8"),
  MBT: (interaction, client) => handleJoinQueue(interaction, client, "Mobilador"),
};
