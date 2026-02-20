const fs = require("fs");
const path = require("path");

module.exports = (client) => {
  const eventsPath = path.join(__dirname, "..", "events");

  const eventFiles = [
    "channelDelete.js",
    "channelUpdate.js",
    "clientReady.js",
    "guildCreate.js",
    "guildDelete.js",
    "guildEmojiCreate.js",
    "guildEmojiDelete.js",
    "guildEmojiUpdate.js",
    "guildMemberAdd.js",
    "guildMemberRemove.js",
    "guildMemberUpdate.js",
    "guildUpdate.js",
    "interactionCreate.js",
    "messageCreate.js",
    "messageCreatePix.js",
    "messageCreateSala.js",
    "messageCreateSala2.js",
    "messageDelete.js",
    "roleDelete.js",
  ];

  let loadedCount = 0;
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    if (!fs.existsSync(filePath)) {
      console.warn(
        `[EventHandler] Aviso: O arquivo de evento ${file} foi listado mas não existe.`
      );
      continue;
    }

    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    loadedCount++;
  }

  console.log(`✅ Eventos carregados: ${loadedCount}/${eventFiles.length}`);
};
