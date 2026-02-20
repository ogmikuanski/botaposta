const {
    AttachmentBuilder,
    EmbedBuilder,
    Colors,
    ChannelType,
    MessageFlags
} = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const GIFEncoder = require("gifencoder");
const RoletaItem = require("../../database/models/RoletaItem");
const PlayerProfile = require("../../database/models/PlayerProfile");
const ConfigsGerais = require("../../database/models/ConfigsGerais");
const LogsConfig = require("../../database/models/LogsConfig");
const { redisClient } = require("../../utils/cache");
const Emojis = require("../../Emojis.json");

const ITEM_WIDTH = 130;
const ITEM_HEIGHT = 150;
const GAP = 20;
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 250;

const RARITY_COLORS = {
    comum: "#40E0D0",
    incomum: "#32CD32",
    raro: "#4169E1",
    epico: "#9400D3",
    lendario: "#FF8C00",
    mistico: "#FF1493"
};

const WATERMARK_COLOR = "#FFD700";

const RARITY_MESSAGES = {
    comum: "Um item comum, mas útil!",
    incomum: "Olha só, a sorte está sorrindo!",
    raro: "Boa! Um item de respeito.",
    epico: "SENSACIONAL! Um prêmio épico!",
    lendario: "🔥 LENDÁRIO! ISSO É INSANO!",
    mistico: "👑 MÍSTICO! PAREM AS MÁQUINAS!"
};

function applyBotFooter(embed, interaction) {
    const useGlobalMarking = process.env.BOT_MARCACOES_INTERFACES === 'true';
    const defaultText = process.env.DEFAULT_FOOTER_TEXT || interaction.guild.name;
    const defaultIcon = process.env.DEFAULT_FOOTER_ICON || null;

    let text, iconURL;

    if (useGlobalMarking) {
        text = defaultText;
        iconURL = defaultIcon;
    } else {
        text = interaction.guild?.name || defaultText;
        iconURL = interaction.guild?.iconURL() || defaultIcon;
    }

    embed.setFooter({ text, iconURL });
    return embed;
}

function sortearItem(itens) {
    const totalPoints = itens.reduce((sum, item) => sum + item.percentage, 0);
    let random = Math.random() * totalPoints;

    for (const item of itens) {
        if (random < item.percentage) return item;
        random -= item.percentage;
    }
    return itens[0];
}

function gerarSequencia(itens, vencedor) {
    const winnerIndex = 25;
    const sequence = [];
    for (let i = 0; i < 50; i++) {
        if (i === winnerIndex) {
            sequence.push(vencedor);
        } else {
            sequence.push(itens[Math.floor(Math.random() * itens.length)]);
        }
    }
    return { sequence, winnerIndex };
}

