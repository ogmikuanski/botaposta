const { PermissionFlagsBits, EmbedBuilder, Colors, parseEmoji } = require("discord.js");
const Emojis = require("../../Emojis.json");
const { isBlacklisted } = require("../../manager/blacklistManager");
const { isDev } = require("../../manager/devManager");
const { isMaintenanceMode, getRemainingCooldown, setCooldown } = require("../../utils/cache");
const { createSystemPagination } = require("../../utils/systemPageBuilder");

const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []);

const simpleEmbed = (description, color = Colors.Red) => {
    return new EmbedBuilder()
        .setColor(process.env.botcolor || color)
        .setDescription(description);
};

module.exports = {
  name: "emojiadd",
  description: "Gerenciar emojis: Adiciona, Lista ou Procura.",

  execute: async (message, args, client) => {
    const userBlocked = await isBlacklisted(message.author.id, "user");
    if (userBlocked) return; 

    const subAction = args[0]?.toLowerCase();

    if (subAction === "lista") {
      const payload = await createSystemPagination(client, 0, "all");
      return message.reply({ ...payload, allowedMentions: { repliedUser: false } });
    }

    if (subAction === "procurar") {
      const query = args[1];
      if (!query) {
          return message.reply({ embeds: [simpleEmbed(`### ${Emojis.aviso || "⚠️"} Faltou o nome!\nUse: \`.addemoji procurar <nome>\``, Colors.Yellow)] });
      }
      const payload = await createSystemPagination(client, 0, query);
      return message.reply({ ...payload, allowedMentions: { repliedUser: false } });
    }

    let responseMsg;
    try {
      responseMsg = await message.reply({ 
          embeds: [simpleEmbed(`${Emojis.carregando || "🔄"} **Processando...**`, Colors.Blue)] 
      });
    } catch (e) { return; }

    try {
      const userIsDev = await isDev(message.author.id);
      const userIsOnEquipe = ownerIdSet.has(message.author.id) || userIsDev;

      if (!userIsOnEquipe && await isMaintenanceMode()) {
        return responseMsg.edit({ embeds: [simpleEmbed(`### ${Emojis.verifybot || "🤖"} ${process.env.MSGMANUTENCAO}`, Colors.Orange)] });
      }

      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions) && !userIsOnEquipe) {
        return responseMsg.edit({ embeds: [simpleEmbed(`### ${Emojis.circlecross || "🚫"} Sem Permissão\nVocê precisa de \`Gerenciar Emojis\`.`)] });
      }
      if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
        return responseMsg.edit({ embeds: [simpleEmbed(`### ${Emojis.circlecross || "🚫"} Sem Permissão\nEu preciso de \`Gerenciar Emojis\`.`)] });
      }

      const remaining = await getRemainingCooldown(message.guild.id, message.author.id, module.exports.name);
      if (remaining > 0 && !userIsOnEquipe) {
        return responseMsg.edit({ embeds: [simpleEmbed(`### ${Emojis.time || "⏱️"} Calma aí!\nAguarde **${remaining.toFixed(1)}s**.`, Colors.Yellow)] });
      }
      if(!userIsOnEquipe) await setCooldown(message.guild.id, message.author.id, module.exports.name, 5);

      const nome = args[0];
      const link = args[1];
      const arquivo = message.attachments.first();
      let emojiSource, sanitizedName;

      if (!nome) {
        return responseMsg.edit({ 
            embeds: [simpleEmbed(`### ${Emojis.naoentendi || "❓"} Como usar:\n\n> **Adicionar:** \`.addemoji <nome> [link/anexo]\`\n> **Listar:** \`.addemoji lista\`\n> **Buscar:** \`.addemoji procurar <nome>\``, Colors.Blue)]
        });
      }

      if (!link && !arquivo) {
        const parsed = parseEmoji(nome);
        if (parsed?.id) {
            emojiSource = `https://cdn.discordapp.com/emojis/${parsed.id}.${parsed.animated ? "gif" : "png"}`;
            sanitizedName = parsed.name;
        } else {
             return responseMsg.edit({ embeds: [simpleEmbed(`### ${Emojis.circlecross || "❌"} Erro\nImagem não encontrada. Envie um link ou anexo.`)] });
        }
      } else {
        if (link && arquivo) return responseMsg.edit({ embeds: [simpleEmbed(`### ${Emojis.circlecross || "❌"} Erro\nEnvie Link OU Arquivo, não ambos.`)] });
        emojiSource = arquivo ? arquivo.url : link;
        sanitizedName = nome.replace(/[^a-zA-Z0-9_]/g, "");
      }

      if (sanitizedName.length < 2) return responseMsg.edit({ embeds: [simpleEmbed(`### ${Emojis.circlecross || "❌"} Nome Inválido\nMínimo de 2 caracteres.`)] });

      const newEmoji = await message.guild.emojis.create({ attachment: emojiSource, name: sanitizedName });
      
      const successEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Green)
        .setDescription(`### ${Emojis.Success || "✅"} Sucesso!\nEmoji ${newEmoji} (\`:${newEmoji.name}:\`) adicionado com sucesso!`)
        .setFooter({ text: `ID: ${newEmoji.id}` });
      
      await responseMsg.edit({ embeds: [successEmbed] });

    } catch (err) {
      console.error("[PREFFIX ADDEMOJI]: " + err);
      let errorMsg = process.env.MSGERROBOT || "Ocorreu um erro desconhecido.";
      if (err.code === 50035) errorMsg = "Link inválido ou imagem corrompida.";
      if (err.code === 30008) errorMsg = "O servidor atingiu o limite de emojis.";
      if (err.code === 50013) errorMsg = "Arquivo muito grande (>256kb).";

      if (responseMsg) responseMsg.edit({ embeds: [simpleEmbed(`### ${Emojis.circlecross || "❌"} Falha\n${errorMsg}`)] });
    }
  },
};