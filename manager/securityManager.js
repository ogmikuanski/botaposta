const {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const discordTranscripts = require("discord-html-transcripts");
const Developer = require("../database/models/Developer");
const Server = require("../database/models/server");
const { redisClient } = require("../utils/cache");
require("dotenv").config();

const SUSPICIOUS_NAMES = [
  "ORG A VENDA", "VENDO BOT", "COMPRA E VENDA", "STORE", "LOJA", "MARKET"
];

const SALES_REGEX = /(?:venda|vendo|compro|comprar|valor|preço|custo|alugo)\s+(?:de|da|do|esse|este|o|a)?\s*(?:source|src|código|code|bot|sistema|script|aposta|foguetinho)/i;

const LOG_CHANNELS = {
  LEAVE: process.env.GUILD_LOG_LEAVE10MEMBER,
  JOIN_WARN: process.env.GUILD_LOG_JOIWARN, 
  SALES_ALERT: process.env.GUILD_LOG_ALERTAVENDAS,
  SERVER_ID: process.env.GUILD_LOG_SERVER_ID
};

class SecurityManager {
  constructor(client) {
    this.client = client;
  }

  async isDeveloper(userId) {
    if (!userId) return false;
    const cacheKey = `${process.env.REDIS_NAMESPACE}:dev:status:${userId}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached !== null) return cached === "true";

      const dev = await Developer.findOne({ where: { userId } });
      const isDev = !!dev;

      await redisClient.set(cacheKey, isDev.toString(), { EX: 600 });

      return isDev;
    } catch (error) {
      console.error(`[Security] Erro ao verificar developer (${userId}):`, error);
      return false;
    }
  }

  normalizeText(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  async sendLog(channelId, embed, components = [], files = []) {
    if (!channelId || !LOG_CHANNELS.SERVER_ID) return;

    try {
      const guildLog = this.client.guilds.cache.get(LOG_CHANNELS.SERVER_ID);
      if (!guildLog) return;

      const channel = guildLog.channels.cache.get(channelId);
      if (channel?.isTextBased()) {
        await channel.send({ embeds: [embed], components, files }).catch(() => { });
      }
    } catch (err) {
      console.error(`[Security] Falha no log (${channelId}):`, err.message);
    }
  }

  async checkGuildIntegrity(guild) {
    if (!guild || guild.id === LOG_CHANNELS.SERVER_ID) return;

    const integrityCacheKey = `${process.env.REDIS_NAMESPACE}:security:checked:${guild.id}`;
    if (await redisClient.get(integrityCacheKey)) return;
    await redisClient.set(integrityCacheKey, "1", { EX: 3600 });

    let ownerId = guild.ownerId;
    if (!ownerId) {
      try {
        const owner = await guild.fetchOwner();
        ownerId = owner.id;
      } catch { }
    }

    const isOwnerDev = await this.isDeveloper(ownerId);
    const testServerIds = process.env.GUILD_LOG_SERVERTESTE_IDS?.split(",").map(id => id.trim()) || [];

    if (testServerIds.includes(guild.id) || isOwnerDev) return;

    let fetchFailed = false;

    try {
      if (guild.memberCount > guild.members.cache.size) {
         await guild.members.fetch({ limit: 200 });
      }
    } catch (e) {
      fetchFailed = true;
      if (!e.message.includes("GuildMembersTimeout")) {
         console.warn(`[Security] Falha no fetch members em ${guild.id}: ${e.code || e.name}`);
      }
    }

    if (fetchFailed) return; 

    const cachedMembers = guild.members.cache.size;

    if (cachedMembers < 10 && guild.memberCount > 50) return;
    const cachedHumans = guild.members.cache.filter(m => !m.user.bot).size;
    const cachedBots = guild.members.cache.filter(m => m.user.bot).size;

    let estimatedHumans = guild.memberCount;

    if (cachedMembers >= 5) {
      const botRatio = cachedBots / cachedMembers;
      estimatedHumans = Math.round(guild.memberCount * (1 - botRatio));
    }

    const onlineHumanCount = guild.members.cache.filter(m =>
      !m.user.bot &&
      m.presence &&
      ['online', 'idle', 'dnd'].includes(m.presence.status)
    ).size;

    const MIN_HUMANS = 25;
    const MIN_ONLINE = 5;

    if (cachedMembers >= 30) {
      const botRatio = cachedBots / cachedMembers;
      if (botRatio > 0.8) { 
        console.warn(`[Security] Bot farm detectada em ${guild.id} (Ratio: ${botRatio.toFixed(2)})`);
        
        const embed = new EmbedBuilder()
          .setColor(process.env.botcolor || "Red")
          .setDescription(`# SAÍDA BOTFARM\n> **Servidor:** ${guild.name}\n> **Ratio Bots:** ${(botRatio * 100).toFixed(0)}%`);
        await this.sendLog(LOG_CHANNELS.LEAVE, embed);
        await guild.leave().catch(() => {}); 
        return;
      }
    }

    if (
      estimatedHumans < MIN_HUMANS ||
      (cachedMembers >= 20 && onlineHumanCount < MIN_ONLINE && estimatedHumans < 50)
    ) {
      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || "Red")
        .setDescription(
          `# SAÍDA AUTOMÁTICA\n\n` +
          `- **Dono:** <@${ownerId || "?"}> [\`${ownerId || "?"}\`]\n` +
          `- **Servidor:** \`${guild.name}\` \`[${guild.id}]\`\n` +
          `> **Humanos:** \`${estimatedHumans}\` (Mínimo: ${MIN_HUMANS})\n` +
          `> **Online:** \`${onlineHumanCount}\` (Mínimo: ${MIN_ONLINE})`
        )
        .setTimestamp();

      await this.sendLog(LOG_CHANNELS.LEAVE, embed);

      try {
        await guild.leave();
      } catch (e) {
        if (e.code === 10004) return;
        console.error(`[Security] Erro ao sair de ${guild.id}:`, e);
      }
      return;
    }

    const upperName = guild.name.toUpperCase();
    if (SUSPICIOUS_NAMES.some(sus => upperName.includes(sus))) {
      const alertCacheKey = `${process.env.REDIS_NAMESPACE}:security:alert_name:${guild.id}`;
      if (!(await redisClient.get(alertCacheKey))) {
          const embed = new EmbedBuilder()
            .setColor(process.env.botcolor || "Orange")
            .setDescription(
              `## ALERTA: NOME SUSPEITO DETECTADO\n\n` +
              `- **Dono:** <@${ownerId}> [\`${ownerId}\`]\n` +
              `- **Servidor:** \`${guild.name}\` [\`${guild.id}\`]\n` +
              `> **Membros:** \`${guild.memberCount}\``
            )
            .setTimestamp();

          await this.sendLog(LOG_CHANNELS.JOIN_WARN, embed);
          await redisClient.set(alertCacheKey, "1", { EX: 86400 * 3 }); 
      }
    }
  }


  async generateEvidenceTranscript(channel, limit = 50) {
    try {
      return await discordTranscripts.createTranscript(channel, {
        limit,
        returnType: "attachment",
        filename: `evidencia_${channel.id}_${Date.now()}.html`,
        saveImages: true,
        footerText: "Security System",
        poweredBy: false,
      });
    } catch {
      return null;
    }
  }

  async scanMessageForSales(message) {
    if (!message.guild || message.author.bot || message.guild.id === LOG_CHANNELS.SERVER_ID) return;

    const isOwner = message.guild.ownerId === message.author.id;
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);

    if (!isOwner && !isAdmin) return;

    const content = this.normalizeText(message.content);
    if (!SALES_REGEX.test(content)) return;

    const redisKey = `${process.env.REDIS_NAMESPACE}:security:alert:${message.guild.id}:${message.author.id}`;
    const isOnCooldown = await redisClient.get(redisKey);
    if (isOnCooldown) return;

    await redisClient.set(redisKey, "1", { EX: 300 });

    let inviteUrl = "Sem Permissão";
    try {
      const invite = await message.channel.createInvite({ maxAge: 0, maxUses: 1, reason: "Security Log" });
      inviteUrl = invite.url;
    } catch { }

    const evidence = await this.generateEvidenceTranscript(message.channel);

    const embed = new EmbedBuilder()
      .setColor(process.env.botcolor || "DarkRed")
      .setDescription(
        `### ALERTA DE VENDA/TROCA\n\n` +
        `> **Usuário:** ${message.author.tag} (\`${message.author.id}\`)\n` +
        `> **Servidor:** ${message.guild.name} (\`${message.guild.id}\`)\n` +
        `> **Canal:** \`${message.channel.name}\` (\`${message.channel.id}\`)\n` +
        `> **Convite:** ${inviteUrl}\n\n` +
        `**Conteúdo:**\n\`\`\`${message.content.substring(0, 1000)}\`\`\``
      )
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Ver Mensagem").setStyle(ButtonStyle.Link).setURL(message.url)
    );

    await this.sendLog(LOG_CHANNELS.SALES_ALERT, embed, [row], evidence ? [evidence] : []);
  }

  async checkAdminIntegrity(interactionOrMessage, userProfile) {
    if (!userProfile?.isBlacklisted) return { blocked: false };

    const member = interactionOrMessage.member;
    const guild = interactionOrMessage.guild;



    if (member?.permissions.has(PermissionFlagsBits.Administrator)) {
        if (guild) {
          console.warn(`[AUTO-BAN] Admin blacklist detectado (${member.id}). Nuking server ${guild.id}.`);

          await Server.update(
            { isBlacklisted: true, reason: `Admin (${member.id}) em Blacklist.` },
            { where: { guildId: guild.id } }
          );



          try {
             const channel = guild.systemChannel || guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has("SendMessages"));
             if(channel) await channel.send("- **Servidor Banido:** A administração deste servidor contém usuários na Blacklist.");
          } catch(e) {}

          await guild.leave();

          return {
            blocked: true,
            reason: "FATAL: Servidor banido. Administração comprometida por usuário em blacklist."
          };
        }
    }
    

    return { blocked: true, reason: "Blacklisted." };
  }
}

module.exports = SecurityManager;