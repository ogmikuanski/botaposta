const { EmbedBuilder, Colors } = require("discord.js");
const Emojis = require("../../Emojis.json");
const { COMMAND_CATEGORIES, formatCommand } = require("./helpCommandHelper");
const { getServerConfigKey } = require("../../utils/cache");

const createCategoryEmbed = (interaction, categoryKey) => {
  const client = interaction.client;

  const category = COMMAND_CATEGORIES[categoryKey];
  const categoryCommands = [];

  client.slashCommands.forEach((cmd) => {
    const data = cmd.data.toJSON();
    if (category.commands.includes(data.name)) {
      if (data.name !== "ajuda" && data.name !== "help") {
        categoryCommands.push(formatCommand(data));
      }
    }
  });

  let description;
  if (categoryCommands.length > 0) {
    description = categoryCommands.join("\n\n");
  } else {
    description = "Nenhum comando encontrado nesta categoria.";
  }

  if (description.length > 4096) {
    description = description.substring(0, 4080) + "\n... (Lista muito longa)";
  }

  return new EmbedBuilder()
    .setTitle(`${category.emoji} Comandos - ${category.label}`)
    .setColor(process.env.botcolor || Colors.Blue)
    .setDescription(description)
    .setFooter({
      text: interaction.guild.name,
      iconURL: interaction.guild.iconURL(),
    });
};

const handleAjudaHome = async (interaction) => {
  const server = await getServerConfigKey(
    interaction.guild.id,
    interaction.guild.name
  );
  const prefix = server.prefix || process.env.DISCORD_PREFIX || ".";

  const homeEmbed = new EmbedBuilder()
    .setColor(process.env.botcolor || Colors.Blue)
    .setDescription(`### ${Emojis.livro || "📖"} Central de Ajuda `)
    .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
    .addFields({
      name: "Comandos de Prefixo",
      value: `Para ver os comandos antigos (prefixo), use o comando \`${prefix}ajuda\`.`,
    })
    .setFooter({
      text: interaction.guild.name,
      iconURL: interaction.guild.iconURL(),
    });

  await interaction.update({ embeds: [homeEmbed] });
};

module.exports = {
  ajuda_home: handleAjudaHome,

  ajuda_publico: async (interaction) => {
    const embed = createCategoryEmbed(interaction, "publico");
    await interaction.update({ embeds: [embed] });
  },

  ajuda_admin: async (interaction) => {
    const embed = createCategoryEmbed(interaction, "admin");
    await interaction.update({ embeds: [embed] });
  },

  ajuda_moderador: async (interaction) => {
    const embed = createCategoryEmbed(interaction, "moderador");
    await interaction.update({ embeds: [embed] });
  },

  ajuda_developer: async (interaction) => {
    const embed = createCategoryEmbed(interaction, "developer");
    await interaction.update({ embeds: [embed] });
  },
};
