const { Events, REST, Routes, ActivityType, EmbedBuilder } = require("discord.js");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { ensurePersistentChannel } = require("../manager/persistentChannelManager");
const { enforceGoldenRule } = require("../utils/adminCheck");
const SecurityManager = require("../manager/securityManager");

const MIN_MEMBERS = 25;
const MIN_ONLINE = 5;

const statuses = ["online"];
let statusIndex = 0;
let activityIndex = 0;

const getActivities = (client) => {
  return [
    { name: ` ${process.env.NOMEMARCA}`, type: ActivityType.Playing },
    {
      name: ` Presente em ${client.guilds.cache.size} Servidores!`,
      type: ActivityType.Watching,
    },
    {
      name: ` Presente em ${client.guilds.cache.size} Servidores!`,
      type: ActivityType.Listening,
    },
    { name: " Bot Gratuito de Filas!", type: ActivityType.Playing },
  ];
};

async function sendLeaveLog(client, guild, total, online) {
    try {
        const logChannelId = process.env.GUILD_LOG_LEAVE10MEMBER;
        if (!logChannelId) return;

        const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setColor(process.env.botcolor || "#FF0000")
            .setDescription(
              `# SAÍDA AUTOMÁTICA\n` +
              `- Dono: <@${guild.ownerId}> (${guild.ownerId})\n` +
              `- Servidor: \`${guild.name}\` (${guild.id})\n` +
              `> Membros Totais: \`${total}\` (mínimo: ${MIN_MEMBERS})\n` +
              `> Membros Online: \`${online}\` (mínimo: ${MIN_ONLINE})\n\n` +
              `### Saiu Servidor automaticamente por não atender aos requisitos mínimos.`
            )
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error("[LOG-LEAVE] Erro ao enviar log de saída:", e.message);
    }
}

async function checkAllGuilds(client) {
  const { GUILD_LOG_SERVER_ID, GUILD_LOG_SERVERTESTE_IDS } = process.env;
  const allowedGuilds = [
    GUILD_LOG_SERVER_ID,
    ...(GUILD_LOG_SERVERTESTE_IDS?.split(",") || [])
  ].filter(Boolean);

  const guilds = Array.from(client.guilds.cache.values());
  const security = new SecurityManager(client);

  for (const guild of guilds) {
    try {
      if (allowedGuilds.includes(guild.id)) {
        await ensurePersistentChannel(guild);
        continue;
      }

      const members = await guild.members.fetch({ withPresences: true });
      const totalMembers = guild.memberCount;
      const onlineMembers = members.filter(m => 
          m.presence?.status === 'online' || 
          m.presence?.status === 'dnd' || 
          m.presence?.status === 'idle'
      ).size;

      if (totalMembers < MIN_MEMBERS || onlineMembers < MIN_ONLINE) {
        console.log(`[REQUISITOS] Saindo de "${guild.name}" - Membros: ${totalMembers}, Online: ${onlineMembers}`);
        
        await sendLeaveLog(client, guild, totalMembers, onlineMembers);
        
        await guild.leave();
        continue;
      }

      await security.checkGuildIntegrity(guild);

      if (!client.guilds.cache.has(guild.id)) continue;

      const hasAdmin = await enforceGoldenRule(guild);
      if (!hasAdmin) continue;

      await ensurePersistentChannel(guild);
    } catch (err) {
      console.error(`[checkAllGuilds] Erro em ${guild.name}:`, err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    const { 
        DISCORD_TOKEN, 
        BOT_ID, 
        GUILD_LOG_SERVER_ID, 
        GUILD_LOG_SERVERTESTE_IDS,
        SUNDOBOT 
    } = process.env;

    const allowedGuilds = [
        GUILD_LOG_SERVER_ID, 
        ...(GUILD_LOG_SERVERTESTE_IDS?.split(",") || [])
    ].filter(Boolean);

    console.log(`\n🎉 ${client.user.tag} está online!`);

    if (SUNDOBOT) {
      const guilds = client.guilds.cache;
      for (const [guildId, guild] of guilds) {
        if (allowedGuilds.includes(guildId)) continue;
        try {
          const rivalMember = await guild.members.fetch(SUNDOBOT).catch(() => null);
          if (rivalMember) {
            await guild.leave();
          }
        } catch (e) { }
      }
    }

    const activities = getActivities(client);
    client.user.setPresence({
      activities: [activities[activityIndex]],
      status: statuses[statusIndex],
    });

    setInterval(() => {
      const updatedActivities = getActivities(client);
      activityIndex = (activityIndex + 1) % updatedActivities.length;
      client.user.setPresence({
        activities: [updatedActivities[activityIndex]],
        status: statuses[statusIndex],
      });
    }, 15000);

    const commands = [];
    client.slashCommands.forEach((cmd) => commands.push(cmd.data.toJSON()));
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

    try {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log(`✅ Slash commands registrados!`);
    } catch (err) {
      console.error("❌ Erro ao registrar Slash Commands:", err);
    }

    setTimeout(() => {
      checkAllGuilds(client).catch((err) => {
        console.error("[clientReady] Erro na verificação:", err.message);
      });
    }, 10000);
  },
};