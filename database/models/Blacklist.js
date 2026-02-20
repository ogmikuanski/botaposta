const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");

const Blacklist = sequelize.define(
  "Blacklist",
  {
    entityId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: "Nenhum motivo fornecido.",
    },

    addedByUserId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provaUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: false,
      },
    },
  },
  {
    tableName: "blacklist",
    timestamps: true,
  }
);

module.exports = Blacklist;
