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
const Emojis = require("../../Emojis.json");
const CargosConfig = require("../../database/models/CargosConfig");
const { isDev } = require("../../manager/devManager");
const { isBlacklisted } = require("../../manager/blacklistManager");
const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("restaurar")
    .setDescription("Reseta estatísticas do servidor .")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("perfis")
        .setDescription("Reseta TODOS os perfis de jogadores.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("mediadores")
        .setDescription("Reseta TODAS as estatísticas de mediação.")
    ),

  execute: async (interaction) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.warn(`[reset-stats] Falha ao deferir: ${e.message}`);
      return;
    }

    const userBlocked = await isBlacklisted(interaction.user.id, "user");
    if (userBlocked) {
      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
        .setDescription(
          process.env.MSGBLACKLISTMEMBERBOT
        );
      return interaction.editReply({ embeds: [embed] });
    }
    const guildBlocked = await isBlacklisted(interaction.guild.id, "guild");
    if (guildBlocked) {
      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
        .setDescription(
          process.env.MSGBLACKLISTSERVIDORBOT
        );
      return interaction.editReply({ embeds: [embed] });
    }

    try {
      const { member, user, guild } = interaction;

      if (member.id !== guild.ownerId) {
        const userIsDev = await isDev(user.id);
        if (!ownerIdSet.has(user.id) && !userIsDev) {
          const [cargosConfig] = await CargosConfig.findOrCreate({
            where: { guildId: guild.id },
          });
          const permMaxRoleId = cargosConfig.cargoPermMaxId;

          if (!permMaxRoleId || !member.roles.cache.has(permMaxRoleId)) {
            let errorMessage;
            if (permMaxRoleId) {
              errorMessage = `### ${Emojis.circlecross || "❌"
                } Sem Permissão!\n- Apenas usuários com o cargo <@&${permMaxRoleId}> (Permissão Máxima) podem usar este comando.`;
            } else {
              errorMessage = `### ${Emojis.circlecross || "❌"
                } Sem Permissão!\n- O cargo de "Permissão Máxima" não foi configurado.\n- Apenas o Dono do Servidor (<@${guild.ownerId
                }>) pode usar este comando.`;
            }
            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Red)
                  .setDescription(errorMessage),
              ],
            });
          }
        }
      }
    } catch (err) {
      console.error("Erro na checagem de permissão do /reset-stats:", err);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(process.env.MSGERROBOT),
        ],
      });
    }

    const subcommand = interaction.options.getSubcommand();
    let target, description, customId;

    if (subcommand === "perfis") {
      target = "Perfis de Jogadores";
      description =
        "Todos os dados de **Vitórias, Derrotas e Sequências** de todos os jogadores deste servidor serão apagados permanentemente.";
      customId = "confirm_reset_stats:perfis";
    } else if (subcommand === "mediadores") {
      target = "Estatísticas de Mediadores";
      description =
        "Todos os dados de **Partidas Mediadas** de todos os mediadores deste servidor serão apagados permanentemente.";
      customId = "confirm_reset_stats:mediadores";
    }

    const embed = new EmbedBuilder()
      .setTitle(`${Emojis.aviso || "⚠️"} ATENÇÃO, AÇÃO DESTRUTIVA!`)
      .setColor(process.env.botcolor || Colors.Red)
      .setDescription(
        `Você está prestes a resetar **${target}**.\n\n${description}\n\nIsso não pode ser desfeito. **Você tem certeza?**`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(`Sim, resetar ${target}!`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji(Emojis.Lixeira || "🗑️"),
      new ButtonBuilder()
        .setCustomId("cancel_action")
        .setLabel("Cancelar")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
