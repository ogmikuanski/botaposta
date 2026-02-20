const { Client, GatewayIntentBits, Events } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const outputPath = path.join(__dirname, "tst.json");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  console.log(`\n📥 BAIXANDO EMOJIS DA APLICAÇÃO...`);
  console.log(`🤖 Bot: ${client.user.tag}`);
  console.log(`=============================================================`);

  try {
    await client.application.fetch();

    const appEmojis = await client.application.emojis.fetch();
    console.log(`💎 Encontrados: ${appEmojis.size} emojis na nuvem.`);

    const jsonOutput = {};

    appEmojis.forEach((emoji) => {
      const isAnimated = emoji.animated ? "a" : "";
      const emojiString = `<${isAnimated}:${emoji.name}:${emoji.id}>`;
      
      jsonOutput[emoji.name] = emojiString;
    });

    fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2));

    console.log(`=============================================================`);
    console.log(`✅ SUCESSO! Todos os emojis foram salvos em: tst.json`);
    console.log(`📁 Total gravado: ${Object.keys(jsonOutput).length}`);

  } catch (error) {
    console.error("❌ Erro ao baixar emojis:", error);
  }

  process.exit();
});

client.login(process.env.DISCORD_TOKEN);