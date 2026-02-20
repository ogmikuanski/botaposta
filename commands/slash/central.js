const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  Colors,
} = require("discord.js");
const { createCentralEmbed } = require("../../components/Embeds/centralEmbed");
const {
  createCentralButtons,
} = require("../../components/Components/centralMenu");
const CargosConfig = require("../../database/models/CargosConfig");
const Server = require("../../database/models/server");
const { isDev } = require("../../manager/devManager");
const { isBlacklisted } = require("../../manager/blacklistManager");
const Emojis = require("../../Emojis.json");
const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("central")
    .setDescription("Abre o painel central com todas as opções do bot."),

  execute: async (interaction) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      return;
    }

    const userBlocked = await isBlacklisted(interaction.user.id, "user");
    if (userBlocked) {
      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
        .setDescription(process.env.MSGBLACKLISTMEMBERBOT || "Você está na blacklist.")
        .setFooter({
          text: interaction.client.user.username,
          iconURL: interaction.client.user.displayAvatarURL(),
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
        .setDescription(process.env.MSGBLACKLISTSERVIDORBOT || "Servidor na blacklist.")
        .setFooter({
          text: interaction.client.user.username,
          iconURL: interaction.client.user.displayAvatarURL(),
        });

      return interaction.editReply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const { member, user, guild } = interaction;

      await Server.findOrCreate({
        where: { guildId: guild.id },
        defaults: { guildName: guild.name }
      });

      if (member.id === guild.ownerId) {
      } else {
        const userIsDev = await isDev(user.id);
        if (ownerIdSet.has(user.id) || userIsDev) {
        } else {
          const [cargosConfig] = await CargosConfig.findOrCreate({
            where: { guildId: guild.id },
          });
          const permMaxRoleId = cargosConfig.cargoPermMaxId;

          if (permMaxRoleId && member.roles.cache.has(permMaxRoleId)) {
          } else {
            let errorMessage;
            if (permMaxRoleId) {
              errorMessage = `### ${Emojis.circlecross || "❌"} Sem Permissão!\n- Apenas usuários com o cargo <@&${permMaxRoleId}> (Permissão Máxima) podem acessar a central de configurações.`;
            } else {
              errorMessage = `### ${Emojis.circlecross || "❌"} Sem Permissão!\n- O cargo de "Permissão Máxima" não foi configurado.\n- Apenas o Dono do Servidor (<@${guild.ownerId}>) pode acessar a central de configurações.`;
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

      const embed = createCentralEmbed(interaction);
      const components = createCentralButtons();

      await interaction.editReply({
        embeds: [embed],
        components: components,
      });
    } catch (err) {
      console.error("Erro no /central:", err);
      await interaction.editReply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(process.env.MSGERROBOT || "Erro interno."),
        ],
      });
    }
  },
};