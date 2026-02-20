const { Events, ChannelType, AttachmentBuilder } = require("discord.js");
const { redisClient, getMatchKey } = require("../utils/cache");
const { QrCodePix } = require("qrcode-pix");
const CargosConfig = require("../database/models/CargosConfig");

const REGEX_PIX = {
  CPF: /^(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})$/,
  CNPJ: /^(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})$/,
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  TELEFONE: /^(?:\+?55)?\s?(?:\(?\d{2}\)?)\s?(?:9\d{4})[-.\s]?\d{4}$/,
  EVP: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
};

function extractPixKey(content) {
  const cleanContent = content.trim();

  for (const [type, regex] of Object.entries(REGEX_PIX)) {
    if (regex.test(cleanContent)) {
      let key = cleanContent;
      if (type === "CPF" || type === "CNPJ" || type === "TELEFONE") {
        key = key.replace(/\D/g, "");
      }
      return { key, type };
    }
  }
  return null;
}

function sanitizeText(text, maxLength) {
  if (!text) return "DESCONHECIDO";
  return (
    String(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .substring(0, maxLength) || "USER"
  );
}

function getTeams(players) {
  const half = Math.ceil(players.length / 2);
  const time1 = players.slice(0, half);
  const time2 = players.slice(half);
  return { time1, time2 };
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      const channel = message.channel;
      if (
        channel.type !== ChannelType.PrivateThread &&
        channel.type !== ChannelType.PublicThread
      ) {
        return;
      }

      if (message.mentions.users.size > 0) return;

      const detected = extractPixKey(message.content);
      const channelName = channel.name;

      if (
        (channelName.startsWith("aguardando-confirmacao") ||
          channelName.startsWith("Filas-")) &&
        detected
      ) {
        if (message.deletable) {
          await message.delete().catch(() => { });
        }
        return;
      }

      if (channelName.startsWith("Pagar-")) {
        if (!detected) return;

        const matchKey = getMatchKey(message.guild.id, channel.id);
        const matchDataJSON = await redisClient.get(matchKey);

        if (!matchDataJSON) {
          if (message.deletable) await message.delete().catch(() => { });
          return;
        }

        const matchData = JSON.parse(matchDataJSON);
        const userId = message.author.id;

        const [cargosConfig] = await CargosConfig.findOrCreate({
          where: { guildId: message.guild.id },
        });
        const permMaxRoleId = cargosConfig.cargoPermMaxId;
        const isPermMax =
          permMaxRoleId && message.member.roles.cache.has(permMaxRoleId);

        const isPlayer =
          matchData.players && matchData.players.includes(userId);

        if (!isPlayer && !isPermMax) {
          if (message.deletable) await message.delete().catch(() => { });
          return;
        }

        if (matchData.pendingWinnerTeamId) {
          const { time1, time2 } = getTeams(matchData.players);
          const winners =
            matchData.pendingWinnerTeamId === "time1" ? time1 : time2;
          const isWinner = winners.includes(userId);

          if (!isWinner && !isPermMax) {
            if (message.deletable) await message.delete().catch(() => { });
            return;
          }
        }

        const pix = QrCodePix({
          version: "01",
          key: detected.key,
          name: sanitizeText(message.author.username, 25),
          city: process.env.PIX_RECEIVER_CITY || "BRASIL",
          transactionId: "PAGAMENTO",
        });

        const base64 = await pix.base64();
        const buffer = Buffer.from(base64.split(",")[1], "base64");
        const attachment = new AttachmentBuilder(buffer, {
          name: "qrcode.png",
        });

        const replyContent = {
          content: detected.key,//- Tipo do Pix: \`${detected.type}\`\n> \`${detected.key}\`
          allowedMentions: { repliedUser: false },
        };

        try {
          await message.reply({
            ...replyContent,
            files: [attachment],
          });
        } catch (sendErr) {
          if (
            sendErr.rawError?.message ===
            "Access to file uploads has been limited for this guild" ||
            sendErr.code === 400001
          ) {
            await message.reply({
              ...replyContent,
              content:
                replyContent.content +
                "\n⚠️ **O servidor restringiu envio de imagens. Copie e cole a chave acima.**",
            });
          } else {
            throw sendErr;
          }
        }
      }
    } catch (err) {
      if (err.code === 10003) return;
      if (err.code === 50035) return;
      console.error("[Pix] Erro ao processar mensagem:", err);
    }
  },
};
