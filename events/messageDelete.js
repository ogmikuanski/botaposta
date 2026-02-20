const { Events } = require("discord.js");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const { ensurePersistentChannel } = require("../manager/persistentChannelManager");

module.exports = {
  name: Events.MessageDelete,
  once: false,

  async execute(message, client) {
    if (!message.guild) return;

    try {
      const configs = await ConfigsGerais.findOne({
        where: { guildId: message.guild.id },
      });

      if (configs && configs.persistentChannelId === message.channelId) {
        ensurePersistentChannel(message.guild).catch((err) => {
          console.error(
            `[messageDelete] Falha ao verificar canal em ${message.guild.name}:`,
            err.message
          );
        });
      }
    } catch (e) {
      console.error("[messageDelete] Erro ao verificar mensagem:", e.message);
    }
  },
};
