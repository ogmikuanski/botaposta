const {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  MessageFlags,
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
    .setName("avatar")
    .setDescription("Mostra o avatar de um usuário ou o seu próprio.")
    .addUserOption((opt) =>
      opt
        .setName("usuario")
        .setDescription("O usuário que você quer ver o avatar (opcional).")
        .setRequired(false)
    ),

  execute: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.warn(`[avatar] Falha ao deferir: ${e.message}`);
      return;
    }

    try {
      const userIsDev = await isDev(interaction.user.id);
      const userIsOnEquipe = ownerIdSet.has(interaction.user.id) || userIsDev;

      if (!userIsOnEquipe) {
        const maintenance = await isMaintenanceMode();
        if (maintenance) {
          return interaction
            .editReply({
              content: "",
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Yellow)
                  .setDescription(
                    `- ${Emojis.verifybot || "🤖"
                    } ${process.env.MSGMANUTENCAO}`
                  )
                  .setFooter({
                    text: client.user.username,
                    iconURL:
                      client.user.displayAvatarURL() || undefined
                        ? process.env.DEFAULT_FOOTER_ICON
                        : undefined,
                  }),
              ],
            })
            .then((msg) =>
              setTimeout(() => msg.delete().catch(() => { }), 5000)
            );
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

        const server = await getServerConfig(
          interaction.guild.id,
          interaction.guild.name
        );
        const remaining = await getRemainingCooldown(
          interaction.guild.id,
          interaction.user.id,
          module.exports.data.name
        );
        if (remaining > 0) {
          return interaction
            .editReply({
              content: `## ${Emojis.aviso
                } Calma aí!\n- Você precisa esperar **${remaining.toFixed(
                  1
                )}s**.`,
            })
            .then((msg) =>
              setTimeout(() => msg.delete().catch(() => { }), 5000)
            );
        }
        await setCooldown(
          interaction.guild.id,
          interaction.user.id,
          module.exports.data.name,
          server.cooldown || 5
        );
      }

      const targetUser =
        interaction.options.getUser("usuario") || interaction.user;

      const avatarURL = targetUser.displayAvatarURL({
        dynamic: true,
        size: 1024,
      });

      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Blue)
        .setImage(avatarURL)
        .setDescription(`> Clique [aqui](${avatarURL}) para baixar a imagem.`);

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(`Erro no /${module.exports.data.name}:`, err);
      const errorEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(process.env.MSGERROBOT);

      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({ embeds: [errorEmbed], content: "" })
          .then((msg) => setTimeout(() => msg.delete().catch(() => { }), 5000))
          .catch(() => { });
      }
    }
  },
};
