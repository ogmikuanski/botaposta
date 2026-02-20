const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  Colors,
} = require("discord.js");
const FilaConfig = require("../../database/models/FilaConfig");
const ConfigsGerais = require("../../database/models/ConfigsGerais");
const { createFilaModalityEmbed } = require("../Embeds/filaModalityEmbed");
const Emojis = require("../../Emojis.json");
const { buildFilaPanel } = require("./filaConfigInteractions");
const {
  setGuildInterfaceLock,
  releaseGuildInterfaceLock,
} = require("../../utils/cache");

const getModalidades = async (guildId) => {
  const [configs] = await FilaConfig.findOrCreate({
    where: { guildId },
    defaults: { guildId },
  });
  return configs.modalidades;
};

const getGeraisConfigs = async (guildId) => {
  const [configs] = await ConfigsGerais.findOrCreate({
    where: { guildId },
    defaults: { guildId },
  });
  return configs;
};

const setModalidades = async (guildId, newModalidades) => {
  await FilaConfig.update(
    { modalidades: newModalidades },
    {
      where: { guildId },
      individualHooks: true,
    }
  );
};

async function toggleModalityMessages(client, modo, enable) {
  if (!modo.canalId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(modo.canalId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const messages = await channel.messages.fetch({ limit: 100 });
    const botMessages = messages.filter(
      (msg) => msg.author.id === client.user.id && msg.components.length > 0
    );
    for (const message of botMessages.values()) {
      const firstButton = message.components[0]?.components[0];
      if (!firstButton) continue;

      const customIdParts = firstButton.customId.split(":");
      const buttonModoId = customIdParts[2];
      if (buttonModoId === modo.id) {
        const newRows = [];
        for (const row of message.components) {
          const newRow = new ActionRowBuilder();
          for (const comp of row.components) {
            newRow.addComponents(ButtonBuilder.from(comp).setDisabled(!enable));
          }
          newRows.push(newRow);
        }

        if (newRows.length > 0) {
          await message.edit({ components: newRows });
        }
      }
    }
  } catch (err) { }
}

const defaultBotoes = [
  "Entrar na Fila",
  "Ump e Xm8",
  "Gelo Normal",
  "Gelo Infinito",
  "Mobile",
  "Mobilador",
  "Emulador",
  "Misto",
  "1 Emu",
  "2 Emu",
  "3 Emu",
];

const buildModalityPanel = async (interaction, modeId) => {
  const guildId = interaction.guild.id;
  const modalidades = await getModalidades(guildId);
  const geraisConfigs = await getGeraisConfigs(guildId);
  const modo = modalidades.find((m) => m.id === modeId);
  if (!modo) throw new Error(`Modalidade ${modeId} não encontrada.`);

  const valoresPermitidos = (geraisConfigs.valoresApostados || []).sort(
    (a, b) => a - b
  );
  const embed = createFilaModalityEmbed(modo);

  const templateButtonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`editar_template_fila:${modeId}`)
      .setLabel("Editar Template")
      .setEmoji(Emojis.TicketLog_RkBots || "📝")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("parametros_template_fila")
      .setLabel("Parâmetros")
      .setEmoji(Emojis.livro || "ℹ️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("voltar_systemfilasconfigs")
      .setLabel("Voltar")
      .setEmoji(Emojis.Voltar)
      .setStyle(ButtonStyle.Secondary)
  );
  const valoresMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`submit_fila_valores:${modeId}`)
      .setPlaceholder("Selecione os valores do apostado...")
      .setMinValues(0)
      .setMaxValues(valoresPermitidos.length || 1)
      .setOptions(
        valoresPermitidos.length > 0
          ? valoresPermitidos.map((v) => ({
            label: `R$ ${v.toFixed(2)}`,
            value: String(v),
            default: modo.valores.includes(v),
          }))
          : [
            {
              label: "Nenhum valor configurado",
              value: "null",
              default: false,
            },
          ]
      )
  );
  const botoesMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`submit_fila_botoes:${modeId}`)
      .setPlaceholder("Selecione as opções do apostado...")
      .setMinValues(1)
      .setMaxValues(4)
      .setOptions(
        defaultBotoes.map((b) => ({
          label: b,
          value: b,
          default: modo.botoes.includes(b),
        }))
      )
  );
  const channelMenu = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`submit_fila_canal:${modeId}`)
      .setPlaceholder("Selecione o canal que ficará essa modalidade")
      .addChannelTypes([ChannelType.GuildText])
      .setMinValues(1)
      .setMaxValues(1)
  );
  const actionButtonsFinal = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`submit_fila_toggle:${modeId}`)
      .setLabel(modo.ativo ? "Desativar" : "Ativar")
      .setEmoji(modo.ativo ? Emojis.BotOffline : Emojis.BotOnline)
      .setStyle(modo.ativo ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`submit_fila_exportar:${modeId}`)
      .setLabel("Importar")
      .setEmoji(Emojis.TicketLog_RkBots)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`visualizar_template_fila:${modeId}`)
      .setLabel("Visualizar")
      .setEmoji(Emojis.visualizar)
      .setStyle(ButtonStyle.Secondary)
  );
  return {
    embeds: [embed],
    components: [
      templateButtonsRow,
      valoresMenu,
      botoesMenu,
      channelMenu,
      actionButtonsFinal,
    ],
    flags: MessageFlags.Ephemeral,
  };
};

