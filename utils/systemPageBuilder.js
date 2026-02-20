const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require("discord.js");
const Emojis = require("../Emojis.json");

async function createSystemPagination(client, page, query) {
  let allEmojis = client.emojis.cache.map(e => e);
  let filteredItems = query === "all" 
    ? allEmojis 
    : allEmojis.filter(e => e.name && e.name.toLowerCase().includes(query.toLowerCase()));

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  page = Math.max(0, Math.min(page, totalPages - 1));

  const start = page * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const currentItems = filteredItems.slice(start, end);

  const description = currentItems.length > 0 
    ? currentItems.map(e => `${e} | [**${e.name}**](${e.imageURL()}) \`ID: ${e.id}\``).join("\n")
    : (Emojis.bot || "🤖") + " **Nenhum resultado encontrado.**";

  const embed = new EmbedBuilder()
    .setColor(process.env.botcolor || Colors.Blue) 
    .setTitle(query === "all" ? `${Emojis.livro || "📖"} Lista de Emojis Global` : `${Emojis.visualizar || "🔎"} Busca: "${query}"`)
    .setDescription(description)
    .setFooter({ 
        text: `Página ${page + 1}/${totalPages} • Total: ${filteredItems.length} emojis`,
        iconURL: client.user.displayAvatarURL()
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sys:${page - 1}:${query}`)
      .setEmoji(Emojis.anterior || "◀️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),

    new ButtonBuilder()
      .setCustomId(`sys_ignore`)
      .setLabel(`${page + 1} / ${totalPages}`)
      .setEmoji(Emojis.Sky_preview || "🗒️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),

    new ButtonBuilder()
      .setCustomId(`sys:${page + 1}:${query}`)
      .setEmoji(Emojis.proximo || "▶️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages - 1)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { createSystemPagination };