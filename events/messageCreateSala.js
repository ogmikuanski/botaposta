const {
  Events,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { redisClient, getMatchKey } = require("../utils/cache");
const Emojis = require("../Emojis.json");
const CargosConfig = require("../database/models/CargosConfig");

const getPendingSalaKey = (guildId, threadId) =>
  `${process.env.REDIS_NAMESPACE}:${guildId}:sala_pending:${threadId}`;
const PENDING_EXPIRY_SECONDS = 180;

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client) {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;
      if (
        message.channel.type !== ChannelType.PrivateThread &&
        message.channel.type !== ChannelType.PublicThread
      )
        return;

      const threadName = message.channel.name;
      if (!threadName.startsWith("Filas-") && !threadName.startsWith("Pagar-"))
        return;

      const thread = message.channel;
      const guild = message.guild;

      const matchKey = getMatchKey(guild.id, thread.id);
      const matchDataJSON = await redisClient.get(matchKey);
      if (!matchDataJSON) return;

      const matchData = JSON.parse(matchDataJSON);

      let canCreateRoom = message.author.id === matchData.assignedMediatorId;

      if (!canCreateRoom) {
        const [cargosConfig] = await CargosConfig.findOrCreate({
          where: { guildId: guild.id },
        });
        const permMaxRoleId = cargosConfig.cargoPermMaxId;
        if (permMaxRoleId && message.member.roles.cache.has(permMaxRoleId)) {
          canCreateRoom = true;
        }
      }

      if (!canCreateRoom) return;

      const premiacao =
        (Math.round(matchData.valorBase * 100) * matchData.maxPlayers) / 100;
      const premiacaoFormatada = premiacao.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      const lines = message.content
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const pendingKey = getPendingSalaKey(guild.id, thread.id);

      let foundId = null;
      let foundSenha = null;

      if (
        lines.length === 2 &&
        /^\d{6,12}$/.test(lines[0]) &&
        /^\d{1,2}$/.test(lines[1])
      ) {
        foundId = lines[0];
        foundSenha = lines[1];
        await redisClient.del(pendingKey);

      } else if (lines.length === 1 && /^\d{6,12}$/.test(lines[0])) {
        foundId = lines[0];
        await redisClient.set(pendingKey, foundId, {
          EX: PENDING_EXPIRY_SECONDS,
        });
        return;

      } else if (lines.length === 1 && /^\d{1,2}$/.test(lines[0])) {
        const pendingId = await redisClient.get(pendingKey);
        if (!pendingId) return;
        foundId = pendingId;
        foundSenha = lines[0];
        await redisClient.del(pendingKey);
      } else {
        return;
      }

      try {
        const valorParaNome = premiacao.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const novoNome = `Pagar-R$${valorParaNome}`;
        if (thread.name !== novoNome && thread.manageable) {
          await thread.setName(novoNome);
        }
      } catch (err) {
        console.error(
          `[Evento messageCreateSala] Falha ao renomear o tópico ${thread.id}`,
          err.message
        );
      }

      const playersMention = matchData.players
        .map((id) => `<@${id}>`)
        .join(" ");

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "SALA CRIADA",
          iconURL: guild.iconURL({ dynamic: true }),
        })
        .setColor(process.env.botcolor || Colors.Green)
        .setDescription(
          `${Emojis.setabranca || "»"} **ID:** \`${foundId}\`\n` +
          `${Emojis.setabranca || "»"} **Senha:** \`${foundSenha}\`\n` +
          `${Emojis.money || "»"} **Premiação:** \`${premiacaoFormatada}\`\n\n` +
          "> Fique atento! Em cerca de `3 a 5 minutos` a sala será iniciada."
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`copy_sala_id:${foundId}`)
          .setLabel("Copiar ID")
          .setEmoji(Emojis.id || "📋")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`copy_sala_senha:${foundSenha}`)
          .setLabel("Copiar Senha")
          .setEmoji(Emojis.id || "🔒")
          .setStyle(ButtonStyle.Secondary)
      );

      await thread.send({
        content: playersMention,
        embeds: [embed],
        components: [row],
      });
    } catch (err) {
      if (err.code === 10003) return;
      if (err.code === 50035) return;
      console.error(
        "[Evento messageCreateSala] Erro ao processar mensagem do mediador:",
        err
      );
    }
  },
};
