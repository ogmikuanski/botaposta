const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  Colors,
} = require("discord.js");
const Emojis = require("../../Emojis.json");
const { getServerConfig } = require("../../manager/configManager");
const { isBlacklisted } = require("../../manager/blacklistManager");
const { isDev } = require("../../manager/devManager");
const {
  isMaintenanceMode,
  getRemainingCooldown,
  setCooldown,
} = require("../../utils/cache");
const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("limpar")
    .setDescription("Apaga uma quantidade de mensagens no canal atual.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt
        .setName("quantidade")
        .setDescription("O número de mensagens para apagar.")
        .setRequired(true)
        .setMinValue(2)
        .setMaxValue(100)
    )
    .addUserOption((opt) =>
      opt
        .setName("usuario")
        .setDescription("Apaga mensagens apenas deste usuário.")
        .setRequired(false)
    ),

  execute: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      if (e.code === 10062) return;
      console.warn(`[clear] Falha ao deferir: ${e.message}`);
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
      const amount = interaction.options.getInteger("quantidade");
      const targetUser = interaction.options.getUser("usuario");
      const channel = interaction.channel;

      try {
        const messages = await channel.messages.fetch({ limit: amount });
        let messagesToDelete;

        if (targetUser) {
          messagesToDelete = messages.filter(
            (msg) => msg.author.id === targetUser.id
          );
        } else {
          messagesToDelete = messages;
        }

        if (messagesToDelete.size === 0) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Yellow)
                .setDescription(
                  `### ${Emojis.aviso || "⚠️"
                  } Nenhuma mensagem encontrada para apagar (ou são muito antigas).`
                ),
            ],
          });
        }

        const deletedMessages = await channel.bulkDelete(
          messagesToDelete,
          true
        );

        const replyEmbed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Green)
          .setDescription(
            `### ${Emojis.check || "✅"} Sucesso!\n- **${deletedMessages.size
            }** mensagens foram apagadas.`
          );

        if (targetUser) {
          replyEmbed.setDescription(
            `### ${Emojis.check || "✅"} Sucesso!\n- **${deletedMessages.size
            }** mensagens de ${targetUser.tag} foram apagadas.`
          );
        }

        await interaction.editReply({ embeds: [replyEmbed] });
      } catch (err) { }
    } catch (err) {
      console.error(`Erro no /${module.exports.data.name}:`, err);
      const errorEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(process.env.MSGERROBOT);

      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({ embeds: [errorEmbed], content: "" })
          .catch(() => { });
      }
    }
  },
};
