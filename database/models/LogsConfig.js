const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");

const LogsConfig = sequelize.define(
  "LogsConfig",
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
    logApostaAbertaId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    logApostaConfirmadoId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    logApostaFinalizadaId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    logApostaCanceladaId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    logPartidasId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    logLojaId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    logLojaComprarId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    logRoletaId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    logRoletaPublicId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    logMediadorId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    logBlacklistId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "configs_logs",
    timestamps: false,
  }
);

Server.hasOne(LogsConfig, { foreignKey: "guildId", onDelete: "CASCADE" });
LogsConfig.belongsTo(Server, { foreignKey: "guildId", onDelete: "CASCADE" });

module.exports = LogsConfig;
