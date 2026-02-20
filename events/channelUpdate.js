const { Events } = require("discord.js");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const { ensurePersistentChannel } = require("../manager/persistentChannelManager");

module.exports = {
  name: Events.ChannelUpdate,
  once: false,

  async execute(oldChannel, newChannel) {
    if (!newChannel.guild) return;

    try {
      const configs = await ConfigsGerais.findOne({
        where: { guildId: newChannel.guild.id },
      });

      if (configs && configs.persistentChannelId === newChannel.id) {
        const nameChanged = oldChannel.name !== newChannel.name;
        const positionChanged = oldChannel.position !== newChannel.position;
        const parentChanged = oldChannel.parentId !== newChannel.parentId;
        const permsChanged = !oldChannel.permissionOverwrites.cache.equals(
          newChannel.permissionOverwrites.cache
        );

        if (nameChanged || positionChanged || parentChanged || permsChanged) {
          ensurePersistentChannel(newChannel.guild).catch();
        }
      }
    } catch (e) {
      console.error("[channelUpdate] Erro ao verificar canal:", e.message);
    }
  },
};
