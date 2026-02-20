const { SlashCommandBuilder } = require("discord.js");
const { isBlacklisted } = require("../../manager/blacklistManager");
const ajudaCommand = require("./ajuda.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Mostra a lista de todos os comandos."),

  execute: async (interaction, client) => {
    await ajudaCommand.execute(interaction, client);
  },
};
