const {
  Events,
  EmbedBuilder,
  Colors,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  AuditLogEvent,
} = require("discord.js");
const { Op } = require("sequelize");
const Server = require("../database/models/server");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const FilaConfig = require("../database/models/FilaConfig");
const CargosConfig = require("../database/models/CargosConfig");
const LogsConfig = require("../database/models/LogsConfig");
const Blacklist = require("../database/models/Blacklist");
const { addToBlacklist } = require("../manager/blacklistManager");
const Emojis = require("../Emojis.json");
const {
  GUILD_LOG_SERVER_ID,
  GUILD_LOG_CHANNEL_JOIN_ID,
  GUILD_LOG_LEAVEBLACKLIST,
  SUNDOBOT,
  GUILD_LOG_SERVERTESTE_IDS
} = process.env;
const { ensurePersistentChannel } = require("../manager/persistentChannelManager");
const { enforceGoldenRule } = require("../utils/adminCheck");
const SecurityManager = require("../manager/securityManager");

const WELCOME_CHANNEL_NAME = "instruções-importantes";

async function sendAutoBlacklistLog(client, guild, ownerId, triggerUser, reason, proof) {
  if (!GUILD_LOG_SERVER_ID || !GUILD_LOG_LEAVEBLACKLIST) return;

  try {
    const logGuild = await client.guilds.fetch(GUILD_LOG_SERVER_ID).catch(() => null);
    if (!logGuild) return;

    const logChannel = await logGuild.channels.fetch(GUILD_LOG_LEAVEBLACKLIST).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(process.env.botcolor || Colors.DarkRed)
      .setDescription(
        `## ${Emojis.verifybot || "🛡️"} AUTO-BLACKLIST DETECTADA\n` +
        `### Servidor\n> **Nome:** \`${guild.name}\`\n> **ID:** \`${guild.id}\`\n> **Membros:** \`${guild.memberCount}\`\n` +
        `### Responsável pelo servidor: \n> <@${ownerId}> (\`${ownerId}\`)\n` +
        `### Gatilho\n> **Quem causou:** ${triggerUser}\n> **Motivo:** ${reason}`
      )
      .addFields({ name: "Prova", value: proof || "Sem prova anexada." })
      .setThumbnail(guild.iconURL({ dynamic: true }) || null)
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Erro ao enviar log de Auto-Blacklist:", err);
  }
}

