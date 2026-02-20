const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  Colors,
} = require("discord.js");
const { createLogsConfigEmbed } = require("../Embeds/logsConfigEmbed");
const Emojis = require("../../Emojis.json");
const CargosConfig = require("../../database/models/CargosConfig");
const { isDev } = require("../../manager/devManager");

const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

async function buildLogsPanel(interaction) {
  const embed = await createLogsConfigEmbed(interaction);

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_log_config_menu")
      .setPlaceholder("Selecione uma opção para alterar...")
      .addOptions([
        {
          label: "Alterar Logs Aposta Aberta",
          value: "set_log_aposta_aberta",
          emoji: Emojis.text || "📜",
        },
        {
          label: "Alterar Logs Aposta Confirmada",
          value: "set_log_aposta_confirmada",
          emoji: Emojis.text || "📜",
        },
        {
          label: "Alterar Logs Aposta Finalizada",
          value: "set_log_aposta_finalizada",
          emoji: Emojis.text || "📜",
        },
        {
          label: "Alterar Logs Apostado Cancelado",
          value: "set_log_aposta_cancelada",
          emoji: Emojis.text || "📜",
        },
        {
          label: "Alterar Logs Loja ( Staff )",
          value: "set_log_lojastaff",
          emoji: Emojis.text || "📜",
        },
        {
          label: "Alterar Logs Loja ( Publico )",
          value: "set_log_lojapublic",
          emoji: Emojis.text || "📜",
        },
        {
          label: "Alterar Logs Roleta ( Staff )",
          value: "set_log_roletataff",
          emoji: Emojis.text || "📜",
        },
        {
          label: "Alterar Logs Roleta ( Publico )",
          value: "set_log_roletapublic",
          emoji: Emojis.text || "📜",
        },
        {
          label: "Alterar Logs Partidas",
          value: "set_log_partidas",
          emoji: Emojis.text || "📜",
        },
        {
          label: "Alterar Logs Mediador",
          value: "set_log_mediador",
          emoji: Emojis.text || "📜",
        },
        {
          label: "Alterar Logs BlackList",
          value: "set_log_blacklist",
          emoji: Emojis.text || "📜",
        },
      ])
  );

  const voltarButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("voltar_central")
      .setLabel("Voltar")
      .setEmoji(Emojis.Voltar || "⬅️")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [selectMenu, voltarButton],
    flags: MessageFlags.Ephemeral,
  };
}

module.exports = {
  systemlogsconfigs: async (interaction, client) => {
    const { member, user, guild } = interaction;

    const isOwner = member.id === guild.ownerId;
    const isDevUser = await isDev(user.id);
    const isTeam = ownerIdSet.has(user.id);

    if (!isOwner && !isDevUser && !isTeam) {
      const [cargosConfig] = await CargosConfig.findOrCreate({ where: { guildId: guild.id } });
      const permMaxRoleId = cargosConfig.cargoPermMaxId;

      if (!permMaxRoleId || !member.roles.cache.has(permMaxRoleId)) {
        const errorMsg = permMaxRoleId
          ? `### ${Emojis.circlecross || "❌"} Sem Permissão!\n- Apenas usuários com o cargo <@&${permMaxRoleId}> podem acessar.`
          : `### ${Emojis.circlecross || "❌"} Sem Permissão!\n- O cargo de "Permissão Máxima" não está configurado. Apenas o Dono pode acessar.`;

        return interaction.update({
          embeds: [new EmbedBuilder().setColor(process.env.botcolor || Colors.Red).setDescription(errorMsg)],
          components: [],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const panel = await buildLogsPanel(interaction);
    await interaction.update(panel);
  },

  voltar_systemlogsconfigs: async (interaction, client) => {
    const panel = await buildLogsPanel(interaction);
    await interaction.update(panel);
  },

  buildLogsPanel: buildLogsPanel,
};