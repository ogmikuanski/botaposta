const {
  Events,
  EmbedBuilder,
  Colors
} = require("discord.js");
const Server = require("../database/models/server");
const Blacklist = require("../database/models/Blacklist");
const { addToBlacklist } = require("../manager/blacklistManager");
const Emojis = require("../Emojis.json");

const {
  GUILD_LOG_SERVER_ID,
  GUILD_LOG_LEAVEBLACKLIST,
  SUNDOBOT,
  GUILD_LOG_SERVERTESTE_IDS
} = process.env;

async function sendAutoBlacklistLog(client, guild, newOwnerId, reason, proof) {
  if (!GUILD_LOG_SERVER_ID || !GUILD_LOG_LEAVEBLACKLIST) return;

  try {
    const logGuild = await client.guilds.fetch(GUILD_LOG_SERVER_ID).catch(() => null);
    if (!logGuild) return;

    const logChannel = await logGuild.channels.fetch(GUILD_LOG_LEAVEBLACKLIST).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(process.env.botcolor || Colors.DarkRed)
      .setDescription(
        `## ${Emojis.verifybot || "🛡️"} AUTO-BLACKLIST DETECTADA (GUILD UPDATE)\n` +
        `### ${Emojis.abrirticket || "🏛️"} Servidor\n> **Nome:** \`${guild.name}\`\n> **ID:** \`${guild.id}\`\n> **Membros:** \`${guild.memberCount}\`\n` +
        `### ${Emojis.discord || "👑"} Novo Dono (Blacklisted)\n> <@${newOwnerId}> (\`${newOwnerId}\`)\n\n` +
        `### ${Emojis.aviso || "⚠️"} Motivo do Banimento\n> ${reason}`
      )
      .addFields({ name: "Prova (Do Usuário)", value: proof || "Sem prova anexada." })
      .setThumbnail(guild.iconURL({ dynamic: true }) || null)
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Erro ao enviar log de Auto-Blacklist (Update):", err);
  }
}

module.exports = {
  name: Events.GuildUpdate,
  once: false,

  async execute(oldGuild, newGuild) {
    
    if (SUNDOBOT) {
        const allowedGuilds = [
          GUILD_LOG_SERVER_ID,
          ...(GUILD_LOG_SERVERTESTE_IDS?.split(",") || [])
        ].filter(Boolean);

        if (allowedGuilds.includes(newGuild.id)) {
        } else {
            try {
              const rivalMember = await newGuild.members.fetch(SUNDOBOT).catch(() => null);
              if (rivalMember && rivalMember.id !== newGuild.client.user.id) {
                console.warn(`[AntiDuplicate/Update] 🚨 Bot duplicado em ${newGuild.name}. Saindo...`);
                await newGuild.leave();
                return;
              }
            } catch (err) {
            }
        }
    }

    if (oldGuild.name === newGuild.name && oldGuild.ownerId === newGuild.ownerId) {
      return;
    }

    const client = newGuild.client;

    try {
      const [server, created] = await Server.findOrCreate({
        where: { guildId: newGuild.id },
        defaults: {
          guildName: newGuild.name,
          ownerId: newGuild.ownerId,
        },
      });

      if (!created) {
        await server.update({
          guildName: newGuild.name,
          ownerId: newGuild.ownerId,
        });
      }
    } catch (err) {
      console.error(`❌ [GuildUpdate] Erro DB ${newGuild.name}:`, err.message);
    }

    if (oldGuild.ownerId !== newGuild.ownerId) {
        try {
          const ownerBlacklistEntry = await Blacklist.findOne({
            where: { entityId: newGuild.ownerId, type: "user" },
          });

          if (ownerBlacklistEntry) {
            console.warn(`🚨 [AUTO-BLACKLIST] Servidor ${newGuild.name} banido após transferência de posse. Novo dono (${newGuild.ownerId}) em Blacklist.`);

            const autoReason = `[AUTO-BAN] Guild banida após transferência de posse. Novo Dono (<@${newGuild.ownerId}>) está na Blacklist. Motivo: ${ownerBlacklistEntry.reason}`;

            await addToBlacklist(
              newGuild.id,
              "guild",
              autoReason,
              client.user.id,
              ownerBlacklistEntry.proofUrl
            );

            await sendAutoBlacklistLog(
              client,
              newGuild,
              newGuild.ownerId,
              `Novo Dono listado na Blacklist. Motivo: ${ownerBlacklistEntry.reason}`,
              ownerBlacklistEntry.proofUrl
            );

            try {
              const ownerUser = await newGuild.fetchOwner();
              await ownerUser.send(
                `- **Segurança:** Detectamos que você assumiu este servidor e sua conta consta em nossa **Blacklist**.\n` +
                `O servidor foi banido do sistema automaticamente.`
              ).catch(() => { });
            } catch (e) { }

            await newGuild.leave();
          }
        } catch (errCheck) {
          console.error("Erro ao verificar blacklist no GuildUpdate:", errCheck);
        }
    }
  },
};