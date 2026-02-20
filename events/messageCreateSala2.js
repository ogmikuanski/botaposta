const {
    Events,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Colors,
} = require("discord.js");
const { redisClient, getMatchKey } = require("../utils/cache");
const Emojis = require("../Emojis.json");
const CargosConfig = require("../database/models/CargosConfig");

const CLASH_LINK_REGEX = /https:\/\/link\.clashroyale\.com\/invite\/friend\/pt\?tag=[^\s]+/;

module.exports = {
    name: Events.MessageCreate,

    async execute(message, client) {
        try {
            if (message.author.bot) return;
            if (!message.guild) return;

            if (
                message.channel.type !== ChannelType.PrivateThread &&
                message.channel.type !== ChannelType.PublicThread
            )
                return;

            const threadName = message.channel.name;
            if (!threadName.startsWith("Filas-") && !threadName.startsWith("Pagar-"))
                return;

            const linkMatch = message.content.match(CLASH_LINK_REGEX);
            if (!linkMatch) return;

            const foundLink = linkMatch[0];
            const thread = message.channel;
            const guild = message.guild;

            const matchKey = getMatchKey(guild.id, thread.id);
            const matchDataJSON = await redisClient.get(matchKey);
            if (!matchDataJSON) return;

            const matchData = JSON.parse(matchDataJSON);

            let canCreateRoom = message.author.id === matchData.assignedMediatorId;

            if (!canCreateRoom) {
                const [cargosConfig] = await CargosConfig.findOrCreate({
                    where: { guildId: guild.id },
                });
                const permMaxRoleId = cargosConfig.cargoPermMaxId;
                if (permMaxRoleId && message.member.roles.cache.has(permMaxRoleId)) {
                    canCreateRoom = true;
                }
            }

            if (!canCreateRoom) return;

            let displayTag = "Link Direto";
            try {
                const urlObj = new URL(foundLink);
                const tagParam = urlObj.searchParams.get("tag");
                if (tagParam) displayTag = tagParam.toUpperCase();
            } catch (e) {
            }

            const premiacao =
                (Math.round(matchData.valorBase * 100) * matchData.maxPlayers) / 100;
            const premiacaoFormatada = premiacao.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
            });

            try {
                const valorParaNome = premiacao.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                });
                const novoNome = `Pagar-R$${valorParaNome}`;

                if (thread.name !== novoNome && thread.manageable) {
                    await thread.setName(novoNome);
                }
            } catch (err) {
                console.error(
                    `[ClashHandler] Falha ao renomear tópico ${thread.id}: ${err.message}`
                );
            }

            const redisLinkKey = `${process.env.REDIS_NAMESPACE}:clash_link:${thread.id}`;
            await redisClient.set(redisLinkKey, foundLink, { EX: 3600 });

            const playersMention = matchData.players
                .map((id) => `<@${id}>`)
                .join(" ");

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: guild.name,
                    iconURL: guild.iconURL({ dynamic: true }),
                })
                .setColor(process.env.botcolor || Colors.Blue)
                .setDescription(
                    `${Emojis.setabranca || "»"} **TAG da Sala:** \`${displayTag}\`\n` +
                    `${Emojis.money || "💰"} **Premiação:** \`${premiacaoFormatada}\`\n\n` +
                    `> **Instruções:** Clique no botão abaixo para abrir o jogo e entrar na partida automaticamente.`
                )
                .setFooter({ text: "A partida será iniciada em instantes." })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Entrar na Partida")
                    .setEmoji(Emojis.royale || "⚔️")
                    .setStyle(ButtonStyle.Link)
                    .setURL(foundLink),
            );

            await thread.send({
                content: playersMention,
                embeds: [embed],
                components: [row],
            });

            await message.delete().catch(() => { });

        } catch (err) {
            if (err.code === 10003) return;
            if (err.code === 50035) return;
            console.error(
                "[Evento messageCreateClash] Erro crítico:",
                err
            );
        }
    },
};