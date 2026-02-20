const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const Emojis = require("../../Emojis.json");
const LogsConfig = require("../../database/models/LogsConfig");
const CargosConfig = require("../../database/models/CargosConfig");
const Server = require("../../database/models/server");
const { isDev } = require("../../manager/devManager");
const { isBlacklisted } = require("../../manager/blacklistManager");
const {
  isMaintenanceMode,
  getRemainingCooldown,
  setCooldown,
} = require("../../utils/cache");

const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHANNELS_CONFIG = [
  {
    name: "📝・apostas-abertas",
    key: "logApostaAbertaId",
    topic: "Logs de novas apostas criadas.",
  },
  {
    name: "✅・apostas-confirmadas",
    key: "logApostaConfirmadoId",
    topic: "Logs de apostas que foram confirmadas.",
  },
  {
    name: "🏆・apostas-finalizadas",
    key: "logApostaFinalizadaId",
    topic: "Resultados e finalizações de apostas.",
  },
  {
    name: "🚫・apostas-canceladas",
    key: "logApostaCanceladaId",
    topic: "Registros de apostas canceladas ou deletadas.",
  },
  {
    name: "⚔️・logs-partidas",
    key: "logPartidasId",
    topic: "Logs gerais de partidas em andamento.",
  },
  {
    name: "👮・logs-mediadores",
    key: "logMediadorId",
    topic: "Ações administrativas dos mediadores.",
  },
  {
    name: "📜・logs-blacklist",
    key: "logBlacklistId",
    topic: "Registro de usuários na lista negra.",
  },
  {
    name: "🛒・logs-loja",
    key: "logLojaId",
    topic: "Logs administrativos da loja.",
  },
  {
    name: "🎰・logs-roleta",
    key: "logRoletaId",
    topic: "Logs técnicos e administrativos da roleta (Staff).",
  }
];

