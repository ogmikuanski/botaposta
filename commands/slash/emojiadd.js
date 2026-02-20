const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const Emojis = require("../../Emojis.json");
const { isBlacklisted } = require("../../manager/blacklistManager");
const { isDev } = require("../../manager/devManager");
const { isMaintenanceMode, getRemainingCooldown, setCooldown } = require("../../utils/cache");
const { createSystemPagination } = require("../../utils/systemPageBuilder");

const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []);

const simpleEmbed = (description, color = Colors.Red) => {
    return new EmbedBuilder().setColor(process.env.botcolor || color).setDescription(description);
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emojiadd")
    .setDescription("Gerencia emojis do servidor.")
    .addSubcommand(sub => 
        sub.setName("adicionar")
           .setDescription("Adiciona um novo emoji.")
           .addStringOption(opt => opt.setName("nome").setDescription("Nome do emoji").setRequired(true).setMinLength(2))
           .addAttachmentOption(opt => opt.setName("arquivo").setDescription("Imagem"))
           .addStringOption(opt => opt.setName("link").setDescription("Link da imagem"))
    )
    .addSubcommand(sub => sub.setName("lista").setDescription("Lista todos os emojis globais."))
    .addSubcommand(sub => sub.setName("procurar").setDescription("Busca emojis.").addStringOption(opt => opt.setName("termo").setDescription("Nome").setRequired(true))),

  execute: async (interaction, client) => {
    const userBlocked = await isBlacklisted(interaction.user.id, "user");
    if (userBlocked) return interaction.reply({ embeds: [simpleEmbed(process.env.MSGBLACKLISTMEMBERBOT)], flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "lista" || subcommand === "procurar") {
       let query = "all";
       if (subcommand === "procurar") query = interaction.options.getString("termo");

       const payload = await createSystemPagination(client, 0, query);
       return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }

    if (subcommand === "adicionar") {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const userIsDev = await isDev(interaction.user.id);
            const userIsOnEquipe = ownerIdSet.has(interaction.user.id) || userIsDev;

            if (!userIsOnEquipe && await isMaintenanceMode()) {
                return interaction.editReply({ embeds: [simpleEmbed(`### ${Emojis.verifybot} ${process.env.MSGMANUTENCAO}`, Colors.Orange)] });
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions) && !userIsOnEquipe) {
                 return interaction.editReply({ embeds: [simpleEmbed(`### ${Emojis.circlecross} Sem Permissão\nRequer: \`Gerenciar Emojis\`.`)] });
            }

            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
                return interaction.editReply({ embeds: [simpleEmbed(`### ${Emojis.circlecross} Sem Permissão\nEu preciso de: \`Gerenciar Emojis\`.`)] });
            }

            const remaining = await getRemainingCooldown(interaction.guild.id, interaction.user.id, "addemoji_add");
            if (remaining > 0 && !userIsOnEquipe) {
                return interaction.editReply({ embeds: [simpleEmbed(`### ${Emojis.aviso} Aguarde\nEspere **${remaining.toFixed(1)}s**.`, Colors.Yellow)] });
            }
            if(!userIsOnEquipe) await setCooldown(interaction.guild.id, interaction.user.id, "addemoji_add", 5);

            const nome = interaction.options.getString("nome");
            const arquivo = interaction.options.getAttachment("arquivo");
            const link = interaction.options.getString("link");

            if (!arquivo && !link) return interaction.editReply({ embeds: [simpleEmbed(`### ${Emojis.circlecross} Erro\nForneça Arquivo OU Link.`)] });
            if (arquivo && link) return interaction.editReply({ embeds: [simpleEmbed(`### ${Emojis.circlecross} Erro\nEscolha apenas UM método.`)] });

            const emojiSource = arquivo ? arquivo.url : link;
            const sanitizedName = nome.replace(/[^a-zA-Z0-9_]/g, "");

            if (sanitizedName.length < 2) {
                return interaction.editReply({ embeds: [simpleEmbed(`### ${Emojis.circlecross} Nome Inválido\nUse apenas letras, números e underline (mínimo 2 letras).`)] });
            }

            const newEmoji = await interaction.guild.emojis.create({ attachment: emojiSource, name: sanitizedName });

            const embed = new EmbedBuilder()
                .setColor(process.env.botcolor || Colors.Green)
                .setDescription(`### ${Emojis.Success || "✅"} Sucesso!\nEmoji ${newEmoji} (\`:${newEmoji.name}:\`) adicionado!`)
                .setThumbnail(newEmoji.imageURL()); 

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error(`Erro /emojiadd:`, err);
            let msg = "Erro interno.";
            if (err.code === 30008) msg = "Servidor cheio de emojis.";
            if (err.code === 50035) msg = "Link inválido, imagem muito grande ou formato não suportado.";
            
            if (interaction.deferred) await interaction.editReply({ embeds: [simpleEmbed(`### ${Emojis.circlecross} Falha\n${msg}`)] });
        }
    }
  },
};