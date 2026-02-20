const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const { Op } = require("sequelize");
const MediatorPix = require("../../database/models/MediatorPix");
const CargosConfig = require("../../database/models/CargosConfig");
const LogsConfig = require("../../database/models/LogsConfig");
const ConfigsGerais = require("../../database/models/ConfigsGerais");
const MediatorStats = require("../../database/models/MediatorStats");
const Emojis = require("../../Emojis.json");
const { redisClient, getMediatorsOnlineKey } = require("../../utils/cache");

async function handleServiceError(error, interaction) {
  if (error.code === 10062 || error.code === 40060) {
    return;
  }

  console.error(`[mediatorHandler] Erro:`, error);

  const errorEmbed = new EmbedBuilder()
    .setColor(process.env.botcolor || Colors.Red)
    .setDescription(process.env.MSGERROBOT);

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral,
      }).catch(() => { });
    } else {
      await interaction.reply({
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral,
      }).catch(() => { });
    }
  } catch (e) {
  }
}

function detectPixKeyType(key) {
  if (!key) return "Desconhecido";
  key = key.trim();
  if (/^[0-9]{11}$/.test(key)) return "CPF";
  if (/^[0-9]{14}$/.test(key)) return "CNPJ";
  const phoneKey = key.replace(/[\s()-+]/g, "");
  if (/^[0-9]{10,13}$/.test(phoneKey)) return "Celular";
  if (/^[^@]+@[^@]+\.[^@]+$/.test(key)) return "E-mail";
  if (/^[a-fA-F0-9-]{32,36}$/.test(key)) return "Aleatória";
  if (key.length > 0 && key.length <= 77 && !key.includes(" ")) return "Alias";
  return "Desconhecido";
}

async function getLogChannel(guild, channelType) {
  try {
    const [logsConfig] = await LogsConfig.findOrCreate({
      where: { guildId: guild.id },
    });
    const channelId = logsConfig[channelType];
    if (!channelId) return null;
    return await guild.channels.fetch(channelId).catch(() => null);
  } catch {
    return null;
  }
}

async function forceUpdateMediatorPanel(client, guildId) {
  const [configsGerais] = await ConfigsGerais.findOrCreate({
    where: { guildId },
  });
  const { mediatorPanelChannelId, mediatorPanelMessageId } = configsGerais;

  if (!mediatorPanelChannelId || !mediatorPanelMessageId) return;

  try {
    const channel = await client.channels.fetch(mediatorPanelChannelId).catch(() => null);
    if (!channel) return;
    const message = await channel.messages.fetch(mediatorPanelMessageId).catch(() => null);
    if (!message) return;

    const mediatorsKey = getMediatorsOnlineKey(guildId);
    const mediatorIds = await redisClient.hKeys(mediatorsKey);
    const mediatorListString =
      mediatorIds.length > 0
        ? mediatorIds.map((id) => `• <@${id}>`).join("\n")
        : "> Nenhum mediador online no momento.";

    if (!message.embeds || message.embeds.length === 0) return;

    const embed = new EmbedBuilder(message.embeds[0].toJSON());

    const fields = message.embeds[0].fields || [];
    const newFields = fields.map((f) => {
      if (f.name.includes("Mediadores Online"))
        return { name: f.name, value: mediatorListString, inline: f.inline };
      return f;
    });

    embed.setFields(newFields);
    await message.edit({ embeds: [embed] });
  } catch (err) {
    console.warn(`[mediatorHandler] Falha ao atualizar painel: ${err.message}`);
  }
}

