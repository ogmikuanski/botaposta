const {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { isDev } = require("../../manager/devManager");
const { isBlacklisted } = require("../../manager/blacklistManager");
const Emojis = require("../../Emojis.json");

const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

const getAdminPanelPayload = (interaction) => {
  const embed = new EmbedBuilder()
    .setColor(process.env.botcolor || Colors.Blue)
    .setAuthor({
      name: process.env.DEFAULT_FOOTER_TEXT || interaction.client.user.username,
      iconURL: process.env.DEFAULT_FOOTER_ICON || interaction.client.user.displayAvatarURL(),
    })
    .setDescription(
      `## Painel de Controle Central\n` +
      `Bem-vindo, **${interaction.user.username}**.\n` +
      `Selecione uma categoria abaixo para administrar a infraestrutura do bot.\n\n` +
      `> **Sessão Segura:** Todas as ações são registradas.\n`
    )
    .setThumbnail(interaction.guild.iconURL());

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("rkadmin_main_menu_select")
      .setPlaceholder("Navegar pelo sistema...")
      .addOptions([
        {
          label: "Monitoramento & Status",
          description: "Latência DB/API, RAM, CPU e Uptime.",
          value: "rkadmin_monitoramento",
          emoji: Emojis.status || "📊",
        },
        {
          label: "Gerenciar Equipe",
          description: "Adicionar/Remover Developers.",
          value: "rkadmin_equipe_menu",
          emoji: Emojis.user || "👥",
        },
        {
          label: "Blacklist Global",
          description: "Bloquear Usuários e Servidores.",
          value: "rkadmin_gerenciar_menu",
          emoji: Emojis.bloqueado || "🚫",
        },
        {
          label: "Gerenciar Servidores",
          description: "Listas, Convites e Force Leave.",
          value: "rkadmin_servidores_menu",
          emoji: Emojis.server || "🌎",
        },
        {
          label: "Modo Manutenção",
          description: "Travar o bot globalmente.",
          value: "rkadmin_manutencao_menu",
          emoji: Emojis.verifybot || "🔒",
        },
      ])
  );

  return { embeds: [embed], components: [row], flags: MessageFlags.Ephemeral };
};

module.exports = {
  getAdminPanelPayload,

  data: new SlashCommandBuilder()
    .setName("systemlabs")
    .setDescription(" [DEV] Painel administrativo."),

  execute: async (interaction, client) => {
    try {
      const userBlocked = await isBlacklisted(interaction.user.id, "user");
      if (userBlocked) {
        return interaction.reply({
          content: `${Emojis.circlecross || "🚫"} **Acesso Negado:** Você está na blacklist.`,
          flags: MessageFlags.Ephemeral
        });
      }

      const userIsDev = await isDev(interaction.user.id);
      if (!ownerIdSet.has(interaction.user.id) && !userIsDev) {
        return interaction.reply({
          content: `### ${Emojis.naoentendi || "❓"} Acesso Restrito\nEste comando é exclusivo para a equipe.`,
          flags: MessageFlags.Ephemeral
        });
      }

      const panel = getAdminPanelPayload(interaction);
      await interaction.reply(panel);

    } catch (err) {
      console.error(`Erro crítico no /systemlabs:`, err);
      if (!interaction.replied) {
        await interaction.reply({ content: process.env.MSGERROBOT || "❌ Erro interno ao carregar painel.", flags: MessageFlags.Ephemeral });
      }
    }
  },
};