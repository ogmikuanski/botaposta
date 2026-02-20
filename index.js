const {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  Colors,
  ChannelType,
  WebhookClient,
} = require("discord.js");
const path = require("path");
const fs = require("fs").promises;
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  EQUIPE_IDS,
  GUILD_LOG_SERVER_ID,
  ERROR_LOG_CHANNEL_ID,
  ERROR_WEBHOOK_URL,
} = process.env;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildEmojisAndStickers
  ],
});

client.slashCommands = new Collection();
client.prefixCommands = new Collection();
client.components = new Collection();

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

let isLogging = false;

const IGNORED_ERRORS = [
  "DiscordAPIError[10008]",
  "DiscordAPIError[10003]",
  "DiscordAPIError[10062]",
  "DiscordAPIError[50001]",
  "DiscordAPIError[50013]",
  "Interaction has already been acknowledged"
];

const EMBED_FIELD_SAFE_LIMIT = 900;
const STACK_FILE_PREFIX = "error-";

function clamp(text, max = EMBED_FIELD_SAFE_LIMIT) {
  if (text === undefined || text === null) return "N/A";
  text = String(text);
  return text.length > max ? text.substring(0, max) + "... (truncado)" : text;
}

async function createStackFile(stack) {
  try {
    const fileName = `${STACK_FILE_PREFIX}${Date.now()}.txt`;
    const fullPath = path.join(__dirname, fileName);
    await fs.writeFile(fullPath, String(stack), { encoding: "utf8" });
    return fullPath;
  } catch (err) {
    originalConsoleError("[createStackFile] Falha ao criar arquivo:", err);
    return null;
  }
}

const sendSmartLog = async ({ client, embed, contentPing = null, files = [] }) => {
  if (isLogging) return;
  isLogging = true;
  
  try {
    if (client && client.isReady && client.isReady() && GUILD_LOG_SERVER_ID && ERROR_LOG_CHANNEL_ID) {
      try {
        const logGuild = await client.guilds.fetch(GUILD_LOG_SERVER_ID).catch(() => null);
        if (logGuild) {
            const logChannel = await logGuild.channels.fetch(ERROR_LOG_CHANNEL_ID).catch(() => null);
            if (logChannel && logChannel.type === ChannelType.GuildText) {
                await logChannel.send({ content: contentPing, embeds: [embed], files });
                return; 
            }
        }
      } catch (fetchErr) {
      }
    }

    if (!ERROR_WEBHOOK_URL) return; 
    
    const webhookClient = new WebhookClient({ url: ERROR_WEBHOOK_URL });
    await webhookClient.send({
      username: "Alerta de Erro do Bot (Fallback)",
      avatarURL: "https://cdn.discordapp.com/attachments/1383191896377266176/1435385370102730763/goat.webp",
      content: contentPing,
      embeds: [embed],
      files,
    });
  } catch (err) {
    originalConsoleError("[sendSmartLog] Falha crítica no sistema de logs:", err);
  } finally {
    isLogging = false;
  }
};