function desenharFrame(ctx, sequence, scrollX, serverAssets) {
    ctx.fillStyle = "#090909";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (serverAssets.banner) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        const scale = Math.max(CANVAS_WIDTH / serverAssets.banner.width, CANVAS_HEIGHT / serverAssets.banner.height);
        const x = (CANVAS_WIDTH / 2) - (serverAssets.banner.width / 2) * scale;
        const y = (CANVAS_HEIGHT / 2) - (serverAssets.banner.height / 2) * scale;
        ctx.drawImage(serverAssets.banner, x, y, serverAssets.banner.width * scale, serverAssets.banner.height * scale);
        ctx.restore();
    } else if (serverAssets.icon) {
        ctx.save();
        ctx.globalAlpha = 0.1;
        const size = 350;
        ctx.drawImage(serverAssets.icon, (CANVAS_WIDTH / 2) - (size / 2), (CANVAS_HEIGHT / 2) - (size / 2), size, size);
        ctx.restore();
    }

    const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
    gradient.addColorStop(0, "rgba(9, 9, 9, 1)");
    gradient.addColorStop(0.15, "rgba(9, 9, 9, 0)");
    gradient.addColorStop(0.85, "rgba(9, 9, 9, 0)");
    gradient.addColorStop(1, "rgba(9, 9, 9, 1)");

    for (let j = 0; j < sequence.length; j++) {
        const item = sequence[j];
        const xPos = (j * (ITEM_WIDTH + GAP)) - scrollX;

        if (xPos > -ITEM_WIDTH && xPos < CANVAS_WIDTH) {
            const rarityColor = RARITY_COLORS[item.rarity] || "#e89b00";
            const boxY = (CANVAS_HEIGHT - ITEM_HEIGHT) / 2;

            ctx.fillStyle = "#181818";
            ctx.fillRect(xPos, boxY, ITEM_WIDTH, ITEM_HEIGHT);

            ctx.fillStyle = rarityColor;
            ctx.fillRect(xPos, boxY, ITEM_WIDTH, 8);

            ctx.strokeStyle = rarityColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(xPos, boxY, ITEM_WIDTH, ITEM_HEIGHT);

            ctx.shadowColor = rarityColor;
            ctx.shadowBlur = 15;
            ctx.strokeRect(xPos, boxY, ITEM_WIDTH, ITEM_HEIGHT);
            ctx.shadowBlur = 0;

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 15px Arial";
            ctx.textAlign = "center";

            const words = item.name.split(" ");
            let lineY = boxY + 50;
            if (words.length > 2) {
                ctx.fillText(words[0], xPos + ITEM_WIDTH / 2, lineY);
                ctx.fillText(words[1], xPos + ITEM_WIDTH / 2, lineY + 20);
                ctx.fillText(words.slice(2).join(" "), xPos + ITEM_WIDTH / 2, lineY + 40);
            } else if (words.length > 1) {
                ctx.fillText(words[0], xPos + ITEM_WIDTH / 2, lineY + 10);
                ctx.fillText(words[1], xPos + ITEM_WIDTH / 2, lineY + 30);
            } else {
                ctx.fillText(item.name, xPos + ITEM_WIDTH / 2, lineY + 20);
            }

            ctx.fillStyle = rarityColor;
            ctx.font = "bold 12px Arial";
            ctx.fillText(item.rarity.toUpperCase(), xPos + ITEM_WIDTH / 2, boxY + ITEM_HEIGHT - 15);
        }
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const centerX = CANVAS_WIDTH / 2;
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 8;

    ctx.fillStyle = process.env.botcolor || "#FFD700";
    ctx.beginPath();
    ctx.moveTo(centerX - 15, 10);
    ctx.lineTo(centerX + 15, 10);
    ctx.lineTo(centerX, 40);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(255, 215, 0, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, 40);
    ctx.lineTo(centerX, CANVAS_HEIGHT - 10);
    ctx.stroke();

    ctx.fillStyle = WATERMARK_COLOR;
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "right";
    ctx.globalAlpha = 0.7;
    ctx.fillText(process.env.DEFAULT_FOOTER_TEXT, CANVAS_WIDTH - 15, CANVAS_HEIGHT - 15);
    ctx.globalAlpha = 1.0;
}

async function gerarGifRoleta(sequence, winnerIndex, serverAssets) {
    const encoder = new GIFEncoder(CANVAS_WIDTH, CANVAS_HEIGHT);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(40);
    encoder.setQuality(20);

    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");

    const finalX = (winnerIndex * (ITEM_WIDTH + GAP)) - (CANVAS_WIDTH / 2) + (ITEM_WIDTH / 2);
    const totalFrames = 45;

    for (let i = 0; i < totalFrames; i++) {
        let t = i / (totalFrames - 1);
        const ease = (--t) * t * t + 1;
        const currentScrollX = finalX * ease;

        desenharFrame(ctx, sequence, currentScrollX, serverAssets);
        encoder.addFrame(ctx);
    }

    for (let k = 0; k < 12; k++) {
        desenharFrame(ctx, sequence, finalX, serverAssets);
        encoder.addFrame(ctx);
    }

    encoder.finish();
    return encoder.out.getData();
}

