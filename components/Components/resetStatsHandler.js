const {
  EmbedBuilder,
  Colors,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const PlayerProfile = require("../../database/models/PlayerProfile");
const MediatorStats = require("../../database/models/MediatorStats");
const Emojis = require("../../Emojis.json");

module.exports = {
  confirm_reset_stats: async (interaction, client) => {
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } Apenas administradores podem confirmar esta ação.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const [action, target] = interaction.customId.split(":");

    await interaction.update({
      content: `### ${Emojis.loading || "🔄"
        } Processando...\n- Apagando registros. Isso pode levar um momento.`,
      embeds: [],
      components: [],
    });

    let count = 0;
    let targetName = "";
    const guildId = interaction.guild.id;

    try {
      if (target === "perfis") {
        targetName = "Perfis de Jogadores";
        const result = await PlayerProfile.destroy({ where: { guildId } });
        count = result;
      } else if (target === "mediadores") {
        targetName = "Estatísticas de Mediadores";
        const result = await MediatorStats.destroy({ where: { guildId } });
        count = result;
      } else {
        throw new Error("Alvo de reset desconhecido.");
      }

      await interaction.editReply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `## ${Emojis.check || "✅"
              } Sucesso!\n- **${count}** registros de **${targetName}** foram permanentemente apagados do servidor.`
            ),
        ],
        components: [],
      });
    } catch (err) {
      console.error(`[ResetStats] Falha ao apagar dados (${target}):`, err);
      await interaction.editReply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              process.env.MSGERROBOT || `## ${Emojis.circlecross || "❌"} Falha!\n- Ocorreu um erro ao tentar apagar os registros de **${targetName}**.\n- \`${err.message}\``
            ),
        ],
        components: [],
      });
    }
  },
};
