const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const FilaConfig = require("../../database/models/FilaConfig");
const { isBlacklisted } = require("../../manager/blacklistManager");
const Emojis = require("../../Emojis.json");

module.exports = {
  autocomplete: async (interaction) => {
    if (interaction.options.getSubcommand() !== "modalidade") {
      return interaction.respond([]);
    }
    try {
      const focusedValue = interaction.options.getFocused();
      const [filaConfigs] = await FilaConfig.findOrCreate({
        where: { guildId: interaction.guild.id },
      });
      const modalities = filaConfigs.modalidades || [];
      const filtered = modalities.filter((modo) =>
        modo.nome.toLowerCase().startsWith(focusedValue.toLowerCase())
      );
      await interaction.respond(
        filtered
          .map((modo) => ({ name: modo.nome, value: modo.id }))
          .slice(0, 25)
      );
    } catch (error) {
      if (error.code === 10062) {
        await interaction.respond([]);
        return;
      }
      console.error("Erro no autocomplete de /resetar modalidade:", error);
      await interaction.respond([]);
    }
  },

  data: new SlashCommandBuilder()
    .setName("resetar")
    .setDescription("Recria as interfaces de fila do servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("filas")
        .setDescription("Recria TODAS as interfaces de fila ativas.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("modalidade")
        .setDescription("Recria a interface de UMA modalidade específica.")
        .addStringOption((opt) =>
          opt
            .setName("modalidade")
            .setDescription("Selecione a modalidade para recriar")
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  execute: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      if (e.code === 10062) return;
      console.warn(`[resetar] Falha ao deferir: ${e}`);
      return;
    }

    const userBlocked = await isBlacklisted(interaction.user.id, "user");
    if (userBlocked) {
      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
        .setDescription(
          process.env.MSGBLACKLISTMEMBERBOT
        )
        .setFooter({
          text: client.user.username,
          iconURL: client.user.displayAvatarURL(),
        });

      return interaction.editReply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildBlocked = await isBlacklisted(interaction.guild.id, "guild");
    if (guildBlocked) {
      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
        .setDescription(
          process.env.MSGBLACKLISTSERVIDORBOT
        )
        .setFooter({
          text: client.user.username,
          iconURL: client.user.displayAvatarURL(),
        });

      return interaction.editReply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      const row = new ActionRowBuilder();
      let confirmationText = "";

      if (subcommand === "modalidade") {
        const modalityId = interaction.options.getString("modalidade");
        const [filaConfigs] = await FilaConfig.findOrCreate({
          where: { guildId },
        });
        const modo = filaConfigs.modalidades.find((m) => m.id === modalityId);

        if (!modo) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `### ${Emojis.circlecross || "❌"
                  } Modalidade não encontrada. O ID selecionado pode ser inválido.`
                ),
            ],
          });
        }

        confirmationText = `## **ATENÇÃO, Administrador!**\n\nVocê está prestes a recriar as interfaces da modalidade **${modo.nome}**.\n\nIsso irá:\n1. Deletar as interfaces antigas no canal <#${modo.canalId}>.\n2. Criar novas interfaces para esta modalidade.\n3. Resetar a fila de jogadores (apenas desta modalidade).\n\nTem certeza?`;

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_reset:${modalityId}`)
            .setLabel(`Sim, recriar ${modo.nome}`)
            .setStyle(ButtonStyle.Danger)
            .setEmoji(Emojis.aviso || "⚠️")
        );
      } else if (subcommand === "filas") {
        confirmationText = ` ## **ATENÇÃO, Administrador!**\n\nVocê está prestes a recriar **TODAS** as interfaces de fila ativas.\n\nIsso irá:\n1. Deletar as interfaces antigas nos canais.\n2. Criar novas interfaces (pode levar alguns segundos).\n3. Resetar as filas de jogadores atuais.\n\nTem certeza que deseja continuar?`;

        row.addComponents(
          new ButtonBuilder()
            .setCustomId("confirm_reset:all")
            .setLabel("Sim, recriar TUDO")
            .setStyle(ButtonStyle.Danger)
            .setEmoji(Emojis.aviso || "⚠️")
        );
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId("cancel_action")
          .setLabel("Cancelar")
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Blue)
            .setDescription(confirmationText),
        ],
        components: [row],
      });
    } catch (err) {
      console.error(`Erro ao executar /resetar ${subcommand}:`, err);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(process.env.MSGERROBOT),
        ],
      });
    }
  },
};
