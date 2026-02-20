const {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const Emojis = require("../../Emojis.json");
const { getServerConfig } = require("../../manager/configManager");
const { isBlacklisted } = require("../../manager/blacklistManager");
const { isDev } = require("../../manager/devManager");
const {
  isMaintenanceMode,
  getRemainingCooldown,
  setCooldown,
} = require("../../utils/cache");

const { EQUIPE_IDS, DEFAULT_FOOTER_ICON, MSGMANUTENCAO, MSGERROBOT, MSGBLACKLISTMEMBERBOT, MSGBLACKLISTSERVIDORBOT } = process.env;

const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Mostra informações detalhadas sobre o servidor atual."),

  execute: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.warn(`[serverinfo] Falha ao deferir: ${e.message}`);
      return;
    }

    try {
      const userIsDev = await isDev(interaction.user.id);
      const userIsOnEquipe = ownerIdSet.has(interaction.user.id) || userIsDev;

      if (!userIsOnEquipe) {
        const maintenance = await isMaintenanceMode();
        if (maintenance) {
          return interaction
            .editReply({
              content: "",
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Yellow)
                  .setDescription(
                    `- ${Emojis.verifybot || "🤖"} ${MSGMANUTENCAO || "Sistema em manutenção."}`
                  )
                  .setFooter({
                    text: client.user.username,
                    iconURL: client.user.displayAvatarURL() || DEFAULT_FOOTER_ICON,
                  }),
              ],
            })
            .then((msg) =>
              setTimeout(() => msg.delete().catch(() => {}), 5000)
            );
        }

        const userBlocked = await isBlacklisted(interaction.user.id, "user");
        if (userBlocked) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
                .setDescription(MSGBLACKLISTMEMBERBOT || "Você está na blacklist."),
            ],
          });
        }

        const guildBlocked = await isBlacklisted(interaction.guild.id, "guild");
        if (guildBlocked) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
                .setDescription(MSGBLACKLISTSERVIDORBOT || "Este servidor está na blacklist."),
            ],
          });
        }

        const server = await getServerConfig(
          interaction.guild.id,
          interaction.guild.name
        );
        const remaining = await getRemainingCooldown(
          interaction.guild.id,
          interaction.user.id,
          module.exports.data.name
        );
        if (remaining > 0) {
          return interaction
            .editReply({
              content: `## ${Emojis.aviso || "⚠️"} Calma aí!\n- Você precisa esperar **${remaining.toFixed(1)}s**.`,
            })
            .then((msg) =>
              setTimeout(() => msg.delete().catch(() => {}), 5000)
            );
        }
        await setCooldown(
          interaction.guild.id,
          interaction.user.id,
          module.exports.data.name,
          server.cooldown || 5
        );
      }

      const guild = interaction.guild;
      let owner = null;
      try {
          owner = await guild.fetchOwner();
      } catch (e) {
          owner = { id: guild.ownerId }; 
      }

      const textChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildText
      ).size;
      const voiceChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildVoice
      ).size;
      const categories = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildCategory
      ).size;

      const members = guild.memberCount;
      const bots = guild.members.cache.filter((m) => m.user.bot).size;
      const humans = members - bots;

      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Blue)
        .setAuthor({
          name: guild.name,
          iconURL: guild.iconURL({ dynamic: true }) || undefined,
        })
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          {
            name: `Dono(a)`,
            value: owner
              ? `> <@${owner.id}> [\`${owner.id}\`]`
              : "`Não foi possível buscar`",
          },
          { name: "ID do Servidor", value: `> (\`${guild.id}\`)` },
          {
            name: "Criado em",
            value: `> <t:${Math.floor(guild.createdAt.getTime() / 1000)}:F>`,
            inline: false,
          },
          {
            name: `Membros (\` ${members} \`)`,
            value: `> **Humanos:** \`${humans}\`\n> **Bots:** \`${bots}\``,
          },
          {
            name: `Canais (\` ${textChannels + voiceChannels} \`)`,
            value: `> **Texto:** \`${textChannels}\`\n> **Voz:** \`${voiceChannels}\`\n> **Categorias:** \`${categories}\``,
          },
          {
            name: `Emojis e Cargos`,
            value: `> **Emojis:** \`${guild.emojis.cache.size}\`\n> **Cargos:** \`${guild.roles.cache.size}\``,
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) { 
      console.error(`Erro no /${module.exports.data.name}:`, err);
      
      const errorMessage = MSGERROBOT || "Ocorreu um erro interno.";
      
      const errorEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(errorMessage);

      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({ embeds: [errorEmbed], content: "" })
          .then((msg) => setTimeout(() => msg.delete().catch(() => {}), 5000))
          .catch(() => {});
      }
    }
  },
};