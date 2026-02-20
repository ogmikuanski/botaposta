const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  EmbedBuilder,
  Colors,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
} = require("discord.js");
const { createFilaConfigEmbed } = require("../Embeds/filaConfigEmbed");
const { createFilaInterfaces } = require("../../services/filaService");
const FilaConfig = require("../../database/models/FilaConfig");
const Emojis = require("../../Emojis.json");
const ConfigsGerais = require("../../database/models/ConfigsGerais");
const CargosConfig = require("../../database/models/CargosConfig");
const { isDev } = require("../../manager/devManager");
const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(
  EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []
);

const getModalidades = async (guildId) => {
  const [configs] = await FilaConfig.findOrCreate({
    where: { guildId },
    defaults: { guildId },
  });
  return configs.modalidades;
};

const getGeraisConfigs = async (guildId) => {
  const [configs] = await ConfigsGerais.findOrCreate({
    where: { guildId },
    defaults: { guildId },
  });
  return configs;
};

async function buildFilaPanel(interaction) {
  const embed = await createFilaConfigEmbed(interaction);
  const [configs] = await FilaConfig.findOrCreate({
    where: { guildId: interaction.guild.id },
    defaults: { guildId: interaction.guild.id },
  });

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_fila_modalidade_submit")
      .setPlaceholder("Selecione uma modalidade para editar...")
      .addOptions(
        configs.modalidades.map((modo) => ({
          label: modo.nome,
          description: `Canal: ${modo.canalId ? "Definido" : "Não Definido"
            } | Status: ${modo.ativo ? "Ativado" : "Desativado"}`,
          value: modo.id,
          emoji: modo.emoji || Emojis.seta,
        }))
      )
  );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("voltar_central")
      .setLabel("Voltar")
      .setEmoji(Emojis.Voltar)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("set_fila_coins")
      .setLabel("Alterar Coins")
      .setEmoji(Emojis.coinsaa || "💰")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("criar_interfaces")
      .setLabel("Criar ou Atualizar Filas")
      .setEmoji(Emojis.discord)
      .setStyle(ButtonStyle.Success)
  );


  return {
    embeds: [embed],
    components: [selectMenu, buttons],
    flags: MessageFlags.Ephemeral,
  };
}

module.exports = {
  systemfilasconfigs: async (interaction, client) => {
    const { member, user, guild } = interaction;

    if (member.id === guild.ownerId) {
    } else {
      const userIsDev = await isDev(user.id);
      if (ownerIdSet.has(user.id) || userIsDev) {
      } else {
        const [cargosConfig] = await CargosConfig.findOrCreate({
          where: { guildId: guild.id },
        });
        const permMaxRoleId = cargosConfig.cargoPermMaxId;

        if (permMaxRoleId && member.roles.cache.has(permMaxRoleId)) {
        } else {
          let errorMessage;
          if (permMaxRoleId) {
            errorMessage = `### ${Emojis.circlecross || "❌"
              } Sem Permissão!\n- Apenas usuários com o cargo <@&${permMaxRoleId}> (Permissão Máxima) podem acessar esta configuração.`;
          } else {
            errorMessage = `### ${Emojis.circlecross || "❌"
              } Sem Permissão!\n- O cargo de "Permissão Máxima" não foi configurado.\n- Apenas o Dono do Servidor (<@${guild.ownerId
              }>) pode acessar esta configuração.`;
          }

          return interaction.update({
            embeds: [
              new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Red)
                .setDescription(errorMessage),
            ],
            components: [],
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }

    const panel = await buildFilaPanel(interaction);
    await interaction.update(panel);
  },
  voltar_systemfilasconfigs: async (interaction, client) => {
    const panel = await buildFilaPanel(interaction);
    await interaction.update(panel);
  },

  criar_interfaces: async (interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const confirmButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirmar_criar_interfaces")
        .setLabel("Sim, Tenho certeza!")
        .setEmoji(Emojis.sim)
        .setStyle(ButtonStyle.Success)
    );
    await interaction.followUp({
      content: "",
      embeds: [
        new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Yellow)
          .setDescription(
            `- Tem certeza de que deseja criar as interfaces dos apostados? Esse processo pode levar alguns minutos para ser concluído.\n> Apos iniciar não e possivel cancelar.`
          ),
      ],
      components: [confirmButton],
    });
  },

  confirmar_criar_interfaces: async (interaction, client) => {
    await interaction.update({
      content: ``,
      embeds: [
        new EmbedBuilder()
          .setColor(process.env.botcolor || Colors.Green)
          .setDescription(
            `### ${Emojis.loading} Processando a criação das interfaces... Aguarde!`
          ),
      ],
      components: [],
    });

    const { sucesso, erros } = await createFilaInterfaces(
      client,
      interaction.guild.id
    );

    let resposta = `${Emojis.check || "✅"} **${sucesso} Interfaces** de fila foram criadas/atualizadas.`;

    if (erros.length > 0) {
      resposta += `\n\n${Emojis.circlecross || "❌"} **Erros (${erros.length}):**\n- ${erros.join("\n- ")}`;
      resposta += `\n\n*-# Verifique se o bot tem permissão de 'Enviar Mensagens' nos canais definidos.*`;
    }

    const replyEmbed = new EmbedBuilder()
      .setColor(
        erros.length > 0
          ? process.env.botcolor || Colors.Yellow
          : process.env.botcolor || Colors.Green
      )
      .setDescription(resposta);

    try {
      await interaction.editReply({
        content: "",
        embeds: [replyEmbed],
        components: [],
      });
    } catch (err) {
      if (err.code === 10008) {
        if (interaction.channel) {
          await interaction.channel.send({
            content: `${Emojis.Success || "✅"} **${sucesso} Interfaces** de fila foram criadas/atualizadas.`,
            embeds: [replyEmbed]
          }).catch(() => { });
        }
      } else (erro) => {
        if (erro.code === 50027) return;
        console.error("Erro ao responder interação de interface:", err);
      }
    }
  },

  buildFilaPanel: buildFilaPanel,
};