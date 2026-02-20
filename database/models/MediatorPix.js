const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");

const MediatorPix = sequelize.define(
  "MediatorPix",
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
    bankName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    accountName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    pixKeyType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    pixKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "mediator_pix",
    timestamps: true,
  }
);

Server.hasMany(MediatorPix, { foreignKey: "guildId", onDelete: "CASCADE" });
MediatorPix.belongsTo(Server, { foreignKey: "guildId", onDelete: "CASCADE" });


module.exports = MediatorPix;
