const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  Colors,
  MessageFlags,
} = require("discord.js");
const FilaConfig = require("../../database/models/FilaConfig");
const { buildModalityPanel } = require("./filaConfigSubmit");
const Emojis = require("../../Emojis.json");

const { isDev } = require("../../manager/devManager");
const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

const isHttpsUrl = (url) => {
  if (!url || url.trim() === "") return true;
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:";
  } catch (e) {
    return false;
  }
};
const isHexColor = (hex) => {
  if (!hex || hex.trim() === "") return false;
  return /^#[0-9A-F]{6}$/i.test(hex);
};
const isValidFooterText = (text) => {
  if (!text || text.trim() === "") return true;
  if (text.length > 20) return false;
  return /^[A-Z0-9\s@_.,!?&()-]+$/i.test(text);
};

const getModalidades = async (guildId) => {
  const [configs] = await FilaConfig.findOrCreate({
    where: { guildId },
    defaults: { guildId },
  });
  return configs.modalidades;
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

module.exports = {
  editar_template_fila: async (interaction) => {
    const modeId = interaction.customId.split(":")[1];
    const [configs] = await FilaConfig.findOrCreate({
      where: { guildId: interaction.guild.id },
      defaults: { guildId: interaction.guild.id },
    });
    const modo = configs.modalidades.find((m) => m.id === modeId);
    if (!modo)
      return interaction.reply({
        content: "❌ Erro: Modalidade não encontrada.",
        flags: MessageFlags.Ephemeral,
      });

    const userIsDev = await isDev(interaction.user.id);
    const userIsStaff = ownerIdSet.has(interaction.user.id) || userIsDev;

    const modal = new ModalBuilder()
      .setCustomId(`modal_template_fila_submit:${modeId}`)
      .setTitle(`Editar Template: ${modo.nome}`);

    const descInput = new TextInputBuilder()
      .setCustomId("template_desc_input")
      .setLabel("ADICIONE A DESCRIÇÃO DO EMBED")
      .setStyle(TextInputStyle.Paragraph)
      .setValue(modo.templateDescription)
      .setRequired(true);

    const avatarInput = new TextInputBuilder()
      .setCustomId("template_avatar_input")
      .setLabel("ADICIONE A URL DO AVATAR (Thumbnail)")
      .setStyle(TextInputStyle.Short)
      .setValue(modo.templateAvatarUrl || "")
      .setRequired(false);

    const colorInput = new TextInputBuilder()
      .setCustomId("template_color_input")
      .setLabel("ADICIONE A COR (HEX: #e89b00)")
      .setStyle(TextInputStyle.Short)
      .setValue(modo.templateColor || "#5865F2")
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(avatarInput),
      new ActionRowBuilder().addComponents(colorInput)
    );

    if (userIsStaff) {
      const footerInput = new TextInputBuilder()
        .setCustomId("template_footer_input")
        .setLabel("TEXTO DO RODAPÉ (Staff Only)")
        .setStyle(TextInputStyle.Short)
        .setValue(modo.templateFooter || "")
        .setRequired(false);

      const footerIconInput = new TextInputBuilder()
        .setCustomId("template_footer_icon_input")
        .setLabel("URL ÍCONE DO RODAPÉ (Staff Only)")
        .setStyle(TextInputStyle.Short)
        .setValue(modo.templateFooterIconUrl || "")
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(footerInput),
        new ActionRowBuilder().addComponents(footerIconInput)
      );
    }

    await interaction.showModal(modal);
  },

  modal_template_fila_submit: async (interaction) => {
    const modeId = interaction.customId.split(":")[1];
    const guildId = interaction.guild.id;

    const userIsDev = await isDev(interaction.user.id);
    const userIsStaff = ownerIdSet.has(interaction.user.id) || userIsDev;

    const templateDescription = interaction.fields.getTextInputValue(
      "template_desc_input"
    );
    const templateAvatarUrl = interaction.fields.getTextInputValue(
      "template_avatar_input"
    );
    const templateColor = interaction.fields.getTextInputValue(
      "template_color_input"
    );

    let templateFooter;
    let templateFooterIconUrl;

    if (userIsStaff) {
      templateFooter = interaction.fields.getTextInputValue(
        "template_footer_input"
      );
      templateFooterIconUrl = interaction.fields.getTextInputValue(
        "template_footer_icon_input"
      );
    } else {
      templateFooter = null;
      templateFooterIconUrl = null;
    }

    const mandatoryErrors = [];
    const optionalErrors = [];
    const finalData = {};
    const modalidades = await getModalidades(guildId);
    const modoIndex = modalidades.findIndex((m) => m.id === modeId);
    if (modoIndex === -1) {
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `${Emojis.verifybot} Erro interno (Modalidade de template não encontrada).`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const modo = modalidades[modoIndex];
    if (
      !templateDescription.includes("[[modo_jogo]]") ||
      !templateDescription.includes("[[valor_partida]]") ||
      !templateDescription.includes("[[jogadores_fila]]")
    ) {
      mandatoryErrors.push(
        `- A **Descrição** é obrigatória e deve conter os parâmetros \`[[modo_jogo]]\`,\`[[valor_partida]]\` e \`[[jogadores_fila]]\`.`
      );
    } else {
      finalData.templateDescription = templateDescription;
    }

    if (!isHexColor(templateColor)) {
      mandatoryErrors.push(
        `- A **Cor** é obrigatória e deve ser um código HexColor válido (ex: \`#e89b00\`).`
      );
    } else {
      finalData.templateColor = templateColor;
    }

    if (mandatoryErrors.length > 0) {
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setTitle(`${Emojis.circlecross || "❌"} Erros de Validação`)
            .setDescription(
              "O template não foi salvo pelos seguintes motivos:\n\n" +
                mandatoryErrors.join("\n")
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();
    if (isHttpsUrl(templateAvatarUrl)) {
      finalData.templateAvatarUrl = templateAvatarUrl || null;
    } else {
      finalData.templateAvatarUrl = modo.templateAvatarUrl;
      if (templateAvatarUrl)
        optionalErrors.push(
          "- URL do Avatar inválida, antiga opção foi mantido."
        );
    }

    if (userIsStaff) {
      if (isValidFooterText(templateFooter)) {
        finalData.templateFooter = templateFooter || null;
      } else {
        finalData.templateFooter = modo.templateFooter;
        if (templateFooter)
          optionalErrors.push(
            "- Nome do Rodapé inválido (máx 20 chars, A-Z, 0-9, etc.), antiga opção foi mantido."
          );
      }

      if (isHttpsUrl(templateFooterIconUrl)) {
        finalData.templateFooterIconUrl = templateFooterIconUrl || null;
      } else {
        finalData.templateFooterIconUrl = modo.templateFooterIconUrl;
        if (templateFooterIconUrl)
          optionalErrors.push(
            "- URL do Ícone do Rodapé inválida (deve ser https://), antiga opção foi mantido."
          );
      }
    } else {
      finalData.templateFooter = null;
      finalData.templateFooterIconUrl = null;
    }

    let dataHasChanged = false;
    if (finalData.templateDescription !== modo.templateDescription)
      dataHasChanged = true;
    if (finalData.templateColor !== modo.templateColor) dataHasChanged = true;
    if (finalData.templateAvatarUrl !== modo.templateAvatarUrl)
      dataHasChanged = true;
    if (finalData.templateFooter !== modo.templateFooter) dataHasChanged = true;
    if (finalData.templateFooterIconUrl !== modo.templateFooterIconUrl)
      dataHasChanged = true;

    if (!dataHasChanged && optionalErrors.length === 0) {
      const panel = await buildModalityPanel(interaction, modeId);
      await interaction.editReply(panel);
      await interaction.followUp({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Yellow)
            .setDescription(
              `${Emojis.info || "ℹ️"} Nenhuma alteração foi detectada.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (dataHasChanged) {
      modalidades[modoIndex] = { ...modalidades[modoIndex], ...finalData };
      await setModalidades(guildId, modalidades);
    }

    const panel = await buildModalityPanel(interaction, modeId);
    await interaction.editReply(panel);
    if (dataHasChanged) {
      await interaction.followUp({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.check || "✅"} Template da modalidade \`${
                modo.nome
              }\` salvo com sucesso!`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (optionalErrors.length > 0) {
      await interaction.followUp({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Yellow)
            .setTitle(`${Emojis.circlecross || "⚠️"} Avisos de Validação`)
            .setDescription(
              "Alguns campos opcionais estavam inválidos e foram ignorados (mantendo os valores antigos):\n\n" +
                optionalErrors.join("\n")
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  visualizar_template_fila: async (interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guild.id;
    const modeId = interaction.customId.split(":")[1];

    const [configs] = await FilaConfig.findOrCreate({
      where: { guildId },
      defaults: { guildId },
    });
    const modo = configs.modalidades.find((m) => m.id === modeId);
    if (!modo) {
      return interaction.editReply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `### ${Emojis.verifybot} Erro: Modalidade não encontrada.`
            ),
        ],
      });
    }

    let description =
      modo.templateDescription ||
      "### Descrição padrão não definida.\nEdite o template!";
    const avatarUrl = modo.templateAvatarUrl || null;
    const color = modo.templateColor || Colors.NotQuiteBlack;

    const footerText = modo.templateFooter || process.env.DEFAULT_FOOTER_TEXT;
    const footerIcon =
      modo.templateFooterIconUrl || process.env.DEFAULT_FOOTER_ICON;

    const dummyValor = "R$ 1,00";
    const dummyJogadores = "<@" + interaction.user.id + ">";
    description = description.replace(/\[\[modo_jogo\]\]/g, modo.nome);
    description = description.replace(/\[\[valor_partida\]\]/g, dummyValor);
    description = description.replace(
      /\[\[jogadores_fila\]\]/g,
      dummyJogadores
    );

    const finalFooterText = modo.templateFooter
      ? footerText.replace(/\[\[modo_jogo\]\]/g, modo.nome)
      : footerText;

    const previewEmbed = new EmbedBuilder()
      .setColor(color)
      .setDescription(description)
      .setThumbnail(avatarUrl)
      .setFooter(
        finalFooterText ? { text: finalFooterText, iconURL: footerIcon } : null
      )
      .setTimestamp();
    await interaction.editReply({
      embeds: [previewEmbed],
    });
  },

  parametros_template_fila: async (interaction) => {
    await interaction.reply({
      content:
        "## PARÂMETROS OBRIGATÓRIOS:\n" +
        "- **[[modo_jogo]]**: `Responsável por informar o modo de jogo (1x1 Mobile, 2x2 Emulador e etc).`\n" +
        "- **[[valor_partida]]**: `Responsável por informar o valor das partidas.`\n" +
        "- **[[jogadores_fila]]**: `Responsável por informar os jogadores presentes na fila.`\n\n" +
        '-# *Todos os parâmetros, obrigatoriamente, tem que estar dentro das chaves " [[]] ", igual os exemplos a cima.*',
      embeds: [],
      flags: MessageFlags.Ephemeral,
    });
  },
};