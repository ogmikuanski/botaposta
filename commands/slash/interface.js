const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  Colors,
  MessageFlags,
  ChannelType
} = require("discord.js");
const CargosConfig = require("../../database/models/CargosConfig");
const ConfigsGerais = require("../../database/models/ConfigsGerais");
const Server = require("../../database/models/server");
const { isBlacklisted } = require("../../manager/blacklistManager");
const Emojis = require("../../Emojis.json");
const { isDev } = require("../../manager/devManager");
const InterfaceManager = require("../../systems/InterfaceManager");

const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);
const { redisClient, getMediatorsOnlineKey } = require("../../utils/cache");

function applyInterfaceFooter(embed, interaction) {
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

async function buildMediatorList(guildId) {
  if (!redisClient.isReady) return "*Cache de mediadores offline.*";
  const mediatorIds = await redisClient.hKeys(getMediatorsOnlineKey(guildId));
  if (mediatorIds.length === 0) {
    return "> Nenhum mediador online no momento.";
  }
  return mediatorIds.map((id) => `• <@${id}>`).join("\n");
}

const sendPermissionError = async (interaction, guild, permMaxRoleId) => {
  let errorMessage;
  if (permMaxRoleId) {
    errorMessage = `### ${Emojis.circlecross || "❌"} Sem Permissão!\n- Apenas usuários com o cargo <@&${permMaxRoleId}> podem acessar este comando.`;
  } else {
    errorMessage = `### ${Emojis.circlecross || "❌"} Sem Permissão!\n- O cargo de "Permissão Máxima" não foi configurado.\n- Apenas o Dono do Servidor (<@${guild.ownerId}>) pode acessar este comando.`;
  }

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(errorMessage),
    ],
  });
};

