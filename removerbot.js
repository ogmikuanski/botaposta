require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder, Colors } = require("discord.js");
const { sequelize } = require("./database/sequelize"); 
const Blacklist = require("./database/models/Blacklist"); 
const Emojis = require('./Emojis.json');

const LOG_SERVER_ID = process.env.GUILD_LOG_SERVER_ID;
const LOG_CHANNEL_ID = process.env.GUILD_LOG_LEAVEBLACKLIST;

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

async function runCleaner() {
    try {
        console.log("🔄 Iniciando sistema de limpeza (Blacklist)...");

        await sequelize.authenticate();
        console.log("✅ Banco de dados conectado.");
        
        await client.login(process.env.TOKEN);
        console.log(`🤖 Logado como ${client.user.tag}`);

        console.log("⏳ Aguardando carregamento dos servidores...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        const bannedEntries = await Blacklist.findAll({
            where: { type: 'guild' }
        });

        if (bannedEntries.length === 0) {
            console.log("✅ Nenhum servidor encontrado na Blacklist.");
            process.exit(0);
        }

        const bannedMap = new Map();
        bannedEntries.forEach(entry => {
            bannedMap.set(entry.id, entry.reason || "Motivo não especificado.");
        });
        
        console.log(`📋 ${bannedMap.size} servidores registrados na Blacklist.`);

        let leftCount = 0;

        for (const guild of client.guilds.cache.values()) {
            
            if (bannedMap.has(guild.id)) {
                console.warn(`🚨 ALERTA: Bot encontrado em servidor proibido: ${guild.name} (${guild.id})`);

                const reason = bannedMap.get(guild.id);

                const owner = await guild.fetchOwner().catch(() => null);
                const ownerTag = owner ? `\`${owner.user.tag}\`` : "`Desconhecido`";
                const ownerId = owner ? `\`${owner.id}\`` : "";

                try {
                    const logGuild = await client.guilds.fetch(LOG_SERVER_ID).catch(() => null);
                    if (logGuild) {
                        const logChannel = await logGuild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
                        
                        if (logChannel) {
                            const embed = new EmbedBuilder()
                                .setColor(process.env.botcolor || Colors.Red)
                                .setThumbnail(guild.iconURL({ dynamic: true }) || null)
                                .setDescription(
                                    `# ${Emojis.verifybot || "🚫"} SAÍDA FORÇADA (BLACKLIST)\n` +
                                    `### ${Emojis.abrirticket || "📂"} Informações do Servidor:\n> \`${guild.name}\` [\`${guild.id}\`]\n` +
                                    `### ${Emojis.discord || "👑"} Posse:\n> ${ownerTag} [${ownerId}]\n` +
                                    `### ${Emojis.user || "👥"} Membros:\n> ${guild.memberCount}\n` +
                                    `### ${Emojis.pato || "⚠️"} Motivo:\n> ${reason}`
                                )
                                .setTimestamp();

                            await logChannel.send({ embeds: [embed] });
                        } else {
                            console.warn(`⚠️ Canal de log (${LOG_CHANNEL_ID}) não encontrado.`);
                        }
                    }
                } catch (logErr) {
                    console.error("❌ Erro ao tentar enviar log de saída:", logErr.message);
                }

                try {
                    await guild.leave();
                    console.log(`👋 SAIU com sucesso de: ${guild.name}`);
                    leftCount++;
                } catch (leaveErr) {
                    console.error(`❌ Falha ao sair de ${guild.name}:`, leaveErr.message);
                }

                await new Promise(r => setTimeout(r, 1000));
            }
        }

        console.log("------------------------------------------------");
        console.log(`🏁 Processo finalizado.`);
        console.log(`🗑️ Total de servidores removidos: ${leftCount}`);
        
    } catch (error) {
        console.error("❌ Erro fatal no script:", error);
    } finally {
        await client.destroy();
        await sequelize.close();
        process.exit(0);
    }
}

runCleaner();