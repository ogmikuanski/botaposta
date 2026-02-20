const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");

const ModalityBlacklist = sequelize.define(
  "ModalityBlacklist",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: Server,
        key: "guildId",
      },
      onDelete: "CASCADE",
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    gameId: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isNumeric: {
          msg: "O ID do Jogo deve conter apenas números.",
        },
        len: {
          args: [5, 20],
          msg: "O ID do Jogo deve ter entre 5 e 20 caracteres.",
        },
      },
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    proofUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: true,
      },
    },
    addedByStaffId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    removedByStaffId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    removeReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    removeProofUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: true,
      },
    },
    removedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "modality_blacklist",
    timestamps: true,
  }
);

Server.hasMany(ModalityBlacklist, {
  foreignKey: "guildId",
  onDelete: "CASCADE",
});
ModalityBlacklist.belongsTo(Server, {
  foreignKey: "guildId",
  onDelete: "CASCADE",
});

module.exports = ModalityBlacklist;
