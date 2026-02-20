const { EmbedBuilder, Colors, PermissionFlagsBits } = require("discord.js");
const Emojis = require("../../Emojis.json");
const { getServerConfigKey } = require("../../utils/cache");

const formatPrefixCommand = (prefix, cmd) => {
  return `- **\`${prefix}${cmd.name}\`** - ${cmd.description}`;
};

const createPrefixCategoryEmbed = async (interaction, categoryKey) => {
  const client = interaction.client;

  const server = await getServerConfigKey(
    interaction.guild.id,
    interaction.guild.name
  );
  const prefix = server.prefix || process.env.DISCORD_PREFIX || ".";

  const category = {
    label: "Desconhecida",
    emoji: "❓",
    commands: [],
  };

  const commandsToFormat = [];

  if (categoryKey === "geral") {
    category.label = "Comandos Gerais";
    category.emoji = Emojis.livro || "📖";
    client.prefixCommands.forEach((cmd) => {
      if (
        ["p", "avatar", "banner", "serverinfo", "reportar"].includes(cmd.name)
      ) {
        commandsToFormat.push(cmd);
      }
    });
  } else if (categoryKey === "admin") {
    category.label = "Comandos de Moderação";
    category.emoji = Emojis.server || "🛡️";
    client.prefixCommands.forEach((cmd) => {
      if (["med","lock", "v", "clear", "limpar", "addemoji", "emojiadd", "emojiadd"].includes(cmd.name)) {
        commandsToFormat.push(cmd);
      }
    });
  }

  let description;
  if (commandsToFormat.length > 0) {
    description = commandsToFormat
      .map((cmd) => formatPrefixCommand(prefix, cmd))
      .join("\n");
  } else {
    description = "Nenhum comando encontrado nesta categoria.";
  }

  return new EmbedBuilder()
    .setTitle(`${category.emoji} Comandos - ${category.label} (\`${prefix}\`)`)
    .setColor(process.env.botcolor || Colors.Blue)
    .setDescription(description)
    .setFooter({
      text: interaction.guild.name,
      iconURL: interaction.guild.iconURL(),
    });
};

const handlePrefixHelpHome = async (interaction) => {
  const server = await getServerConfigKey(
    interaction.guild.id,
    interaction.guild.name
  );
  const prefix = server.prefix || process.env.DISCORD_PREFIX || ".";

  const homeEmbed = new EmbedBuilder()
    .setColor(process.env.botcolor || Colors.Blue)
    .setDescription(
      `### ${Emojis.livro || "📖"
      } Central de Ajuda\nMeu prefixo neste servidor é: \`${prefix}\``
    )
    .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
    .addFields({
      name: "Comandos de Barra (Slash)",
      value:
        "Para ver a lista completa de comandos `/`, use o comando `/ajuda`.",
    })
    .setFooter({
      text: interaction.guild.name,
      iconURL: interaction.guild.iconURL(),
    });

  await interaction.update({ embeds: [homeEmbed] });
};

module.exports = {
  prefix_help_home: handlePrefixHelpHome,

  prefix_help_geral: async (interaction) => {
    const embed = await createPrefixCategoryEmbed(interaction, "geral");
    await interaction.update({ embeds: [embed] });
  },

  prefix_help_admin: async (interaction) => {
    const canManageMessages = interaction.member.permissions.has(
      PermissionFlagsBits.ManageMessages
    );
    const canManageEmojis = interaction.member.permissions.has(
      PermissionFlagsBits.ManageGuildExpressions
    );
    if (!canManageMessages && !canManageEmojis) {
      return interaction.update({
        content: "Você não tem permissão para ver esta categoria.",
        embeds: [],
        components: [],
      });
    }

    const embed = await createPrefixCategoryEmbed(interaction, "admin");
    await interaction.update({ embeds: [embed] });
  },
};
