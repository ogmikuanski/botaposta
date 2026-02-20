const { redisClient } = require("../utils/cache");
const Developer = require("../database/models/Developer");

const DEV_KEY = `${process.env.REDIS_NAMESPACE}:bot:developers`;

async function loadDevsToCache() {
  try {
    const entries = await Developer.findAll();

    await redisClient.del(DEV_KEY);

    const devIds = entries.map((e) => e.userId);

    if (devIds.length > 0) {
      await redisClient.sAdd(DEV_KEY, devIds);
    }
    console.log(`✅ Developers carregados: ${devIds.length} membros.`);
  } catch (error) {
    console.error("❌ Erro fatal ao carregar Developers:", error);
  }
}

async function isDev(userId) {
  if (!redisClient.isReady) {
    console.warn("⚠️ REDIS OFFLINE. Verificação de Dev pulada.");
    return false;
  }
  return redisClient.sIsMember(DEV_KEY, userId);
}

async function addDev(userId, username, addedBy) {
  await Developer.upsert({
    userId,
    username,
    addedBy,
  });
  await redisClient.sAdd(DEV_KEY, userId);
}

async function removeDev(userId) {
  await Developer.destroy({ where: { userId } });
  await redisClient.sRem(DEV_KEY, userId);
}

async function listDevs() {
  return Developer.findAll();
}

module.exports = {
  loadDevsToCache,
  isDev,
  addDev,
  removeDev,
  listDevs,
};
