const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { redisClient } = require("../../utils/cache");
const CargosConfig = require("../../database/models/CargosConfig");
const Emojis = require("../../Emojis.json");
const LogService = require("../../services/logService");
require("dotenv").config();

const BATCH_SIZE = 10;
const BATCH_DELAY = 1500;
const COOLDOWN_TIME = 1800;
const MIN_BOT_AGE = 60 * 60 * 1000;

function createProgressBar(current, total, size = 15) {
  const percentage = current / total;
  const progress = Math.round(size * percentage);
  const emptyProgress = size - progress;
  const progressText = "█".repeat(progress);
  const emptyProgressText = "░".repeat(emptyProgress);
  return `[${progressText}${emptyProgressText}] ${Math.round(
    percentage * 100
  )}%`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("administrar")
    .setDescription("Gerencia cargos em massa (Sistema Blindado).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("acao")
        .setDescription("O que você quer fazer?")
        .setRequired(true)
        .addChoices(
          { name: "Adicionar Cargo", value: "add" },
          { name: "Remover Cargo", value: "remove" }
        )
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_acao")
        .setDescription("O cargo que será manipulado.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("alvo")
        .setDescription("Quem será afetado?")
        .setRequired(true)
        .addChoices(
          { name: "Todos os Usuários", value: "all" },
          { name: "Somente quem tem X cargo", value: "role" }
        )
    )
    .addRoleOption((option) =>
      option
        .setName("cargo_filtro")
        .setDescription(
          "O cargo filtro (Obrigatório se escolheu filtrar por cargo)."
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const { guild, member, user, options } = interaction;
      const acao = options.getString("acao");
      const cargoAcao = options.getRole("cargo_acao");
      const alvo = options.getString("alvo");
      const cargoFiltro = options.getRole("cargo_filtro");

      const [cargosConfig] = await CargosConfig.findOrCreate({
        where: { guildId: guild.id },
      });
      const permMaxRoleId = cargosConfig.cargoPermMaxId;
      const isOwner = guild.ownerId === user.id;
      const hasPermMax = permMaxRoleId && member.roles.cache.has(permMaxRoleId);

      if (!isOwner && !hasPermMax) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross || "❌"
                } **Acesso Negado**\nEste comando é restrito ao Dono ou Permissão Máxima.`
              ),
          ],
        });
      }

      const botMember = guild.members.me;
      const timeSinceJoin = Date.now() - botMember.joinedTimestamp;

      if (timeSinceJoin < MIN_BOT_AGE) {
        const minutesLeft = Math.ceil((MIN_BOT_AGE - timeSinceJoin) / 60000);
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Orange)
              .setDescription(
                `## ${Emojis.verifybot} Protocolo de Segurança\n` +
                `- O bot precisa estar no servidor há pelo menos **1 hora** para executar ações em massa.\n\n` +
                `> ${Emojis.time} **Aguarde:** ${minutesLeft} minutos.`
              ),
          ],
        });
      }

      const cooldownKey = `${process.env.REDIS_NAMESPACE}:cooldown:administrar:${guild.id}`;
      const ttl = await redisClient.ttl(cooldownKey);

      if (ttl > 0) {
        const minutes = Math.floor(ttl / 60);
        const seconds = ttl % 60;
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `## ${Emojis.time || "⏱️"} **Cooldown Ativo**\n` +
                `- O sistema está em Cooldown para proteger o servidor.\n\n` +
                `> Disponível em: **${minutes}m ${seconds}s**`
              ),
          ],
        });
      }

      if (alvo === "role" && !cargoFiltro) {
        return interaction.editReply(
          `${Emojis.aviso} Selecione o **cargo_filtro** para usar esse modo.`
        );
      }

      if (cargoAcao.position >= botMember.roles.highest.position) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} **Erro de Hierarquia**\n` +
                `Não posso gerenciar o cargo ${cargoAcao} pois ele é superior ou igual ao meu cargo.`
              ),
          ],
        });
      }

      await interaction.editReply(
        `${Emojis.loading || "🔄"} Analisando membros...`
      );

      const allMembers = await guild.members.fetch();

      let targets = allMembers.filter((m) => {
        if (m.user.bot) return false;
        if (m.id === user.id && acao === "remove") return false;

        if (alvo === "all") return true;
        if (alvo === "role") return m.roles.cache.has(cargoFiltro.id);
        return false;
      });

      targets = targets.filter((m) => {
        const hasRole = m.roles.cache.has(cargoAcao.id);
        if (acao === "add") return !hasRole;
        if (acao === "remove") return hasRole;
        return false;
      });

      const totalTargets = targets.size;

      if (totalTargets === 0) {
        return interaction.editReply({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Yellow)
              .setDescription(
                `${Emojis.bot} Nenhum membro precisa dessa alteração.`
              ),
          ],
        });
      }

      const confirmEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Gold)
        .setDescription(
          `# ${Emojis.verifybot} Confirmação de Ação em Massa\n\n` +
          `Você está prestes a executar a seguinte ação:\n\n` +
          `${Emojis.discord} **Ação:** ${acao === "add" ? "Adicionar" : "Remover"
          } ${cargoAcao}\n` +
          `${Emojis.usersss} **Alvo:** ${alvo === "all" ? "Todos os Membros" : `Membros com ${cargoFiltro}`
          }\n` +
          `${Emojis.sino} **Quantidade:** ${totalTargets} usuários afetados\n` +
          `${Emojis.time} **Tempo Estimado:** ~${Math.ceil(
            (totalTargets / BATCH_SIZE) * 1.5
          )} segundos\n\n` +
          `**Deseja prosseguir?**`
        );

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("confirm_mass")
          .setLabel("Confirmar")
          .setStyle(ButtonStyle.Success)
          .setEmoji(Emojis.Success || "✅"),
        new ButtonBuilder()
          .setCustomId("cancel_mass")
          .setLabel("Cancelar")
          .setStyle(ButtonStyle.Danger)
          .setEmoji(Emojis.circlecross || "✖️")
      );

      const msg = await interaction.editReply({
        content: "",
        embeds: [confirmEmbed],
        components: [buttons],
      });

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000,
        filter: (i) => i.user.id === user.id,
      });

      collector.on("collect", async (i) => {
        if (i.customId === "cancel_mass") {
          await i.update({
            content: `${Emojis.circlecross} Operação cancelada.`,
            embeds: [],
            components: [],
          });
          return;
        }

        if (i.customId === "confirm_mass") {
          await i.update({ components: [] });

          await redisClient.set(cooldownKey, "1", { EX: COOLDOWN_TIME });

          const membersArray = Array.from(targets.values());
          let success = 0;
          let errors = 0;
          let processed = 0;

          for (let j = 0; j < membersArray.length; j += BATCH_SIZE) {
            const chunk = membersArray.slice(j, j + BATCH_SIZE);

            const promises = chunk.map(async (member) => {
              try {
                if (acao === "add")
                  await member.roles.add(
                    cargoAcao,
                    `Mass Admin por ${user.tag}`
                  );
                else
                  await member.roles.remove(
                    cargoAcao,
                    `Mass Admin por ${user.tag}`
                  );
                success++;
              } catch (e) {
                errors++;
              }
            });

            await Promise.all(promises);
            processed += chunk.length;

            const progressBar = createProgressBar(processed, totalTargets);
            try {
              await interaction.editReply({
                embeds: [
                  new EmbedBuilder()
                    .setColor(process.env.botcolor || Colors.Blue)
                    .setTitle(`${Emojis.carregando || "🔄"} Processando...`)
                    .setDescription(
                      `**Progresso:**\n\`${progressBar}\`\n\n` +
                      `${Emojis.Success} Feito: ${success}\n${Emojis.circlecross} Erros: ${errors}\nTarget: ${totalTargets}`
                    ),
                ],
              });

            } catch (err) {
              if (err.code === 50027 || err.code === 10062) {
                return;
              } else {
                console.error("[Administrar] Erro ao atualizar barra de progresso:", err.message);
              }
            }
            await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
          }

          const finalEmbed = new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setTitle(`${Emojis.Success || "✅"} Operação Concluída`)
            .setDescription(
              `**Resumo da Operação:**\n` +
              `🔹 Ação: ${acao === "add" ? "Adicionar" : "Remover"
              } ${cargoAcao}\n` +
              `${Emojis.Success} Sucessos: **${success}**\n` +
              `${Emojis.circlecross} Falhas: **${errors}**\n` +
              `${Emojis.time} Cooldown de 30min ativado.`
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [finalEmbed] }).catch(async () => {
            await interaction.channel.send({
              content: `${user}, o processamento em massa terminou!`,
              embeds: [finalEmbed]
            }).catch(() => null);
          });
        }
      });

      collector.on("end", (collected, reason) => {
        if (reason === "time") {
          interaction
            .editReply({
              content: `${Emojis.time} Tempo esgotado.`,
              components: [],
            })
            .catch(() => { });
        }
      });
    } catch (error) {
      if (error.code === 10062) return;
      console.error("[Command: Administrar] Erro Fatal:", error);
      try {
        await interaction.editReply({
          content: process.env.MSGERROBOT,
        });
      } catch (e) { }
    }
  },
};
