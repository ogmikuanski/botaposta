const { handlePullWin } = require("../../services/pullWinService");

module.exports = {
  name: "v",
  description: "Define o vencedor da partida diretamente.",

  execute: async (message, args, client) => {

    if (message.mentions.users.size === 0) return;
    const targetUser = message.mentions.users.first();

    const fakeInteraction = {
      guild: message.guild,
      channel: message.channel,
      user: message.author,
      member: message.member,
      replied: false,
      deferred: false,
      client: client,
      reply: async (payload) => {
        if (typeof payload === "string") payload = { content: payload };
        return await message.reply({ 
            ...payload, 
            failIfNotExists: false 
        }).catch(async () => {
            return await message.channel.send(payload).catch(() => {});
        });
      },
      followUp: async (payload) => {
        return await message.channel.send(payload).catch(() => {});
      },
      deferReply: async () => { },
      deleteReply: async () => { },
      isChatInputCommand: () => false,
    };

    await handlePullWin(fakeInteraction, client, targetUser.id);
  },
};