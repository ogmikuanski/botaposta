const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Colors,
  ChannelType,
} = require("discord.js");
const FilaConfig = require("../database/models/FilaConfig");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const Emojis = require("../Emojis.json");
const {
  setLock,
  releaseLock,
  clearPlayerMatchCounts,
  clearAllGuildQueues,
  clearModalityQueues,
  setGuildInterfaceLock,
  releaseGuildInterfaceLock,
} = require("../utils/cache");
const {
  getServerConfig,
  getGeraisConfig,
  getFilaConfig,
} = require("../manager/configManager");

const SEND_DELAY_MS = process.env.SEND_DELAY_MS || 2100;

const BUTTON_MAP = {
  "Entrar na Fila": {
    emoji: Emojis.check || "⚔️",
    style: ButtonStyle.Secondary,
    action: "JN",
  },
  "Sair da Fila": {
    emoji: Emojis.circlecross || "❌",
    style: ButtonStyle.Secondary,
    action: "LV",
  },
  "Gelo Normal": {
    emoji: Emojis.gelo || "🥊",
    style: ButtonStyle.Secondary,
    action: "GN",
  },
  "Gelo Infinito": {
    emoji: Emojis.gelo || "🥊",
    style: ButtonStyle.Secondary,
    action: "GI",
  },
  Mobile: {
    emoji: Emojis.mobile || "📱",
    style: ButtonStyle.Secondary,
    action: "MB",
  },
  Mobilador: {
    emoji: Emojis.mobilador || "📱",
    style: ButtonStyle.Secondary,
    action: "MBT",
  },
  Emulador: {
    emoji: Emojis.laptop || "💻",
    style: ButtonStyle.Secondary,
    action: "EMU",
  },
  Misto: {
    emoji: Emojis.mix || "🤝",
    style: ButtonStyle.Secondary,
    action: "MS",
  },
  "1 Emu": {
    emoji: Emojis.laptop || "💻",
    style: ButtonStyle.Secondary,
    action: "1E",
  },
  "2 Emu": {
    emoji: Emojis.laptop || "💻",
    style: ButtonStyle.Secondary,
    action: "2E",
  },
  "3 Emu": {
    emoji: Emojis.laptop || "💻",
    style: ButtonStyle.Secondary,
    action: "3E",
  },
  "Ump e Xm8": {
    emoji: Emojis.ump || Emojis.xm8,
    style: ButtonStyle.Secondary,
    action: "UEX",
  },
  "CS": {
    emoji: Emojis.naoentendi || "📌",
    style: ButtonStyle.Secondary,
    action: "CS",
  },
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cleanOldFilaMessages(channel, client) {
  if (channel.type !== ChannelType.GuildText) return;

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    if (messages.size > 0) {
      try {
        await channel.bulkDelete(messages, true);
      } catch (bulkErr) {
        for (const msg of messages.values()) {
          await msg.delete().catch(() => { });
          await delay(300);
        }
      }
    }
  } catch (error) {
    console.warn(
      `[Fila Service] Falha ao limpar mensagens em ${channel.name}: ${error.message}`
    );
  }
}

function getButtonConfig(label, modoId, valorId, configTimestamp) {
  const info = BUTTON_MAP[label] || {
    emoji: Emojis.espada || "📌",
    style: ButtonStyle.Secondary,
    action: "CS",
  };
  const acao = info.action;

  let suffix = "";
  if (acao === "CS") {
    suffix = `:${label.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5)}`;
  }

  const customId = `${acao}:${valorId}:${modoId}:${configTimestamp}${suffix}`;

  return {
    label,
    emoji: info.emoji,
    style: info.style,
    customId,
    isJoin: label === "Entrar na Fila",
  };
}

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value
  );

