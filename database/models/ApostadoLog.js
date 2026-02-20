const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");

const ApostadoLog = sequelize.define(
  "ApostadoLog",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: { model: Server, key: "guildId" },
    },
    matchId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    threadId: {
      type: DataTypes.STRING,
      allowNull: true,
      _comment: "The Snowflake ID of the match thread",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "ABERTA",
    },
    modoDisplay: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    valorBase: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    valorSala: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    mediatorId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    winnerIds: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    matchType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "apostado_log",
    timestamps: true,
  }
);

Server.hasMany(ApostadoLog, { foreignKey: "guildId", onDelete: "CASCADE" });
ApostadoLog.belongsTo(Server, { foreignKey: "guildId", onDelete: "CASCADE" });

module.exports = ApostadoLog;
