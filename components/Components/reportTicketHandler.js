const {
  EmbedBuilder,
  Colors,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  MessageFlags,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const Emojis = require("../../Emojis.json");
const {
  GUILD_LOG_SERVER_ID,
  GUILD_LOGS_DENUNCIA_CANAL_ID,
  GUILD_STAFFS_DENUNCIA_IDS,
} = process.env;
const discordTranscripts = require("discord-html-transcripts");

async function getTicketData(channel, client) {
  const messages = await channel.messages.fetch({ limit: 20 });
  const mainEmbedMsg = messages.find(
    (m) =>
      m.author.id === client.user.id &&
      m.embeds.length > 0 &&
      m.embeds[0].description?.includes("Autor da Denúncia")
  );
  if (!mainEmbedMsg)
    throw new Error(
      "Não foi possível encontrar o embed principal da denúncia. (getTicketData)"
    );
  const desc = mainEmbedMsg.embeds[0].description;

  const reporterId = desc.match(
    /Autor da Denúncia:[\s\S]*?\(\`(\d{17,20})\`\)/
  )?.[1];

  const reportedUserId = desc.match(
    /Acusado da Denúncia:[\s\S]*?\`\((\d{17,20})\)\`/
  )?.[1];

  const originGuildName = desc.match(/Executado em:\n> `([^`]+)`/)?.[1];
  const originGuildId = desc.match(
    /Executado em:[\s\S]*?\(\`(\d{17,20})\`\)/
  )?.[1];

  const reason =
    desc.match(/Motivo:\n```yaml\n([\s\S]*?)\n```/m)?.[1]?.trim() || "N/A";

  if (!reporterId || !reportedUserId || !originGuildId || !originGuildName) {
    console.error("[getTicketData] Falha ao parsear Regex:", {
      reporterId,
      reportedUserId,
      originGuildId,
      originGuildName,
    });
    if (reportedUserId) {
      console.error(
        `[getTicketData] Regex 'reportedUserId' capturou: ${reportedUserId} (Esperava um ID de usuário)`
      );
    }
    throw new Error(
      "Falha ao ler dados do embed da denúncia (IDs ou Nomes não encontrados)."
    );
  }

  return {
    reporterId,
    reportedUserId,
    originGuildId,
    originGuildName,
    reason,
    mainEmbedMsg,
  };
}

async function setVeredito(channel, user, status) {
  const veredito = `Status: ${status} | Por: ${user.tag} (${user.id})`;
  try {
    if (channel && !channel.deleted && channel.manageable) {
      await channel.setTopic(veredito);
    }
  } catch (e) {
    if (error.message.includes("Unknown Channel")) return;
      console.error(
        `[Report] Erro ao definir veredito do ticket ${channel.id}:`,
        e.message
      );
  }
}

async function getVeredito(channel) {
  const topic = channel.topic || "";
  if (topic.startsWith("Status: Aceito")) return "Aceito";
  if (topic.startsWith("Status: Recusado")) return "Recusado";
  return null;
}

function isStaff(member) {
  if (!GUILD_STAFFS_DENUNCIA_IDS) return false;
  const staffIds = GUILD_STAFFS_DENUNCIA_IDS.split(",").map((id) => id.trim());
  return member.roles.cache.some((r) => staffIds.includes(r.id));
}

module.exports = {
  manage_report_ticket: async (interaction, client) => {
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(
              `### ${Emojis.circlecross || "❌"
              } Apenas membros da staff podem usar este menu!`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const selectedValue = interaction.values[0];
    const staffMember = interaction.user;

    switch (selectedValue) {
      case "report_accept": {
        await interaction.update({
          components: interaction.message.components,
        });

        let data;
        try {
          data = await getTicketData(interaction.channel, client);
        } catch (e) {
          return interaction.followUp({
            content: `Erro: ${e.message}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const existingMsgs = await interaction.channel.messages.fetch({
          limit: 10,
        });
        const oldEmbedMsg = existingMsgs.find((m) =>
          m.embeds[0]?.description?.includes("DENÚNCIA RESPONDIDA!")
        );

        const embedAceito = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Green)
          .setDescription(
            `### DENÚNCIA RESPONDIDA!
- O staff <@${staffMember.id}> respondeu a denúncia como **ACEITA**.
- **Denunciante:** <@${data.reporterId}> (\`${data.reporterId}\`)
- **Acusado:** <@${data.reportedUserId}> (\`${data.reportedUserId}\`)`
          );
        if (oldEmbedMsg) await oldEmbedMsg.edit({ embeds: [embedAceito] });
        else await interaction.channel.send({ embeds: [embedAceito] });

        await setVeredito(interaction.channel, staffMember, "Aceito");
        break;
      }
      case "report_deny": {
        await interaction.update({
          components: interaction.message.components,
        });

        let data;
        try {
          data = await getTicketData(interaction.channel, client);
        } catch (e) {
          return interaction.followUp({
            content: `Erro: ${e.message}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        await setVeredito(interaction.channel, staffMember, "Recusado");

        const existingMsgs = await interaction.channel.messages.fetch({
          limit: 10,
        });
        const oldEmbedMsg = existingMsgs.find((m) =>
          m.embeds[0]?.description?.includes("DENÚNCIA RESPONDIDA!")
        );

        const embedRecusado = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Red)
          .setDescription(
            `### DENÚNCIA RESPONDIDA!
- O staff <@${staffMember.id}> respondeu a denúncia como **RECUSADA**.
- **Denunciante:** <@${data.reporterId}> (\`${data.reporterId}\`)
- **Acusado:** <@${data.reportedUserId}> (\`${data.reportedUserId}\`)`
          );
        if (oldEmbedMsg)
          await oldEmbedMsg.edit({
            embeds: [embedRecusado],
            allowedMentions: { parse: ["users"] },
          });
        else
          await interaction.channel.send({
            embeds: [embedRecusado],
            allowedMentions: { parse: ["users"] },
          });

        break;
      }

      case "report_notify_dm": {
        await interaction.update({
          components: interaction.message.components,
        });

        let data;
        try {
          data = await getTicketData(interaction.channel, client);
        } catch (e) {
          return interaction.followUp({
            content: `Erro: ${e.message}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const dmEmbed = new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Blue)
          .setDescription(
            `## ${Emojis.aviso} NOTIFICAÇÃO DE DENÚNCIA\n- Você está envolvido em uma denúncia. Verifique o servidor da ${process.env.LOGOMARCA}.`
          )
          .setFooter({
            text: process.env.DEFAULT_FOOTER_TEXT,
            iconURL: process.env.DEFAULT_FOOTER_ICON,
          });
        const dmButton = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Ver Denúncia")
            .setStyle(ButtonStyle.Link)
            .setURL(process.env.Discordinvite)
        );
        const notify = async (userId) => {
          try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [dmEmbed], components: [dmButton] });
            return `${Emojis.Success || "✅"
              } O usuário <@${userId}> foi notificado com sucesso!`;
          } catch {
            return `${Emojis.circlecross || "❌"
              } O usuário <@${userId}> não pôde ser notificado (DM fechada).`;
          }
        };
        const msg = [
          await notify(data.reporterId),
          await notify(data.reportedUserId),
        ].join("\n");

        await interaction.channel.send({
          content: msg,
          allowedMentions: { parse: ["users"] },
        });
        break;
      }

      case "report_cancel": {
        await interaction.update({
          components: interaction.message.components,
        });

        const reply = await interaction.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Yellow)
              .setDescription(
                `${Emojis.loading || "🔄"} Verificando veredito...`
              ),
          ],
        });

        const veredito = await getVeredito(interaction.channel);
        if (!veredito) {
          return reply.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(
                  `- ${Emojis.circlecross} Você precisa dar um veredito antes de encerrar a denúncia.`
                ),
            ],
          });
        }

        let attachment;
        try {
          attachment = await discordTranscripts.createTranscript(
            interaction.channel,
            {
              limit: -1,
              saveImages: true,
              poweredBy: false,
              footerText: process.env.DEFAULT_FOOTER_TEXT,
            }
          );
        } catch (e) {
          console.error("Falha ao criar transcript:", e);
        }

        try {
          if (!GUILD_LOGS_DENUNCIA_CANAL_ID)
            throw new Error(
              "GUILD_LOGS_DENUNCIA_CANAL_ID não definido no .env"
            );
          const logGuild = await client.guilds.fetch(GUILD_LOG_SERVER_ID);
          const logChannel = await logGuild.channels.fetch(
            GUILD_LOGS_DENUNCIA_CANAL_ID
          );
          if (!logChannel || logChannel.type !== ChannelType.GuildText)
            throw new Error("Canal de logs inválido.");
          const data = await getTicketData(interaction.channel, client);
          const logEmbed = new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Blue)
            .setDescription(
              `# DENÚNCIA FINALIZADA\n` +
              `### **Veredito:**:\n> ${veredito}\n` +
              `### ${Emojis.usersss} **Denunciante:**\n> <@${data.reporterId}> (\`${data.reporterId}\`)\n` +
              `### ${Emojis.punicao}**Acusado:**\n> <@${data.reportedUserId}> (\`${data.reportedUserId}\`)\n` +
              `### ${Emojis.discord}**Executado em:**\n> ${data.originGuildName} (\`${data.originGuildId}\`)\n` +
              `### ${Emojis.livro}**Motivo:**\n\`\`\`${data.reason}\`\`\``
            )
            .setTimestamp();
          await logChannel.send({
            embeds: [logEmbed],
            files: attachment ? [attachment] : [],
          });
        } catch (e) {
          console.error("Erro ao enviar log:", e);
          if (attachment)
            await interaction.channel.send({ files: [attachment] });
        }

        await reply.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Yellow)
              .setDescription(
                `### ${Emojis.aviso} denúncia finalizada.\n- Canal sera apagado em \`5 Segundos\`!`
              ),
          ],
        });
        setTimeout(() => interaction.channel.delete().catch(() => { }), 5000);
        break;
      }
    }
  },
};
