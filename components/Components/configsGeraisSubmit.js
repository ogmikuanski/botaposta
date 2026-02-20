const { EmbedBuilder, MessageFlags, Colors } = require("discord.js");
const ConfigsGerais = require("../../database/models/ConfigsGerais");
const { createConfigsGeraisEmbed } = require("../Embeds/configsGeraisEmbed");
const Emojis = require("../../Emojis.json");

const parseCurrency = (value) => {
  if (!value) return null;
  const cleanValue = parseFloat(
    value.replace(",", ".").replace(/[^0-9.]/g, "")
  );
  if (isNaN(cleanValue) || cleanValue < 0) {
    return null;
  }
  return cleanValue;
};

module.exports = {
  select_canal_apostados_submit: async (interaction) => {
    try {
      await interaction.deferUpdate();
      const channelId = interaction.values[0];

      const targetChannel = interaction.guild.channels.cache.get(channelId);

      if (targetChannel && targetChannel.name === "📩・system-labs") {
        const updatedEmbed = await createConfigsGeraisEmbed(interaction);

        await interaction.editReply({
          embeds: [updatedEmbed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await ConfigsGerais.update(
        { apostadosChannelId: channelId },
        {
          where: { guildId: interaction.guild.id },
          individualHooks: true,
        }
      );

      const updatedEmbed = await createConfigsGeraisEmbed(interaction);

      await interaction.editReply({
        embeds: [updatedEmbed],
        flags: MessageFlags.Ephemeral,
      });

    } catch (error) {
      if (error.code === 'UND_ERR_SOCKET' || error.name === 'SocketError') {
        console.warn(`[Rede] A conexão caiu ao configurar o canal (Apostados). O banco provavelmente salvou, mas o Discord não recebeu o retorno.`);

        try {
          await interaction.followUp({
            content: "⚠️ Houve uma oscilação na rede do bot, mas a configuração deve ter sido salva. Verifique se o canal mudou.",
            flags: MessageFlags.Ephemeral
          });
        } catch (e) {
        }

      } else {
        console.error("Erro em select_canal_apostados_submit:", error);

        try {
          await interaction.followUp({
            content: process.env.MSGERROBOT || "Ocorreu um erro ao processar sua solicitação.",
            flags: MessageFlags.Ephemeral
          });
        } catch (e) { }
      }
    }
  },

  modal_valorsala_submit: async (interaction) => {
    await interaction.deferUpdate();
    const valorInput = interaction.fields.getTextInputValue("valor_input");

    if (valorInput.length < 1 || valorInput.length > 4) {
      return interaction.followUp({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `${Emojis.circlecross}  Valor inválido. O valor deve ter no mínimo 1 e no máximo 4 caracteres (ex: \`0.5\` ou \`9.99\`).`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const novoValor = parseCurrency(valorInput);
    if (novoValor === null) {
      return interaction.followUp({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `${Emojis.circlecross}  Valor inválido. Por favor, use somente número positivo (ex: \`0.50\` ou \`0,50\`).`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await ConfigsGerais.update(
      { valorSala: novoValor },
      {
        where: { guildId: interaction.guild.id },
        individualHooks: true,
      }
    );
    const updatedEmbed = await createConfigsGeraisEmbed(interaction);
    await interaction.editReply({
      embeds: [updatedEmbed],
      flags: MessageFlags.Ephemeral,
    });
  },

  modal_valores_submit: async (interaction) => {
    await interaction.deferUpdate();
    const valoresInput = interaction.fields.getTextInputValue("valores_input");
    const linhas = valoresInput.split("\n");

    const novosValoresJSON = [];
    const erros = [];
    for (const linha of linhas) {
      if (linha.trim() === "") continue;
      const valor = parseCurrency(linha);

      if (valor === null) {
        erros.push(`Valor inválido: \`${linha}\`.`);
        continue;
      }
      novosValoresJSON.push(valor);
    }

    if (novosValoresJSON.some((v) => Number(v) === 0)) {
      erros.push("O valor `0` não é permitido.");
    }

    if (novosValoresJSON.length > 15) {
      erros.push(
        `Você só pode definir no máximo 15 valores. Você enviou ${novosValoresJSON.length}.`
      );
    }

    if (erros.length > 0) {
      return interaction.followUp({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `### ${Emojis.circlecross}  Valor inválido!\n- ${erros.join(
                "\n- "
              )}\n\n> Nenhuma alteração foi salva.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const valoresUnicos = [...new Set(novosValoresJSON)];
    await ConfigsGerais.update(
      { valoresApostados: valoresUnicos },
      {
        where: { guildId: interaction.guild.id },
        individualHooks: true,
      }
    );
    const updatedEmbed = await createConfigsGeraisEmbed(interaction);
    await interaction.editReply({
      embeds: [updatedEmbed],
      flags: MessageFlags.Ephemeral,
    });
  },

  toggle_mediator_assignment_gerais: async (interaction) => {
    await interaction.deferUpdate();
    const guildId = interaction.guild.id;

    const [configs] = await ConfigsGerais.findOrCreate({
      where: { guildId },
    });

    const novoStatus = !configs.assignMediatorOnMatchCreate;

    await ConfigsGerais.update(
      { assignMediatorOnMatchCreate: novoStatus },
      {
        where: { guildId },
        individualHooks: true,
      }
    );

    const updatedEmbed = await createConfigsGeraisEmbed(interaction);
    await interaction.editReply({
      embeds: [updatedEmbed],
      flags: MessageFlags.Ephemeral,
    });
  },
};
