const {
  EmbedBuilder,
  Colors,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  PermissionsBitField,
  StringSelectMenuBuilder,
} = require("discord.js");
const Emojis = require("../../Emojis.json");
const {
  GUILD_LOG_SERVER_ID,
  GUILD_CATEGORIA_DENUNCIA_ID,
  GUILD_STAFFS_DENUNCIA_IDS,
  GUILD_BUG_CANAL_ID,
} = process.env;

async function createReportTicket(
  interaction,
  reportedUser,
  reportedMember,
  channelName,
  ticketTitle,
  reportReason,
  reportProof
) {
  const { client } = interaction;
  const reporter = interaction.user;

  try {
    if (
      !GUILD_LOG_SERVER_ID ||
      !GUILD_CATEGORIA_DENUNCIA_ID ||
      !GUILD_STAFFS_DENUNCIA_IDS
    ) {
      throw new Error(
        "IDs de Servidor/Categoria/Cargos de denúncia não configurados no .env"
      );
    }

    const staffRoleIds = GUILD_STAFFS_DENUNCIA_IDS.split(",").map((id) =>
      id.trim()
    );
    const logGuild = await client.guilds
      .fetch(GUILD_LOG_SERVER_ID)
      .catch(() => null);
    if (!logGuild)
      throw new Error(
        `Não consegui encontrar o Servidor de Logs (ID: ${GUILD_LOG_SERVER_ID}).`
      );

    const category = await logGuild.channels
      .fetch(GUILD_CATEGORIA_DENUNCIA_ID)
      .catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new Error(
        `Não consegui encontrar a Categoria de Denúncias (ID: ${GUILD_CATEGORIA_DENUNCIA_ID}) ou não é uma categoria.`
      );
    }

    const reporterMember = await logGuild.members
      .fetch(reporter.id)
      .catch(() => null);
    if (!reporterMember) {
      throw new Error(
        `Denunciante ${reporter.id} não está no servidor de logs.`
      );
    }

    const permissoesTicket = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.AttachFiles,
    ];

    const permissoesNegadasUsuario = [
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.UseExternalStickers,
      PermissionsBitField.Flags.ManageMessages,
      PermissionsBitField.Flags.SendTTSMessages,
      PermissionsBitField.Flags.UseExternalApps,
      PermissionsBitField.Flags.SendVoiceMessages,
      PermissionsBitField.Flags.MentionEveryone,
      PermissionsBitField.Flags.ManageWebhooks,
      PermissionsBitField.Flags.CreateInstantInvite,
      PermissionsBitField.Flags.ManageThreads,
      PermissionsBitField.Flags.AddReactions,
      PermissionsBitField.Flags.UseExternalEmojis,
      PermissionsBitField.Flags.CreatePublicThreads,
      PermissionsBitField.Flags.CreatePrivateThreads,
      PermissionsBitField.Flags.SendMessagesInThreads,
      PermissionsBitField.Flags.UseApplicationCommands,
    ];

    const permissoesStaff = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ManageMessages,
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.AttachFiles,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.MentionEveryone,
      PermissionsBitField.Flags.UseApplicationCommands,
      PermissionsBitField.Flags.CreatePublicThreads,
      PermissionsBitField.Flags.CreatePrivateThreads,
      PermissionsBitField.Flags.ManageThreads,
      PermissionsBitField.Flags.SendMessagesInThreads,
    ];

    const permissionOverwrites = [
      {
        id: logGuild.roles.everyone,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: reporter.id,
        allow: permissoesTicket,
        deny: permissoesNegadasUsuario,
      },
    ];

    staffRoleIds.forEach((roleId) => {
      if (logGuild.roles.cache.has(roleId)) {
        permissionOverwrites.push({ id: roleId, allow: permissoesStaff });
      }
    });

    if (reportedMember) {
      permissionOverwrites.push({
        id: reportedMember.id,
        allow: permissoesTicket,
        deny: permissoesNegadasUsuario,
      });
    }

    const finalChannelName = channelName.substring(0, 100);
    const ticketChannel = await logGuild.channels.create({
      name: finalChannelName,
      type: ChannelType.GuildText,
      parent: category,
      permissionOverwrites: permissionOverwrites,
      reason: `Denúncia de ${reporter.tag} (ID: ${reporter.id})`,
    });

    const proofLinks = reportProof
      .split(/[\s\n]+/)
      .filter((link) => /^https?:\/\/\S+/i.test(link.trim()))
      .map((link) => link.trim());

    const isImageUrl = (url) =>
      /(https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|i\.imgur\.com|media\.tenor\.com|gyazo\.com|prnt\.sc|i\.ibb\.co|.*\.(?:png|jpe?g|gif|webp|bmp|tiff|svg)))(\/[^\s]*)?/i.test(
        url
      );

    const imageLinks = [];
    const unsupportedLinks = [];

    for (const link of proofLinks) {
      if (isImageUrl(link)) imageLinks.push(link);
      else unsupportedLinks.push(link);
    }

    let description = `## NOVA DENÚNCIA RECEBIDA
### ${Emojis.usersss} Autor da Denúncia:
> ${reporter.tag} (\`${reporter.id}\`)
### ${Emojis.punicao} Acusado da Denúncia:
> ${reportedUser.tag} \`(${reportedUser.id})\`
- OBS: ${reportedMember
        ? "Está presente na denúncia"
        : "Não está presente na denúncia"
      }
### ${Emojis.discord} Executado em:
> \`${interaction.guild.name}\` (\`${interaction.guild.id}\`)
### 📖 Motivo:
\`\`\`yaml
${reportReason}
\`\`\`
`;

    if (unsupportedLinks.length > 0) {
      description += `### ${Emojis.setabranca
        } Provas (Links não exibíveis):\n> ${unsupportedLinks.join("\n> ")}`;
    }

    const mainEmbed = new EmbedBuilder()
      .setColor(process.env.botcolor || Colors.Red)
      .setDescription(description)
      .setTimestamp();

    const embedsToSend = [mainEmbed];

    if (imageLinks.length > 0) {
      for (const [index, link] of imageLinks.entries()) {
        const imageEmbed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Yellow)
          .setTitle(`Prova #${index + 1}`)
          .setImage(link)
          .setURL(link);
        embedsToSend.push(imageEmbed);
      }
    }

    const staffMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`manage_report_ticket:${ticketChannel.id}`)
        .setPlaceholder("Selecione uma ação de moderação...")
        .addOptions([
          {
            label: "Aceitar Denúncia",
            description: "Marca a denúncia como aceita.",
            value: "report_accept",
            emoji: Emojis.Success || "✅",
          },
          {
            label: "Recusar Denúncia",
            description: "Marca a denúncia como recusada.",
            value: "report_deny",
            emoji: Emojis.circlecross || "❌",
          },
          {
            label: "Notificar Usuários",
            description: "Envia uma notificação aos envolvidos.",
            value: "report_notify_dm",
            emoji: Emojis.usersss || "🔔",
          },
          {
            label: "Cancelar Ticket",
            description: "Fecha a denúncia como resolvida.",
            value: "report_cancel",
            emoji: Emojis.Lixeira || "🗑️",
          },
        ])
    );

    const mentions = staffRoleIds.map((id) => `<@&${id}>`).join("|");
    let userMentions = `<@${reporter.id}>`;
    if (reportedMember) userMentions += ` | <@${reportedMember.id}>`;

    await ticketChannel.send({
      content: `${mentions}\n${userMentions}`,
      embeds: [mainEmbed],
      components: [staffMenu],
      allowedMentions: { parse: ["users", "roles"] },
    });

    for (const embed of embedsToSend.slice(1)) {
      await ticketChannel.send({ embeds: [embed] });
    }

    return ticketChannel;
  } catch (err) {
    if (err.message.includes("não está no servidor de logs")) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setColor(process.env.botcolor || Colors.Red)
            .setDescription(`### ❌ Acesso Negado
- Você precisa ser um membro do servidor de suporte para enviar uma denúncia.`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return null;
    }

    console.error("[Reportar] Falha ao criar ticket de denúncia:", err);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder().setColor(process.env.botcolor || Colors.Red)
          .setDescription(process.env.MSGERROBOT),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
}

