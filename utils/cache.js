const { createClient } = require("redis");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } = process.env;

const LOCK_KEY = `${process.env.REDIS_NAMESPACE}:global:lock`;
const MAINTENANCE_KEY = `${process.env.REDIS_NAMESPACE}:global:maintenance`;
const GLOBAL_MATCH_COUNTER_KEY = `${process.env.REDIS_NAMESPACE}:global:match_count`;

const redisClient = createClient({
  pingInterval: 10000,
  socket: {
    host: REDIS_HOST,
    port: Number(REDIS_PORT),
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    keepAlive: 10000
  },
  password: REDIS_PASSWORD || undefined,
});

redisClient.on("error", (err) => console.error(`❌ [Redis] Erro Crítico: ${err.message}`));
redisClient.on("end", () => console.warn("🔌 [Redis] Desconectado."));
redisClient.on("reconnecting", () => console.log("♻️ [Redis] Reconectando..."));

const connectRedis = async () => {
  if (redisClient.isReady) return;
  try {
    await redisClient.connect();
    console.log("✅ [Redis] Conectado e pronto para o combate!");
  } catch (error) {
    console.error("⚠️ [Redis] Falha na conexão. O bot vai rodar sem cache (lento).", error.message);
  }
};

const getMediatorsOnlineKey = (guildId) => `${process.env.REDIS_NAMESPACE}:${guildId}:mediators:online`;
const getQueueKey = (guildId, modoId, valor, tag = "") =>
  `${process.env.REDIS_NAMESPACE}:${guildId}:fila:${modoId}:${valor}:${String(tag).replace(/\s+/g, "-")}`;
const getMatchKey = (guildId, threadId) => `${process.env.REDIS_NAMESPACE}:${guildId}:match:${threadId}`;
const getCooldownKey = (guildId, userId, commandName) => `${process.env.REDIS_NAMESPACE}:${guildId}:cooldown:${userId}:${commandName}`;
const getServerConfigKey = (guildId) => `${process.env.REDIS_NAMESPACE}:${guildId}:config:server`;
const getPlayerMatchCountKey = (guildId) => `${process.env.REDIS_NAMESPACE}:${guildId}:player_match_count`;
const getGeraisConfigKey = (guildId) => `${process.env.REDIS_NAMESPACE}:${guildId}:config:gerais`;
const getFilaConfigKey = (guildId) => `${process.env.REDIS_NAMESPACE}:${guildId}:config:fila`;
const getCargosConfigKey = (guildId) => `${process.env.REDIS_NAMESPACE}:${guildId}:config:cargos`;
const getGuildInterfaceLockKey = (guildId) => `${process.env.REDIS_NAMESPACE}:${guildId}:interface_lock`;

const setCache = async (key, value, expirySeconds) => {
  if (!redisClient.isReady) return null;
  const opts = expirySeconds ? { EX: expirySeconds } : {};
  return redisClient.set(key, value, opts);
};

const getCache = async (key) => {
  if (!redisClient.isReady) return null;
  return redisClient.get(key);
};

const clearPattern = async (pattern, logLabel) => {
  if (!redisClient.isReady) return 0;

  let total = 0;
  const BATCH_SIZE = 500;
  let keysBuffer = [];

  try {
    for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: BATCH_SIZE })) {
      if (key && typeof key === 'string') {
        keysBuffer.push(key);
      }

      if (keysBuffer.length >= BATCH_SIZE) {
        if (keysBuffer.length > 0) {
          total += await redisClient.unlink(...keysBuffer);
        }
        keysBuffer = [];
      }
    }

    if (keysBuffer.length > 0) {
      total += await redisClient.unlink(...keysBuffer);
    }

    if (total > 0 && logLabel) {
      console.log(`🧹 [Cache] Limpos ${total} itens de: ${logLabel}`);
    }
  } catch (err) {
    console.error(`❌ [Cache] Erro ao limpar pattern ${pattern}:`, err.message);
  }

  return total;
};


const clearAllGuildQueues = (guildId) => clearPattern(`${process.env.REDIS_NAMESPACE}:${guildId}:fila:*`, `Filas Guild ${guildId}`);
const clearModalityQueues = (guildId, modoId) => clearPattern(`${process.env.REDIS_NAMESPACE}:${guildId}:fila:${modoId}:*`, `Filas Modo ${modoId}`);


const setCooldown = async (guildId, userId, commandName, expirySeconds) => {
  if (!redisClient.isReady) return null;
  return setCache(getCooldownKey(guildId, userId, commandName), "1", expirySeconds);
};

