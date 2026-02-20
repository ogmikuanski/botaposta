const { SlashCommandBuilder, MessageFlags, EmbedBuilder, Colors } = require("discord.js");
const { handlePullPanel } = require("../../services/pullService");
const { isBlacklisted } = require("../../manager/blacklistManager");
const Emojis = require("../../Emojis.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("puxar")
    .setDescription("Gerencia a interface da aposta.")
    .addSubcommand((sub) =>
      sub
        .setName("interface")
        .setDescription("Puxa o painel do mediador para o final do chat.")
    ),

  execute: async (interaction, client) => {
    try {
        const userBlocked = await isBlacklisted(interaction.user.id, "user");
        if (userBlocked) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(process.env.botcolor || Colors.Red)
                        .setDescription(process.env.MSGBLACKLISTMEMBERBOT || "Você está na blacklist.")
                ],
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (err) {
        console.error("[Slash Puxar] Erro blacklist:", err);
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "interface") {
        try {
            await handlePullPanel(interaction, client);
        } catch (err) {
            console.error(`[Slash Puxar] Erro:`, err);
            
            const msg = process.env.MSGERROBOT || "Ocorreu um erro interno.";
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
            } else {
                await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    }
  },
};