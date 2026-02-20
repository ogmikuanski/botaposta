const Server = require("../database/models/server");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const FilaConfig = require("../database/models/FilaConfig");
const CargosConfig = require("../database/models/CargosConfig");
const LogsConfig = require("../database/models/LogsConfig");

async function syncAllGuildsDatabase(client) {
  console.log(
    `🔄 [SyncManager] Iniciando verificação de integridade dos servidores...`
  );

  const guilds = client.guilds.cache;
  let updatedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;

  for (const [guildId, guild] of guilds) {
    try {
      let server = await Server.findOne({ where: { guildId } });

      const currentName = guild.name;

      if (!server) {
        server = await Server.create({
          guildId,
          guildName: currentName,
          botLeftAt: null,
        });
        createdCount++;
      } else {
        const nameChanged = server.guildName !== currentName;
        const wasLeft = server.botLeftAt !== null;

        if (nameChanged || wasLeft) {
          await server.update({
            guildName: currentName,
            botLeftAt: null,
          });
          updatedCount++;
        } else {
          skippedCount++;
        }
      }

      await Promise.all([
        ConfigsGerais.findOrCreate({
          where: { guildId },
          defaults: { guildId },
        }),
        FilaConfig.findOrCreate({ where: { guildId }, defaults: { guildId } }),
        CargosConfig.findOrCreate({
          where: { guildId },
          defaults: { guildId },
        }),
        LogsConfig.findOrCreate({ where: { guildId }, defaults: { guildId } }),
      ]);

    } catch (err) {
      console.error(
        `❌ [SyncManager] Erro ao sincronizar ${guild.name} (${guildId}):`,
        err.message
      );
    }
  }

  console.log(
    `✅ [SyncManager] Finalizado.\n   - Criados: ${createdCount}\n   - Atualizados: ${updatedCount}\n   - Sem alterações: ${skippedCount}`
  );
}

module.exports = { syncAllGuildsDatabase };