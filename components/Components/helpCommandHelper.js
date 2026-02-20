const Emojis = require("../../Emojis.json");

const COMMAND_CATEGORIES = {
  publico: {
    label: "Público",
    emoji: Emojis.livro || "📖",
    commands: ["avatar", "banner", "serverinfo", "reportar"],
  },
  moderador: {
    label: "Moderador",
    emoji: Emojis.server || "🛡️",
    commands: ["clear", "limpar", "addemoji", "lock"],
  },
  admin: {
    label: "Admin ( Permissão maxima )",
    emoji: Emojis.blurplepartner || "⚙️",
    commands: [
      "central",
      "interface",
      "blacklist",
      "resetar",
      "mediador",
      "restaurar",
      "Enviar",
      "puxar",
      "administrar"
    ],
  },
  developer: {
    label: "Developer",
    emoji: Emojis.bot || "🤖",
    commands: ["rnadmin"],
  },
};

const formatCommand = (cmd) => {
  const subcommands = cmd.options?.filter((opt) => opt.type === 1);
  let base = `- **/${cmd.name}** - ${cmd.description}`;

  if (subcommands && subcommands.length > 0) {
    const subList = subcommands
      .map((sub) => `> \`/${cmd.name} ${sub.name}\` - ${sub.description}`)
      .join("\n");
    base += `\n${subList}`;
  }
  return base;
};

module.exports = { COMMAND_CATEGORIES, formatCommand };