async function gerarImagemParada(sequence, winnerIndex, serverAssets) {
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");
    const finalX = (winnerIndex * (ITEM_WIDTH + GAP)) - (CANVAS_WIDTH / 2) + (ITEM_WIDTH / 2);

    desenharFrame(ctx, sequence, finalX, serverAssets);

    return canvas.encode('png');
}


module.exports = {
    btn_roleta_prizes: async (interaction) => {
        const itens = await RoletaItem.findAll({
            where: { guildId: interaction.guild.id },
            order: [['percentage', 'DESC']]
        });

        if (itens.length === 0) {
            const embed = new EmbedBuilder()
                .setDescription(`# ${Emojis.circlecross || "❌"} A roleta tá vazia.`)
                .setColor(process.env.botcolor || Colors.Red);
            applyBotFooter(embed, interaction);
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const lista = itens.map(item => {
            return `- **${item.name}** [ \`${item.rarity.toUpperCase()}\` ]`;
        }).join("\n");

        const embed = new EmbedBuilder()
            .setDescription("# LISTA DE PRÊMIOS:\n" + lista)
            .setColor(process.env.botcolor || Colors.Gold);

        applyBotFooter(embed, interaction);

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },

    btn_roleta_spin: async (interaction) => {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const cooldownKey = `${process.env.REDIS_NAMESPACE}:roleta:${guildId}:${userId}`;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [inCooldown, configsRaw, itens, profileRaw, logsConfigRaw] = await Promise.all([
            redisClient.get(cooldownKey),
            ConfigsGerais.findOrCreate({ where: { guildId } }),
            RoletaItem.findAll({ where: { guildId } }),
            PlayerProfile.findOrCreate({ where: { userId, guildId } }),
            LogsConfig.findOrCreate({ where: { guildId } })
        ]);

        const configs = configsRaw[0];
        const profile = profileRaw[0];
        const logsConfig = logsConfigRaw[0];
        const custo = configs.roletaCost || 0;

        if (inCooldown) {
            const ttl = await redisClient.ttl(cooldownKey);
            const minutos = Math.ceil(ttl / 60);
            const embedCd = new EmbedBuilder()
                .setDescription(`${Emojis.time} **Segura a emoção!** Espera mais **${minutos} min** pra girar de novo.`)
                .setColor(process.env.botcolor || Colors.Red);
            applyBotFooter(embedCd, interaction);
            return interaction.editReply({ embeds: [embedCd] });
        }

        if (!itens || itens.length < 2) {
            const embedMan = new EmbedBuilder()
                .setDescription(`## Roleta desativada no momento...`)
                .setColor(process.env.botcolor || Colors.Orange);
            applyBotFooter(embedMan, interaction);
            return interaction.editReply({ embeds: [embedMan] });
        }

        if (profile.coins < custo) {
            const embedSaldo = new EmbedBuilder()
                .setDescription(`## ${Emojis.coinsaa} **Sem coins, sem jogo.**\n- Você precisa de **${custo} Coins**.\n> Seu saldo atual: **${profile.coins} Coins**.`)
                .setColor(process.env.botcolor || Colors.Red);
            applyBotFooter(embedSaldo, interaction);
            return interaction.editReply({ embeds: [embedSaldo] });
        }

        if (custo > 0) await profile.decrement('coins', { by: custo });

        const vencedor = sortearItem(itens);
        const { sequence, winnerIndex } = gerarSequencia(itens, vencedor);

        const serverAssets = { banner: null, icon: null };
        try {
            const bannerURL = interaction.guild.bannerURL({ extension: 'png', size: 512 });
            if (bannerURL) serverAssets.banner = await loadImage(bannerURL);

            const iconURL = interaction.guild.iconURL({ extension: 'png', size: 256 });
            if (iconURL) serverAssets.icon = await loadImage(iconURL);
        } catch (e) {
            console.log("Assets visuais não carregados, usando padrão.");
        }

        let gifBuffer = null;
        let imgBuffer = null;
        try {
            [gifBuffer, imgBuffer] = await Promise.all([
                gerarGifRoleta(sequence, winnerIndex, serverAssets),
                gerarImagemParada(sequence, winnerIndex, serverAssets)
            ]);
        } catch (err) {
            console.error("[Roleta] Erro Visual:", err);
            return interaction.editReply({ content: "⚠️ Erro ao gerar visual da roleta." });
        }

        const attachmentGif = new AttachmentBuilder(gifBuffer, { name: 'roleta_spin.gif' });
        const embedSpin = new EmbedBuilder()
            .setDescription(`### ${Emojis.roleta} Girando...`)
            .setColor(process.env.botcolor || Colors.Blurple)
            .setImage('attachment://roleta_spin.gif');
        applyBotFooter(embedSpin, interaction);

        await interaction.editReply({ embeds: [embedSpin], files: [attachmentGif] });

        await new Promise(r => setTimeout(r, 4000));

        let actionMessage = "";
        let logDetail = "";
        let fallbackToLog = false;

        try {
            switch (vencedor.type) {
                case 'coins': {
                    const amount = parseInt(vencedor.value) || 0;
                    await profile.increment('coins', { by: amount });
                    actionMessage = `**Coins na conta!** +${amount} Coins pra você.`;
                    logDetail = `Recebeu ${amount} Coins.`;
                    break;
                }
                case 'role': {
                    const roleId = vencedor.value;
                    const member = await interaction.guild.members.fetch(userId).catch(() => null);
                    if (member) {
                        await member.roles.add(roleId).catch(() => {
                            actionMessage = `Ganhou o cargo <@&${roleId}>, mas estou sem permissão.`;
                            logDetail = `Erro permissão cargo ${roleId}.`;
                        });
                        if (!logDetail) {
                            actionMessage = `**Novo Status!** O cargo <@&${roleId}> foi adicionado.`;
                            logDetail = `Recebeu cargo ${roleId}.`;
                        }
                    } else {
                        logDetail = "Saiu do servidor antes de receber.";
                    }
                    break;
                }
                case 'ticket': {
                    const targetChannelId = configs.roletaPanelChannelId;
                    const targetChannel = targetChannelId
                        ? await interaction.guild.channels.fetch(targetChannelId).catch(() => null)
                        : null;

                    if (targetChannel && targetChannel.type === ChannelType.GuildText) {
                        try {
                            const thread = await targetChannel.threads.create({
                                name: `🎁 Resgate ${interaction.user.username}`,
                                type: ChannelType.PrivateThread,
                                reason: `Prêmio Roleta: ${vencedor.name}`,
                                autoArchiveDuration: 1440
                            });
                            await thread.members.add(userId);

                            const ticketEmbed = new EmbedBuilder()
                                .setDescription(`# RESGATE SEU PRÊMIO\n Parabéns <@${userId}>!\n\n- Você tirou: **${vencedor.name}**\n- Valor: \`${vencedor.value}\`\n\n> *Aguarde a staff neste canal.*`)
                                .setColor(process.env.botcolor || Colors.Green);
                            applyBotFooter(ticketEmbed, interaction);

                            await thread.send({ content: `<@${userId}>`, embeds: [ticketEmbed] });
                            actionMessage = `**Abri um chamado pra você!** Resgate aqui: <#${thread.id}>`;
                            logDetail = `Ticket criado: ${thread.id} para resgate manual.`;
                        } catch (err) {
                            console.error("[Roleta] Erro Thread:", err);
                            fallbackToLog = true;
                        }
                    } else {
                        fallbackToLog = true;
                    }
                    if (fallbackToLog) {
                        actionMessage = `**Você Ganhou!** Porém o canal de tickets sumiu. **Já avisei a Staff no log.**`;
                        logDetail = `ALERTA: Ganhou ticket, mas canal de tickets inválido. REQUER ENTREGA MANUAL.`;
                    }
                    break;
                }
                case 'nothing': {
                    actionMessage = `${Emojis.caveira} **Deu ruim.** Tente novamente.`;
                    logDetail = "Não ganhou nada.";
                    break;
                }
            }
        } catch (err) {
            console.error("[Roleta] Erro entrega:", err);
            actionMessage = "⚠️ Deu erro interno.";
            logDetail = `Erro código: ${err.message}`;
        }

        const colorFinal = vencedor.type === 'nothing' ? Colors.Red : (RARITY_COLORS[vencedor.rarity] || Colors.Gold);
        const titleStatus = vencedor.type === 'nothing' ? "Não foi dessa vez" : `Você Ganhou: ${vencedor.name}`;

        const attachmentImg = new AttachmentBuilder(imgBuffer, { name: 'roleta_result.png' });

        const resultEmbed = new EmbedBuilder()
            .setColor(colorFinal)
            .setDescription(`# ${titleStatus}\nRaridade: \`${vencedor.rarity.toUpperCase()}\`\n\n> ${actionMessage}`)
            .setImage('attachment://roleta_result.png');
        applyBotFooter(resultEmbed, interaction);

        await interaction.editReply({ embeds: [resultEmbed], files: [attachmentImg] });

        try {
            if (logsConfig.logRoletaId) {
                const logChannel = interaction.guild.channels.cache.get(logsConfig.logRoletaId);
                if (logChannel) {
                    const staffEmbed = new EmbedBuilder()
                        .setColor(process.env.botcolor || Colors.Yellow)
                        .setDescription(
                            `# ROLETA LOG` +
                            `\n### ${Emojis.user || "👤"} Usuário:\n> <@${userId}> (\`${userId}\`)\n` +
                            `### ${Emojis.coinsaa || "💰"} Coins Gastos:\n> ${custo} \n` +
                            `### ${Emojis.roleta || "🎲"} Prêmio:\n> ${vencedor.name}\n` +
                            `### ${Emojis.TicketLog_RkBots || "📝"} Detalhe:\n> ${logDetail}`
                        )
                        .setTimestamp();
                    applyBotFooter(staffEmbed, interaction);
                    logChannel.send({ embeds: [staffEmbed] }).catch(() => { });
                }
            }

            if (logsConfig.logRoletaPublicId && vencedor.type !== 'nothing') {
                const publicChannel = interaction.guild.channels.cache.get(logsConfig.logRoletaPublicId);
                if (publicChannel) {
                    const rarityColor = RARITY_COLORS[vencedor.rarity] || Colors.Gold;
                    const flavorText = RARITY_MESSAGES[vencedor.rarity] || "Um prêmio incrível!";

                    const publicEmbed = new EmbedBuilder()
                        .setColor(rarityColor)
                        .setDescription(
                            `- O <@${userId}> acabou de ganhar \`${vencedor.name}\`, que tem a raridade \`${vencedor.rarity.toUpperCase()}\`\n> ${flavorText}`
                        )
                        .setThumbnail(interaction.user.displayAvatarURL())
                        .setTimestamp();

                    if (['lendario', 'mistico', 'epico'].includes(vencedor.rarity)) {
                        publicEmbed.setImage(interaction.guild.bannerURL({ size: 512 }) || null);
                    }

                    applyBotFooter(publicEmbed, interaction);
                    publicChannel.send({ embeds: [publicEmbed] }).catch(() => { });
                }
            }
        } catch (logErr) {
            console.error("[Roleta] Erro Logs:", logErr);
        }

        await redisClient.set(cooldownKey, "1", { EX: 3600 });
    }
};