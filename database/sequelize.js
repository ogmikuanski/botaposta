const { Sequelize, QueryTypes } = require("sequelize");
require("dotenv").config();

const { DB_DIALECT, DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME } = process.env;

if (!DB_NAME || !DB_USER || !DB_PASS) {
  console.error(
    "❌ [Database] CRITICAL: Faltam variáveis no .env (DB_NAME, DB_USER, DB_PASS)."
  );
  process.exit(1);
}

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  port: DB_PORT || 3306,
  dialect: "mariadb",
  logging: false,
  dialectOptions: {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
    connectTimeout: 10000,
    timezone: "Etc/GMT-3",
    allowPublicKeyRetrieval: true,
  },
  pool: {
    max: 30,
    min: 5,
    acquire: 30000,
    idle: 5000,
  },
  define: {
    timestamps: true,
    freezeTableName: true,
    underscored: false,
  },
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function autoFixTooManyKeys() {
  console.log("🧹 [AutoFix] Iniciando varredura de índices...");
  try {
    const results = await sequelize.query(`
      SELECT TABLE_NAME, INDEX_NAME 
      FROM information_schema.STATISTICS 
      WHERE TABLE_SCHEMA = :dbName 
      AND INDEX_NAME != 'PRIMARY' 
      AND INDEX_NAME REGEXP '_[0-9]+$';
    `, {
      replacements: { dbName: DB_NAME },
      type: QueryTypes.SELECT
    });

    const uniqueIndexes = new Set();
    const drops = [];

    results.forEach((row) => {
      const uniqueKey = `${row.TABLE_NAME}:${row.INDEX_NAME}`;
      if (!uniqueIndexes.has(uniqueKey)) {
        uniqueIndexes.add(uniqueKey);
        drops.push(row);
      }
    });

    if (drops.length === 0) return;

    console.log(`⚠️ [AutoFix] Limpando ${drops.length} índices redundantes...`);
    await Promise.all(drops.map(async (item) => {
      try {
        await sequelize.query(`ALTER TABLE \`${item.TABLE_NAME}\` DROP INDEX \`${item.INDEX_NAME}\`;`);
      } catch (err) { }
    }));
    console.log("✨ [AutoFix] Limpeza concluída.");
  } catch (err) {
    console.error("❌ [AutoFix] Erro:", err.message);
  }
}

const connectDB = async (retries = 5, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await sequelize.authenticate();
      console.log("✅ [Database] Conexão estabelecida com MariaDB.");

      await sequelize.sync({ force: false, alter: false });
      console.log("✅ [Database] Sincronização completa (Structure Updated).");
      return;

    } catch (error) {
      const msg = error.message || "";
      const code = error.parent?.code;

      if (msg.includes("delete property 'meta'") || msg.includes("object Array")) {
        console.warn("\n⚠️ [Database] Erro de compatibilidade do driver MariaDB detectado ('meta' property).");
        console.warn("🛡️ [Auto-Defense] Ativando MODO DE INICIALIZAÇÃO SEGURA.");

        try {
          await sequelize.sync({ force: false, alter: false });
          console.log("✅ [Database] Bot iniciado com sucesso (Modo Seguro - Sem alteração de Schema).");
          return;
        } catch (e) {
          console.error("❌ [Database] Falha crítica no Modo Seguro:", e.message);
          process.exit(1);
        }
      }

      if (msg.includes("Too many keys") || code === "ER_TOO_MANY_KEYS" || error.parent?.errno === 1069) {
        console.error("\n❌ [Database] Limite de Chaves (Too Many Keys).");
        await autoFixTooManyKeys();
        try {
          await sequelize.sync({ force: false, alter: false });
          console.log("✅ [Database] Recuperado após limpeza.");
          return;
        } catch (retryError) {
          process.exit(1);
        }
      }

      console.error(`❌ [Database] Tentativa ${i + 1}/${retries} falhou: ${msg}`);

      if (i < retries - 1) {
        await wait(delay);
        delay *= 1.5;
      }
    }
  }
  console.error("❌ [Database] Desistindo após várias tentativas.");
};

module.exports = { sequelize, connectDB };