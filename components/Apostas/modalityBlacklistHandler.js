const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  Colors,
  MessageFlags,
} = require("discord.js");
const ModalityBlacklist = require("../../database/models/ModalityBlacklist");
const { Op } = require("sequelize");
const Emojis = require("../../Emojis.json");

async function handleServiceError(error, interaction) {
  console.error(`[blacklistHandler] Erro:`, error);
  const errorEmbed = new EmbedBuilder()
    .setColor(process.env.botcolor || Colors.Red)
    .setDescription(process.env.MSGERROBOT);

  try {
    if (interaction.replied || interaction.deferred) {
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

function applyBlacklistFooter(embed, interaction) {
  const config = process.env.BOT_MARCACOES_INTERFACES;
  if (config === "true") {
    embed.setFooter({
      text: process.env.DEFAULT_FOOTER_TEXT,
      iconURL: process.env.DEFAULT_FOOTER_ICON || null,
    });
  } else if (config === "false") {
    const guild = interaction.guild;
    if (guild) {
      embed.setFooter({
        text: guild.name,
        iconURL: guild.iconURL({ dynamic: true }) || null,
      });
    }
  }
  return embed;
}

module.exports = {
  search_modality_blacklist: async (interaction, client) => {
    try {
      const modal = new ModalBuilder()
        .setCustomId("submit_modality_blacklist_search")
        .setTitle("Pesquisar na Blacklist");

      const idInput = new TextInputBuilder()
        .setCustomId("id_input")
        .setLabel("ID Discord ou ID do Jogo")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Digite aqui...")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(idInput));
      await interaction.showModal(modal);
    } catch (err) {
      await handleServiceError(err, interaction);
    }
  },

  submit_modality_blacklist_search: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const idUnico = interaction.fields.getTextInputValue("id_input");

      if (!/^[0-9]+$/.test(idUnico)) {
        const embed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Red)
          .setDescription(
            `### ${Emojis.circlecross} ID Inválido!\n- Apenas números.`
          );
        applyBlacklistFooter(embed, interaction);
        return interaction.editReply({ embeds: [embed] });
      }

      const results = await ModalityBlacklist.findAll({
        where: {
          guildId: interaction.guild.id,
          [Op.or]: [{ userId: idUnico }, { gameId: idUnico }],
          isActive: true,
        },
      });

      if (results.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle("Nada Encontrado")
          .setColor(process.env.botcolor || Colors.Green)
          .setDescription(
            `${Emojis.check} O ID \`${idUnico}\` não está na Blacklist.`
          )
          .setTimestamp();
        applyBlacklistFooter(embed, interaction);
        return interaction.editReply({ embeds: [embed] });
      }

      for (const entry of results) {
        const embed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Red)
          .setDescription(`## ${Emojis.bloqueado || "🚨"} REGISTRO ENCONTRADO`)
          .setTimestamp()
          .addFields(
            {
              name: "Jogador",
              value: `<@${entry.userId}> (\`${entry.userId}\`)`,
            },
            { name: "ID do Jogo", value: `\`${entry.gameId}\`` },
            { name: "Motivo", value: entry.reason },
            { name: "Adicionado por", value: `<@${entry.addedByStaffId}>` }
          );

        if (entry.proofUrl)
          embed.addFields({
            name: "Provas",
            value: `[Ver Link](${entry.proofUrl})`,
          });

        applyBlacklistFooter(embed, interaction);

        if (interaction.replied)
          await interaction.followUp({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
        else
          await interaction.editReply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (err) {
      await handleServiceError(err, interaction);
    }
  },
};
