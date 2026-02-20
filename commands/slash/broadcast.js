const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const QueueMessageConfig = require("../../database/models/QueueMessageConfig");
const CargosConfig = require("../../database/models/CargosConfig");
const FilaConfig = require("../../database/models/FilaConfig"); 
const { isDev } = require("../../manager/devManager");
const Emojis = require('../../Emojis.json');

const Embeds = require("../../components/Broadcast/broadcastEmbeds");
const Comps = require("../../components/Broadcast/broadcastComponents");

const { EQUIPE_IDS } = process.env;
const ownerIdSet = new Set(EQUIPE_IDS ? EQUIPE_IDS.split(",").map((id) => id.trim()) : []);

async function checkPerms(interaction) {
    if (!interaction.guild) return false;

    const userIsDev = await isDev(interaction.user.id);
    const isOwner = ownerIdSet.has(interaction.user.id) || interaction.user.id === interaction.guild?.ownerId;
    
    if (userIsDev || isOwner) return true;
    
    const [cargosConfig] = await CargosConfig.findOrCreate({ where: { guildId: interaction.guild.id } });
    
    if (cargosConfig.cargoPermMaxId && interaction.member?.roles?.cache?.has(cargosConfig.cargoPermMaxId)) return true;
    
    return false;
}

async function getAvailableChannelsCount(guildId) {
    try {
        const filaConfig = await FilaConfig.findOne({ where: { guildId } });
        if (!filaConfig) return 0;

        let modalidades = filaConfig.modalidades;
        if (typeof modalidades === 'string') try { modalidades = JSON.parse(modalidades); } catch {}

        if (Array.isArray(modalidades)) {
            const seen = new Set();
            let count = 0;
            modalidades.forEach((modo) => {
                if (modo.canalId && String(modo.canalId).trim().length > 0) {
                    if (!seen.has(modo.canalId)) {
                        count++;
                        seen.add(modo.canalId);
                    }
                }
            });
            return count;
        }
    } catch (e) { console.error("[BROADCAST]: " + e); }
    return 0;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("broadcast")
        .setDescription("Abre a Central de Avisos Globais.")
        .setDMPermission(false),

    execute: async (interaction, client) => {
        if (!interaction.guild) {
            return interaction.reply({ 
                content: "❌ Este comando só pode ser utilizado dentro de servidores.", 
                flags: MessageFlags.Ephemeral 
            });
        }

        if (!(await checkPerms(interaction))) {
            return interaction.reply({ 
                content: `${Emojis.circlecross || "🚫"} Sem permissão para usar o Broadcast.`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [config] = await QueueMessageConfig.findOrCreate({ 
            where: { guildId: interaction.guild.id }, 
            defaults: { mode: 'text', textContent: "# FILAS ON", embedJSON: {}, activeMessages: [], targetChannels: [] }
        });

        const totalAvailable = await getAvailableChannelsCount(interaction.guild.id);
        const hasChannels = (config.targetChannels && config.targetChannels.length > 0);

        await interaction.editReply({
            embeds: [Embeds.MainDashboardEmbed(interaction.guild, config, totalAvailable)],
            components: Comps.MainDashboardRows(config.status, hasChannels)
        });
    }
};