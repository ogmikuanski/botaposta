const { Events } = require("discord.js");
const CargosConfig = require("../database/models/CargosConfig");

module.exports = {
  name: Events.GuildRoleDelete,
  once: false,

  async execute(role) {
    if (!role.guild) return;
    const guildId = role.guild.id;

    try {
      const cargosConfig = await CargosConfig.findOne({ where: { guildId } });
      if (!cargosConfig) return;

      const updates = {};
      if (cargosConfig.cargoPermMaxId === role.id)
        updates.cargoPermMaxId = null;
      if (cargosConfig.cargoMediadorId === role.id)
        updates.cargoMediadorId = null;
      if (cargosConfig.cargoAcessoApostadoId === role.id)
        updates.cargoAcessoApostadoId = null;

      if (Object.keys(updates).length > 0) {
        await cargosConfig.update(updates);
      }
    } catch (err) {
      console.error(`❌ [RoleDelete] Erro ao atualizar DB: ${err.message}`);
    }
  },
};
