const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const { redisClient, getServerConfigKey } = require("../../utils/cache");

const Server = sequelize.define(
  "Server",
  {
    guildId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      unique: true,
    },
    ownerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    guildName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    prefix: {
      type: DataTypes.STRING,
      defaultValue: process.env.DISCORD_PREFIX || ".",
      allowNull: false,
    },
    cooldown: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      allowNull: false,
    },
    botLeftAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    storeChannelId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    storeMessageId: {
      type: DataTypes.STRING,
      allowNull: true
    },
  },
  {
    tableName: "servers",
    timestamps: true,

    hooks: {
      afterSave: async (instance, options) => {
        if (!redisClient || !redisClient.isReady) return;
        try {
          const cacheKey = getServerConfigKey(instance.guildId);
          await redisClient.set(cacheKey, JSON.stringify(instance.toJSON()));
        } catch (err) {
          console.error(
            `[HOOK_Server] Falha ao atualizar cache ${instance.guildId}:`,
            err
          );
        }
      },
      afterDestroy: async (instance, options) => {
        if (!redisClient || !redisClient.isReady) return;
        try {
          const cacheKey = getServerConfigKey(instance.guildId);
          await redisClient.del(cacheKey);
        } catch (err) {
          console.error(
            `[HOOK_Server] Falha ao deletar cache ${instance.guildId}:`,
            err
          );
        }
      },
    },
  }
);

module.exports = Server;
