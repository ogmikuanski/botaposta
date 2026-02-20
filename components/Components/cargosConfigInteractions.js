const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  EmbedBuilder,
  Colors,
} = require("discord.js");
const { createCargosConfigEmbed } = require("../Embeds/cargosConfigEmbed");
const Emojis = require("../../Emojis.json");
const CargosConfig = require("../../database/models/CargosConfig");
const { isDev } = require("../../manager/devManager");
const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

async function buildCargosPanel(interaction) {
  const embed = await createCargosConfigEmbed(interaction);
  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_cargo_config_menu")
      .setPlaceholder("Selecione uma opção para alterar...")
      .addOptions([
        {
          label: "Alterar Cargo Permissão Máxima",
          description: "Define o cargo com acesso total aos comandos admin.",
          value: "set_cargo_perm_max",
          emoji: Emojis.blurplepartner || "👮‍♂️",
        },
        {
          label: "Alterar Acesso Apostado",
          description: "Define o cargo que pode participar de apostas.",
          value: "set_cargo_acesso_apostado",
          emoji: Emojis.blurplepartner || "🎟️",
        },
        {
          label: "Alterar Cargo Mediador",
          description: "Define o cargo que pode mediar apostas.",
          value: "set_cargo_mediador",
          emoji: Emojis.blurplepartner || "⚡",
        },
        {
          label: "Alterar Auto Rule (Entrada)",
          description: "Define o cargo dado automaticamente ao entrar.",
          value: "set_auto_role",
          emoji: Emojis.blurplepartner || "🤖",
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
  systemcargosconfigs: async (interaction, client) => {
    const { member, user, guild } = interaction;

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
            errorMessage = `### ${Emojis.circlecross || "❌"
              } Sem Permissão!\n- Apenas usuários com o cargo <@&${permMaxRoleId}> (Permissão Máxima) podem acessar esta configuração.`;
          } else {
            errorMessage = `### ${Emojis.circlecross || "❌"
              } Sem Permissão!\n- O cargo de "Permissão Máxima" não foi configurado.\n- Apenas o Dono do Servidor (<@${guild.ownerId
              }>) pode acessar esta configuração.`;
          }

          return interaction.update({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(errorMessage),
            ],
            components: [],
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }

    const panel = await buildCargosPanel(interaction);
    await interaction.update(panel);
  },

  voltar_systemcargosconfigs: async (interaction, client) => {
    const panel = await buildCargosPanel(interaction);
    await interaction.update(panel);
  },

  buildCargosPanel: buildCargosPanel,
};