module.exports = {
  open_report_denuncia_modal: async (interaction) => {
    const modal = new ModalBuilder()
      .setCustomId("submit_report_denuncia")
      .setTitle("Formulário de Denúncia de Usuário");

    const userIdInput = new TextInputBuilder()
      .setCustomId("report_user_id")
      .setLabel("ID do Usuário Acusado")
      .setPlaceholder("Ex: 852927387129610290")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(20);

    const reasonInput = new TextInputBuilder()
      .setCustomId("report_reason")
      .setLabel("Descreva o Motivo da Denúncia")
      .setPlaceholder("Ex: O usuário X está spammando no chat Y...")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const proofInput = new TextInputBuilder()
      .setCustomId("report_proof")
      .setLabel("Links das Provas (Obrigatório)")
      .setPlaceholder("Cole links do imgur, youtube, lightshot, etc.")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(userIdInput),
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(proofInput)
    );
    await interaction.showModal(modal);
  },

  open_report_bug_modal: async (interaction) => {
    const modal = new ModalBuilder()
      .setCustomId("submit_report_bug")
      .setTitle("Formulário de Report de Bug");

    const bugInput = new TextInputBuilder()
      .setCustomId("bug_description")
      .setLabel("Descreva o Bug (Comando, etc.)")
      .setPlaceholder(
        "Ex: Quando eu uso /fila e saio rápido, o bot não me remove..."
      )
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const proofInput = new TextInputBuilder()
      .setCustomId("bug_proof")
      .setLabel("Links de Prova (Prints/Vídeos - Opcional)")
      .setPlaceholder(
        "Cole links do imgur, lightshot, etc. (Se não tiver, escreva 'N/A')"
      )
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(bugInput),
      new ActionRowBuilder().addComponents(proofInput)
    );
    await interaction.showModal(modal);
  },

  submit_report_denuncia: async (interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { client } = interaction;
    const reporter = interaction.user;

    const reportedUserId =
      interaction.fields.getTextInputValue("report_user_id");
    const reportReason = interaction.fields.getTextInputValue("report_reason");
    const reportProof = interaction.fields.getTextInputValue("report_proof");

    if (reportedUserId === reporter.id) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `### ${Emojis.circlecross || "❌"
              } Ação Inválida\n- Você não pode denunciar a si mesmo.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    let reportedUser;
    try {
      reportedUser = await client.users.fetch(reportedUserId);
    } catch (err) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `### ${Emojis.circlecross || "❌"
              } Usuário Não Encontrado\n- O ID \`${reportedUserId}\` não parece ser um usuário válido do Discord.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (reportedUser.bot) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `### ${Emojis.circlecross || "❌"
              } Ação Inválida\n- Você não pode denunciar um bot.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const logGuild = await client.guilds
      .fetch(GUILD_LOG_SERVER_ID)
      .catch(() => null);
    const reportedMember = logGuild
      ? await logGuild.members.fetch(reportedUserId).catch(() => null)
      : null;

    const ticketChannel = await createReportTicket(
      interaction,
      reportedUser,
      reportedMember,
      `denuncia-${interaction.user.username}`,
      "Nova Denúncia de Usuário",
      reportReason,
      reportProof
    );

    if (ticketChannel) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setColor(process.env.botcolor || Colors.Green)
            .setDescription(`### ${Emojis.check || "✅"} Denúncia Enviada!
- Seu ticket de denúncia foi criado com sucesso no nosso servidor de suporte.
- Acesse o ticket aqui: <#${ticketChannel.id}>`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  submit_report_bug: async (interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { client } = interaction;

    try {
      if (!GUILD_LOG_SERVER_ID || !GUILD_BUG_CANAL_ID) {
        throw new Error(
          "GUILD_LOG_SERVER_ID ou GUILD_BUG_CANAL_ID não estão configurados no .env"
        );
      }

      const bugDescription =
        interaction.fields.getTextInputValue("bug_description");
      const rawBugProof =
        interaction.fields.getTextInputValue("bug_proof")?.trim() || "";
      const hasProof = rawBugProof && rawBugProof.toLowerCase() !== "n/a";
      const reporter = interaction.user;
      const originGuild = interaction.guild;

      const logGuild = await client.guilds
        .fetch(GUILD_LOG_SERVER_ID)
        .catch(() => null);
      if (!logGuild) {
        throw new Error(
          `Servidor de Logs (ID: ${GUILD_LOG_SERVER_ID}) não encontrado.`
        );
      }
      const bugChannel = await logGuild.channels
        .fetch(GUILD_BUG_CANAL_ID)
        .catch(() => null);
      if (!bugChannel || bugChannel.type !== ChannelType.GuildText) {
        throw new Error(
          `Canal de Bug (ID: ${GUILD_BUG_CANAL_ID}) não encontrado ou não é um canal de texto.`
        );
      }

      const isImageUrl = (url) => /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);

      const embedsToSend = [];
      const proofLinks = hasProof
        ? rawBugProof
          .split("\n")
          .filter((link) => link.trim().startsWith("http"))
        : [];
      let descriptionString = `## NOVO BUG RECEBIDO
            ### ${Emojis.usersss || "👤"} Reportado por:
            > <@${reporter.id}> [\`${reporter.tag}\`] (\`${reporter.id}\`)\`
            ### ${Emojis.livro || "📖"} Descrição do Bug:
            \`\`\`yaml
            ${bugDescription}
            \`\`\``;

      const bugEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Blue)
        .setTimestamp();

      if (proofLinks.length > 0) {
        const imageLinks = proofLinks.filter(isImageUrl);
        const otherLinks = proofLinks.filter((link) => !isImageUrl(link));

        if (otherLinks.length > 0) {
          descriptionString += `\n### ${Emojis.info || "ℹ️"
            } Provas (Links):\n${otherLinks.join("\n")}`;
        }

        if (imageLinks.length > 0) {
          bugEmbed.setImage(imageLinks[0]);
          embedsToSend.push(bugEmbed);
          if (imageLinks.length > 1) {
            for (
              let i = 1;
              i < imageLinks.length && embedsToSend.length < 4;
              i++
            ) {
              const extraImageEmbed = new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Blue)
                .setURL(imageLinks[i])
                .setImage(imageLinks[i]);
              embedsToSend.push(extraImageEmbed);
            }
          }
        } else {
          embedsToSend.push(bugEmbed);
        }
      } else {
        descriptionString += `\n### ${Emojis.info || "ℹ️"
          } Provas:\n> Nenhuma prova fornecida.`;
        embedsToSend.push(bugEmbed);
      }

      bugEmbed.setDescription(descriptionString);

      await bugChannel.send({ embeds: embedsToSend });

      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setColor(process.env.botcolor || Colors.Green)
            .setDescription(`### ${Emojis.check || "✅"} Report de Bug Enviado!
- Seu relatório foi enviado com sucesso para a equipe técnica.
- Valeu por ajudar a melhorar o bot!`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error("[Reportar Bug] Falha ao processar report de bug:", err);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setColor(process.env.botcolor || Colors.Red)
            .setDescription(process.env.MSGERROBOT || `### ${Emojis.circlecross || "❌"} Falha no Envio\n- Ocorreu um erro ao enviar seu report de bug.\n- *${err.message}*`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