async function sendWelcomeMessage(channel, client) {
  const publicEmbed = new EmbedBuilder()
    .setTitle(`${Emojis.join || "👋"} Obrigado por me adicionar!`)
    .setColor(process.env.botcolor || Colors.Green)
    .setDescription(
      `- Obrigado por adicionar o **${client.user.username}** ao seu servidor!\n` +
      `- Eu sou um bot de apostas totalmente **gratuito**.\n` +
      `### **${Emojis.aviso || "⚠️"} IMPORTANTE:**\n` +
      `- A venda ou comercialização do bot é proibida.\n` +
      `> Caso queira denunciar essa prática ou qualquer outra irregularidade, use o comando \`/reportar\`.` +
      `\n### **${Emojis.raio || "⚡"} INFORMAÇÕES BÁSICAS:**\n` +
      `- Use \`/central\` para configurar o sistema.\n- Use \`/ajuda\` para ver todos os comandos disponíveis.\n> Qualquer dúvida é só mencionar o <@${client.user.id}>.`
    )
    .setFooter({
      text: process.env.DEFAULT_FOOTER_TEXT || client.user.username,
      iconURL: process.env.DEFAULT_FOOTER_ICON,
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel(process.env.NOMEMARCA || "Suporte").setStyle(ButtonStyle.Link).setURL(process.env.Discordinvite || "https://discord.gg/"),
    new ButtonBuilder().setLabel("Meu Convite").setStyle(ButtonStyle.Link).setURL(process.env.MeuConvite || "https://discord.gg/"),
    new ButtonBuilder().setLabel("Tutorial").setStyle(ButtonStyle.Link).setURL(process.env.MeuTutorial || "https://youtube.com/"),
    new ButtonBuilder().setLabel("Meu Site").setStyle(ButtonStyle.Link).setURL(process.env.MeuSite || "https://google.com")
  );

  await channel.send({ embeds: [publicEmbed], components: [row] }).catch(() => {});
}

module.exports = {
  name: Events.GuildCreate,
  once: false,

  async execute(guild, client) {
    const allowedGuilds = [
      GUILD_LOG_SERVER_ID,
      ...(GUILD_LOG_SERVERTESTE_IDS?.split(",") || [])
    ].filter(Boolean);

    if (allowedGuilds.includes(guild.id)) {
      return console.log(`[AntiDuplicate] 🛡️ Servidor Whitelist (${guild.name}). Entrada permitida.`);
    }

    if (SUNDOBOT) {
      try {
        const rivalMember = await guild.members.fetch(SUNDOBOT).catch(() => null);
        if (rivalMember && rivalMember.id !== client.user.id) {
          console.warn(`[AntiDuplicate] 🚨 CONFLITO DETECTADO em ${guild.name}`);
          await guild.leave();
          return;
        }
      } catch (err) {
        console.error(`[AntiDuplicate] Erro ao verificar integridade:`, err);
      }
    }

    const security = new SecurityManager(guild.client);
    await security.checkGuildIntegrity(guild);

    if (!guild.client.guilds.cache.has(guild.id)) return;

    const allowed = await enforceGoldenRule(guild);
    if (!allowed) return;

    let ownerId = guild.ownerId;
    try {
      const owner = await guild.fetchOwner();
      ownerId = owner.id;
    } catch (e) {}

    try {
      const ownerBlacklistEntry = await Blacklist.findOne({
        where: { entityId: ownerId, type: "user" },
      });

      if (ownerBlacklistEntry) {
        console.warn(`🚨 [AUTO-BLACKLIST] Guild ${guild.name} banida. Dono (${ownerId}) em blacklist.`);
        
        const autoReason = `[AUTO-BAN] Guild banida pois Dono (<@${ownerId}>) está na Blacklist. Motivo: ${ownerBlacklistEntry.reason}`;

        await addToBlacklist(guild.id, "guild", autoReason, client.user.id, ownerBlacklistEntry.proofUrl);
        
        await sendAutoBlacklistLog(
          client, guild, ownerId, 
          `<@${ownerId}> (O Dono)`, 
          `Dono listado na Blacklist. Motivo: ${ownerBlacklistEntry.reason}`, 
          ownerBlacklistEntry.proofUrl
        );

        try {
           const user = await client.users.fetch(ownerId).catch(() => null);
           if(user) await user.send(`- **Segurança:** Saí do servidor pois você consta em nossa blacklist.`).catch(() => {});
        } catch(e) {}

        await guild.leave();
        return;
      }
    } catch (errCheck) {
      console.error("Erro ao checar blacklist do dono:", errCheck);
    }

    try {
      const [server, created] = await Server.findOrCreate({
        where: { guildId: guild.id },
        defaults: {
          guildName: guild.name,
          ownerId: ownerId,
          botLeftAt: null,
        },
      });

      if (!created) {
        await server.update({
          guildName: guild.name,
          ownerId: ownerId,
          botLeftAt: null,
        });
      }

      await Promise.all([
        ConfigsGerais.findOrCreate({ where: { guildId: guild.id }, defaults: { guildId: guild.id } }),
        FilaConfig.findOrCreate({ where: { guildId: guild.id }, defaults: { guildId: guild.id } }),
        CargosConfig.findOrCreate({ where: { guildId: guild.id }, defaults: { guildId: guild.id } }),
        LogsConfig.findOrCreate({ where: { guildId: guild.id }, defaults: { guildId: guild.id } }),
      ]);
    } catch (error) {
      console.error(`❌ Erro ao registrar servidor ${guild.name} no DB:`, error);
    }

    let executorId = null;
    let addedBy = "Desconhecido";

    try {
      await new Promise((r) => setTimeout(r, 3000));

      const auditLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.BotAdd,
      }).catch(() => null);

      if (auditLogs) {
        const addLog = auditLogs.entries.first();
        if (addLog && addLog.target.id === client.user.id && (Date.now() - addLog.createdTimestamp < 45000)) {
            executorId = addLog.executor.id;
            addedBy = `<@${executorId}> \`[${executorId}]\``;
        }
      }
    } catch (err) {}

    if (executorId && executorId !== ownerId) { 
      try {
        const userBlacklistEntry = await Blacklist.findOne({
          where: { entityId: executorId, type: "user" },
        });

        if (userBlacklistEntry) {
          const autoReason = `[AUTO-BAN] Adicionado por usuário Blacklist (${executorId}). Motivo: ${userBlacklistEntry.reason}`;
          
          await addToBlacklist(guild.id, "guild", autoReason, client.user.id, userBlacklistEntry.proofUrl);

          await sendAutoBlacklistLog(
             client, guild, ownerId, 
             `<@${executorId}> (Quem Adicionou)`, 
             `Usuário blacklist adicionou o bot. Motivo: ${userBlacklistEntry.reason}`, 
             userBlacklistEntry.proofUrl
          );

          await guild.leave();
          return;
        }
      } catch (blErr) {}
    }

    try {
      let targetChannel = guild.channels.cache.find(
        (c) => c.name === WELCOME_CHANNEL_NAME && c.type === ChannelType.GuildText
      );

      const me = await guild.members.fetchMe();
      const botPerms = me.permissions;

      if (targetChannel && targetChannel.permissionsFor(me).has(PermissionsBitField.Flags.SendMessages)) {
        await sendWelcomeMessage(targetChannel, client);
      } else {
        if (botPerms.has(PermissionsBitField.Flags.ManageChannels)) {
             try {
                const newChannel = await guild.channels.create({
                    name: WELCOME_CHANNEL_NAME,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: guild.roles.everyone, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] },
                        { id: client.user.id, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks] },
                    ],
                    reason: "Canal de Boas-vindas do Bot"
                });
                await sendWelcomeMessage(newChannel, client);
             } catch(createErr) {
                 const randomChannel = guild.channels.cache.find(c => 
                    c.type === ChannelType.GuildText && 
                    c.permissionsFor(me).has(PermissionsBitField.Flags.SendMessages)
                 );
                 if(randomChannel) await sendWelcomeMessage(randomChannel, client);
             }
        }
      }
    } catch (err) {
    }

    try { await ensurePersistentChannel(guild); } catch (e) {}

    if (GUILD_LOG_SERVER_ID && GUILD_LOG_CHANNEL_JOIN_ID) {
      try {
        const logGuild = await client.guilds.fetch(GUILD_LOG_SERVER_ID).catch(() => null);
        const logChannel = logGuild ? await logGuild.channels.fetch(GUILD_LOG_CHANNEL_JOIN_ID).catch(() => null) : null;

        if (logChannel) {
            let otherServersInfo = "Nenhum outro servidor encontrado.";
            try {
                const ownerOtherServers = await Server.findAll({
                    where: { ownerId: ownerId, guildId: { [Op.ne]: guild.id } },
                    attributes: ['guildName', 'guildId'],
                    limit: 5
                });

                if (ownerOtherServers.length > 0) {
                    const list = ownerOtherServers.map(s => `> ${s.guildName} (\`${s.guildId}\`)`).join('\n');
                    otherServersInfo = `- **Outros ${ownerOtherServers.length} servidores deste dono:**\n${list}`;
                    if (ownerOtherServers.length === 5) otherServersInfo += `\n...e mais.`;
                } else {
                    otherServersInfo = "- Primeiro servidor registrado deste dono.";
                }
            } catch (x9error) { otherServersInfo = "❌ Erro ao buscar histórico."; }

            const embed = new EmbedBuilder()
                .setDescription(
                    `## BOT ADICIONADO\n\n` +
                    `### ${Emojis.discord || "👑"} **Responsável:**\n> <@${ownerId}> \`[${ownerId}]\`\n` +
                    `### ${Emojis.sino || "👤"} **Autorização:**\n> ${addedBy}\n` +
                    `### ${Emojis.abrirticket || "🏟️"} **Servidor:**\n> \`${guild.name}\` \`[${guild.id}]\`\n` +
                    `### ${Emojis.usersss || "📈"} **Membros:**\n> \`${guild.memberCount}\`\n` +
                    `### ${Emojis.pato || "🕵️"} **Histórico:**\n${otherServersInfo}\n` +
                    `### ${Emojis.calendario || "📅"} **Data:**\n> <t:${Math.floor(Date.now() / 1000)}:f>`
                )
                .setColor(process.env.botcolor || Colors.Green)
                .setThumbnail(guild.iconURL({ dynamic: true }) || null)
                .setTimestamp();

            await logChannel.send({ embeds: [embed] });
        }
      } catch (err) { console.error("Erro no log final:", err); }
    }
  },
};