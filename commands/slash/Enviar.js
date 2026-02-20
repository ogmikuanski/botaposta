const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  Colors,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const Emojis = require("../../Emojis.json");
const { redisClient } = require("../../utils/cache");
const CargosConfig = require("../../database/models/CargosConfig");
const { isDev } = require("../../manager/devManager");
const { EQUIPE_IDS } = process.env;

const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("enviar")
    .setDescription("Envia mensagens ou embeds oficiais pelo bot.")
    .addSubcommand((sub) =>
      sub
        .setName("mensagem")
        .setDescription("Envia uma mensagem de texto simples neste canal.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("embed")
        .setDescription("Abre o construtor de Embeds avançado.")
    ),

  execute: async (interaction, client) => {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "mensagem") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } else {
        await interaction.deferReply();
      }
    } catch (e) {
      return;
    }

    try {
      const { member, guild, user, channel } = interaction;
      const userIsDev = await isDev(user.id);
      const isOwner = member.id === guild.ownerId || ownerIdSet.has(user.id);

      let hasPerm = isOwner || userIsDev;

      if (!hasPerm) {
        const [cargosConfig] = await CargosConfig.findOrCreate({
          where: { guildId: guild.id },
        });
        if (
          cargosConfig.cargoPermMaxId &&
          member.roles.cache.has(cargosConfig.cargoPermMaxId)
        ) {
          hasPerm = true;
        }
      }

      if (!hasPerm) {
        if (subcommand === "embed")
          await interaction.deleteReply().catch(() => { });

        return interaction.followUp({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross || "❌"
                } Sem Permissão!\n- Apenas usuários com **Permissão Máxima** podem usar este comando.`
              ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (subcommand === "mensagem") {
        const botPerms = channel.permissionsFor(guild.members.me);
        if (!botPerms.has(PermissionFlagsBits.SendMessages)) {
          return interaction.editReply({
            content: ``,
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Green)
                .setDescription(
                  `${Emojis.circlecross || "❌"
                  } Eu não tenho permissão para enviar mensagens neste canal.`
                ),
            ],
          });
        }

        await interaction.editReply({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Green)
              .setDescription(
                `### ${Emojis.livro || "✍️"} Enviar Mensagem\n` +
                `- Envie abaixo o texto que deseja postar neste canal.\n` +
                `- Sua mensagem será deletada e reenviada pelo bot.\n` +
                `- Digite \`cancelar\` para desistir.\n` +
                `- Tempo limite: 5 minutos.`
              ),
          ],
        });

        const filter = (m) => m.author.id === user.id;
        const collector = channel.createMessageCollector({
          filter,
          max: 1,
          time: 300000,
        });

        collector.on("collect", async (message) => {
          const content = message.content;
          if (message.deletable) await message.delete().catch(() => { });

          if (content.toLowerCase() === "cancelar") {
            await interaction.editReply({
              content: "",
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Green)
                  .setDescription(
                    `${Emojis.circlecross || "❌"} Operação cancelada.`
                  ),
              ],
            });
            return;
          }

          try {
            await channel.send(content);
            await interaction.editReply({
              content: ``,
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Green)
                  .setDescription(
                    `${Emojis.check || "✅"} Mensagem enviada com sucesso!`
                  ),
              ],
            });
          } catch (err) {
            await interaction.editReply({
              content: `❌ Erro ao enviar: ${err.message}`,
            });
          }
        });

        collector.on("end", (collected, reason) => {
          if (reason === "time") {
            interaction
              .editReply({
                content: "",
                embeds: [
                  new EmbedBuilder()
                    .setColor(process.env.botcolor || Colors.Green)
                    .setDescription(`${Emojis.time || "⏰"}  Tempo esgotado.`),
                ],
              })
              .catch(() => { });
          }
        });
      } else if (subcommand === "embed") {
        const draftId = `${guild.id}:${user.id}`;
        const draftKey = `${process.env.REDIS_NAMESPACE}:embed_builder:${draftId}`;

        const initialDraft = {
          channelId: null,
          content: "",
          embed: {
            description: "Embed de exemplo. Use o menu abaixo para configurar.",
          },
        };
        initialDraft.embed.color = process.env.botcolor || "#5865F2";

        if (redisClient.isReady) {
          await redisClient.set(draftKey, JSON.stringify(initialDraft), {
            EX: 3600,
          });
        } else {
          return interaction.editReply("❌ Erro: Redis offline.");
        }

        const previewData = { ...initialDraft.embed };
        delete previewData.color;

        const previewEmbed = new EmbedBuilder(previewData);
        try {
          previewEmbed.setColor(initialDraft.embed.color);
        } catch {
          previewEmbed.setColor(Colors.Default);
        }

        const menuRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("embed_builder_menu")
            .setPlaceholder("Selecione o que deseja editar...")
            .addOptions([
              { label: "Editar Título", value: "edit_title", emoji: "📝" },
              {
                label: "Editar Descrição",
                value: "edit_description",
                emoji: "📄",
              },
              { label: "Editar Cor", value: "edit_color", emoji: "🎨" },
              { label: "Editar Imagem", value: "edit_image", emoji: "🖼️" },
              {
                label: "Editar Thumbnail",
                value: "edit_thumbnail",
                emoji: "🖼️",
              },
              { label: "Editar Rodapé", value: "edit_footer", emoji: "🔻" },
              { label: "Editar Autor", value: "edit_author", emoji: "👤" },
              {
                label: "Mensagem Externa",
                description: "Texto fora da embed",
                value: "edit_content",
                emoji: "📎",
              },
            ])
        );

        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("embed_builder_pre_send")
            .setLabel("Enviar Embed")
            .setEmoji(Emojis.foguete || "🚀")
            .setStyle(ButtonStyle.Success)
        );

        await interaction.editReply({
          content: null,
          embeds: [previewEmbed],
          components: [menuRow, buttonRow],
        });
      }
    } catch (err) {
      console.error("Erro no /enviar:", err);
      try {
        await interaction.editReply({ content: process.env.MSGERROBOT });
      } catch { }
    }
  },
};