async function checkExistingPanel(
  interaction,
  configsGerais,
  serverConfig,
  panelType,
  client
) {
  let channelId, messageId, panelName, updateData, modelToUpdate;

  switch (panelType) {
    case "mediador":
      channelId = configsGerais.mediatorPanelChannelId;
      messageId = configsGerais.mediatorPanelMessageId;
      panelName = "Mediador";
      updateData = { mediatorPanelChannelId: null, mediatorPanelMessageId: null };
      modelToUpdate = configsGerais;
      break;
    case "blacklist":
      channelId = configsGerais.blacklistPanelChannelId;
      messageId = configsGerais.blacklistPanelMessageId;
      panelName = "Blacklist";
      updateData = { blacklistPanelChannelId: null, blacklistPanelMessageId: null };
      modelToUpdate = configsGerais;
      break;
    case "perfil":
      channelId = configsGerais.perfilPanelChannelId;
      messageId = configsGerais.perfilPanelMessageId;
      panelName = "Perfil";
      updateData = { perfilPanelChannelId: null, perfilPanelMessageId: null };
      modelToUpdate = configsGerais;
      break;
    case "loja":
      channelId = serverConfig.storeChannelId;
      messageId = serverConfig.storeMessageId;
      panelName = "Loja de Itens";
      updateData = { storeChannelId: null, storeMessageId: null };
      modelToUpdate = serverConfig;
      break;
    case "roleta":
      channelId = configsGerais.roletaPanelChannelId;
      messageId = configsGerais.roletaPanelMessageId;
      panelName = "Roleta";
      updateData = { roletaPanelChannelId: null, roletaPanelMessageId: null };
      modelToUpdate = configsGerais;
      break;
    default:
      return false;
  }

  if (!channelId || !messageId) {
    return false;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error("Channel not found in cache/API");

    const message = await channel.messages.fetch(messageId);
    if (!message) throw new Error("Message not found in cache/API");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder().setColor(process.env.botcolor || Colors.Red)
          .setDescription(`### ${Emojis.circlecross} Painel ${panelName} já Existe!
- Um painel já está ativo no canal <#${channelId}>.
- [Clique aqui para ver a mensagem](${message.url})
- **Ação Necessária:** Delete a mensagem antiga antes de criar uma nova.`),
      ],
    });
    return true;
  } catch (err) {
    if (
      err.code === 50013 ||
      err.code === 50001 ||
      err.code === 10008 ||
      err.code === 10003 ||
      err.message.includes("not found")
    ) {
      if (modelToUpdate) await modelToUpdate.update(updateData);
      return false;
    } else {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setColor(process.env.botcolor || Colors.Red)
            .setDescription(`### ${Emojis.verifybot} Erro Desconhecido
- Falha ao verificar painel antigo em <#${channelId}>.
- Erro: \`${err.message}\``),
        ],
      });
      return true;
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("interface")
    .setDescription("Posta os painéis de interface do bot.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("painel")
        .setDescription("O tipo de painel que você deseja postar.")
        .setRequired(true)
        .addChoices(
          { name: "Mediador", value: "mediador" },
          { name: "Blacklist", value: "blacklist" },
          { name: "Ranking", value: "perfil" },
          { name: "Painel Roleta", value: "roleta" },
          { name: "Painel da Loja", value: "loja" }
        )
    ),

  execute: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      if (e.message.includes("Unknown interaction")) return;
      console.warn(`[interface] Falha ao deferir: ${e}`);
      return;
    }

    const userBlocked = await isBlacklisted(interaction.user.id, "user");
    if (userBlocked) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setTitle(`${Emojis.circlecross || "🚫"} ACESSO NEGADO!`)
            .setDescription(process.env.MSGBLACKLISTMEMBERBOT),
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
            .setDescription(process.env.MSGBLACKLISTSERVIDORBOT),
        ],
      });
    }

    if (interaction.channel.type === ChannelType.PublicThread || interaction.channel.type === ChannelType.PrivateThread) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(process.env.botcolor || Colors.Red)
            .setDescription(`### ${Emojis.circlecross || "❌"} Local Inválido!\n- Não é permitido gerar interfaces dentro de **Tópicos** (Threads).\n- Por favor, utilize um canal de texto normal.`)
        ]
      });
    }

    try {
      const { member, user, guild } = interaction;
      const painelTipo = interaction.options.getString("painel");
      const userIsDev = await isDev(user.id);
      const isBotTeam = ownerIdSet.has(user.id);

      const [cargosConfig, configsGerais, serverConfig] = await Promise.all([
        CargosConfig.findOrCreate({ where: { guildId: guild.id } }).then((r) => r[0]),
        ConfigsGerais.findOrCreate({ where: { guildId: guild.id } }).then((r) => r[0]),
        Server.findOrCreate({
          where: { guildId: guild.id },
          defaults: { guildName: guild.name },
        }).then((r) => r[0]),
      ]);

      const configTimestamp = new Date(serverConfig.createdAt).getTime();
      const permMaxRoleId = cargosConfig.cargoPermMaxId;

      if (member.id !== guild.ownerId && !isBotTeam && !userIsDev) {
        if (!permMaxRoleId || !member.roles.cache.has(permMaxRoleId)) {
          return sendPermissionError(interaction, guild, permMaxRoleId);
        }
      }

      const shouldStop = await checkExistingPanel(
        interaction,
        configsGerais,
        serverConfig,
        painelTipo,
        client
      );

      if (shouldStop) return;

      try {
        switch (painelTipo) {

          case "loja": {
            const msg = await interaction.channel.send({
              content: `${Emojis.loading || "🔄"} **Inicializando Sistema de Loja...**`
            });

            await serverConfig.update({
              storeChannelId: interaction.channel.id,
              storeMessageId: msg.id
            });

            await InterfaceManager.refreshStore(client, guild.id);

            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Green)
                  .setDescription(`- ${Emojis.check || "✅"} Interface da **Loja** definida com sucesso!`)
              ]
            });
          }

          case "roleta": {
            const embedRoleta = new EmbedBuilder()
              .setColor(process.env.botcolor || Colors.Gold)
              .setAuthor({
                name: guild.name,
                iconURL: guild.iconURL(),
              })
              .setDescription(
                `> Teste a sua sorte e ganhe prêmios incríveis!\n` +
                `### **Como funciona?**\n` +
                `- Clique no botão **Girar Agora** abaixo para rodar a roleta.\n` +
                `> Você precisará aguardar um tempo entre cada giro.\n` +
                `> Clique em "Ver Prêmios" para saber o que está em jogo.`
              )
              .setThumbnail(guild.iconURL({ dynamic: true }))
              .setImage(guild.bannerURL({ size: 1024 }) || null);

            applyInterfaceFooter(embedRoleta, interaction);

            const buttonsRoleta = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("btn_roleta_spin")
                .setLabel("Girar Agora")
                .setEmoji(Emojis.roleta || "🎰")
                .setStyle(ButtonStyle.Secondary),

              new ButtonBuilder()
                .setCustomId("btn_roleta_prizes")
                .setLabel("Ver Prêmios")
                .setEmoji(Emojis.naoentendi || "📦")
                .setStyle(ButtonStyle.Secondary)
            );

            const panelMsg = await interaction.channel.send({
              embeds: [embedRoleta],
              components: [buttonsRoleta]
            });

            await configsGerais.update({
              roletaPanelChannelId: interaction.channel.id,
              roletaPanelMessageId: panelMsg.id
            });

            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Green)
                  .setDescription(`- ${Emojis.check || "✅"} Painel da **Roleta** definido com sucesso!`)
              ]
            });
          }

          case "mediador": {
            const mediatorListString = await buildMediatorList(guild.id);
            const embed = new EmbedBuilder()
              .setColor(process.env.botcolor)
              .setThumbnail(guild.iconURL({ dynamic: true }))
              .setDescription(
                '### Mediadores disponíveis\n> Só interaja com o botão "Entrar na Fila", caso esteja disponível para mediar os apostados.\n'
              )
              .addFields({
                name: "** Mediadores Online:**",
                value: mediatorListString,
              });
            applyInterfaceFooter(embed, interaction);

            const buttons = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`mediator_join_queue:${configTimestamp}`)
                .setLabel("Entrar na Fila")
                .setEmoji(Emojis.check)
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`mediator_ranking:${configTimestamp}`)
                .setLabel("Ranking Mediadores")
                .setEmoji(Emojis.trofeu || "🏆")
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`mediator_register_pix:${configTimestamp}`)
                .setLabel("Cadastrar Pix")
                .setEmoji(Emojis.pix)
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`mediator_view_pix:${configTimestamp}`)
                .setLabel("Visualizar Pix")
                .setEmoji(Emojis.Sky_preview || "👁️")
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`mediator_leave_queue:${configTimestamp}`)
                .setLabel("Sair da Fila")
                .setEmoji(Emojis.circlecross)
                .setStyle(ButtonStyle.Danger)
            );

            const panelMessage = await interaction.channel.send({
              embeds: [embed],
              components: [buttons],
            });
            await configsGerais.update({
              mediatorPanelChannelId: panelMessage.channel.id,
              mediatorPanelMessageId: panelMessage.id,
            });
            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Green)
                  .setDescription(`- ${Emojis.check} Interface da **Mediador** definida com sucesso!`),
              ],
            });
          }

          case "blacklist": {
            const embed = new EmbedBuilder()
              .setColor(process.env.botcolor)
              .setAuthor({ name: "BlackList", iconURL: guild.iconURL() })
              .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
              .setDescription(
                "Bem-vindo ao painel Blacklist. Utilize este painel para verificar se o jogador está na blacklist.\n\n" +
                "- **Como usar?**\n" +
                "> Clique no botão abaixo e insira o ID Discord ou o ID do Jogo que deseja pesquisar."
              );
            applyInterfaceFooter(embed, interaction);

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`search_modality_blacklist:${configTimestamp}`)
                .setLabel("Buscar ID")
                .setEmoji(Emojis.id || "🔍")
                .setStyle(ButtonStyle.Secondary)
            );
            const panelMessage = await interaction.channel.send({
              embeds: [embed],
              components: [row],
            });
            await configsGerais.update({
              blacklistPanelChannelId: panelMessage.channel.id,
              blacklistPanelMessageId: panelMessage.id,
            });
            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Green)
                  .setDescription(`- ${Emojis.check} Interface da **Blacklist** definida com sucesso!`),
              ],
            });
          }

          case "perfil": {
            const embed = new EmbedBuilder()
              .setColor(process.env.botcolor)
              .setAuthor({
                name: "Perfil e Rankings",
                iconURL: guild.iconURL(),
              })
              .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
              .setDescription(
                "Bem-vindo ao painel Perfil e Ranking. Utilize este painel para verificar seu perfil ou o ranking do servidor.\n\n" +
                "- **Como usar?**\n" +
                "> **Meu Perfil:** Clique para ver suas estatísticas pessoais.\n" +
                "> **Ver Ranking:** Clique para ver o ranking do servidor."
              );
            applyInterfaceFooter(embed, interaction);

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`perfil_panel_profile:${configTimestamp}`)
                .setLabel("Meu Perfil")
                .setEmoji(Emojis.Sky_preview || "👤")
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`perfil_panel_ranking:${configTimestamp}`)
                .setLabel("Ver Ranking")
                .setEmoji(Emojis.vitoria || "🏆")
                .setStyle(ButtonStyle.Secondary)
            );
            const panelMessage = await interaction.channel.send({
              embeds: [embed],
              components: [row],
            });
            await configsGerais.update({
              perfilPanelChannelId: panelMessage.channel.id,
              perfilPanelMessageId: panelMessage.id,
            });
            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(process.env.botcolor || Colors.Green)
                  .setDescription(`- ${Emojis.check} Interface da **Ranking** definida com sucesso!`),
              ],
            });
          }
        }
      } catch (err) {
        console.error(`Erro ao criar painel (${painelTipo}):`, err);
        throw err;
      }
    } catch (err) {
      console.error(`Erro no /${module.exports.data.name}:`, err);
      const errorEmbed = new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(process.env.MSGERROBOT);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errorEmbed], content: "" }).catch(() => { });
      }
    }
  },
};