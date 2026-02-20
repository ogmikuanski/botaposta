const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");

const MediatorStats = sequelize.define(
  "MediatorStats",
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
    userId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    matchesMediated: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
  },
  {
    tableName: "mediator_stats",
    timestamps: true,
  }
);

Server.hasMany(MediatorStats, { foreignKey: "guildId", onDelete: "CASCADE" });
MediatorStats.belongsTo(Server, { foreignKey: "guildId", onDelete: "CASCADE" });

module.exports = MediatorStats;
