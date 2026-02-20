const {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const LogsConfig = require("../../database/models/LogsConfig");
const { buildLogsPanel } = require("./logsConfigInteractions");
const Emojis = require("../../Emojis.json");

const createChannelSelector = (customId, placeholder) => {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addChannelTypes([ChannelType.GuildText])
      .setMinValues(1)
      .setMaxValues(1)
  );
};

const createVoltarButton = () => {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("voltar_systemlogsconfigs")
      .setLabel("Cancelar")
      .setEmoji(Emojis.voltar || "⬅️")
      .setStyle(ButtonStyle.Danger)
  );
};

module.exports = {

  set_log_aposta_aberta: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_aposta_aberta", "Selecione o canal de Logs Aposta Aberta"),
        createVoltarButton(),
      ],
    });
  },
  set_log_aposta_confirmada: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_aposta_confirmada", "Selecione o canal de Logs Aposta Confirmada"),
        createVoltarButton(),
      ],
    });
  },
  set_log_aposta_finalizada: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_aposta_finalizada", "Selecione o canal de Logs Aposta Finalizada"),
        createVoltarButton(),
      ],
    });
  },
  set_log_aposta_cancelada: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_aposta_cancelada", "Selecione o canal de Logs Apostado Cancelado"),
        createVoltarButton(),
      ],
    });
  },
  set_log_partidas: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_partidas", "Selecione o canal de Logs Partidas"),
        createVoltarButton(),
      ],
    });
  },
  set_log_mediador: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_mediador", "Selecione o canal de Logs Mediador"),
        createVoltarButton(),
      ],
    });
  },
  set_log_blacklist: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_blacklist", "Selecione o canal de Logs BlackList"),
        createVoltarButton(),
      ],
    });
  },

  set_log_lojastaff: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_lojastaff", "Selecione o Logs Admin Loja (Erros/Vendas)"),
        createVoltarButton(),
      ],
    });
  },

  set_log_lojapublic: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_lojapublic", "Selecione o Logs Público Loja (Avisos)"),
        createVoltarButton(),
      ],
    });
  },

  set_log_roletataff: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_roletastaff", "Selecione o Logs Admin Loja (Erros/Vendas)"),
        createVoltarButton(),
      ],
    });
  },

  set_log_roletapublic: async (interaction) => {
    await interaction.update({
      embeds: interaction.message.embeds,
      components: [
        createChannelSelector("submit_log_roletapublic", "Selecione o Logs Público Loja (Avisos)"),
        createVoltarButton(),
      ],
    });
  },


  submit_log_aposta_aberta: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update({ logApostaAbertaId: interaction.values[0] }, { where: { guildId: interaction.guild.id } });
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },
  submit_log_aposta_confirmada: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update({ logApostaConfirmadoId: interaction.values[0] }, { where: { guildId: interaction.guild.id } });
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },
  submit_log_aposta_finalizada: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update({ logApostaFinalizadaId: interaction.values[0] }, { where: { guildId: interaction.guild.id } });
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },
  submit_log_aposta_cancelada: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update({ logApostaCanceladaId: interaction.values[0] }, { where: { guildId: interaction.guild.id } });
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },
  submit_log_partidas: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update({ logPartidasId: interaction.values[0] }, { where: { guildId: interaction.guild.id } });
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },
  submit_log_mediador: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update({ logMediadorId: interaction.values[0] }, { where: { guildId: interaction.guild.id } });
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },
  submit_log_blacklist: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update({ logBlacklistId: interaction.values[0] }, { where: { guildId: interaction.guild.id } });
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },

  submit_log_lojastaff: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update(
      { logLojaId: interaction.values[0] },
      { where: { guildId: interaction.guild.id } }
    );
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },

  submit_log_lojapublic: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update(
      { logLojaComprarId: interaction.values[0] },
      { where: { guildId: interaction.guild.id } }
    );
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },

  submit_log_roletastaff: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update(
      { logRoletaId: interaction.values[0] },
      { where: { guildId: interaction.guild.id } }
    );
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },

  submit_log_roletapublic: async (interaction) => {
    await interaction.deferUpdate();
    await LogsConfig.update(
      { logRoletaPublicId: interaction.values[0] },
      { where: { guildId: interaction.guild.id } }
    );
    const panel = await buildLogsPanel(interaction);
    await interaction.editReply(panel);
  },
};

