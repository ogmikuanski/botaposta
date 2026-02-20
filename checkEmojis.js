const { Client, GatewayIntentBits } = require("discord.js");
const path = require("path");
require("dotenv").config();

const EmojisLocal = require("./Emojis.json");

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

client.once("clientReady", async () => {
    console.log(`\n🕵️  AUDITORIA DE EMOJIS DA APLICAÇÃO (DEV PORTAL)`);
    console.log(`🤖 Bot: ${client.user.tag}`);
    console.log(`=============================================================`);

    try {
        await client.application.fetch();
        const appEmojis = await client.application.emojis.fetch();

        let validos = 0;
        let invalidos = 0;
        let total = 0;

        const idRegex = /:(\d+)>/;

        for (const [key, jsonString] of Object.entries(EmojisLocal)) {
            total++;

            const match = jsonString.match(idRegex);

            if (!match) {
                console.log(`⚠️  [FORMATO INVÁLIDO] ${key}: ${jsonString} (Não tem ID reconhecível)`);
                invalidos++;
                continue;
            }

            const jsonId = match[1];

            const emojiDev = appEmojis.get(jsonId);

            if (emojiDev) {
                console.log(`✅ [OK] ${key.padEnd(20)} -> ${emojiDev.name} (ID Bateu!)`);
                validos++;
            } else {
                console.log(`❌ [ERRO] ${key.padEnd(18)} -> ID: ${jsonId} (Não encontrado na Aplicação)`);
                invalidos++;
            }
        }

        console.log(`=============================================================`);
        console.log(`✅ Sincronizados: ${validos}`);
        console.log(`❌ Quebrados/Externos: ${invalidos}`);

    } catch (error) {
        console.error("❌ Erro ao buscar dados da aplicação:", error);
    }

    process.exit();
});

client.login(process.env.DISCORD_TOKEN);