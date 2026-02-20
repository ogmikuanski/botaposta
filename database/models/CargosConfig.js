const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");
const { redisClient, getCargosConfigKey } = require("../../utils/cache");

const CargosConfig = sequelize.define(
  "CargosConfig",
  {
    guildId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      references: {
        model: Server,
        key: "guildId",
      },
      onDelete: "CASCADE",
    },
    cargoPermMaxId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cargoMediadorId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cargoAcessoApostadoId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    autoRoleId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "configs_cargos",
    timestamps: false,

    hooks: {
      afterSave: async (instance, options) => {
        if (!redisClient || !redisClient.isReady) return;
        try {
          const cacheKey = getCargosConfigKey(instance.guildId);
          await redisClient.set(cacheKey, JSON.stringify(instance.toJSON()));
        } catch (err) {
          console.error(
            `[HOOK_CargosConfig] Falha ao atualizar cache ${instance.guildId}:`,
            err
          );
        }
      },
      afterDestroy: async (instance, options) => {
        if (!redisClient || !redisClient.isReady) return;
        try {
          const cacheKey = getCargosConfigKey(instance.guildId);
          await redisClient.del(cacheKey);
        } catch (err) {
          console.error(
            `[HOOK_CargosConfig] Falha ao deletar cache ${instance.guildId}:`,
            err
          );
        }
      },
    },
  }
);

Server.hasOne(CargosConfig, { foreignKey: "guildId", onDelete: "CASCADE" });
CargosConfig.belongsTo(Server, { foreignKey: "guildId", onDelete: "CASCADE" });

module.exports = CargosConfig;
