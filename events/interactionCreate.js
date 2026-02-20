const { Events, EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const Emojis = require("../Emojis.json");
const { isBlacklisted } = require("../manager/blacklistManager");
const { isMaintenanceMode, isGuildInterfaceLocked } = require("../utils/cache");
const { enforceGoldenRule } = require("../utils/adminCheck");
const SecurityManager = require("../manager/securityManager");
const { isDev } = require("../manager/devManager");

const { gerenciar_botoes_ranking } = require("../components/Apostas/perfilPanelHandler");
const { handleBroadcastInteraction, handleBroadcastModal } = require("../components/Broadcast/broadcastHandler");

const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

module.exports = {
  name: Events.InteractionCreate,
  execute: async (interaction, client) => {
    if (!interaction.guild || !interaction.user) return;

    try {
      if (!(await enforceGoldenRule(interaction.guild))) return;
      const security = new SecurityManager(interaction.client);
      await security.checkGuildIntegrity(interaction.guild);
    } catch (err) {
      console.error("[Security Check Error]", err);
    }

    if (interaction.isAutocomplete()) {
      const command = client.slashCommands.get(interaction.commandName);
      if (!command) {
        console.error(`[AutoComplete] Comando ${interaction.commandName} não encontrado.`);
        return;
      }
      if (command.autocomplete) {
        try {
          await command.autocomplete(interaction, client);
        } catch (err) {
          if (err.code === 10062) {
            await interaction.respond([]).catch(() => { });
            return;
          }
          console.error(`[AutoComplete] Erro: ${err}`);
          await interaction.respond([]).catch(() => { });
        }
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = client.slashCommands.get(interaction.commandName);
      if (!command) {
        console.warn(`Comando slash "${interaction.commandName}" não encontrado.`);
        return interaction.reply({
          content: "Esse comando não foi encontrado/carregado.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => { });
      }

      try {
        await command.execute(interaction, client);
      } catch (err) {
        if (err.code === 10062) return;
        console.error(`[InteractionCreate] Erro INESPERADO ao executar ${interaction.commandName}:`, err);

        const errorEmbed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Red)
          .setDescription(process.env.MSGERROBOT || "Ocorreu um erro interno.");

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => { });
        } else {
          await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => { });
        }
      }
      return;
    }

    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isModalSubmit() ||
      interaction.isChannelSelectMenu() ||
      interaction.isRoleSelectMenu()
    ) {

      if (interaction.isButton() && interaction.customId.startsWith("rank_")) {
        try {
          await gerenciar_botoes_ranking(interaction, client);
        } catch (err) {
          console.error("[Ranking Error]", err);
        }
        return;
      }

      if (interaction.customId.startsWith("broadcast_")) {
        try {
          if (interaction.isModalSubmit()) {
            await handleBroadcastModal(interaction, client);
          } else {
            await handleBroadcastInteraction(interaction, client);
          }
        } catch (err) {
          if (err.code === 10062) return;
          if (err.message.includes("Invalid Form Body")) return;
          console.error("[Broadcast Error]", err);
        }
        return;
      }

      try {
        const guildInterfaceLocked = await isGuildInterfaceLocked(interaction.guild.id);
        if (guildInterfaceLocked) {
          return interaction.reply({
            content: "",
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Yellow)
                .setTitle(`${Emojis.aviso || "⚠️"} AÇÃO BLOQUEADA!`)
                .setDescription(`- ${Emojis.naoentendi} Há um processo em andamento...\n> Por favor, aguarde a conclusão.`)
                .setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() }),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (err) {
        if (err.message.includes("Cannot read properties of null")) return;

        console.error(`[InteractionCreate] Erro check trava de processo geração:`, err);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: process.env.MSGERROBOT || "Erro interno de segurança.", flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: process.env.MSGERROBOT || "Erro interno de segurança.", flags: MessageFlags.Ephemeral });
          }
        } catch (e) { /* Ignora erro de resposta se a interação morreu */ }
        return;
      }

      try {
        const userIsDev = await isDev(interaction.user.id);
        const userIsOnEquipe = ownerIdSet.has(interaction.user.id) || userIsDev;

        if (!userIsOnEquipe) {
          const maintenance = await isMaintenanceMode();
          if (maintenance) {
            return interaction.reply({
              content: "",
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Yellow)
                  .setDescription(`- ${Emojis.verifybot || "🤖"} ${process.env.MSGMANUTENCAO || "Manutenção"}`)
                  .setFooter({
                    text: client.user.username,
                    iconURL: client.user.displayAvatarURL() || undefined ? process.env.DEFAULT_FOOTER_ICON : undefined,
                  }),
              ],
              flags: MessageFlags.Ephemeral,
            });
          }

          const userBlocked = await isBlacklisted(interaction.user.id, "user");
          if (userBlocked) {
            const embed = new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
              .setDescription(process.env.MSGBLACKLISTMEMBERBOT || "Usuário banido.");
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
          }

          const guildBlocked = await isBlacklisted(interaction.guild.id, "guild");
          if (guildBlocked) {
            const embed = new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
              .setDescription(process.env.MSGBLACKLISTSERVIDORBOT || "Servidor banido.");
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
          }
        }
      } catch (err) {
        console.error(`[InteractionCreate] Erro check blacklist/manutenção:`, err);
      }

      let componentId;

      if (interaction.customId.includes(":")) {
        componentId = interaction.customId.split(":")[0];
      } else if (interaction.isStringSelectMenu()) {
        if (client.components.has(interaction.customId)) {
          componentId = interaction.customId;
        } else {
          componentId = interaction.values[0];
        }
      } else {
        componentId = interaction.customId;
      }

      const component = client.components.get(componentId);

      const ignoredIds = [
        "central_menu", "select_cargo_config_menu", "select_log_config_menu",
        "rkadmin_main_menu_select", "rkadmin_equipe_select", "rkadmin_gerenciar_select",
        "rkadmin_servidores_select", "ajuda_select_menu", "prefix_help_select_menu",
        "inf_builder_values", "inf_builder_formats", "inf_btn_reset", "inf_toggle_embed",
        "inf_toggle_type", "inf_btn_send_queue", "inf_join_game", "confirm_global_update",
        "confirm_mass", "cancel_mass", "sys", "sys_ignore"
      ];

      if (!component) {
        if (ignoredIds.includes(interaction.customId)) {
          return;
        }
        console.warn(`Componente não encontrado: ${componentId}`);
        return;
      }

      try {
        await component(interaction, client);
      } catch (err) {
        if (err.code === 10062) return;
        if (err.code === 50027) return;
        if (err.code === 50035) return;
        console.error(`[InteractionCreate] Erro componente ${interaction.customId}:`, err);

        const errorEmbed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Red)
          .setDescription(process.env.MSGERROBOT || "Ocorreu um erro ao processar esta ação.");

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => { });
        } else {
          await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => { });
        }
      }
    }
  },
};