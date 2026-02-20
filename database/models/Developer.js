const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");

const Developer = sequelize.define(
  "Developer",
  {
    userId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    addedBy: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "developers",
    timestamps: true,
  }
);

module.exports = Developer;
