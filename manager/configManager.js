const {
  redisClient,
  getCache,
  setCache,
  getServerConfigKey,
  getGeraisConfigKey,
  getFilaConfigKey,
  getCargosConfigKey,
} = require("../utils/cache");
const Server = require("../database/models/server");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const FilaConfig = require("../database/models/FilaConfig");
const CargosConfig = require("../database/models/CargosConfig");

async function ensureServerExists(guildId) {
  try {
    await Server.findOrCreate({
      where: { guildId },
      defaults: { guildName: "Unknown Guild" }, 
    });
  } catch (error) {
    console.error(`[ConfigManager] Erro ao garantir existência do servidor ${guildId}:`, error);
    throw error; 
  }
}

async function getServerConfig(guildId, guildName) {
  const cacheKey = getServerConfigKey(guildId);
  if (redisClient.isReady) {
    try {
      const cachedConfig = await getCache(cacheKey);
      if (cachedConfig) return JSON.parse(cachedConfig);
    } catch (e) {
      console.error("Falha ao ler cache de config do server:", e);
    }
  }
  
  const [server, created] = await Server.findOrCreate({
    where: { guildId },
    defaults: { guildName },
  });

  if (!created && guildName && server.guildName !== guildName) {
      await server.update({ guildName });
  }

  if (redisClient.isReady) {
    await redisClient.set(cacheKey, JSON.stringify(server.toJSON()));
  }
  return server.toJSON();
}

async function getGeraisConfig(guildId) {
  const cacheKey = getGeraisConfigKey(guildId);
  if (!redisClient.isReady) return null;
  
  try {
    const cachedConfig = await getCache(cacheKey);
    if (cachedConfig) {
      return JSON.parse(cachedConfig);
    } else {
      await ensureServerExists(guildId);

      const [configs] = await ConfigsGerais.findOrCreate({
        where: { guildId },
        defaults: { guildId },
      });
      
      await redisClient.set(cacheKey, JSON.stringify(configs.toJSON()));
      
      return configs.toJSON();
    }
  } catch (e) {
    console.error("Falha ao ler/criar cache de config gerais:", e);
    return null;
  }
}

async function getFilaConfig(guildId) {
  const cacheKey = getFilaConfigKey(guildId);
  if (!redisClient.isReady) return null;
  
  try {
    const cachedConfig = await getCache(cacheKey);
    if (cachedConfig) {
      return JSON.parse(cachedConfig);
    } else {
      await ensureServerExists(guildId);

      const [configs] = await FilaConfig.findOrCreate({
        where: { guildId },
        defaults: { guildId },
      });

      await redisClient.set(cacheKey, JSON.stringify(configs.toJSON()));

      return configs.toJSON();
    }
  } catch (e) {
    console.error("Falha ao ler/criar cache de config fila:", e);
    return null;
  }
}

async function getCargosConfig(guildId) {
  const cacheKey = getCargosConfigKey(guildId);
  if (!redisClient.isReady) return null;
  
  try {
    const cachedConfig = await getCache(cacheKey);
    if (cachedConfig) {
      return JSON.parse(cachedConfig);
    } else {
      await ensureServerExists(guildId);

      const [configs] = await CargosConfig.findOrCreate({
        where: { guildId },
        defaults: { guildId },
      });

      await redisClient.set(cacheKey, JSON.stringify(configs.toJSON()));

      return configs.toJSON();
    }
  } catch (e) {
    console.error("Falha ao ler/criar cache de config cargos:", e);
    return null;
  }
}

async function warmupAllConfigs() {
  if (!redisClient.isReady) {
    console.warn(
      "[WARMUP] Redis não está pronto. Pulando aquecimento de cache."
    );
    return;
  }
  let total = 0;

  try {
    const pipeline = redisClient.multi();

    const servers = await Server.findAll();
    for (const server of servers) {
      pipeline.set(
        getServerConfigKey(server.guildId),
        JSON.stringify(server.toJSON())
      );
    }
    total += servers.length;

    const gerais = await ConfigsGerais.findAll();
    for (const config of gerais) {
      pipeline.set(
        getGeraisConfigKey(config.guildId),
        JSON.stringify(config.toJSON())
      );
    }
    total += gerais.length;

    const filas = await FilaConfig.findAll();
    for (const config of filas) {
      pipeline.set(
        getFilaConfigKey(config.guildId),
        JSON.stringify(config.toJSON())
      );
    }
    total += filas.length;

    const cargos = await CargosConfig.findAll();
    for (const config of cargos) {
      pipeline.set(
        getCargosConfigKey(config.guildId),
        JSON.stringify(config.toJSON())
      );
    }
    total += cargos.length;

    await pipeline.exec();
    console.log(
      `✅ [WARMUP] Cache aquecido com ${total} registros de configuração.`
    );
  } catch (err) {
    console.error("❌ [WARMUP] Erro fatal ao aquecer o cache:", err);
    throw err;
  }
}

module.exports = {
  getServerConfig,
  getGeraisConfig,
  getFilaConfig,
  getCargosConfig,
  warmupAllConfigs,
};