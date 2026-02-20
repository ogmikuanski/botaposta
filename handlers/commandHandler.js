const fs = require("fs");
const path = require("path");

module.exports = (client) => {
  const slashPath = path.join(__dirname, "..", "commands", "slash");
  const slashFiles = fs
    .readdirSync(slashPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of slashFiles) {
    const command = require(path.join(slashPath, file));
    client.slashCommands.set(command.data.name, command);
  }

  const prefixPath = path.join(__dirname, "..", "commands", "prefix");
  const prefixFiles = fs
    .readdirSync(prefixPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of prefixFiles) {
    const command = require(path.join(prefixPath, file));
    client.prefixCommands.set(command.name, command);
  }

  console.log(
    `✅ Comandos carregados: ${client.slashCommands.size} Slash, ${client.prefixCommands.size} Prefix`
  );
};
