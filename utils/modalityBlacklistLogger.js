const { EmbedBuilder, Colors, ChannelType } = require("discord.js");
const LogsConfig = require("../database/models/LogsConfig");
const Emojis = require("../Emojis.json");

async function getBlacklistLogChannel(client, guildId) {
  try {
    const [logsConfig] = await LogsConfig.findOrCreate({
      where: { guildId: guildId },
    });
    const channelId = logsConfig.logBlacklistId;

    if (!channelId) {
      return null;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (channel && channel.type === ChannelType.GuildText) {
      return channel;
    } else {
      return null;
    }
  } catch (err) {
    console.error(`Erro ao buscar canal de log (logBlacklistId):`, err);
    return null;
  }
}

async function logModalityBlacklistAdd(client, guildId, entry) {
  const channel = await getBlacklistLogChannel(client, guildId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`${Emojis.bloqueado || "✅"} JOGADOR ADICIONADO`)
    .setColor(process.env.botcolor || Colors.Green)
    .addFields(
      {
        name: "Jogador",
        value: `<@${entry.userId}> (\`${entry.userId}\`)`,
        inline: true,
      },
      { name: "ID no Jogo", value: `\`${entry.gameId}\``, inline: true },
      { name: "", value: ``, inline: true },
      {
        name: "Staff ( Author )",
        value: `<@${entry.addedByStaffId}>`,
        inline: true,
      },
      { name: "Motivo", value: entry.reason, inline: true },
      { name: "Provas", value: `[Ver Prova](${entry.proofUrl})`, inline: true }
    )
    .setTimestamp(entry.createdAt);

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error("Falha ao enviar log de adição (ModalityBlacklist):", e);
  }
}

async function logModalityBlacklistRemove(client, guildId, entry) {
  const channel = await getBlacklistLogChannel(client, guildId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`${Emojis.bloqueado || "❌"} JOGADOR REMOVIDO`)
    .setColor(process.env.botcolor || Colors.Red)
    .addFields(
      {
        name: "Jogador",
        value: `<@${entry.userId}> (\`${entry.userId}\`)`,
        inline: true,
      },
      { name: "ID no Jogo", value: `\`${entry.gameId}\``, inline: true },
      { name: "", value: ``, inline: true },
      {
        name: "Staff ( Author )",
        value: `<@${entry.removedByStaffId}>`,
        inline: true,
      },
      { name: "Motivo", value: entry.removeReason, inline: true },
      {
        name: "Provas",
        value: entry.removeProofUrl
          ? `[Ver Prova](${entry.removeProofUrl})`
          : "Nenhuma",
        inline: true,
      }
    )
    .setTimestamp(entry.removedAt);

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error("Falha ao enviar log de remoção (ModalityBlacklist):", e);
  }
}

module.exports = {
  logModalityBlacklistAdd,
  logModalityBlacklistRemove,
};
