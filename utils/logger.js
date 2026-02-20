const Server = require("../database/models/server");

module.exports = {
  log: async (client, guildId, msg) => {
    const server = await Server.findOne({ where: { guildId } });

    if (server?.logChannelId) {
      try {
        const channel = await client.channels.fetch(server.logChannelId);
        if (channel) return channel.send(`📌 ${msg}`);
      } catch (err) {
        console.error(
          `[LOG ERRO] Canal de log ${server.logChannelId} não encontrado.`
        );
        console.log(`[LOG - ${guildId}] ${msg}`);
      }
    } else {
      console.log(`[LOG - ${guildId}] ${msg}`);
    }
  },
  error: (msg) => console.error(`[ERRO - ${new Date().toISOString()}] ${msg}`),
};
