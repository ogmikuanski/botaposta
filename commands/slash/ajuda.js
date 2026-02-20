const {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  PermissionFlagsBits,
  MessageFlags,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const Emojis = require("../../Emojis.json");
const { isDev } = require("../../manager/devManager");
const CargosConfig = require("../../database/models/CargosConfig");
const {
  COMMAND_CATEGORIES,
} = require("../../components/Components/helpCommandHelper");
const { getServerConfig } = require("../../manager/configManager");
const { isBlacklisted } = require("../../manager/blacklistManager");
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
    .setName("ajuda")
    .setDescription("Mostra a lista de todos os comandos."),

  execute: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      if (e.code === 10062) return;
      console.warn(`[ajuda] Falha ao deferir: ${e}`);
      return;
    }

    try {
      const userIsDev = await isDev(interaction.user.id);
      const userIsOnEquipe = ownerIdSet.has(interaction.user.id) || userIsDev;

      if (!userIsOnEquipe) {
        const maintenance = await isMaintenanceMode();
        if (maintenance) {
          return interaction.editReply({
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
          });
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

        const serverConfig = await getServerConfig(
          interaction.guild.id,
          interaction.guild.name
        );
        const remaining = await getRemainingCooldown(
          interaction.guild.id,
          interaction.user.id,
          module.exports.data.name
        );
        if (remaining > 0) {
          return interaction.editReply({
            content: ``,
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `### ${Emojis.aviso || "❓"
                  } Calma aí!\n- Você precisa esperar **${remaining.toFixed(
                    1
                  )} Segundos**.`
                ),
            ],
          });
        }
        await setCooldown(
          interaction.guild.id,
          interaction.user.id,
          module.exports.data.name,
          serverConfig.cooldown || 5
        );
      }

      const userIsDiscordAdmin = interaction.member.permissions.has(
        PermissionFlagsBits.Administrator
      );

      const [cargosConfig, server] = await Promise.all([
        CargosConfig.findOrCreate({ where: { guildId: interaction.guild.id } }),
        getServerConfig(interaction.guild.id, interaction.guild.name),
      ]);

      const prefix = server.prefix || process.env.DISCORD_PREFIX || ".";
      const permMaxRoleId = cargosConfig[0].cargoPermMaxId;
      const userIsBotAdmin =
        permMaxRoleId && interaction.member.roles.cache.has(permMaxRoleId);

      const selectOptions = [
        {
          label: "Início",
          description: "Voltar para a página principal da ajuda.",
          value: "ajuda_home",
          emoji: Emojis.verifybot || "🏠",
        },
      ];

      selectOptions.push({
        label: COMMAND_CATEGORIES.publico.label,
        description: "Comandos disponíveis para todos os usuários.",
        value: "ajuda_publico",
        emoji: COMMAND_CATEGORIES.publico.emoji,
      });

      if (userIsDiscordAdmin) {
        selectOptions.push({
          label: COMMAND_CATEGORIES.moderador.label,
          description: "Comandos de moderação do servidor.",
          value: "ajuda_moderador",
          emoji: COMMAND_CATEGORIES.moderador.emoji,
        });
      }

      if (userIsBotAdmin) {
        selectOptions.push({
          label: COMMAND_CATEGORIES.admin.label,
          description: "Comandos de configuração do bot.",
          value: "ajuda_admin",
          emoji: COMMAND_CATEGORIES.admin.emoji,
        });
      }

      if (userIsDev) {
        selectOptions.push({
          label: COMMAND_CATEGORIES.developer.label,
          description: "Comandos de manutenção do bot.",
          value: "ajuda_developer",
          emoji: COMMAND_CATEGORIES.developer.emoji,
        });
      }

      const homeEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Blue)
        .setDescription(`### ${Emojis.livro || "📖"} Central de Ajuda `)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .addFields({
          name: "Comandos de Prefixo",
          value: `Para ver os comandos antigos (prefixo), use o comando \`${prefix}help\`.`,
        })
        .setFooter({
          text: interaction.guild.name,
          iconURL: interaction.guild.iconURL(),
        });

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ajuda_select_menu")
          .setPlaceholder("Selecione uma categoria...")
          .setOptions(selectOptions)
      );

      await interaction.editReply({
        embeds: [homeEmbed],
        components: [row],
      });
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
