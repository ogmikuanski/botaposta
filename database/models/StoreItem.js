const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");

const StoreItem = sequelize.define(
  "StoreItem"
  , {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: Server,
        key: "guildId"
      },
      onDelete: "CASCADE"
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false, defaultValue: 0
    },

    emoji: {
      type: DataTypes.STRING,
      allowNull: true
    },
    banner: {
      type: DataTypes.STRING,
      allowNull: true
    },

    type: {
      type: DataTypes.ENUM("ROLE", "TICKET"),
      allowNull: false,
      defaultValue: "TICKET"
    },
    roleId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: false, defaultValue: -1
    },
  }, {
  tableName: "store_items",
  timestamps: true,
});

Server.hasMany(StoreItem, { foreignKey: "guildId", onDelete: "CASCADE" });
StoreItem.belongsTo(Server, { foreignKey: "guildId", onDelete: "CASCADE" });

module.exports = StoreItem;