function applyBotFooter(embed) {
  embed.setFooter({
    text: process.env.DEFAULT_FOOTER_TEXT || "Apostado Free",
    iconURL: process.env.DEFAULT_FOOTER_ICON || null
  });
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("canaislogs")
    .setDescription(
      "Cria ou sincroniza a estrutura de canais de logs do sistema."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  execute: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      return;
    }

    const { user, guild, member } = interaction;

    try {
      await Server.findOrCreate({
        where: { guildId: guild.id },
        defaults: { guildName: guild.name }
      });

      const userIsDev = await isDev(user.id);
      const userIsOnEquipe = ownerIdSet.has(user.id) || userIsDev;

      if (!userIsOnEquipe) {
        if (await isMaintenanceMode()) {
          const embedMaint = new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Yellow)
            .setDescription(
              `- ${Emojis.verifybot || "🤖"} ${process.env.MSGMANUTENCAO}`
            );
          applyBotFooter(embedMaint);
          return interaction.editReply({ embeds: [embedMaint] });
        }

        const [userBlocked, guildBlocked] = await Promise.all([
          isBlacklisted(user.id, "user"),
          isBlacklisted(guild.id, "guild"),
        ]);

        if (userBlocked || guildBlocked) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
                .setDescription(
                  userBlocked
                    ? process.env.MSGBLACKLISTMEMBERBOT
                    : process.env.MSGBLACKLISTSERVIDORBOT
                ),
            ],
          });
        }

        const remaining = await getRemainingCooldown(
          guild.id,
          user.id,
          "canaislogs_slash"
        );
        if (remaining > 0) {
          const timeString =
            remaining > 60 ? `${Math.floor(remaining / 60)}m` : `${remaining}s`;
          return interaction.editReply({
            content: `## ${Emojis.aviso} Calma aí!\n- Aguarde **${timeString}** para usar novamente.`,
          });
        }
        await setCooldown(guild.id, user.id, "canaislogs_slash", 600);

        const [cargosConfig] = await CargosConfig.findOrCreate({
          where: { guildId: guild.id },
        });
        const permMaxRoleId = cargosConfig.cargoPermMaxId;
        const hasRole = permMaxRoleId && member.roles.cache.has(permMaxRoleId);
        const isOwner = user.id === guild.ownerId;

        if (!hasRole && !isOwner) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  permMaxRoleId
                    ? `### ${Emojis.circlecross || "❌"} Sem Permissão!\n- Necessário cargo <@&${permMaxRoleId}>.`
                    : `### ${Emojis.circlecross || "❌"} Sem Permissão!\n- Apenas o Dono do Servidor pode configurar.`
                ),
            ],
          });
        }
      }

      if (
        !guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)
      ) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross || "❌"} Permissão Faltando!\n- Preciso de **Gerenciar Canais**.`
              ),
          ],
        });
      }

      const [logsConfig] = await LogsConfig.findOrCreate({
        where: { guildId: guild.id },
        defaults: { guildId: guild.id },
      });

      let category = guild.channels.cache.find(
        (c) =>
          c.name.toUpperCase() === "LOGS APOSTADOS" &&
          c.type === ChannelType.GuildCategory
      );

      const basePermissionOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ];

      if (!category) {
        try {
          category = await guild.channels.create({
            name: "LOGS APOSTADOS",
            type: ChannelType.GuildCategory,
            permissionOverwrites: basePermissionOverwrites,
          });
          await delay(2000);
        } catch (err) {
          console.error("Erro ao criar categoria:", err);
          return interaction.editReply(
            "❌ Erro crítico ao criar categoria de logs. Verifique se atingiu o limite de canais."
          );
        }
      }

      if (!category) return interaction.editReply("❌ Não foi possível definir a categoria dos canais.");

      const dbUpdates = {};
      let stats = { created: 0, updated: 0, skipped: 0 };

      for (const config of CHANNELS_CONFIG) {
        const savedId = logsConfig[config.key];
        let channel = savedId ? guild.channels.cache.get(savedId) : null;

        if (channel) {
          let modified = false;

          try {
            if (channel.name !== config.name) {
              await channel
                .setName(config.name)
                .catch();
              modified = true;
            }
          }
          catch (err) {
            if (err.code === 10003) return;
              console.error(`[CANAISLOGS]Erro ao atualizar canal ${config.name}:`, err);
            }
            if (channel.parentId !== category.id) {
              await channel
                .setParent(category.id, { lockPermissions: false })
                .catch((e) => console.error(`Erro mover ${config.name}:`, e));
              modified = true;
            }

            if (modified) {
              stats.updated++;
              await delay(1200);
            } else {
              stats.skipped++;
            }

            dbUpdates[config.key] = channel.id;
          } else {
          try {
            const newChannel = await guild.channels.create({
              name: config.name,
              type: ChannelType.GuildText,
              parent: category.id,
              topic: config.topic,
              permissionOverwrites: basePermissionOverwrites,
            });

            dbUpdates[config.key] = newChannel.id;
            stats.created++;
            await delay(1500);
          } catch (err) {
            console.error(`Falha ao criar canal ${config.name}:`, err.message);
          }
        }
      }

      if (Object.keys(dbUpdates).length > 0) {
        await LogsConfig.update(dbUpdates, {
          where: { guildId: guild.id },
          individualHooks: true,
        });
      }

      const embedSuccess = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Green)
        .setTitle(`${Emojis.check || "✅"} Sistema de Logs Sincronizado`)
        .setDescription(
          `A estrutura de logs foi auditada e corrigida com sucesso.\n\n` +
          `**Resumo da Operação:**\n` +
          `> ${Emojis.sino || "🆕"} **Criados:** \`${stats.created}\`\n` +
          `> ${Emojis.verifybot || "🔄"} **Atualizados:** \`${stats.updated}\`\n` +
          `> ${Emojis.check || "✨"} **Verificados (Intactos):** \`${stats.skipped}\``
        )
        .setTimestamp();

      applyBotFooter(embedSuccess);

      await interaction
        .editReply({ content: "", embeds: [embedSuccess] })
        .catch((err) => { });

    } catch (error) {
      console.error("Erro fatal em canaislogs:", error);
      const errorEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(
          `### ${Emojis.circlecross || "❌"} Erro Crítico\nFalha na execução do comando.\n\`${error.message}\``
        );

      if (!interaction.replied) {
        await interaction
          .editReply({ content: "", embeds: [errorEmbed] })
          .catch(() => { });
      }
    }
  },
};