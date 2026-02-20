const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const Emojis = require("../../Emojis.json");

module.exports = {
  createCentralButtons: () => {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("central_menu")
        .setPlaceholder("Selecione uma opção de configuração...")
        .addOptions([
          {
            label: "Configurações Gerais",
            description: "Configurações gerais do bot.",
            value: "configsgeraisbot",
            emoji: Emojis.bot,
          },
          {
            label: "Sistema de Fila/Apostados",
            description: "Configurar as funções das filas.",
            value: "systemfilasconfigs",
            emoji: Emojis.server,
          },
          {
            label: "Configuração de Cargos",
            description: "Configurar os cargos.",
            value: "systemcargosconfigs",
            emoji: Emojis.blurplepartner,
          },
          {
            label: "Configuracoes da Loja",
            description: "Configurar da loja automática.",
            value: "systemstoreconfigs",
            emoji: Emojis.loja,
          },
          {
            label: "Configuracoes da Roleta",
            description: "Configurar da roleta.",
            value: "systemroletaconfigs",
            emoji: Emojis.roleta,
          },
          {
            label: "Sistema De Logs",
            description: "Configurar os canais de lgos.",
            value: "systemlogsconfigs",
            emoji: Emojis.text,
          },
        ])
    );
    return [row];
  },
};
