const { PermissionFlagsBits, EmbedBuilder, Colors } = require("discord.js");
const Emojis = require("../../Emojis.json"); 
const { getServerConfig } = require("../../manager/configManager");
const { isBlacklisted } = require("../../manager/blacklistManager");
const { isDev } = require("../../manager/devManager");
const {
  isMaintenanceMode,
  getRemainingCooldown,
  setCooldown,
} = require("../../utils/cache");

const { 
    EQUIPE_IDS, 
    botcolor, 
    DEFAULT_FOOTER_TEXT, 
    DEFAULT_FOOTER_ICON, 
    BOT_MARCACOES_INTERFACES,
    MSGERROBOT
} = process.env;

const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

const createEmbed = (description, color = Colors.Red, footerText = null, footerIcon = null) => {
    const embed = new EmbedBuilder()
        .setColor(botcolor || color)
        .setDescription(description);

    if (footerText) {
        embed.setFooter({ 
            text: footerText, 
            iconURL: footerIcon || undefined 
        });
    }
    return embed;
};

module.exports = {
  name: "lock",
  aliases: ["trancar", "chat"],
  description: "Alterna entre trancar e destrancar o canal atual.",

  execute: async (message, args, client) => {
    let responseMsg;
    
    try {
      responseMsg = await message.reply({
        embeds: [createEmbed(`${Emojis.loading || "🔄"} **Processando...**`, Colors.Blue)]
      });
    } catch (e) { return; }

    try {
      const userIsDev = await isDev(message.author.id);
      const userIsOnEquipe = ownerIdSet.has(message.author.id) || userIsDev;

      if (!userIsOnEquipe) {
        const maintenance = await isMaintenanceMode();
        if (maintenance) {
          return responseMsg.edit({
            embeds: [createEmbed(
                `- ${Emojis.verifybot || "🤖"} ${process.env.MSGMANUTENCAO}`,
                Colors.Yellow,
                client.user.username
            )],
            content: ""
          });
        }
      }

      const userBlocked = await isBlacklisted(message.author.id, "user");
      if (userBlocked) {
        return responseMsg.edit({
            embeds: [createEmbed(`${Emojis.circlecross || "🚫"} **ACESSO NEGADO!**\nVocê está na blacklist.`, Colors.Red)],
            content: ""
        });
      }

      const guildBlocked = await isBlacklisted(message.guild.id, "guild");
      if (guildBlocked) {
        return responseMsg.edit({
            embeds: [createEmbed(`${Emojis.circlecross || "🚫"} **ACESSO NEGADO!**\nServidor bloqueado.`, Colors.Red)],
            content: ""
        });
      }

      const server = await getServerConfig(message.guild.id, message.guild.name);
      const remaining = await getRemainingCooldown(message.guild.id, message.author.id, "lock");
      
      if (remaining > 0 && !userIsOnEquipe) {
        return responseMsg.edit({
            embeds: [createEmbed(`## ${Emojis.aviso || "⚠️"} Calma aí!\n- Aguarde **${remaining.toFixed(1)}s**.`, Colors.Yellow)],
            content: ""
        });
      }
      if (!userIsOnEquipe) await setCooldown(message.guild.id, message.author.id, "lock", server.cooldown || 5);


      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels) && !userIsOnEquipe) {
        return responseMsg.edit({
            embeds: [createEmbed(`### ${Emojis.circlecross || "❌"} Sem Permissão!\n- Requer permissão \`Gerenciar Canais\`.`, Colors.Red)],
            content: ""
        });
      }

      if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return responseMsg.edit({
            embeds: [createEmbed(`### ${Emojis.circlecross || "❌"} Eu não tenho permissão!\n- Preciso da permissão \`Gerenciar Canais\`.`, Colors.Red)],
            content: ""
        });
      }

      const channel = message.channel;
      const everyone = message.guild.roles.everyone;
      
      const isUnlocked = channel.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);

      const useMentions = BOT_MARCACOES_INTERFACES === "true";
      const actor = useMentions ? message.author : `**${message.author.username}**`;

      if (isUnlocked) {
        await channel.permissionOverwrites.edit(everyone, {
          [PermissionFlagsBits.SendMessages]: false,
        });

        const embed = createEmbed(
            `## 🔒 Canal Trancado\n- O canal foi silenciado por ${actor}.`,
            Colors.Red,
            DEFAULT_FOOTER_TEXT || client.user.username,
            message.guild.iconURL()
        ).setTimestamp();
        
        if (message.deletable) await message.delete().catch(() => {});
        return responseMsg.edit({ embeds: [embed], content: "" });

      } else {
        await channel.permissionOverwrites.edit(everyone, {
          [PermissionFlagsBits.SendMessages]: null, 
        });

        const embed = createEmbed(
            `## 🔓 Canal Destrancado\n- O canal foi reaberto por ${actor}.`,
            Colors.Green,
            DEFAULT_FOOTER_TEXT || client.user.username,
            message.guild.iconURL()
        ).setTimestamp();

        if (message.deletable) await message.delete().catch(() => {});
        return responseMsg.edit({ embeds: [embed], content: "" });
      }

    } catch (err) {
        console.error("[PREFIX LOCK]" + err);
        const errorMsg = MSGERROBOT || "❌ Ocorreu um erro interno.";
        return responseMsg.edit({
            embeds: [createEmbed(errorMsg, Colors.Red)],
            content: ""
        }).catch(() => {});
    }
  },
};