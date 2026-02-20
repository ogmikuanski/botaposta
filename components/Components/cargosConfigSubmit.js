const {
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Colors,
  MessageFlags,
} = require("discord.js");
const CargosConfig = require("../../database/models/CargosConfig");
const { buildCargosPanel } = require("./cargosConfigInteractions");
const Emojis = require("../../Emojis.json");

const createRoleSelector = (customId, placeholder) => {
  return new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
  );
};

const createVoltarButton = () => {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("voltar_systemcargosconfigs")
      .setLabel("Cancelar")
      .setEmoji(Emojis.voltar || "⬅️")
      .setStyle(ButtonStyle.Danger)
  );
};

module.exports = {
  set_cargo_perm_max: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createRoleSelector(
          "submit_cargo_perm_max",
          "Selecione o cargo de Permissão Máxima"
        ),
        createVoltarButton(),
      ],
    });
  },

  set_cargo_mediador: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createRoleSelector(
          "submit_cargo_mediador",
          "Selecione o cargo Mediador"
        ),
        createVoltarButton(),
      ],
    });
  },

  set_cargo_acesso_apostado: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createRoleSelector(
          "submit_cargo_acesso_apostado",
          "Selecione o cargo Acesso Apostado"
        ),
        createVoltarButton(),
      ],
    });
  },

  set_auto_role: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createRoleSelector(
          "submit_auto_role",
          "Selecione o cargo para Auto Rule (Entrada)"
        ),
        createVoltarButton(),
      ],
    });
  },

  submit_cargo_perm_max: async (interaction) => {
    await interaction.deferUpdate();
    const roleId = interaction.values[0];

    await CargosConfig.update(
      { cargoPermMaxId: roleId },
      {
        where: { guildId: interaction.guild.id },
        individualHooks: true,
      }
    );
    const panel = await buildCargosPanel(interaction);
    await interaction.editReply(panel);
  },

  submit_cargo_mediador: async (interaction) => {
    await interaction.deferUpdate();
    const roleId = interaction.values[0];
    await CargosConfig.update(
      { cargoMediadorId: roleId },
      {
        where: { guildId: interaction.guild.id },
        individualHooks: true,
      }
    );
    const panel = await buildCargosPanel(interaction);
    await interaction.editReply(panel);
  },

  submit_cargo_acesso_apostado: async (interaction) => {
    await interaction.deferUpdate();
    const roleId = interaction.values[0];
    await CargosConfig.update(
      { cargoAcessoApostadoId: roleId },
      {
        where: { guildId: interaction.guild.id },
        individualHooks: true,
      }
    );
    const panel = await buildCargosPanel(interaction);
    await interaction.editReply(panel);
  },

  submit_auto_role: async (interaction) => {
    await interaction.deferUpdate();

    const roleId = interaction.values[0];
    const guild = interaction.guild;
    const role = guild.roles.cache.get(roleId);
    const botMember = guild.members.me;

    if (!role) {
      return interaction.followUp({
        content: `${Emojis.circlecross || "❌"} Cargo não encontrado.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (role.position >= botMember.roles.highest.position) {
      const errorEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(
          `### ${Emojis.verifybot} Ação Bloqueada: Hierarquia de Cargos\n` +
          `Eu não posso gerenciar o cargo **${role.name}**.\n\n` +
          `**O Motivo:**\n` +
          `O cargo selecionado está **acima ou igual** ao meu cargo mais alto na lista de cargos do servidor.\n\n` +
          `**Como Resolver:**\n` +
          `1. Vá nas **Configurações do Servidor** > **Cargos**.\n` +
          `2. Arraste o meu cargo (do bot) para ficar **ACIMA** do cargo ${role}.\n` +
          `3. Tente configurar novamente.`
        );

      return interaction.followUp({
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (role.managed) {
      return interaction.followUp({
        content: `${Emojis.circlecross || "❌"
          } Eu não posso atribuir cargos gerenciados automaticamente (ex: Nitro Booster ou cargos de outros bots).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await CargosConfig.update(
      { autoRoleId: roleId },
      {
        where: { guildId: interaction.guild.id },
        individualHooks: true,
      }
    );
    const panel = await buildCargosPanel(interaction);
    await interaction.editReply(panel);
  },
};
