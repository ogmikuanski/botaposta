const {
  EmbedBuilder,
  ActionRowBuilder,
  Colors,
  MessageFlags,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
} = require("discord.js");
const { redisClient } = require("../../utils/cache");
const Emojis = require("../../Emojis.json");
const CargosConfig = require("../../database/models/CargosConfig");
const { isDev } = require("../../manager/devManager");
const { EQUIPE_IDS } = process.env;

const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

const isValidUrl = (url) => {
  if (!url) return true;
  try {
    new URL(url);
    return url.startsWith("http");
  } catch {
    return false;
  }
};

const isValidHex = (hex) => /^#?[0-9A-F]{6}$/i.test(hex);

async function checkPermission(interaction) {
  const { member, guild, user } = interaction;
  const userIsDev = await isDev(user.id);
  const isOwner = member.id === guild.ownerId || ownerIdSet.has(user.id);

  if (isOwner || userIsDev) return true;

  const [cargosConfig] = await CargosConfig.findOrCreate({
    where: { guildId: guild.id },
  });
  if (
    cargosConfig.cargoPermMaxId &&
    member.roles.cache.has(cargosConfig.cargoPermMaxId)
  ) {
    return true;
  }
  return false;
}

async function getDraft(guildId, userId) {
  if (!redisClient.isReady) return null;
  const data = await redisClient.get(
    `${process.env.REDIS_NAMESPACE}:embed_builder:${guildId}:${userId}`
  );
  return data ? JSON.parse(data) : null;
}

async function saveDraft(guildId, userId, data) {
  if (!redisClient.isReady) return;
  await redisClient.set(
    `${process.env.REDIS_NAMESPACE}:embed_builder:${guildId}:${userId}`,
    JSON.stringify(data),
    { EX: 3600 }
  );
}

