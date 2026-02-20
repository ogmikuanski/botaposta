const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");
const { redisClient, getGeraisConfigKey } = require("../../utils/cache");

const ConfigsGerais = sequelize.define(
  "ConfigsGerais",
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
    apostadosChannelId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    valorSala: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
      allowNull: false,
    },
    valoresApostados: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [1.0, 2.0, 3.0, 4.0, 5.0, 10.0, 20.0, 30.0, 50.0, 100.0],
    },
    roletaCost: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    mediatorPanelChannelId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    mediatorPanelMessageId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    blacklistPanelChannelId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    blacklistPanelMessageId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    perfilPanelChannelId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    perfilPanelMessageId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    assignMediatorOnMatchCreate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    persistentChannelId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    persistentMessageId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    storeChannelId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    storeMessageId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    roletaPanelChannelId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    roletaPanelMessageId: {
      type: DataTypes.STRING,
      allowNull: true
    },
  },
  {
    tableName: "configs_gerais",
    timestamps: false,

    hooks: {
      afterSave: async (instance, options) => {
        if (!redisClient || !redisClient.isReady) return;
        try {
          const cacheKey = getGeraisConfigKey(instance.guildId);
          await redisClient.set(cacheKey, JSON.stringify(instance.toJSON()));
        } catch (err) {
          console.error(
            `[HOOK_ConfigsGerais] Falha ao atualizar cache ${instance.guildId}:`,
            err
          );
        }
      },
      afterDestroy: async (instance, options) => {
        if (!redisClient || !redisClient.isReady) return;
        try {
          const cacheKey = getGeraisConfigKey(instance.guildId);
          await redisClient.del(cacheKey);
        } catch (err) {
          console.error(
            `[HOOK_ConfigsGerais] Falha ao deletar cache ${instance.guildId}:`,
            err
          );
        }
      },
    },
  }
);

Server.hasOne(ConfigsGerais, { foreignKey: "guildId", onDelete: "CASCADE" });
ConfigsGerais.belongsTo(Server, { foreignKey: "guildId", onDelete: "CASCADE" });

module.exports = ConfigsGerais;
