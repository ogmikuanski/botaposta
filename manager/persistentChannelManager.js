const {
  ChannelType,
  PermissionsBitField,
  DiscordAPIError,
} = require("discord.js");

const ConfigsGerais = require("../database/models/ConfigsGerais");
const Server = require("../database/models/server");
const { redisClient } = require("../utils/cache");
const { GUILD_LOG_SERVER_ID } = process.env;


const CHANNEL_NAME = process.env.LOGOMARCACANAL;
const EXPECTED_MESSAGE_CONTENT =
  process.env.LOGOMARCA;

const MAX_ALLOWED_POSITION = 3;


const REQUIRED_BOT_GUILD_PERMS = [
  PermissionsBitField.Flags.Administrator,
];

const REQUIRED_BOT_CHANNEL_PERMS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.ManageMessages,
  PermissionsBitField.Flags.ManageChannels,
];

const REQUIRED_EVERYONE_DENY = [
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.AddReactions,
  PermissionsBitField.Flags.CreatePublicThreads,
  PermissionsBitField.Flags.CreatePrivateThreads,
  PermissionsBitField.Flags.SendMessagesInThreads,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.AttachFiles,
];


function payload() {
  return { content: EXPECTED_MESSAGE_CONTENT };
}

function hasPerms(target, member, perms) {
  const p = target.permissionsFor(member);
  return !!p && perms.every(x => p.has(x));
}

function isHardPermissionError(err) {
  return err instanceof DiscordAPIError &&
    (err.code === 50013 || err.code === 50001);
}

async function leaveGuild(guild, reason) {
  /*console.error(`[SECURE-CHANNEL][${guild.name}] ${reason}`);*/
  try {
    await guild.leave();
  } catch { }
}

async function ensurePersistentChannel(guild) {
  if (!guild || guild.id === GUILD_LOG_SERVER_ID) return;
  if (!redisClient?.isReady) return;

  const LOCK = `${process.env.REDIS_NAMESPACE}:persistentChannel:lock:${guild.id}`;
  if (!await redisClient.set(LOCK, "1", { NX: true, EX: 25 })) return;

  try {
    const client = guild.client;
    const me = guild.members.me;
    if (!me) return;

    if (!me.permissions.has(REQUIRED_BOT_GUILD_PERMS)) {
      return leaveGuild(guild, "Bot sem Administrator.");
    }

    await Server.findOrCreate({
      where: { guildId: guild.id },
      defaults: { guildId: guild.id, guildName: guild.name },
    });

    const [configs] = await ConfigsGerais.findOrCreate({
      where: { guildId: guild.id },
      defaults: { guildId: guild.id },
    });

    const categories = guild.channels.cache
      .filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition);

    const firstCategory = categories.first() || null;

    if (
      firstCategory &&
      !hasPerms(firstCategory, me, [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ManageChannels,
      ])
    ) {
      return leaveGuild(guild, "Sem acesso à primeira categoria.");
    }

    let channel = null;

    if (configs.persistentChannelId) {
      try {
        channel = await guild.channels.fetch(configs.persistentChannelId);
      } catch {
        channel = null;
        configs.persistentChannelId = null;
        configs.persistentMessageId = null;
        await configs.save();
      }
    }

    if (!channel) {
      channel = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name === CHANNEL_NAME
      );
    }

    if (!channel) {
      try {
        channel = await guild.channels.create({
          name: CHANNEL_NAME,
          type: ChannelType.GuildText,
          parent: firstCategory?.id ?? null,
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: REQUIRED_EVERYONE_DENY,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.ReadMessageHistory,
              ],
            },
            {
              id: client.user.id,
              allow: REQUIRED_BOT_CHANNEL_PERMS,
            },
          ],
          reason: "Secure Labs Channel",
        });

        await configs.update({
          persistentChannelId: channel.id,
          persistentMessageId: null,
        });
      } catch (e) {
        if (isHardPermissionError(e))
          return leaveGuild(guild, "Falha ao criar canal seguro.");
        return;
      }
    }

    if (channel.name !== CHANNEL_NAME) {
      try {
        await channel.setName(CHANNEL_NAME);
      } catch (e) {
        if (isHardPermissionError(e))
          return leaveGuild(guild, "Não foi possível restaurar nome.");
      }
    }

    if (firstCategory) {
      if (channel.parentId !== firstCategory.id) {
        try {
          await channel.setParent(firstCategory.id, { lockPermissions: false });
        } catch (e) {
          if (isHardPermissionError(e))
            return leaveGuild(guild, "Não foi possível mover para a primeira categoria.");
        }
      }
    } else if (channel.parentId !== null) {
      try {
        await channel.setParent(null);
      } catch (e) {
        if (isHardPermissionError(e))
          return leaveGuild(guild, "Não foi possível remover categoria.");
      }
    }

    if (channel.position > MAX_ALLOWED_POSITION) {
      try {
        await channel.setPosition(0);
      } catch (e) {
        if (isHardPermissionError(e))
          return leaveGuild(guild, "Não foi possível corrigir posição do canal.");
      }
    }

    try {
      await channel.permissionOverwrites.set([
        {
          id: guild.roles.everyone,
          deny: REQUIRED_EVERYONE_DENY,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: REQUIRED_BOT_CHANNEL_PERMS,
        },
      ]);
    } catch (e) {
      if (isHardPermissionError(e))
        return leaveGuild(guild, "Permissões do canal foram adulteradas.");
    }

    if (!hasPerms(channel, me, REQUIRED_BOT_CHANNEL_PERMS)) {
      return leaveGuild(guild, "Bot perdeu permissão no canal.");
    }

    let secureMessage = null;
    let messages;

    try {
      messages = await channel.messages.fetch({ limit: 15 });
    } catch {
      return;
    }

    for (const msg of messages.values()) {
      if (
        msg.author.id === client.user.id &&
        msg.content === EXPECTED_MESSAGE_CONTENT &&
        !secureMessage
      ) {
        secureMessage = msg;
      } else {
        try {
          await msg.delete();
        } catch (e) {
          if (isHardPermissionError(e))
            return leaveGuild(guild, "Não foi possível limpar mensagens.");
        }
      }
    }

    if (!secureMessage) {
      try {
        const m = await channel.send(payload());
        await configs.update({ persistentMessageId: m.id });
      } catch (e) {
        if (isHardPermissionError(e))
          return leaveGuild(guild, "Não foi possível recriar mensagem segura.");
      }
    }

  } catch (err) {
    console.error("[SECURE-CHANNEL][UNEXPECTED]", err);
  } finally {
    await redisClient.del(LOCK);
  }
}

module.exports = {
  ensurePersistentChannel,
  getPersistentMessagePayload: payload,
};