async function returnToEditor(interaction, draft, messageContent = null) {
  const embedData = { ...draft.embed };
  delete embedData.color;

  const embed = new EmbedBuilder(embedData);
  try {
    if (draft.embed.color) embed.setColor(draft.embed.color);
    else embed.setColor(Colors.Default);
  } catch {
    embed.setColor(Colors.Default);
  }

  if (!embed.data.title && !embed.data.description && !embed.data.image) {
    embed.setDescription("Embed vazia. Edite algo para visualizar.");
  }

  const menuRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("embed_builder_menu")
      .setPlaceholder("Selecione o que deseja editar...")
      .addOptions([
        { label: "Editar Título", value: "edit_title", emoji: "📝" },
        { label: "Editar Descrição", value: "edit_description", emoji: "📄" },
        { label: "Editar Cor", value: "edit_color", emoji: "🎨" },
        { label: "Editar Imagem", value: "edit_image", emoji: "🖼️" },
        { label: "Editar Thumbnail", value: "edit_thumbnail", emoji: "🖼️" },
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

  const payload = {
    content: draft.content || null,
    embeds: [embed],
    components: [menuRow, buttonRow],
  };

  try {
    if (interaction.type === 5 || interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.update(payload);
    }
  } catch (err) {
    if (interaction.message && interaction.message.editable) {
      await interaction.message.edit(payload).catch(() => { });
    }
  }

  if (messageContent) {
    await interaction.followUp({
      content: messageContent,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function resetMenuSelection(interaction, draft) {
  const embedData = { ...draft.embed };
  delete embedData.color;
  const embed = new EmbedBuilder(embedData);
  try {
    if (draft.embed.color) embed.setColor(draft.embed.color);
    else embed.setColor(Colors.Default);
  } catch {
    embed.setColor(Colors.Default);
  }

  if (!embed.data.title && !embed.data.description && !embed.data.image) {
    embed.setDescription("Embed vazia. Edite algo para visualizar.");
  }

  const menuRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("embed_builder_menu")
      .setPlaceholder("Selecione o que deseja editar...")
      .addOptions([
        { label: "Editar Título", value: "edit_title", emoji: "📝" },
        { label: "Editar Descrição", value: "edit_description", emoji: "📄" },
        { label: "Editar Cor", value: "edit_color", emoji: "🎨" },
        { label: "Editar Imagem", value: "edit_image", emoji: "🖼️" },
        { label: "Editar Thumbnail", value: "edit_thumbnail", emoji: "🖼️" },
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

  await interaction.message.edit({
    content: draft.content || null,
    embeds: [embed],
    components: [menuRow, buttonRow],
  });
}

module.exports = {
  embed_builder_menu: async (interaction) => {
    if (!(await checkPermission(interaction)))
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(`${Emojis.circlecross || "❌"} Sem permissão.`),
        ],
        flags: MessageFlags.Ephemeral,
      });

    const option = interaction.values[0];
    const draft = await getDraft(interaction.guild.id, interaction.user.id);

    if (!draft)
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } Sessão expirada. Use \`/enviar embed\` novamente.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    resetMenuSelection(interaction, draft).catch(() => { });

    if (option === "edit_description") {
      await interaction.deferUpdate();

      const instructionMsg = await interaction.followUp({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `### ${Emojis.livro || "✍️"} Editando: Descrição\n` +
              `- Envie a nova descrição no chat abaixo (pode ser texto longo).\n` +
              `- Máximo de **4096 caracteres**.\n` +
              `- Digite \`remover\` para limpar.\n` +
              `- Digite \`cancelar\` para voltar.\n` +
              `- Tempo: 2 minutos.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
        fetchReply: true,
      });

      const filter = (m) => m.author.id === interaction.user.id;
      const collector = interaction.channel.createMessageCollector({
        filter,
        max: 1,
        time: 120000,
      });

      collector.on("collect", async (message) => {
        const content = message.content;

        if (message.deletable) await message.delete().catch(() => { });

        if (content.toLowerCase() === "cancelar") {
          try {
            await interaction.deleteReply(instructionMsg);
          } catch (e) { }
          return;
        }

        if (content.length > 4096) {
          await interaction.followUp({
            content: `❌ A descrição é muito longa! O limite é de **4096** caracteres. Você enviou **${content.length}**. Tente novamente.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const currentDraft = await getDraft(
          interaction.guild.id,
          interaction.user.id
        );
        if (!currentDraft) return;

        if (content.toLowerCase() === "remover") {
          currentDraft.embed.description = "Embed vazia.";
        } else {
          currentDraft.embed.description = content;
        }

        await saveDraft(
          interaction.guild.id,
          interaction.user.id,
          currentDraft
        );

        try {
          await interaction.deleteReply(instructionMsg);
        } catch (e) { }

        await returnToEditor(
          {
            ...interaction,
            deferred: true,
            replied: true,
            message: interaction.message,
          },
          currentDraft
        );
        collector.stop();
      });
      return;
    }

    let modal;
    if (option === "edit_title") {
      modal = new ModalBuilder()
        .setCustomId("modal_embed_title")
        .setTitle("Editar Título");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("inp_title")
            .setLabel("Título (Máx 256 chars)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(draft.embed.title || "")
        )
      );
    } else if (option === "edit_color") {
      modal = new ModalBuilder()
        .setCustomId("modal_embed_color")
        .setTitle("Editar Cor");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("inp_color")
            .setLabel("Cor Hex (ex: #FF0000)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(draft.embed.color || "")
        )
      );
    } else if (option === "edit_image") {
      modal = new ModalBuilder()
        .setCustomId("modal_embed_image")
        .setTitle("Editar Imagem");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("inp_image")
            .setLabel("URL da Imagem")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(draft.embed.image?.url || "")
        )
      );
    } else if (option === "edit_thumbnail") {
      modal = new ModalBuilder()
        .setCustomId("modal_embed_thumbnail")
        .setTitle("Editar Thumbnail");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("inp_thumbnail")
            .setLabel("URL da Thumbnail")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(draft.embed.thumbnail?.url || "")
        )
      );
    } else if (option === "edit_footer") {
      modal = new ModalBuilder()
        .setCustomId("modal_embed_footer")
        .setTitle("Editar Rodapé");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("inp_foot_text")
            .setLabel("Texto (Máx 2048 chars)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(draft.embed.footer?.text || "")
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("inp_foot_icon")
            .setLabel("URL Ícone")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(draft.embed.footer?.icon_url || "")
        )
      );
    } else if (option === "edit_author") {
      modal = new ModalBuilder()
        .setCustomId("modal_embed_author")
        .setTitle("Editar Autor");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("inp_auth_name")
            .setLabel("Nome (Máx 256 chars)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(draft.embed.author?.name || "")
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("inp_auth_icon")
            .setLabel("URL Ícone")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(draft.embed.author?.icon_url || "")
        )
      );
    } else if (option === "edit_content") {
      modal = new ModalBuilder()
        .setCustomId("modal_embed_content")
        .setTitle("Mensagem Externa");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("inp_content")
            .setLabel("Conteúdo (Máx 2000 chars)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(draft.content || "")
        )
      );
    }

    if (modal) await interaction.showModal(modal);
  },

  modal_embed_title: async (interaction) => {
    if (!(await checkPermission(interaction))) return;

    const title = interaction.fields.getTextInputValue("inp_title");
    if (title && title.length > 256) {
      return interaction.reply({
        content: `❌ Título muito longo! Máximo de 256 caracteres (Você enviou ${title.length}).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();
    const draft = await getDraft(interaction.guild.id, interaction.user.id);
    if (!draft) return;

    draft.embed.title = title || null;
    await saveDraft(interaction.guild.id, interaction.user.id, draft);
    await returnToEditor(interaction, draft);
  },

  modal_embed_color: async (interaction) => {
    if (!(await checkPermission(interaction))) return;
    const color = interaction.fields.getTextInputValue("inp_color");

    if (color && !isValidHex(color)) {
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } Cor inválida! Use formato HEX (ex: #e89b00).`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();
    const draft = await getDraft(interaction.guild.id, interaction.user.id);
    if (!draft) return;

    draft.embed.color = color || null;
    await saveDraft(interaction.guild.id, interaction.user.id, draft);
    await returnToEditor(interaction, draft);
  },

  modal_embed_image: async (interaction) => {
    if (!(await checkPermission(interaction))) return;
    const url = interaction.fields.getTextInputValue("inp_image");

    if (url && !isValidUrl(url)) {
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } URL de imagem inválida! Deve começar com http/https.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();
    const draft = await getDraft(interaction.guild.id, interaction.user.id);
    if (!draft) return;

    if (url) draft.embed.image = { url };
    else delete draft.embed.image;
    await saveDraft(interaction.guild.id, interaction.user.id, draft);
    await returnToEditor(interaction, draft);
  },

  modal_embed_thumbnail: async (interaction) => {
    if (!(await checkPermission(interaction))) return;
    const url = interaction.fields.getTextInputValue("inp_thumbnail");

    if (url && !isValidUrl(url)) {
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } URL de thumbnail inválida! Deve começar com http/https.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();
    const draft = await getDraft(interaction.guild.id, interaction.user.id);
    if (!draft) return;

    if (url) draft.embed.thumbnail = { url };
    else delete draft.embed.thumbnail;
    await saveDraft(interaction.guild.id, interaction.user.id, draft);
    await returnToEditor(interaction, draft);
  },

  modal_embed_footer: async (interaction) => {
    if (!(await checkPermission(interaction))) return;

    const text = interaction.fields.getTextInputValue("inp_foot_text");
    const icon = interaction.fields.getTextInputValue("inp_foot_icon");

    if (text && text.length > 2048) {
      return interaction.reply({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } Texto do rodapé muito longo! Máximo de 2048 caracteres.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (icon && !isValidUrl(icon)) {
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } A Embed não pode estar completamente vazia.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();
    const draft = await getDraft(interaction.guild.id, interaction.user.id);
    if (!draft) return;

    if (text) draft.embed.footer = { text, icon_url: icon || null };
    else delete draft.embed.footer;
    await saveDraft(interaction.guild.id, interaction.user.id, draft);
    await returnToEditor(interaction, draft);
  },

  modal_embed_author: async (interaction) => {
    if (!(await checkPermission(interaction))) return;
    const name = interaction.fields.getTextInputValue("inp_auth_name");
    const icon = interaction.fields.getTextInputValue("inp_auth_icon");

    if (name && name.length > 256) {
      return interaction.reply({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } Nome do autor muito longo! Máximo de 256 caracteres.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (icon && !isValidUrl(icon)) {
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"} URL do ícone do autor inválida!`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();
    const draft = await getDraft(interaction.guild.id, interaction.user.id);
    if (!draft) return;

    if (name) draft.embed.author = { name, icon_url: icon || null };
    else delete draft.embed.author;
    await saveDraft(interaction.guild.id, interaction.user.id, draft);
    await returnToEditor(interaction, draft);
  },

  modal_embed_content: async (interaction) => {
    if (!(await checkPermission(interaction))) return;
    const content = interaction.fields.getTextInputValue("inp_content");

    if (content && content.length > 2000) {
      return interaction.reply({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } Mensagem externa muito longa! Máximo de 2000 caracteres.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();
    const draft = await getDraft(interaction.guild.id, interaction.user.id);
    if (!draft) return;
    draft.content = content || "";
    await saveDraft(interaction.guild.id, interaction.user.id, draft);
    await returnToEditor(interaction, draft);
  },

  embed_builder_pre_send: async (interaction) => {
    if (!(await checkPermission(interaction)))
      return interaction.reply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(`${Emojis.circlecross || "❌"} Sem permissão`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    await interaction.deferUpdate();

    const channelRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("embed_builder_channel_select")
        .setPlaceholder("Selecione o canal de destino final...")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1)
    );

    const cancelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("embed_builder_cancel_send")
        .setLabel("Voltar / Cancelar Envio")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(Emojis.Voltar || "⬅️")
    );

    await interaction.editReply({
      content: "",
      embeds: [
        new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Green)
          .setDescription(
            `**Confirmação de Envio**\n> Selecione abaixo o canal onde deseja enviar esta embed agora.`
          ),
      ],
      components: [channelRow, cancelRow],
    });
  },

  embed_builder_cancel_send: async (interaction) => {
    if (!(await checkPermission(interaction))) return;
    await interaction.deferUpdate();
    const draft = await getDraft(interaction.guild.id, interaction.user.id);
    if (!draft) return;
    await returnToEditor(interaction, draft);
  },

  embed_builder_channel_select: async (interaction) => {
    if (!(await checkPermission(interaction))) return;
    await interaction.deferUpdate();

    const draft = await getDraft(interaction.guild.id, interaction.user.id);
    if (!draft) {
      return interaction.followUp({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"
              } Sessão expirada. Use \`/enviar embed\` novamente.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetChannelId = interaction.values[0];
    const channel = interaction.guild.channels.cache.get(targetChannelId);

    if (!channel) {
      return interaction.followUp({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(`${Emojis.circlecross || "❌"} Canal inválido.`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const embedData = { ...draft.embed };
      delete embedData.color;

      const finalEmbed = new EmbedBuilder(embedData);
      try {
        if (draft.embed.color) finalEmbed.setColor(draft.embed.color);
        else finalEmbed.setColor(Colors.Default);
      } catch {
        finalEmbed.setColor(Colors.Default);
      }

      if (
        !finalEmbed.data.title &&
        !finalEmbed.data.description &&
        !finalEmbed.data.image &&
        !finalEmbed.data.author &&
        !finalEmbed.data.footer
      ) {
        return interaction.followUp({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Green)
              .setDescription(
                `${Emojis.circlecross || "❌"
                } A Embed não pode estar completamente vazia.`
              ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      await channel.send({
        content: draft.content || null,
        embeds: [finalEmbed],
      });

      await returnToEditor(
        interaction,
        draft,
        `${Emojis.check || "✅"} Embed enviada com sucesso em ${channel}!`
      );
    } catch (err) {
      console.error("[EMBED BUILDER HANDLE]: " + err);
      await interaction.followUp({
        content: ``,
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.circlecross || "❌"} Erro ao enviar: ${err.message
              }. Verifique minhas permissões no canal ${channel}.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      await returnToEditor(interaction, draft);
    }
  },
};