module.exports = {
  forceUpdateMediatorPanel,

  mediator_join_queue: async (interaction, client) => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      const { user, guild, member } = interaction;
      const [cargosConfig] = await CargosConfig.findOrCreate({
        where: { guildId: guild.id },
      });

      if (
        !member.roles.cache.has(cargosConfig.cargoMediadorId) &&
        !member.roles.cache.has(cargosConfig.cargoPermMaxId)
      ) {
        return interaction.editReply({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Você não possui acesso a esse painel!`
              ),
          ],
        });
      }

      const pixData = await MediatorPix.findOne({
        where: {
          userId: user.id,
          guildId: guild.id,
        },
      });

      if (!pixData) {
        return interaction.editReply({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Cadastre sua chave PIX antes de entrar na fila!`
              ),
          ],
        });
      }

      const mediatorsKey = getMediatorsOnlineKey(guild.id);
      const mediatorsQueueKey = mediatorsKey + ":queue";

      if (await redisClient.hExists(mediatorsKey, user.id)) {
        return interaction.editReply({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Você já está presente na fila de mediadores!`
              ),
          ],
        });
      }

      await redisClient.hSet(
        mediatorsKey,
        user.id,
        JSON.stringify(pixData.toJSON())
      );
      await redisClient.lPush(mediatorsQueueKey, user.id);

      forceUpdateMediatorPanel(client, guild.id).catch(() => { });

      const totalOnline = await redisClient.hLen(mediatorsKey);
      const logChannel = await getLogChannel(guild, "logMediadorId");
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle("MEDIADOR ENTROU NA FILA")
          .setColor(process.env.botcolor || Colors.Green)
          .addFields(
            { name: "Mediador", value: `<@${user.id}> (\`${user.id}\`)` },
            { name: "Total Online", value: `\`${totalOnline}\` Mediador(es)` },
            { name: "Data", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
          )
          .setThumbnail(user.displayAvatarURL())
          .setFooter({ text: guild.name, iconURL: guild.iconURL() });
        await logChannel.send({ embeds: [logEmbed] }).catch(() => { });
      }

      await interaction.editReply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(
              `${Emojis.check} Você entrou na fila de mediadores!`
            ),
        ],
      });
    } catch (err) {
      await handleServiceError(err, interaction);
    }
  },

  mediator_leave_queue: async (interaction, client) => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      const { user, guild } = interaction;
      const mediatorsKey = getMediatorsOnlineKey(guild.id);
      const mediatorsQueueKey = mediatorsKey + ":queue";

      const removed = await redisClient.hDel(mediatorsKey, user.id);
      await redisClient.lRem(mediatorsQueueKey, 0, user.id);

      if (removed) {
        forceUpdateMediatorPanel(client, guild.id).catch(() => { });

        const totalOnline = await redisClient.hLen(mediatorsKey);
        const logChannel = await getLogChannel(guild, "logMediadorId");
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle("MEDIADOR SAIU NA FILA")
            .setColor(process.env.botcolor || Colors.Red)
            .addFields(
              { name: "Mediador", value: `<@${user.id}> (\`${user.id}\`)` },
              {
                name: "Total Online",
                value: `\`${totalOnline}\` Mediador(es)`,
              },
              { name: "Data", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
            )
            .setThumbnail(user.displayAvatarURL())
            .setFooter({ text: guild.name, iconURL: guild.iconURL() });
          await logChannel.send({ embeds: [logEmbed] }).catch(() => { });
        }

        await interaction.editReply({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Green)
              .setDescription(
                `${Emojis.check} Você saiu da fila de mediadores!`
              ),
          ],
        });
      } else {
        await interaction.editReply({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Você não está presente na fila de mediadores!`
              ),
          ],
        });
      }
    } catch (err) {
      await handleServiceError(err, interaction);
    }
  },

  mediator_register_pix: async (interaction, client) => {
    try {
      const existingData = await MediatorPix.findOne({
        where: {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
        },
      });
      const modal = new ModalBuilder()
        .setCustomId("mediator_register_pix_submit")
        .setTitle("Cadastro de PIX (Local)");

      const bank = new TextInputBuilder()
        .setCustomId("bank_name")
        .setLabel("Nome do Banco")
        .setStyle(TextInputStyle.Short)
        .setValue(existingData?.bankName || "")
        .setRequired(true);
      const name = new TextInputBuilder()
        .setCustomId("account_name")
        .setLabel("Nome Completo")
        .setStyle(TextInputStyle.Short)
        .setValue(existingData?.accountName || "")
        .setRequired(true);
      const key = new TextInputBuilder()
        .setCustomId("pix_key")
        .setLabel("Chave PIX")
        .setStyle(TextInputStyle.Short)
        .setValue(existingData?.pixKey || "")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(bank),
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(key)
      );
      await interaction.showModal(modal);
    } catch (err) {
      await handleServiceError(err, interaction);
    }
  },

  mediator_register_pix_submit: async (interaction, client) => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }
      const { user, guild } = interaction;

      const bankName = interaction.fields.getTextInputValue("bank_name");
      const accountName = interaction.fields.getTextInputValue("account_name");
      const pixKey = interaction.fields.getTextInputValue("pix_key");
      const pixKeyType = detectPixKeyType(pixKey);

      if (
        !["CPF", "CNPJ", "Celular", "E-mail", "Aleatória"].includes(pixKeyType)
      ) {
        return interaction.editReply({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `### ${Emojis.circlecross || "❌"
                } Chave PIX Inválida\n- A chave que você digitou foi identificada como \`${pixKeyType}\`.\n- **Só aceitamos:** CPF, CNPJ, Celular, E-mail ou Chave Aleatória.`
              ),
          ],
        });
      }

      const existingData = await MediatorPix.findOne({
        where: {
          userId: user.id,
          guildId: guild.id,
        },
      });
      const isUpdate = !!existingData;

      await MediatorPix.upsert({
        guildId: guild.id,
        userId: user.id,
        bankName,
        accountName,
        pixKey,
        pixKeyType,
      });

      let wasLoggedOut = false;
      const mediatorsKey = getMediatorsOnlineKey(guild.id);
      const wasOn = await redisClient.hDel(mediatorsKey, user.id);
      if (wasOn) {
        await redisClient.lRem(mediatorsKey + ":queue", 0, user.id);
        forceUpdateMediatorPanel(client, guild.id).catch(() => { });
        wasLoggedOut = true;
      }

      const logChannel = await getLogChannel(guild, "logMediadorId");
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle(
            isUpdate
              ? `${Emojis.pix || "📝"} PIX ATUALIZADO`
              : `${Emojis.pix || "✅"} PIX CADASTRADO`
          )
          .setColor(process.env.botcolor)
          .addFields(
            { name: "Mediador", value: `<@${user.id}>` },
            { name: "Banco", value: `\`${bankName}\``, inline: true },
            { name: "Tipo", value: `\`${pixKeyType}\``, inline: true },
            { name: "Chave", value: `\`\`\`${pixKey}\`\`\`` },
            { name: "Data", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
          )
          .setThumbnail(user.displayAvatarURL())
          .setFooter({ text: guild.name, iconURL: guild.iconURL() });
        await logChannel.send({ embeds: [logEmbed] }).catch(() => { });
      }

      let msg = `### ${Emojis.sim} Dados cadastrados com sucesso neste servidor!`;
      if (wasLoggedOut)
        msg += `\n\n**Aviso:** Você estava mediando e foi removido da fila para atualizar seus dados.`;

      await interaction.editReply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Green)
            .setDescription(msg),
        ],
      });
    } catch (err) {
      await handleServiceError(err, interaction);
    }
  },

  mediator_view_pix: async (interaction, client) => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      const pixData = await MediatorPix.findOne({
        where: {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
        },
      });
      if (!pixData)
        return interaction.editReply({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Você ainda não cadastrou seu PIX neste servidor. Use o botão "Cadastrar Pix".`
              ),
          ],
        });

      const embed = new EmbedBuilder()
        .setTitle(`PIX DE ${interaction.user.username} (Este Servidor)`)
        .setColor(process.env.botcolor)
        .addFields(
          { name: "Chave", value: `\`${pixData.pixKey}\`` },
          { name: "Banco", value: `\`${pixData.bankName}\`` },
          { name: "Nome", value: `\`${pixData.accountName}\`` }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`mediator_self_copy_pix:${pixData.pixKey}`)
          .setLabel("Copiar")
          .setEmoji("📋")
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } catch (err) {
      await handleServiceError(err, interaction);
    }
  },

  mediator_self_copy_pix: async (interaction) => {
    const key = interaction.customId.split(":")[1];
    await interaction.reply({ content: key, flags: MessageFlags.Ephemeral }).catch(() => { });
  },

  mediator_copy_pix: async (interaction) => {
    const key = interaction.customId.split(":")[1];
    await interaction.reply({ content: key, flags: MessageFlags.Ephemeral }).catch(() => { });
  },

  mediator_ranking: async (interaction, client) => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }
      const stats = await MediatorStats.findAll({
        where: {
          guildId: interaction.guild.id,
          matchesMediated: { [Op.gt]: 0 },
        },
        order: [["matchesMediated", "DESC"]],
        limit: 10,
      });

      if (stats.length === 0)
        return interaction.editReply({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Red)
              .setDescription(
                `${Emojis.circlecross} Nenhum mediador tem estatísticas de partidas registradas.`
              ),
          ],
        });

      const desc = stats
        .map(
          (s, i) =>
            `${i + 1}º <@${s.userId}> tem \`${s.matchesMediated
            }\` partidas mediadas`
        )
        .join("\n");
      const embed = new EmbedBuilder()
        .setAuthor({
          name: interaction.guild.name + " | Top 10 Mediadores",
          iconURL: interaction.guild.iconURL() || undefined,
        })
        .setDescription(desc)
        .setColor(process.env.botcolor)
        .setTimestamp();

      await interaction.editReply({ content: "", embeds: [embed] });
    } catch (err) {
      await handleServiceError(err, interaction);
    }
  },
};