const getRemainingCooldown = async (guildId, userId, commandName) => {
  if (!redisClient.isReady) return 0;
  const ttl = await redisClient.ttl(getCooldownKey(guildId, userId, commandName));
  return ttl > 0 ? ttl : 0;
};

const clearCooldown = async (guildId, userId, commandName) => {
  if (!redisClient.isReady) return 0;
  return redisClient.unlink(getCooldownKey(guildId, userId, commandName));
};


const incrementGlobalMatchCount = async () => {
  if (!redisClient.isReady) return null;
  return redisClient.incr(GLOBAL_MATCH_COUNTER_KEY);
};

const incrementPlayerMatchCount = async (guildId, userId) => {
  if (!redisClient.isReady) return null;
  return redisClient.hIncrBy(getPlayerMatchCountKey(guildId), userId, 1);
};

const decrementPlayerMatchCount = async (guildId, userId) => {
  if (!redisClient.isReady) return null;
  const key = getPlayerMatchCountKey(guildId);
  const newCount = await redisClient.hIncrBy(key, userId, -1);
  if (newCount <= 0) {
    await redisClient.hDel(key, userId);
    return 0;
  }
  return newCount;
};

const getPlayerMatchCount = async (guildId, userId) => {
  if (!redisClient.isReady) return 0;
  const count = await redisClient.hGet(getPlayerMatchCountKey(guildId), userId);
  return parseInt(count, 10) || 0;
};

const clearPlayerMatchCounts = async (guildId) => {
  if (!redisClient.isReady) return 0;
  return redisClient.unlink(getPlayerMatchCountKey(guildId));
};


const setGenericLock = async (key, expirySeconds) => {
  if (!redisClient.isReady) return false;
  const res = await redisClient.set(key, "locked", { EX: expirySeconds, NX: true });
  return res === "OK";
};

const setGuildInterfaceLock = (guildId, expiry = 300) => setGenericLock(getGuildInterfaceLockKey(guildId), expiry);
const releaseGuildInterfaceLock = (guildId) => redisClient.isReady ? redisClient.unlink(getGuildInterfaceLockKey(guildId)) : 0;
const isGuildInterfaceLocked = async (guildId) => redisClient.isReady ? (await redisClient.exists(getGuildInterfaceLockKey(guildId))) === 1 : false;

const setLock = (guildId, expiry = 300) => setGenericLock(LOCK_KEY, expiry);
const releaseLock = () => redisClient.isReady ? redisClient.unlink(LOCK_KEY) : 0;
const isLocked = async () => redisClient.isReady ? (await redisClient.exists(LOCK_KEY)) === 1 : false;

const setUserLock = (userId, expiry = 5) => setGenericLock(`${process.env.REDIS_NAMESPACE}:global:user_lock:${userId}`, expiry);
const releaseUserLock = (userId) => redisClient.isReady ? redisClient.unlink(`${process.env.REDIS_NAMESPACE}:global:user_lock:${userId}`) : 0;

const setMatchLock = (matchKey, expiry = 5) => setGenericLock(`${matchKey}:lock`, expiry);
const releaseMatchLock = (matchKey) => redisClient.isReady ? redisClient.unlink(`${matchKey}:lock`) : 0;

const setMaintenanceMode = async (status) => {
  if (!redisClient.isReady) return false;
  return status ? redisClient.set(MAINTENANCE_KEY, "true") : redisClient.unlink(MAINTENANCE_KEY);
};

const isMaintenanceMode = async () => {
  if (!redisClient.isReady) return false;
  return (await redisClient.get(MAINTENANCE_KEY)) === "true";
};

const getMaintenanceStatus = async () => getCache(MAINTENANCE_KEY);

module.exports = {
  redisClient,
  connectRedis,
  getMediatorsOnlineKey,
  getQueueKey,
  getMatchKey,
  getServerConfig: getServerConfigKey,
  getServerConfigKey,
  getGeraisConfigKey,
  getFilaConfigKey,
  getCargosConfigKey,
  getCooldownKey,
  setCache,
  getCache,
  setMaintenanceMode,
  isMaintenanceMode,
  getMaintenanceStatus,
  setLock,
  releaseLock,
  isLocked,
  setUserLock,
  releaseUserLock,
  setMatchLock,
  releaseMatchLock,
  setGuildInterfaceLock,
  releaseGuildInterfaceLock,
  isGuildInterfaceLocked,
  setCooldown,
  getRemainingCooldown,
  clearCooldown,
  incrementGlobalMatchCount,
  incrementPlayerMatchCount,
  decrementPlayerMatchCount,
  getPlayerMatchCount,
  clearPlayerMatchCounts,
  clearAllGuildQueues,
  clearModalityQueues,
};