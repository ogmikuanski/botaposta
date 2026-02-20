const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");

const PlayerProfile = sequelize.define(
  "PlayerProfile",
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
    partidasTotais: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    wins: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    losses: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    wo: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    maxWinStreak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    currentWinStreak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    coins: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
  },
  {
    tableName: "player_profiles",
    timestamps: true,
  }
);

Server.hasMany(PlayerProfile, { foreignKey: "guildId", onDelete: "CASCADE" });
PlayerProfile.belongsTo(Server, { foreignKey: "guildId", onDelete: "CASCADE" });

module.exports = PlayerProfile;
