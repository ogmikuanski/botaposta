const { DataTypes } = require("sequelize");
const { sequelize } = require("../sequelize");
const Server = require("./server");

const QueueMessageConfig = sequelize.define("QueueMessageConfig", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
    mode: { type: DataTypes.STRING, defaultValue: 'text' },
    textContent: { type: DataTypes.TEXT, allowNull: true },
    embedJSON: { type: DataTypes.JSON, allowNull: true },
    targetChannels: { type: DataTypes.JSON, defaultValue: [] },
    activeMessages: { type: DataTypes.JSON, defaultValue: [] },
    status: { type: DataTypes.BOOLEAN, defaultValue: false }
});

Server.hasOne(QueueMessageConfig, { foreignKey: "guildId", onDelete: "CASCADE" });
QueueMessageConfig.belongsTo(Server, { foreignKey: "guildId", onDelete: "CASCADE" });

module.exports = QueueMessageConfig;