const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
  Colors,
} = require("discord.js");
const ConfigsGerais = require("../../database/models/ConfigsGerais");
const { createConfigsGeraisEmbed } = require("../Embeds/configsGeraisEmbed");
const Emojis = require("../../Emojis.json");
const CargosConfig = require("../../database/models/CargosConfig");
const { isDev } = require("../../manager/devManager");
const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

module.exports = {
  configsgeraisbot: async (interaction, client) => {
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

    const embed = await createConfigsGeraisEmbed(interaction);
    const channelMenu = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("select_canal_apostados_submit")
        .setPlaceholder("Selecione o canal para criar os apostados.")
        .addChannelTypes([ChannelType.GuildText])
        .setMinValues(1)
        .setMaxValues(1)
    );
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setValorSala")
        .setLabel("Valor das Salas")
        .setEmoji(Emojis.cifraodinheiro)
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("setValoresApostados")
        .setLabel("Valores Apostados")
        .setEmoji(Emojis.info)
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("toggle_mediator_assignment_gerais")
        .setLabel("Modo de Mediação")
        .setEmoji(Emojis.time || "⏱️")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("voltar_central")
        .setLabel("Voltar")
        .setEmoji(Emojis.Voltar)
        .setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({
      embeds: [embed],
      components: [channelMenu, buttons],
      flags: MessageFlags.Ephemeral,
    });
  },

  voltar_central: async (interaction) => {
    const { createCentralEmbed } = require("../Embeds/centralEmbed");
    const { createCentralButtons } = require("./centralMenu");

    const embed = createCentralEmbed(interaction);
    const components = createCentralButtons();
    await interaction.update({
      embeds: [embed],
      components: components,
      flags: MessageFlags.Ephemeral,
    });
  },

  setValorSala: async (interaction) => {
    const [configs] = await ConfigsGerais.findOrCreate({
      where: { guildId: interaction.guild.id },
      defaults: { guildId: interaction.guild.id },
    });
    const modal = new ModalBuilder()
      .setCustomId("modal_valorsala_submit")
      .setTitle("Alterar Valor das Salas");
    const valorInput = new TextInputBuilder()
      .setCustomId("valor_input")
      .setLabel("Novo Valor (use ponto, ex: 0.50)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Ex: 0.50 para R$ 0,50")
      .setValue(String(configs.valorSala))
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(valorInput));
    await interaction.showModal(modal);
  },

  setValoresApostados: async (interaction) => {
    const [configs] = await ConfigsGerais.findOrCreate({
      where: { guildId: interaction.guild.id },
      defaults: { guildId: interaction.guild.id },
    });
    const textoValores = (configs.valoresApostados || [])
      .sort((a, b) => a - b)
      .join("\n");
    const modal = new ModalBuilder()
      .setCustomId("modal_valores_submit")
      .setTitle("Alterar Valores dos Apostados");
    const valoresInput = new TextInputBuilder()
      .setCustomId("valores_input")
      .setLabel("Valores permitidos (um por linha)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Ex:\n1.00\n5.50\n10")
      .setValue(textoValores)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(valoresInput));
    await interaction.showModal(modal);
  },
};
