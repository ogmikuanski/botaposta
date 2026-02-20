const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  MessageFlags,
} = require("discord.js");
const ModalityBlacklist = require("../../database/models/ModalityBlacklist");
const {
  logModalityBlacklistAdd,
  logModalityBlacklistRemove,
} = require("../../utils/modalityBlacklistLogger");
const Emojis = require("../../Emojis.json");
const { isBlacklisted } = require("../../manager/blacklistManager");
const { Op } = require("sequelize");
const idRegex = /^[0-9]{5,20}$/;
function applyBlacklistFooter(embed, interaction) {
  const config = process.env.BOT_MARCACOES_INTERFACES;

  if (config === "true") {
    embed.setFooter({
      text: process.env.DEFAULT_FOOTER_TEXT,
      iconURL: process.env.DEFAULT_FOOTER_ICON || null,
    });
  } else if (config === "false") {
    const guild = interaction.guild;
    if (guild) {
      embed.setFooter({
        text: guild.name,
        iconURL: guild.iconURL({ dynamic: true }) || null,
      });
    }
  }
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Gerencia a Blacklist.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName("adicionar")
        .setDescription("Adiciona um jogador à Blacklist.")
        .addUserOption((opt) =>
          opt
            .setName("usuario")
            .setDescription("O usuário do Discord.")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("id_do_jogo")
            .setDescription("O ID do jogador.")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("motivo")
            .setDescription("O motivo da blacklist.")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("provas")
            .setDescription("O link da prova(print, vídeo). (Opcional)")
            .setRequired(false)
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("remover")
        .setDescription("Remove um jogador da Blacklist.")
        .addSubcommand((sub) =>
          sub
            .setName("usuario")
            .setDescription("Remove por @usuário do Discord.")
            .addUserOption((opt) =>
              opt
                .setName("usuario")
                .setDescription("O usuário do Discord para remover.")
                .setRequired(true)
            )
            .addStringOption((opt) =>
              opt
                .setName("motivo_remocao")
                .setDescription("O motivo da remoção da blacklist.")
                .setRequired(true)
            )
            .addStringOption((opt) =>
              opt
                .setName("provas_remocao")
                .setDescription("O link da prova.")
                .setRequired(false)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("id_jogo")
            .setDescription("Remove por ID do Jogo.")
            .addStringOption((opt) =>
              opt
                .setName("id_jogo")
                .setDescription("O ID do Jogo para remover.")
                .setRequired(true)
            )
            .addStringOption((opt) =>
              opt
                .setName("motivo_remocao")
                .setDescription("O motivo da remoção da blacklist.")
                .setRequired(true)
            )
            .addStringOption((opt) =>
              opt
                .setName("provas_remocao")
                .setDescription("O link da prova.")
                .setRequired(false)
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("lista")
        .setDescription("Lista todos os jogadores ativos na Blacklist.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("Busca um jogador nas logs da Blacklist.")
        .addStringOption((opt) =>
          opt
            .setName("id_alvo")
            .setDescription("O ID Discord ou ID do Jogo")
            .setRequired(true)
        )
    ),

  execute: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      return;
    }

    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();
    const staff = interaction.user;
    const guildId = interaction.guild.id;

    const userBlocked = await isBlacklisted(interaction.user.id, "user");
    if (userBlocked) {
      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
        .setDescription(
          process.env.MSGBLACKLISTMEMBERBOT
        )
        .setFooter({
          text: interaction.client.user.username,
          iconURL: interaction.client.user.displayAvatarURL(),
        });

      return interaction.editReply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildBlocked = await isBlacklisted(interaction.guild.id, "guild");
    if (guildBlocked) {
      const embed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
        .setDescription(
          process.env.MSGBLACKLISTSERVIDORBOT
        )
        .setFooter({
          text: interaction.client.user.username,
          iconURL: interaction.client.user.displayAvatarURL(),
        });

      return interaction.editReply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      if (subcommand === "adicionar") {
        const targetUser = interaction.options.getUser("usuario");
        const gameId = interaction.options.getString("id_do_jogo");
        const reason = interaction.options.getString("motivo");
        const proofUrl = interaction.options.getString("provas") || null;

        if (targetUser.id === gameId) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `### ${Emojis.circlecross} Erro!\n- O **ID do Discord** e o **ID do Jogo** não podem ser iguais.`
                ),
            ],
          });
        }

        if (!idRegex.test(gameId)) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `### ${Emojis.circlecross} O **ID do Jogo** é inválido.\n- Ele deve conter apenas números e ter entre 5 e 20 dígitos.`
                ),
            ],
          });
        }

        if (
          proofUrl &&
          !proofUrl.startsWith("http://") &&
          !proofUrl.startsWith("https://")
        ) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `### ${Emojis.circlecross} As **Provas** (se fornecidas) devem ser um link (URL) válido.\n- Começando com \`http://\` ou \`https://\`.`
                ),
            ],
          });
        }

        const existingEntry = await ModalityBlacklist.findOne({
          where: {
            guildId,
            isActive: true,
            [Op.or]: [{ userId: targetUser.id }, { gameId: gameId }],
          },
        });

        if (existingEntry) {
          let erroMsg = `### ${Emojis.circlecross} Falha ao Adicionar!\n`;
          if (existingEntry.userId === targetUser.id) {
            erroMsg += `- O usuário <@${targetUser.id}> já está na blacklist.`;
          } else if (existingEntry.gameId === gameId) {
            erroMsg += `- O ID de Jogo \`${gameId}\` já está na blacklist\n> Associado a <@${existingEntry.userId}>.`;
          }
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(erroMsg),
            ],
          });
        }

        const newEntry = await ModalityBlacklist.create({
          guildId,
          userId: targetUser.id,
          gameId,
          reason,
          proofUrl,
          addedByStaffId: staff.id,
        });

        await logModalityBlacklistAdd(client, guildId, newEntry);

        return interaction.editReply({
          content: ``,
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `- ${Emojis.check} **${targetUser.tag}** (ID Jogo: \`${gameId}\`) foi **adicionado** à Blacklist.`
              ),
          ],
        });
      }

      if (subcommandGroup === "remover") {
        const removeReason = interaction.options.getString("motivo_remocao");
        const removeProofUrl =
          interaction.options.getString("provas_remocao") || null;

        let searchCriteria;
        let idAlvoLog;

        if (
          removeProofUrl &&
          !removeProofUrl.startsWith("http://") &&
          !removeProofUrl.startsWith("https://")
        ) {
          return interaction.editReply({
            content: "",
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `- ${Emojis.circlecross} As **Provas (Remoção)** devem ser um link (URL) válido.`
                ),
            ],
          });
        }

        if (subcommand === "usuario") {
          const targetUser = interaction.options.getUser("usuario");
          searchCriteria = { userId: targetUser.id };
          idAlvoLog = targetUser.tag;
        } else if (subcommand === "id_jogo") {
          const gameId = interaction.options.getString("id_jogo");

          if (!idRegex.test(gameId)) {
            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Red)
                  .setDescription(
                    `### ${Emojis.circlecross} O **ID do Jogo** é inválido.\n- Ele deve conter apenas números e ter entre 5 e 20 dígitos.`
                  ),
              ],
            });
          }
          searchCriteria = { gameId: gameId };
          idAlvoLog = gameId;
        }

        const entryToDeactivate = await ModalityBlacklist.findOne({
          where: {
            guildId,
            ...searchCriteria,
            isActive: true,
          },
        });

        if (!entryToDeactivate) {
          return interaction.editReply({
            content: ``,
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `- ${Emojis.circlecross} Ninguém com o critério \`${idAlvoLog}\` foi encontrado na Blacklist.`
                ),
            ],
          });
        }

        entryToDeactivate.isActive = false;
        entryToDeactivate.removedByStaffId = staff.id;
        entryToDeactivate.removeReason = removeReason;
        entryToDeactivate.removeProofUrl = removeProofUrl;
        entryToDeactivate.removedAt = new Date();
        await entryToDeactivate.save();

        await logModalityBlacklistRemove(client, guildId, entryToDeactivate);

        return interaction.editReply({
          content: ``,
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Green)
              .setDescription(
                `- ${Emojis.check} O registro associado a \`${idAlvoLog}\` foi **removido** da Blacklist.`
              ),
          ],
        });
      }

      if (subcommand === "lista") {
        const entries = await ModalityBlacklist.findAll({
          where: { guildId, isActive: true },
          order: [["createdAt", "DESC"]],
        });

        if (entries.length === 0) {
          return interaction.editReply({
            content: "",
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(`- ${Emojis.livro} A Blacklist está vazia.`),
            ],
          });
        }

        const embeds = [];
        let description = "";
        const baseEmbed = new EmbedBuilder()
          .setTitle(`Blacklist Ativa (${entries.length})`)
          .setColor(process.env.botcolor || Colors.Blue)
          .setTimestamp();

        applyBlacklistFooter(baseEmbed, interaction);

        for (const entry of entries) {
          const line = `- <@${entry.userId}> (\`${entry.userId}\`)\n`;

          if ((description + line).length > 4096) {
            embeds.push(
              new EmbedBuilder(baseEmbed).setDescription(description)
            );
            description = line;
          } else {
            description += line;
          }
        }

        embeds.push(new EmbedBuilder(baseEmbed).setDescription(description));

        await interaction.editReply({
          embeds: [embeds[0]],
        });
        for (let i = 1; i < embeds.length; i++) {
          await interaction.followUp({
            embeds: [embeds[i]],
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      if (subcommand === "info") {
        const idAlvo = interaction.options.getString("id_alvo");

        if (!idRegex.test(idAlvo)) {
          const embed = new EmbedBuilder().setColor(
            process.env.botcolor || Colors.Red
          ).setDescription(`### ${Emojis.circlecross || "❌"} ID Inválido!
- A pesquisa deve conter **apenas números** e ter entre 5 e 20 dígitos.
- Você digitou: \`${idAlvo.substring(0, 100)}\``);

          applyBlacklistFooter(embed, interaction);
          return interaction.editReply({
            embeds: [embed],
          });
        }

        const searchCriteria = [{ userId: idAlvo }, { gameId: idAlvo }];

        const results = await ModalityBlacklist.findAll({
          where: {
            guildId: interaction.guild.id,
            [Op.or]: searchCriteria,
            isActive: true,
          },
        });

        if (results.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle("Nenhum Registro Encontrado")
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross} O ID \`${idAlvo}\` não foi encontrado na Blacklist.`
            )
            .setTimestamp();

          applyBlacklistFooter(embed, interaction);

          return interaction.editReply({
            embeds: [embed],
          });
        }

        const resultEmbeds = results.map((entry) => {
          const embed = new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `## ${Emojis.bloqueado || "🚨"} REGISTRO ENCONTRADO`
            )
            .setTimestamp()
            .addFields(
              {
                name: "Jogador",
                value: `<@${entry.userId}>\n(\`${entry.userId}\`)`,
                inline: false,
              },
              {
                name: "ID do Jogo",
                value: `\`${entry.gameId}\``,
                inline: false,
              },
              { name: "Motivo", value: entry.reason, inline: false },
              {
                name: "Provas",
                value: entry.proofUrl
                  ? `[Ver Prova](${entry.proofUrl})`
                  : "Nenhuma registrada",
                inline: false,
              },
              {
                name: "Adicionado por",
                value: `<@${entry.addedByStaffId}> em <t:${Math.floor(
                  entry.createdAt.getTime() / 1000
                )}:f>`,
                inline: false,
              }
            );

          return applyBlacklistFooter(embed, interaction);
        });

        await interaction.editReply({
          embeds: [resultEmbeds[0]],
        });

        for (let i = 1; i < resultEmbeds.length; i++) {
          await interaction.followUp({
            embeds: [resultEmbeds[i]],
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }
    } catch (err) {
      console.error("Erro no comando /blacklist:", err);

      if (err.name === "SequelizeValidationError") {
        return interaction.editReply({
          content: ``,
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross} Erro de validação.\n- Verifique se a **Prova** é uma URL válida e se o **ID do Jogo** tem entre 5 e 20 números.`
              ),
          ],
        });
      }

      return interaction.editReply({
        content: "",
        embeds: [errorEmbed],
      });
    }
  },
};
