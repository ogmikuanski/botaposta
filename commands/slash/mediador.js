const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  MessageFlags,
  ChannelType,
} = require("discord.js");
const CargosConfig = require("../../database/models/CargosConfig");
const MediatorStats = require("../../database/models/MediatorStats");
const LogsConfig = require("../../database/models/LogsConfig");
const { isBlacklisted } = require("../../manager/blacklistManager");
const Emojis = require("../../Emojis.json");
const { redisClient, getMediatorsOnlineKey } = require("../../utils/cache");
const {
  forceUpdateMediatorPanel,
} = require("../../components/Apostas/mediatorHandler");

async function getLogChannel(guild, channelType) {
  try {
    const [logsConfig] = await LogsConfig.findOrCreate({
      where: { guildId: guild.id },
    });
    const channelId = logsConfig[channelType];
    if (!channelId) return null;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel && channel.type === ChannelType.GuildText) {
      return channel;
    }
    return null;
  } catch (err) {
    console.error(`Erro ao buscar canal de log (${channelType}):`, err);
    return null;
  }
}

module.exports = {
  autocomplete: async (interaction) => {
    if (interaction.options.getSubcommand() !== "remover") {
      return interaction.respond([]);
    }
    try {
      if (!redisClient.isReady) return interaction.respond([]);

      const guild = interaction.guild;
      if (!guild) return interaction.respond([]);

      const guildId = guild.id;
      const focusedValue = interaction.options.getFocused();
      const mediatorsKey = getMediatorsOnlineKey(guildId);

      const mediatorHashes = await redisClient.hGetAll(mediatorsKey);
      const choices = [];

      for (const userId in mediatorHashes) {
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          const displayName = member
            ? `${member.displayName}`
            : `Usuário não encontrado [${userId}]`;

          choices.push({
            name: `${displayName} [${userId}]`,
            value: userId,
          });
        } catch {
          choices.push({
            name: `Erro ao ler dados de [${userId}]`,
            value: userId,
          });
        }
      }

      const filtered = choices
        .filter((c) =>
          c.name.toLowerCase().includes(focusedValue.toLowerCase())
        )
        .slice(0, 25);

      await interaction.respond(filtered);
    } catch (err) {
      if (err.code === 10062) {
        await interaction.respond([]);
        return;
      }

      console.error("Erro no autocomplete de /mediador remover:", err);
      try { await interaction.respond([]); } catch { }
    }
  },

  data: new SlashCommandBuilder()
    .setName("mediador")
    .setDescription("Gerencia os mediadores.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("remover")
        .setDescription("Remove forçadamente um mediador da fila.")
        .addStringOption((opt) =>
          opt
            .setName("mediador")
            .setDescription("O mediador online a ser removido.")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("Mostra estatísticas e partidas ativas de um mediador.")
        .addUserOption((opt) =>
          opt
            .setName("usuario")
            .setDescription("O @usuário ou ID do mediador a verificar.")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("limpar")
        .setDescription("Remove todos os mediadores atualmente online.")
    ),

  execute: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      if (e.message.includes("Unknown interaction")) return;
      console.warn(`[mediador] Falha ao deferir: ${e}`);
      return;
    }

    try {
      const userBlocked = await isBlacklisted(interaction.user.id, "user");
      if (userBlocked) {
        const embed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Red)
          .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
          .setDescription(process.env.MSGBLACKLISTMEMBERBOT || "Você está na blacklist.");
        return interaction.editReply({ embeds: [embed] });
      }

      const guildBlocked = await isBlacklisted(interaction.guild.id, "guild");
      if (guildBlocked) {
        const embed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Red)
          .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
          .setDescription(process.env.MSGBLACKLISTSERVIDORBOT || "Este servidor está na blacklist.");
        return interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      console.error("Erro ao verificar blacklist:", err);
    }

    try {
      const { guild, member, user: staffUser } = interaction;

      const [cargosConfig] = await CargosConfig.findOrCreate({
        where: { guildId: guild.id },
      });
      const permMaxRoleId = cargosConfig.cargoPermMaxId;

      if (!permMaxRoleId) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross} Erro de Configuração.\n- O Cargo de Permissão Máxima não foi definido na \`/central\`.`
              ),
          ],
        });
      }

      const isPermMax = member.roles.cache.has(permMaxRoleId);
      if (!isPermMax) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross} Erro de validação.\n- Somente quem possuir o cargo <@&${permMaxRoleId}> pode usar este comando.`
              ),
          ],
        });
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "limpar") {
        const mediatorsKey = getMediatorsOnlineKey(guild.id);
        const mediatorsQueueKey = mediatorsKey + ":queue";

        const multiResult = await redisClient
          .multi()
          .hGetAll(mediatorsKey)
          .del(mediatorsKey)
          .del(mediatorsQueueKey)
          .exec();

        const mediatorHashes = multiResult[0];

        if (!mediatorHashes || Object.keys(mediatorHashes).length === 0) {
          await forceUpdateMediatorPanel(client, guild.id);
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Blue)
                .setDescription(
                  `${Emojis.bot || "ℹ️"} Nenhum mediador estava online para ser removido.`
                ),
            ],
          });
        }

        const mediadores = Object.keys(mediatorHashes);
        const totalAntes = mediadores.length;

        await forceUpdateMediatorPanel(client, guild.id);

        const logChannel = await getLogChannel(guild, "logMediadorId");
        if (logChannel) {
          const embedLog = new EmbedBuilder()
            .setTitle("LIMPEZA DE MEDIADORES ONLINE")
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `Foram removidos **${totalAntes}** mediadores da fila online.`
            )
            .addFields(
              {
                name: "Executado por",
                value: `<@${staffUser.id}> (\`${staffUser.id}\`)`,
              },
              {
                name: "IDs Removidos",
                value:
                  mediadores
                    .map((id) => `\`${id}\``)
                    .join(", ")
                    .slice(0, 1000) || "Nenhum listado",
              },
              { name: "Data", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
            )
            .setThumbnail(staffUser.displayAvatarURL())
            .setFooter({ text: guild.name, iconURL: guild.iconURL() });

          await logChannel.send({ embeds: [embedLog] }).catch(() => { });
        }

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Green)
              .setDescription(
                `${Emojis.check} Todos os **${totalAntes} mediadores** foram removidos da fila.`
              ),
          ],
        });
      }

      if (subcommand === "remover") {
        const targetUserId = interaction.options.getString("mediador");

        const mediatorsKey = getMediatorsOnlineKey(guild.id);
        const mediatorsQueueKey = mediatorsKey + ":queue";

        const removedCount = await redisClient.hDel(mediatorsKey, targetUserId);
        await redisClient.lRem(mediatorsQueueKey, 0, targetUserId);

        if (removedCount === 0) {
          const isUserId = /^\d{17,19}$/.test(targetUserId);
          const mensagemErro = isUserId
            ? `${Emojis.circlecross} O usuário <@${targetUserId}> não estava na fila de mediadores!`
            : `${Emojis.circlecross} O \`${targetUserId}\` não parece ser um ID de usuário válido.`;

          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(mensagemErro),
            ],
          });
        }

        const totalOnline = await redisClient.hLen(mediatorsKey);
        const logChannel = await getLogChannel(guild, "logMediadorId");

        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle("MEDIADOR REMOVIDO (FORÇADO)")
            .setColor(process.env.botcolor || Colors.Red)
            .addFields(
              {
                name: "Mediador Removido",
                value: `<@${targetUserId}> (\`${targetUserId}\`)`,
              },
              {
                name: "Autor da Remoção",
                value: `<@${staffUser.id}> (\`${staffUser.id}\`)`,
              },
              {
                name: "Total Online Agora",
                value: `\`${totalOnline}\` Mediador(es)`,
              },
              { name: "Data", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
            )
            .setThumbnail(staffUser.displayAvatarURL())
            .setFooter({ text: guild.name, iconURL: guild.iconURL() });

          await logChannel.send({ embeds: [logEmbed] }).catch(() => { });
        }

        await forceUpdateMediatorPanel(client, guild.id);
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Green)
              .setDescription(
                `${Emojis.check} O mediador <@${targetUserId}> foi removido da fila.`
              ),
          ],
        });
      }

      if (subcommand === "info") {
        const targetUser = interaction.options.getUser("usuario");
        const targetUserId = targetUser.id;

        const [stats, activeMatchesInfo] = await Promise.all([
          MediatorStats.findOne({
            where: {
              guildId: guild.id,
              userId: targetUserId,
            },
          }),
          (async () => {
            const matchPattern = `${process.env.REDIS_NAMESPACE}:${guild.id}:match:*`;
            let cursor = "0";
            const activeMatches = [];
            try {
              do {
                const scanReply = await redisClient.scan(
                  cursor,
                  "MATCH",
                  matchPattern,
                  "COUNT",
                  "100"
                );
                cursor = scanReply.cursor;
                const keys = scanReply.keys;
                if (!keys?.length) continue;

                const matchesDataJSON = await redisClient.mGet(keys);
                for (let i = 0; i < matchesDataJSON.length; i++) {
                  const matchDataJSON = matchesDataJSON[i];
                  const key = keys[i];
                  if (!matchDataJSON) continue;

                  try {
                    const matchData = JSON.parse(matchDataJSON);
                    const threadId = key.split("match:").pop()?.trim();

                    if (
                      !key.startsWith(`${process.env.REDIS_NAMESPACE}:${guild.id}:match:`) ||
                      !threadId
                    )
                      continue;
                    if (matchData.assignedMediatorId === targetUserId) {
                      const thread = await guild.channels
                        .fetch(threadId)
                        .catch(() => null);
                      activeMatches.push({
                        threadId,
                        threadExists: !!thread,
                        modo: matchData.modoDisplay,
                        valor: matchData.valor,
                        players: matchData.players || [],
                      });
                    }
                  } catch (e) {
                  }
                }
              } while (cursor !== "0");
            } catch (err) {
              console.error(
                "Erro ao escanear chaves do Redis para /mediador info:",
                err
              );
            }
            return activeMatches;
          })(),
        ]);

        const embed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Blue)
          .setAuthor({
            name: `INFORMAÇÕES MEDIADOR`,
            iconURL: client.user.displayAvatarURL(),
          })
          .setThumbnail(
            targetUser.displayAvatarURL({ dynamic: true, size: 256 })
          )
          .setDescription(
            `
### ${Emojis.usersss || "👤"} **・ Informações mediador**
> <@${targetUserId}> [ \`${targetUserId}\` ]
### ${Emojis.server || "⚔️"} **・ Partidas Mediadas**
> \` ${stats ? stats.matchesMediated : 0} \` partida(s) mediada(s)
### ${Emojis.time || "⏱️"} **・ Partidas Ativas**
 ${activeMatchesInfo.length > 0
              ? activeMatchesInfo
                .slice(0, 5)
                .map((match) => {
                  const channelRef = match.threadExists
                    ? `<#${match.threadId}>`
                    : `\`Canal Deletado\``;
                  return `- ${Emojis.channel || "💬"} ${channelRef} (${match.modo})`;
                })
                .join("\n") +
              (activeMatchesInfo.length > 5
                ? `\n> ...e mais ${activeMatchesInfo.length - 5} partidas.`
                : "")
              : "> Não possui nenhuma partida ativa"
            }
  `
          )
          .setTimestamp()
          .setFooter({ text: guild.name, iconURL: guild.iconURL() });

        return interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      console.error(`Erro no /${module.exports.data.name}:`, err);
      const errorEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(process.env.MSGERROBOT || "Erro interno.");

      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({ embeds: [errorEmbed], content: "" })
          .catch(() => { });
      }
    }
  },
};