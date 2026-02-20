const { Events, EmbedBuilder, Colors } = require("discord.js");
const { redisClient } = require("../utils/cache");
const CargosConfig = require("../database/models/CargosConfig");
const Server = require("../database/models/server");
const Emojis = require("../Emojis.json");
const {
  GUILD_LOG_SERVER_ID,
  SUNDOBOT,
  GUILD_LOG_SERVERTESTE_IDS
} = process.env;

module.exports = {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(member) {
    const client = member.client;

    if (member.id === client.user.id) {
      if (!SUNDOBOT) return;
      const guild = member.guild;

      const allowedGuilds = [
        GUILD_LOG_SERVER_ID,
        ...(GUILD_LOG_SERVERTESTE_IDS?.split(",") || [])
      ].filter(Boolean);

      if (allowedGuilds.includes(guild.id)) return;

      try {
        const rivalMember = await guild.members.fetch(SUNDOBOT).catch(() => null);
        if (rivalMember && rivalMember.id !== client.user.id) {
          console.warn(`[AntiDuplicate/MemberAdd] 🚨 Bot duplicado em ${guild.name}. Saindo...`);
          await guild.leave();
        }
      } catch (err) { }
      return;
    }

    if (member.user.bot) return;

    await handleAutoRole(member);
    await handleMatchRecovery(member);
  }
};

async function handleAutoRole(member) {
  try {
    const guildId = member.guild.id;

    await Server.findOrCreate({
      where: { guildId },
      defaults: { guildName: member.guild.name }
    });

    const config = await CargosConfig.findOne({ where: { guildId } });

    if (!config || !config.autoRoleId) return;

    const roleId = config.autoRoleId;
    const role = member.guild.roles.cache.get(roleId);

    if (!role) return;
    if (!role.editable) {
      return;
    }

    await member.roles.add(role, "Sistema de AutoRole").catch((err) => {
      if (err.code !== 50013) { 
        console.error(`[AutoRole] Erro ao adicionar cargo: ${err.message}`);
      }
    });

  } catch (err) {
    console.error(`[AutoRole] Erro fatal:`, err);
  }
}

async function handleMatchRecovery(member) {
  const guildId = member.guild.id;
  const userId = member.user.id;

  if (!redisClient || !redisClient.isReady) return;

  // Busca partidas APENAS deste servidor para otimizar
  const matchPattern = `${process.env.REDIS_NAMESPACE}:${guildId}:match:*`;

  try {
    const iterator = redisClient.scanIterator({
      MATCH: matchPattern,
      COUNT: 50, // Processa em lotes menores
    });

    for await (const rawKey of iterator) {
      const key = String(rawKey);
      if (key.endsWith(":lock")) continue;

      try {
        const dataJson = await redisClient.get(key);
        if (!dataJson) continue;

        const matchData = JSON.parse(dataJson);
        const threadId = key.split(":").pop();
        if (!threadId) continue;

        const isPlayer = matchData.players && matchData.players.includes(userId);
        const isMediator = matchData.assignedMediatorId === userId;

        if (isPlayer || isMediator) {
          // Tenta buscar o tópico (Thread)
          const thread = await member.guild.channels.fetch(threadId).catch(() => null);

          if (thread && thread.isThread()) {
            await thread.members.add(userId).catch((err) => {
              if (err.code !== 50013) console.error(`[MatchRecovery] Falha ao add membro: ${err.message}`);
            });

            const roleName = isMediator ? "Mediador" : "Jogador";

            const recoverEmbed = new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Green)
              .setTitle(`${Emojis.check || "✅"} RECUPERAÇÃO DE CONEXÃO`)
              .setDescription(
                `O ${roleName} <@${userId}> retornou ao servidor!\n` +
                `> **Acesso restaurado.** A partida continua.`
              );

            await thread.send({
              content: `<@${userId}>`,
              embeds: [recoverEmbed],
            }).catch(() => { });

            break;
          }
        }
      } catch (innerErr) {
        console.error(`[MatchRecovery] Erro ao processar chave ${key}:`, innerErr.message);
      }
    }
  } catch (err) {
    console.error(`[GuildMemberAdd] Erro no Redis Iterator:`, err);
  }
}