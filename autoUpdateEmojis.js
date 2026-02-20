const { Client, GatewayIntentBits, Events } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const emojisPath = path.join(__dirname, "src", "Emojis.json");

let localEmojis = {};
try {
  localEmojis = require(emojisPath);
} catch (e) {
  console.error("❌ Não consegui ler o src/Emojis.json. Verifique o caminho.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  console.log(`\n🔄 INICIANDO ATUALIZAÇÃO AUTOMÁTICA DE EMOJIS`);
  console.log(`🤖 Bot: ${client.user.tag}`);
  console.log(`=============================================================`);

  try {

    await client.application.fetch();
    const appEmojis = await client.application.emojis.fetch();
    console.log(`📥 Emojis carregados da Nuvem: ${appEmojis.size}\n`);

    let atualizados = 0;
    let naoEncontrados = 0;
    let total = 0;
    let novoJson = { ...localEmojis };

    const nameRegex = /:(.*?):/;

    for (const [key, valorAtual] of Object.entries(localEmojis)) {
      total++;
      
      let nomeAlvo = key; 

      const match = valorAtual.match(nameRegex);
      if (match) {
        nomeAlvo = match[1];
      }

      const emojiAchado = appEmojis.find(e => e.name === nomeAlvo);

      if (emojiAchado) {
        const isAnimated = emojiAchado.animated ? "a" : "";
        const novaString = `<${isAnimated}:${emojiAchado.name}:${emojiAchado.id}>`;

        if (valorAtual !== novaString) {
          novoJson[key] = novaString;
          console.log(`✅ [ATUALIZADO] ${key.padEnd(15)} : ${nomeAlvo} -> Novo ID: ${emojiAchado.id}`);
          atualizados++;
        }
      } else {
        const emojiPelaKey = appEmojis.find(e => e.name === key);
        if (emojiPelaKey) {
            const isAnimated = emojiPelaKey.animated ? "a" : "";
            const novaString = `<${isAnimated}:${emojiPelaKey.name}:${emojiPelaKey.id}>`;
            
            if (valorAtual !== novaString) {
                novoJson[key] = novaString;
                console.log(`✅ [CORRIGIDO] ${key.padEnd(15)} : Usando nome da chave -> ${emojiPelaKey.name}`);
                atualizados++;
            }
        } else {
            console.log(`❌ [FALHA] ${key.padEnd(18)} : Não encontrei emoji com nome "${nomeAlvo}" ou "${key}" no App.`);
            naoEncontrados++;
        }
      }
    }

    if (atualizados > 0) {
      fs.writeFileSync(emojisPath, JSON.stringify(novoJson, null, 2));
      console.log(`\n=============================================================`);
      console.log(`🚀 SUCESSO! Arquivo src/Emojis.json foi atualizado.`);
      console.log(`📝 Total de alterações: ${atualizados}`);
    } else {
      console.log(`\n=============================================================`);
      console.log(`✨ Tudo parece estar em dia. Nenhuma alteração necessária.`);
    }

    console.log(`🔍 Total Verificado: ${total}`);
    console.log(`⚠️ Não encontrados: ${naoEncontrados}`);

  } catch (error) {
    console.error("❌ Deu ruim na atualização:", error);
  }

  process.exit();
});

client.login(process.env.DISCORD_TOKEN);