const sendFatalErrorLog = async (clientArg, error, errorType) => {
  const errorData = error instanceof Error ? error : new Error(String(error || "Razão desconhecida"));
  
  if (IGNORED_ERRORS.some(msg => errorData.message?.includes(msg))) return;

  originalConsoleError(`[ERRO GLOBAL] ${errorType}:\n`, errorData);

  const fullStack = errorData.stack || "Sem stack trace disponível";
  const fullMessage = errorData.message || "N/A";

  const clippedStack = clamp(fullStack);
  const clippedMessage = clamp(fullMessage);

  const embed = new EmbedBuilder()
    .setTitle(`❌ Erro Fatal Detectado: ${errorType}`)
    .setColor(process.env.botcolor || Colors.Red)
    .setTimestamp()
    .addFields(
      { name: "Mensagem de Erro", value: `\`\`\`\n${clippedMessage}\n\`\`\`` },
      { name: "Stacktrace (Início)", value: `\`\`\`js\n${clippedStack}\n\`\`\`` }
    );

  let stackFilePath = null;
  try {
    if (String(fullStack).length > EMBED_FIELD_SAFE_LIMIT) {
      stackFilePath = await createStackFile(fullStack);
    }

    const files = stackFilePath ? [stackFilePath] : [];
    
    await Promise.race([
      sendSmartLog({
        client: clientArg,
        embed,
        contentPing: `|| <@&1454593015137173592> || || <@&1454593015137173591> ||`,
        files,
      }),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  } finally {
    if (stackFilePath) {
      fs.unlink(stackFilePath, () => {});
    }
  }
};

const sendNonFatalLog = async (clientArg, args, type) => {
  let title = "🟡 Aviso Detectado";
  let color = Colors.Yellow;
  
  if (type === "Error") {
    title = "🟠 Erro Inesperado Detectado";
    color = Colors.Orange;
  }

  const data = args.length === 1 ? args[0] : args;

  let message, stack;
  if (data instanceof Error) {
    message = data.message || "N/A";
    stack = data.stack || "Sem stack trace disponível";
  } else {
    message = args.map((item) => {
        if (typeof item === "object" && item !== null) {
          try { return JSON.stringify(item, null, 2); } catch { return String(item); }
        }
        return String(item);
    }).join(" ");
    stack = "Não é um objeto Error, stack trace indisponível.";
  }

  if (typeof message === "string" && IGNORED_ERRORS.some((err) => message.includes(err))) {
    return;
  }

  if (!message.trim()) message = "Nenhuma informação fornecida.";

  const clippedMessage = clamp(message);
  const clippedStack = clamp(stack);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp()
    .addFields(
      { name: "Mensagem", value: `\`\`\`\n${clippedMessage}\n\`\`\`` },
      { name: "Stacktrace / Detalhes", value: `\`\`\`js\n${clippedStack}\n\`\`\`` }
    );

  try {
    void sendSmartLog({ client: clientArg, embed, contentPing: null });
  } catch (err) {
    originalConsoleError("[sendNonFatalLog] Falha ao encaminhar log:", err);
  }
};


console.error = (...args) => {
  const error = args[0];
  if (error instanceof Error && IGNORED_ERRORS.some(msg => error.message.includes(msg))) return;
  
  originalConsoleError.apply(console, args);

  try {
    void sendNonFatalLog(client, args, "Error");
  } catch (err) {
    originalConsoleError("[console.error override] falha ao logar:", err);
  }
};

console.warn = (...args) => {
  const error = args[0];
  if (error instanceof Error && IGNORED_ERRORS.some(msg => error.message.includes(msg))) return;

  originalConsoleWarn.apply(console, args);
  
  try {
    void sendNonFatalLog(client, args, "Warning");
  } catch (err) {
    originalConsoleError("[console.warn override] falha ao logar:", err);
  }
};

process.on("uncaughtException", async (error) => {
  try {
    if (IGNORED_ERRORS.some(msg => error.message?.includes(msg))) return;
    await sendFatalErrorLog(client, error, "Uncaught Exception");
  } catch (err) {
    originalConsoleError("[uncaughtException] falha ao enviar log fatal:", err);
  }
});

process.on("unhandledRejection", async (reason) => {
  try {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (IGNORED_ERRORS.some(msg => message.includes(msg))) return;

    await sendFatalErrorLog(client, reason, "Unhandled Rejection");
  } catch (err) {
    originalConsoleError("[unhandledRejection] falha ao enviar log fatal:", err);
  }
});


const { connectDB } = require("./database/sequelize");
const { connectRedis } = require("./utils/cache");
const { warmupAllConfigs } = require("./manager/configManager");

require("./database/models/server");
require("./database/models/ConfigsGerais");
require("./database/models/CargosConfig");
require("./database/models/FilaConfig");
require("./database/models/Blacklist");
require("./database/models/Developer");
require("./database/models/LogsConfig");
require("./database/models/MediatorPix");
require("./database/models/PlayerProfile");
require("./database/models/MediatorStats");
require("./database/models/ModalityBlacklist");
require("./database/models/ApostadoLog");
require("./database/models/StoreItem");
require("./database/models/RoletaItem");
require("./database/models/QueueMessageConfig");

const { loadBlacklistToCache } = require("./manager/blacklistManager");
const { loadDevsToCache } = require("./manager/devManager");
const { cleanupOrphanedLogs } = require("./manager/cleanupManager");
const { startMatchCleaner } = require("./manager/staleMatchCleaner");
const { startGuildCleanupCron } = require("./manager/guildCleanupManager");
const { syncAllGuildsDatabase } = require("./manager/syncManager");

if (!DISCORD_TOKEN || !CLIENT_ID || !EQUIPE_IDS || !GUILD_LOG_SERVER_ID || !ERROR_LOG_CHANNEL_ID || !ERROR_WEBHOOK_URL) {
  originalConsoleError("❌ ERRO FATAL: Variáveis de ambiente críticas ausentes no .env!");
  process.exit(1);
}

async function initializeBot() {
  await connectDB();
  await connectRedis();
  await warmupAllConfigs();

  await loadBlacklistToCache();
  await loadDevsToCache();

  require("./handlers/commandHandler")(client);
  require("./handlers/eventHandler")(client);
  require("./handlers/componentHandler")(client);

  await client.login(DISCORD_TOKEN);

  client.once("clientReady", async () => {
    await syncAllGuildsDatabase(client);

    startMatchCleaner(client);
    startGuildCleanupCron(client);

    setTimeout(() => {
      cleanupOrphanedLogs(client).catch((err) =>
        console.error("[Cleanup] Falha na limpeza inicial:", err)
      );
    }, 30000);
  });

  setInterval(() => {
    cleanupOrphanedLogs(client).catch((err) =>
      console.error("[Cleanup] Falha na limpeza agendada:", err)
    );
  }, 1 * 60 * 60 * 1000);
}

initializeBot().catch((initError) => {
  (async () => {
    try {
      await sendFatalErrorLog(client, initError, "Bootstrap Failure");
    } catch (err) {
      originalConsoleError("[initializeBot.catch] falha ao enviar log:", err);
    } finally {
        process.exit(1); 
    }
  })();
});