const {
  EmbedBuilder,
  Colors,
  Events,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const Emojis = require("../Emojis.json");
const { EQUIPE_IDS, GUILD_LOG_SERVER_ID } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);
const { getServerConfig } = require("../manager/configManager");
const ConfigsGerais = require("../database/models/ConfigsGerais");
const { enforceGoldenRule } = require("../utils/adminCheck");
const SecurityManager = require("../manager/securityManager");

module.exports = {
  name: Events.MessageCreate,
  execute: async (message, client) => {
    if (message.author.bot || !message.guild) return;
    if (message.author.id === client.user.id) return;

    if (!(await enforceGoldenRule(message.guild))) return;

    const security = new SecurityManager(message.client);
    security
      .scanMessageForSales(message)
      .catch((err) => console.error("[Security] Erro no scan:", err));

    let serverConfig;
    let configsGerais;

    try {
      [serverConfig, configsGerais] = await Promise.all([
        getServerConfig(message.guild.id, message.guild.name),
        ConfigsGerais.findOne({ where: { guildId: message.guild.id } }),
      ]);
    } catch (e) {
      console.error("[messageCreate] Erro ao carregar configs:", e);
      return;
    }

    if (
      configsGerais &&
      configsGerais.persistentChannelId === message.channelId
    ) {
      if (message.deletable) await message.delete().catch(() => { });
      return;
    }

    const serverPrefix =
      serverConfig?.prefix || process.env.DISCORD_PREFIX || ".";
    const isBotMention = message.mentions.users.has(client.user.id);
    const isCommand = message.content.startsWith(serverPrefix);

    if (
      isBotMention &&
      !isCommand &&
      message.guild.id !== GUILD_LOG_SERVER_ID
    ) {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL({ dynamic: true }),
        })
        .setColor(process.env.botcolor || Colors.Blue)
        .setDescription(
          `Eu sou o \`${client.user.username}\`, um bot público e totalmente gratuito, criado para auxiliar servidores com sistemas de apostas e recursos úteis para sua comunidade.\n` +
          `### ${Emojis.sino || "🔔"} Para mais informações:\n` +
          `${Emojis.setabranca || "🔹"} \`/ajuda\`\n` +
          `${Emojis.setabranca || "🔹"} \`${serverPrefix}help\``
        )
        .setFooter({
          text: process.env.DEFAULT_FOOTER_TEXT || "Bot Apostado Free",
          iconURL: process.env.DEFAULT_FOOTER_ICON,
        });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Suporte")
          .setStyle(ButtonStyle.Link)
          .setURL(process.env.Discordinvite),
        new ButtonBuilder()
          .setLabel("Site")
          .setStyle(ButtonStyle.Link)
          .setURL(process.env.MeuSite),

        new ButtonBuilder()
          .setLabel("Meu Convite")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&integration_type=0&scope=bot+applications.commands`)
      );

      return message.reply({ embeds: [embed], components: [row] });
    }

    if (!isCommand) {
      try {
        const botName = client.user.username.toLowerCase();
        const botNickname =
          message.guild.members.me?.displayName?.toLowerCase();
        const content = message.content.toLowerCase();

        let mentionedByName = content.includes(botName);
        if (botNickname && botNickname !== botName) {
          mentionedByName = mentionedByName || content.includes(botNickname);
        }

        if (mentionedByName) {
          await message.react(Emojis.emojireact || "👀");
        }
      } catch (reactErr) { }

      return;
    }

    try {
      const userIsDev = ownerIdSet.has(message.author.id);
      const isLogServer = message.guild.id === GUILD_LOG_SERVER_ID;

      if (isLogServer && !userIsDev) {
        if (message.deletable) await message.delete().catch(() => { });
        return;
      }

      const args = message.content
        .slice(serverPrefix.length)
        .trim()
        .split(/ +/);
      const commandName = args.shift().toLowerCase();
      const command = client.prefixCommands.get(commandName);

      if (!command) return;

      await command.execute(message, args, client);
    } catch (err) {
      if (e.message.includes("Unknown message")) return;
      console.error(err);
      const errorEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(process.env.MSGERROBOT);

      if (message.channel.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages)) {
        await message.reply({ embeds: [errorEmbed] }).catch(() => { });
      }
    }
  },
};
