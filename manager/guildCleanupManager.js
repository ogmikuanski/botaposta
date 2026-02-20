const { Op } = require("sequelize");
const Server = require("../database/models/server");
const { redisClient } = require("../utils/cache");
const { sequelize } = require("../database/sequelize");

const CONFIG = {
  REDIS_KEY_PREFIX: process.env.REDIS_NAMESPACE,

  INACTIVE_DAYS: 0,
  CRON_CLEANUP_MS: 60 * 60 * 1000,
  CRON_INTEGRITY_MS: 12 * 60 * 60 * 1000,
  STARTUP_DELAY_MS: 25 * 1000,

  SCAN_COUNT: 500,
  DELETE_BATCH: 500,

  DEBUG: true
};

const log = {
  info: (m) => console.log(`\x1b[36m[CLEANUP]\x1b[0m ${m}`),
  success: (m) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${m}`),
  warn: (m) => console.log(`\x1b[33m[WARN]\x1b[0m ${m}`),
  error: (m) => console.error(`\x1b[31m[ERROR]\x1b[0m ${m}`),
  debug: (m) => CONFIG.DEBUG && console.log(`\x1b[90m[DEBUG]\x1b[0m ${m}`)
};

let cleanupRunning = false;
let integrityRunning = false;


function normalizeRedisKey(key) {
  if (Buffer.isBuffer(key)) return key.toString("utf8");
  if (typeof key === "string") return key;
  return null;
}

async function safeDelete(keys) {
  if (!keys.length) return 0;

  try {
    return await redisClient.unlink(keys);
  } catch {
    return await redisClient.del(keys);
  }
}

async function purgeGuildData(guildId) {
  if (!redisClient?.isOpen) throw new Error("Redis offline");

  const id = String(guildId);
  const rootKey = `${CONFIG.REDIS_KEY_PREFIX}:${id}`;
  const pattern = `${rootKey}:*`;

  let deleted = 0;

  deleted += await safeDelete([rootKey]);

  let batch = [];

  for await (let key of redisClient.scanIterator({
    MATCH: pattern,
    COUNT: CONFIG.SCAN_COUNT
  })) {
    key = normalizeRedisKey(key);
    if (!key) continue;

    batch.push(key);

    if (batch.length >= CONFIG.DELETE_BATCH) {
      deleted += await safeDelete(batch);
      batch.length = 0;
    }
  }

  if (batch.length) {
    deleted += await safeDelete(batch);
  }

  return deleted;
}
async function runCleanupRoutine(client) {
  if (cleanupRunning) return;
  cleanupRunning = true;

  try {
    const cutoff = new Date(Date.now() - CONFIG.INACTIVE_DAYS * 86400000);

    const servers = await Server.findAll({
      where: { botLeftAt: { [Op.not]: null, [Op.lt]: cutoff } },
      limit: 50
    });

    for (const server of servers) {
      const { guildId, guildName } = server;

      if (client.guilds.cache.has(guildId)) {
        await server.update({ botLeftAt: null });
        continue;
      }

      const transaction = await sequelize.transaction();

      try {
        const redisDeleted = await purgeGuildData(guildId);
        await server.destroy({ transaction });
        await transaction.commit();

        log.success(`Guild ${guildName} removida | Redis: ${redisDeleted}`);
      } catch (err) {
        await transaction.rollback();
        log.error(`Falha ao remover ${guildName}: ${err.message}`);
      }
    }
  } catch (err) {
    log.error(`Cleanup fatal: ${err.message}`);
  } finally {
    cleanupRunning = false;
  }
}

async function runIntegrityCheck(client) {
  if (integrityRunning || !redisClient?.isOpen) return;
  integrityRunning = true;

  try {
    const dbServers = await Server.findAll({ attributes: ["guildId"], raw: true });
    const validIds = new Set(dbServers.map(s => String(s.guildId)));
    const botGuilds = client.guilds.cache;

    const ghosts = new Set();
    const pattern = `${CONFIG.REDIS_KEY_PREFIX}:*`;

    for await (let key of redisClient.scanIterator({
      MATCH: pattern,
      COUNT: CONFIG.SCAN_COUNT
    })) {
      key = normalizeRedisKey(key);
      if (!key) continue;

      const [, guildId] = key.split(":");
      if (!guildId || !/^\d+$/.test(guildId)) continue;

      if (!validIds.has(guildId) && !botGuilds.has(guildId)) {
        ghosts.add(guildId);
      }
    }

    for (const ghostId of ghosts) {
      const removed = await purgeGuildData(ghostId);
      log.warn(`Fantasma ${ghostId} exorcizado | Redis: ${removed}`);
    }

  } catch (err) {
    log.error(`Integrity error: ${err.message}`);
  } finally {
    integrityRunning = false;
  }
}

function startGuildCleanupCron(client) {
  if (!client) throw new Error("Discord client inválido");

  log.info("Serviço de limpeza iniciado");
  log.info(`Prefixo Redis: ${CONFIG.REDIS_KEY_PREFIX}`);

  setTimeout(() => runCleanupRoutine(client), CONFIG.STARTUP_DELAY_MS);
  setInterval(() => runCleanupRoutine(client), CONFIG.CRON_CLEANUP_MS);
  setInterval(() => runIntegrityCheck(client), CONFIG.CRON_INTEGRITY_MS);
}

module.exports = { startGuildCleanupCron };