module.exports = {
  buildModalityPanel,

  set_fila_coins: async (interaction) => {
    const [config] = await FilaConfig.findOrCreate({
      where: { guildId: interaction.guild.id },
      defaults: { guildId: interaction.guild.id },
    });

    const modal = new ModalBuilder()
      .setCustomId("submit_fila_coins_modal")
      .setTitle("Configurar Recompensa de Coins");

    const winnerInput = new TextInputBuilder()
      .setCustomId("coins_winner_input")
      .setLabel("Coins para o VENCEDOR")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Ex: 10")
      .setValue(String(config.coinsWinner || "0"))
      .setRequired(true);

    const loserInput = new TextInputBuilder()
      .setCustomId("coins_loser_input")
      .setLabel("Coins para o PERDEDOR")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Ex: 2")
      .setValue(String(config.coinsLoser || "0"))
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(winnerInput),
      new ActionRowBuilder().addComponents(loserInput)
    );

    await interaction.showModal(modal);
  },

  submit_fila_coins_modal: async (interaction) => {
    await interaction.deferUpdate();

    const rawWinner =
      interaction.fields.getTextInputValue("coins_winner_input");
    const rawLoser = interaction.fields.getTextInputValue("coins_loser_input");

    const coinsWinner = parseInt(rawWinner);
    const coinsLoser = parseInt(rawLoser);

    if (
      isNaN(coinsWinner) ||
      coinsWinner < 0 ||
      isNaN(coinsLoser) ||
      coinsLoser < 0
    ) {
      return interaction.followUp({
        content: `${Emojis.circlecross || "❌"
          } Valores inválidos! Por favor, insira apenas números inteiros positivos (0 ou maior).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await FilaConfig.update(
      {
        coinsWinner: coinsWinner,
        coinsLoser: coinsLoser,
      },
      {
        where: { guildId: interaction.guild.id },
        individualHooks: true,
      }
    );

    const { buildFilaPanel } = require("./filaConfigInteractions");
    const panel = await buildFilaPanel(interaction);
    await interaction.editReply(panel);
  },

  select_fila_modalidade_submit: async (interaction) => {
    const modeId = interaction.values[0];
    const panel = await buildModalityPanel(interaction, modeId);
    await interaction.update(panel);
  },

  submit_fila_valores: async (interaction) => {
    await interaction.deferUpdate();
    const modeId = interaction.customId.split(":")[1];
    const valoresSelecionados = interaction.values.map((v) => parseFloat(v));
    const modalidades = await getModalidades(interaction.guild.id);
    const modoIndex = modalidades.findIndex((m) => m.id === modeId);
    if (modoIndex === -1) return;

    modalidades[modoIndex].valores = valoresSelecionados;
    await setModalidades(interaction.guild.id, modalidades);
    const panel = await buildModalityPanel(interaction, modeId);
    await interaction.editReply(panel);
  },

  submit_fila_botoes: async (interaction) => {
    await interaction.deferUpdate();
    const modeId = interaction.customId.split(":")[1];
    const botoesSelecionados = interaction.values;

    const modalidades = await getModalidades(interaction.guild.id);
    const modoIndex = modalidades.findIndex((m) => m.id === modeId);
    if (modoIndex === -1) return;

    modalidades[modoIndex].botoes = botoesSelecionados;
    await setModalidades(interaction.guild.id, modalidades);
    const panel = await buildModalityPanel(interaction, modeId);
    await interaction.editReply(panel);
  },

  submit_fila_canal: async (interaction) => {
    await interaction.deferUpdate();
    const modeId = interaction.customId.split(":")[1];
    const novoCanalId = interaction.values[0];

    const channel = interaction.guild.channels.cache.get(novoCanalId) || await interaction.guild.channels.fetch(novoCanalId).catch(() => null);

    if (channel && channel.name === "📩・system-labs") {
      const panel = await buildModalityPanel(interaction, modeId);
      await interaction.editReply(panel);
      return;
    }

    const modalidades = await getModalidades(interaction.guild.id);
    const modoIndex = modalidades.findIndex((m) => m.id === modeId);
    if (modoIndex === -1) return;

    modalidades[modoIndex].canalId = novoCanalId;
    await setModalidades(interaction.guild.id, modalidades);
    const panel = await buildModalityPanel(interaction, modeId);
    await interaction.editReply(panel);
  },

  submit_fila_toggle: async (interaction) => {
    const client = interaction.client;
    const guildId = interaction.guild.id;
    const modeId = interaction.customId.split(":")[1];

    const lockAcquired = await setGuildInterfaceLock(guildId, 60);
    if (!lockAcquired) {
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Yellow)
            .setTitle(`${Emojis.aviso || "⚠️"} AÇÃO BLOQUEADA!`)
            .setDescription(
              `- ${Emojis.naoentendi} Há um processo em andamento de criação de interfaces, ativação ou desativação de modalidades neste servidor.\n> Por favor, aguarde a conclusão antes de iniciar uma nova ação.`
            )
            .setFooter({
              text: client.user.username,
              iconURL: client.user.displayAvatarURL(),
            }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();

    let waitMsg = null;

    try {
      const modalidades = await getModalidades(guildId);
      const modoIndex = modalidades.findIndex((m) => m.id === modeId);
      if (modoIndex === -1) return;

      const modo = modalidades[modoIndex];
      const novoStatus = !modo.ativo;
      modalidades[modoIndex].ativo = novoStatus;

      await setModalidades(guildId, modalidades);

      if (modo.canalId) {
        waitMsg = await interaction.editReply({
          content: ``,
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Yellow)
              .setDescription(
                `${Emojis.loading || "🔄"
                } Atualizando interfaces... Por favor, aguarde a conclusão.`
              )
              .setFooter({
                text: client.user.username,
                iconURL: client.user.displayAvatarURL(),
              }),
          ],
          components: [],
          flags: MessageFlags.Ephemeral,
        });
      }

      await toggleModalityMessages(client, modo, novoStatus);

      if (waitMsg) {
        await waitMsg.delete().catch(() => { });
      }

      const panel = await buildModalityPanel(interaction, modeId);
      await interaction.editReply(panel);
    } catch (err) {
      console.error("[submit_fila_toggle] Erro ao alternar modalidade:", err);

      if (waitMsg) {
        await waitMsg.delete().catch(() => { });
      }

      await interaction.followUp({
        content: process.env.MSGERROBOT || `${Emojis.circlecross || "❌"} Ocorreu um erro ao tentar ${!novoStatus ? "ativar" : "desativar"
          } a modalidade.`,
        flags: MessageFlags.Ephemeral,
      });
    } finally {
      await releaseGuildInterfaceLock(guildId);
    }
  },

  submit_fila_exportar: async (interaction) => {
    const targetModeId = interaction.customId.split(":")[1];
    const modal = new ModalBuilder()
      .setCustomId(`modal_fila_exportar_submit:${targetModeId}`)
      .setTitle("Importar Configurações");
    const nomeInput = new TextInputBuilder()
      .setCustomId("modalidade_nome_input")
      .setLabel("ADICIONE A MODALIDADE")
      .setPlaceholder("NOME EXATO da modalidade que você quer copiar")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(nomeInput));
    await interaction.showModal(modal);
  },

  modal_fila_exportar_submit: async (interaction) => {
    await interaction.deferUpdate();
    const targetModeId = interaction.customId.split(":")[1];
    const sourceModeName = interaction.fields.getTextInputValue(
      "modalidade_nome_input"
    );

    const modalidades = await getModalidades(interaction.guild.id);
    const sourceMode = modalidades.find(
      (m) => m.nome.toLowerCase() === sourceModeName.toLowerCase()
    );
    const targetModeIndex = modalidades.findIndex((m) => m.id === targetModeId);
    if (!sourceMode) {
      return interaction.followUp({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `${Emojis.circlecross} Modalidade "${sourceModeName}" não encontrada. Verifique se digitou o nome exatamente igual.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (targetModeIndex === -1) {
      return interaction.followUp({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `${Emojis.verifybot} Erro interno (Alvo não encontrado).`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sourceMode.id === targetModeId) {
      return interaction.followUp({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `${Emojis.verifybot} Você não pode importar as configurações da própria modalidade.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const originalCanalId = modalidades[targetModeIndex].canalId;
    const originalEmoji = modalidades[targetModeIndex].emoji;

    modalidades[targetModeIndex].valores = sourceMode.valores;
    modalidades[targetModeIndex].botoes = sourceMode.botoes;
    modalidades[targetModeIndex].ativo = sourceMode.ativo;

    modalidades[targetModeIndex].templateDescription =
      sourceMode.templateDescription;
    modalidades[targetModeIndex].templateAvatarUrl =
      sourceMode.templateAvatarUrl;
    modalidades[targetModeIndex].templateColor = sourceMode.templateColor;
    modalidades[targetModeIndex].templateFooter = sourceMode.templateFooter;
    modalidades[targetModeIndex].templateFooterIconUrl =
      sourceMode.templateFooterIconUrl;

    modalidades[targetModeIndex].canalId = originalCanalId;
    modalidades[targetModeIndex].emoji = originalEmoji;

    await setModalidades(interaction.guild.id, modalidades);
    const panel = await buildModalityPanel(interaction, targetModeId);
    await interaction.editReply(panel);
  },
};