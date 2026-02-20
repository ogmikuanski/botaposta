const { MessageFlags, EmbedBuilder, Colors } = require("discord.js");
const { handlePullPanel } = require("../../services/pullService");
const { isBlacklisted } = require("../../manager/blacklistManager");
const Emojis = require("../../Emojis.json");

module.exports = {
  name: "med",
  description: "Puxa o painel do mediador para baixo.",

  execute: async (message, args, client) => {
    try {
        const userBlocked = await isBlacklisted(message.author.id, "user");
        if (userBlocked) {
             return message.reply({ 
                 content: process.env.MSGBLACKLISTMEMBERBOT || "Você está na blacklist." 
             });
        }
    } catch (err) {
        console.error("[Prefix Med] Erro ao verificar blacklist:", err);
    }

    const fakeInteraction = {
      guild: message.guild,
      channel: message.channel,
      user: message.author,
      member: message.member,
      replied: false,
      deferred: false,
      
      reply: async (payload) => {
        let msgPayload = payload;
        
        if (typeof payload === "object" && payload !== null) {
            const { withResponse, flags, fetchReply, ephemeral, ...rest } = payload;
            msgPayload = rest;
        } else if (typeof payload === "string") {
            msgPayload = { content: payload };
        }

        return await message.reply({ 
            ...msgPayload, 
            failIfNotExists: false 
        }).catch(async () => {
            return await message.channel.send(msgPayload).catch(() => {});
        });
      },

      followUp: async (payload) => {
        let msgPayload = payload;
        if (typeof payload === "object" && payload !== null) {
            const { withResponse, flags, ephemeral, ...rest } = payload;
            msgPayload = rest;
        } else if (typeof payload === "string") {
            msgPayload = { content: payload };
        }
        return await message.channel.send(msgPayload).catch(() => {});
      },

      deferReply: async () => {},
      deleteReply: async () => {},
      fetchReply: async () => { return message; },
      isChatInputCommand: () => false,
    };

    try {
        await handlePullPanel(fakeInteraction, client);
    } catch (err) {
        console.error(`[Prefix Med] Erro ao executar:`, err);
        message.channel.send(process.env.MSGERROBOT || "Ocorreu um erro interno.").catch(() => {});
    }
  },
};