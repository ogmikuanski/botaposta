const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");

const RoletaItem = sequelize.define(
  "RoletaItem",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM(
        "coins",
        "role",
        "ticket",
        "nothing"
      ),
      defaultValue: "coins",
    },
    value: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rarity: {
      type: DataTypes.ENUM("comum", "incomum", "raro", "epico", "lendario", "mistico"),
      defaultValue: "comum",
    },
    percentage: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      validate: {
        min: 0,
        max: 100
      }
    },
    color: {
      type: DataTypes.STRING,
      defaultValue: "#e89b00",
    }
  },
  {
    tableName: "roleta_items",
    timestamps: true,
  }
);

Server.hasMany(RoletaItem, { foreignKey: "guildId", onDelete: "CASCADE" });
RoletaItem.belongsTo(Server, { foreignKey: "guildId", onDelete: "CASCADE" });

module.exports = RoletaItem;