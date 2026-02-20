const {
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  Colors,
} = require("discord.js");
const { createFilaInterfaces } = require("../../services/filaService");
const Emojis = require("../../Emojis.json");

module.exports = {
  confirm_reset: async (interaction, client) => {
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: "Apenas administradores podem confirmar esta ação.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.customId.split(":")[1];

    try {
      await interaction.update({
        content: `### ${Emojis.loading || "🔄"} Processando...\n- Recriando interfaces de fila. Isso pode levar alguns minutos ou segundos.`,
        embeds: [],
        components: [],
      });
    } catch (error) {
      if (error.code === 10008) return;
      throw error;
    }

    const targetModalityId = target === "all" ? null : target;

    const { sucesso, erros } = await createFilaInterfaces(
      client,
      interaction.guild.id,
      targetModalityId
    );

    let resposta = `${Emojis.check || "✅"} **${sucesso} Interfaces** de fila foram criadas/atualizadas.`;

    if (erros.length > 0) {
      resposta += `\n\n${Emojis.circlecross || "❌"} **Erros (${erros.length}):**\n- ${erros.join("\n- ")}`;
      resposta += `\n\n*-# Verifique se o bot tem permissão de 'Enviar Mensagens' nos canais definidos.*`;
    }

    try {
      await interaction.editReply({ content: resposta, embeds: [] });
    } catch (error) {
      if (error.code !== 10008) return;
    }
  },

  cancel_action: async (interaction) => {
    try {
      await interaction.update({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(`${Emojis.check} Ação Cancelada.`),
        ],
        components: [],
      });
    } catch (error) {
      if (error.code !== 10008) return;
    }
  },
};