const { redisClient } = require("../utils/cache");
const Blacklist = require("../database/models/Blacklist");

const GUILD_KEY = `${process.env.REDIS_NAMESPACE}:bot:blacklist:guilds`;
const USER_KEY = `${process.env.REDIS_NAMESPACE}:bot:blacklist:users`;

async function loadBlacklistToCache() {
  try {
    const entries = await Blacklist.findAll();

    await redisClient.del(GUILD_KEY);
    await redisClient.del(USER_KEY);

    const guildIds = entries
      .filter((e) => e.type === "guild")
      .map((e) => e.entityId);

    const userIds = entries
      .filter((e) => e.type === "user")
      .map((e) => e.entityId);

    if (guildIds.length > 0) {
      await redisClient.sAdd(GUILD_KEY, guildIds);
    }
    if (userIds.length > 0) {
      await redisClient.sAdd(USER_KEY, userIds);
    }

    console.log(
      `✅ Blacklist carregada: ${guildIds.length} servidores, ${userIds.length} usuários.`
    );
  } catch (error) {
    console.error("❌ Erro fatal ao carregar Blacklist:", error);
  }
}

async function isBlacklisted(entityId, type) {
  if (!redisClient.isReady) {
    console.warn("⚠️ REDIS OFFLINE. Verificação de Blacklist pulada.");
    return false;
  }

  const key = type === "guild" ? GUILD_KEY : USER_KEY;
  return redisClient.sIsMember(key, entityId);
}

async function addToBlacklist(
  entityId,
  type,
  reason,
  addedByUserId,
  provaUrl = null
) {
  await Blacklist.upsert({
    entityId,
    type,
    reason,
    addedByUserId,
    provaUrl,
  });

  const key = type === "guild" ? GUILD_KEY : USER_KEY;
  await redisClient.sAdd(key, entityId);
}

async function removeFromBlacklist(entityId, type) {
  await Blacklist.destroy({ where: { entityId, type } });
  const key = type === "guild" ? GUILD_KEY : USER_KEY;
  await redisClient.sRem(key, entityId);
}

module.exports = {
  loadBlacklistToCache,
  isBlacklisted,
  addToBlacklist,
  removeFromBlacklist,
};