async function createFilaInterfaces(client, guildId, targetModalityId = null) {
  let sucesso = 0;
  let erros = [];

  await setLock(guildId);
  await setGuildInterfaceLock(guildId);

  try {
    try {
      if (targetModalityId)
        await clearModalityQueues(guildId, targetModalityId);
      else await clearAllGuildQueues(guildId);
    } catch (cacheError) { }

    try {
      await clearPlayerMatchCounts(guildId);
    } catch (e) { }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      erros.push("Falha crítica: Guild não encontrado no cache.");
      return { sucesso, erros };
    }

    const allModalidadesConfigs = await getFilaConfig(guildId);
    const configsGerais = await getGeraisConfig(guildId);
    const serverConfig = await getServerConfig(guildId, guild.name);

    if (!allModalidadesConfigs || !configsGerais || !serverConfig) {
      erros.push("Falha: Configurações não encontradas.");
      return { sucesso, erros };
    }

    const allModalidades = allModalidadesConfigs.modalidades;
    const configTimestamp = new Date(serverConfig.createdAt).getTime();

    let modalitiesToProcess = targetModalityId
      ? allModalidades.filter((m) => m.id === targetModalityId)
      : allModalidades;

    if (modalitiesToProcess.length === 0 && targetModalityId)
      erros.push(`Modalidade ${targetModalityId} não encontrada.`);

    for (const modo of modalitiesToProcess) {
      if (!client.guilds.cache.has(guildId)) {
        erros.push("Processo abortado: O bot foi removido do servidor.");
        break;
      }

      if (!modo.ativo || !modo.canalId || modo.valores.length === 0) continue;

      let canal;
      try {
        canal = await client.channels.fetch(modo.canalId).catch(() => null);
      } catch (err) {
        erros.push(
          `Modalidade ${modo.nome}: Canal inacessível ou bot sem permissão.`
        );
        continue;
      }

      if (!canal) {
        erros.push(`Modalidade ${modo.nome}: Canal não encontrado.`);
        continue;
      }

      await cleanOldFilaMessages(canal, client);
      const valoresOrdenados = (modo.valores || []).sort((a, b) => b - a);

      for (const valor of valoresOrdenados) {
        if (!client.guilds.cache.has(guildId)) break;

        try {
          const valorFormatado = formatCurrency(valor);
          const valorId = valor.toFixed(2);

          let description =
            modo.templateDescription || "Descrição não definida.";
          description = description
            .replace(/\[\[modo_jogo\]\]/g, modo.nome)
            .replace(/\[\[valor_partida\]\]/g, valorFormatado)
            .replace(/\[\[jogadores_fila\]\]/g, "Nenhum jogador na fila");

          const interfaceEmbed = new EmbedBuilder()
            .setColor(modo.templateColor || process.env.botcolor)
            .setDescription(description)
            .setThumbnail(modo.templateAvatarUrl);

          if (modo.templateFooter) {
            interfaceEmbed.setFooter({
              text: modo.templateFooter.replace(
                /\[\[modo_jogo\]\]/g,
                modo.nome
              ),
              iconURL: modo.templateFooterIconUrl || null,
            });
          } else {
            interfaceEmbed.setFooter({
              text: process.env.DEFAULT_FOOTER_TEXT,
              iconURL: null,
            });
          }

          const actionButtonsRow = new ActionRowBuilder();

          const rawButtons = modo.botoes || [];
          const uniqueButtons = [...new Set(rawButtons)];

          const joinLabel = "Entrar na Fila";
          const leaveLabel = "Sair da Fila";

          const otherButtons = uniqueButtons.filter(
            (l) => l !== joinLabel && l !== leaveLabel
          );

          const finalButtonOrder = [];
          if (uniqueButtons.includes(joinLabel))
            finalButtonOrder.push(joinLabel);

          finalButtonOrder.push(...otherButtons);

          finalButtonOrder.push(leaveLabel);

          const usedCustomIds = new Set();

          finalButtonOrder.slice(0, 5).forEach((label) => {
            const btn = getButtonConfig(
              label,
              modo.id,
              valorId,
              configTimestamp
            );

            if (usedCustomIds.has(btn.customId)) return;
            usedCustomIds.add(btn.customId);

            actionButtonsRow.addComponents(
              new ButtonBuilder()
                .setCustomId(btn.customId)
                .setLabel(btn.label)
                .setEmoji(btn.emoji)
                .setStyle(btn.style)
            );
          });

          await canal.send({
            embeds: [interfaceEmbed],
            components: [actionButtonsRow],
          });
          await delay(SEND_DELAY_MS);
          sucesso++;
        } catch (error) {
          if (
            error.code === 50001 ||
            error.code === 10003 ||
            error.message.includes("Missing Access")
          ) {
            erros.push(`Erro Crítico: Perda de acesso ao servidor/canal.`);
            break;
          }

          erros.push(`Modalidade ${modo.nome}: Erro de envio.`);
          if (error.message.includes("other side closed")) return;
          if (error.code === 50035) return;
          if (error.code === 50013) return;
          console.error(`Erro fila ${modo.nome}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`ERRO CRÍTICO FILA:`, error);
    erros.push(`Erro Crítico: ${error.message}`);
  } finally {
    await releaseGuildInterfaceLock(guildId);
    await releaseLock();
  }

  return { sucesso, erros };
}

module.exports = { createFilaInterfaces };