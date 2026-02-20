const {
  EmbedBuilder,
  Colors,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const PlayerProfile = require("../../database/models/PlayerProfile");
const Emojis = require("../../Emojis.json");
const { Op } = require("sequelize");

function createProgressBar(current, total, size = 15) {
  const percentage = total === 0 ? 0 : Math.min(Math.max(current / total, 0), 1);
  const progress = Math.round(size * percentage);
  const emptyProgress = size - progress;
  return "🟩".repeat(progress) + "⬛".repeat(emptyProgress);
}

function getPlayerRank(wins) {
  if (wins >= 1000) return { name: "Lenda Suprema", emoji: "👑", color: "#ff0000", next: Infinity };
  if (wins >= 500) return { name: "Grão-Mestre", emoji: "🔴", color: "#e74c3c", next: 1000 };
  if (wins >= 200) return { name: "Mestre", emoji: "🟣", color: "#9b59b6", next: 500 };
  if (wins >= 100) return { name: "Diamante", emoji: "💎", color: "#3498db", next: 200 };
  if (wins >= 50) return { name: "Platina", emoji: "💠", color: "#1abc9c", next: 100 };
  if (wins >= 50) return { name: "Ouro", emoji: "🥇", color: "#f1c40f", next: 50 };
  if (wins >= 10) return { name: "Prata", emoji: "🥈", color: "#95a5a6", next: 20 };
  return { name: "Bronze", emoji: "🥉", color: "#cd7f32", next: 10 };
}

function calculateLevel(totalGames) {
  return Math.floor(Math.sqrt(totalGames) * 2) + 1;
}

function getBadges(profile, member) {
  const badges = [];
  const total = profile.partidasTotais;
  const wr = total > 0 ? (profile.wins / total) : 0;

  if (profile.coins >= 100000) badges.push("`Magnata` 🤑");
  if (profile.currentWinStreak >= 5) badges.push("`On Fire` 🔥");
  if (wr >= 0.8 && total > 20) badges.push("Sniper (`Alta precisão`) 🎯");
  if (total >= 500) badges.push("`Viciado` 👴");
  if (profile.wo === 0 && total > 50) badges.push("`Santo` 😇");

  if (member && (Date.now() - member.joinedTimestamp) > 31536000000) badges.push("🛡️");

  return badges.length > 0 ? badges.join(" ") : "Nenhuma conquista ainda";
}

function getPlayStyle(wins, total, losses) {
  if (total < 10) return "`Novato` 🐣";
  const wr = wins / total;
  if (wr > 0.8) return "`Tryhard` 😈";
  if (wr > 0.6) return "`Pro Player` 🎮";
  if (wr > 0.4) return "`Casual` 🧢";
  return "`Por diversão` 🤡";
}

function formatDate(date) {
  if (!date) return "N/A";
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

async function generateRankingView(guildId, category, client, interactionGuild) {
  const config = {
    wins: {
      col: 'wins',
      title: 'Vitórias',
      emoji: '',
      desc: 'Jogadores com mais vitórias',
      format: (p) => ` **${p.wins}** Vitórias`
    },
    losses: {
      col: 'losses',
      title: 'Derrotas',
      emoji: '',
      desc: 'Jogadores com mais derrotas',
      format: (p) => ` **${p.losses}** Derrotas`
    },
    wo: {
      col: 'wo',
      title: 'W.O',
      emoji: '',
      desc: 'Jogadores com mais desistências',
      format: (p) => ` **${p.wo}** W.O.s`
    },
    coins: {
      col: 'coins',
      title: 'Coins',
      emoji: '',
      desc: 'Jogadores mais ricos',
      format: (p) => ` **${p.coins.toLocaleString('pt-BR')}** Coins`
    }
  };

  const current = config[category];

  const topPlayers = await PlayerProfile.findAll({
    where: {
      guildId: guildId,
      [current.col]: { [Op.gt]: 0 }
    },
    order: [[current.col, "DESC"]],
    limit: 20,
  });

  if (topPlayers.length === 0) {
    return {
      embed: new EmbedBuilder()
        .setColor(process.env.botcolor || Colors.Red)
        .setDescription(`### **Ranking Vazio!**\n- Ninguém possui registros de **${current.title}** neste servidor.`),
      components: []
    };
  }

  const description = topPlayers.map((profile, index) => {
    let rankDisplay = `- **${index + 1}.** `;

    const infoDisplay = current.format(profile);

    return `${rankDisplay} <@${profile.userId}>\n> ${infoDisplay}`;
  }).join("\n");

  const embed = new EmbedBuilder()
    .setColor(process.env.botcolor || Colors.Gold)
    .setDescription(`# Top 20 ${current.title}\n` + description)
    .setThumbnail(interactionGuild.iconURL({ dynamic: true }))
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rank_wins')
      .setLabel('Vitórias')
      .setStyle(category === 'wins' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(category === 'wins'),

    new ButtonBuilder()
      .setCustomId('rank_losses')
      .setLabel('Derrotas')
      .setStyle(category === 'losses' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(category === 'losses'),

    new ButtonBuilder()
      .setCustomId('rank_wo')
      .setLabel('W.Os')
      .setStyle(category === 'wo' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(category === 'wo'),

    new ButtonBuilder()
      .setCustomId('rank_coins')
      .setLabel('Coins')
      .setStyle(category === 'coins' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(category === 'coins')
  );

  return { embed, components: [row] };
}

module.exports = {
  perfil_panel_profile: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      return;
    }

    try {
      const targetUser = interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      const [profile] = await PlayerProfile.findOrCreate({
        where: { guildId: interaction.guild.id, userId: targetUser.id },
        defaults: {
          guildId: interaction.guild.id,
          userId: targetUser.id,
          partidasTotais: 0,
          wins: 0,
          losses: 0,
          wo: 0,
          maxWinStreak: 0,
          currentWinStreak: 0,
          coins: 0,
        },
      });

      const totalGames = profile.partidasTotais || 0;
      const wins = profile.wins || 0;
      const losses = profile.losses || 0;
      const wo = profile.wo || 0;
      const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : "0.0";
      const reliability = totalGames > 0 ? (100 - ((wo / totalGames) * 100)).toFixed(1) : "100.0";

      const rank = getPlayerRank(wins);
      const level = calculateLevel(totalGames);
      const badges = getBadges(profile, member);
      const playStyle = getPlayStyle(wins, totalGames, losses);

      let rankProgressMsg = "🏆 **Nível Máximo!**";
      if (rank.next !== Infinity) {
        const winsNeeded = rank.next - wins;
        rankProgressMsg = `Faltam **${winsNeeded}** vitórias para subir`;
      }

      const description = [
        `# ${rank.emoji} ${rank.name}`,
        `- **Nível:** ${level}`,
        `> **Estilo:** ${playStyle}`,
        `> **Conquistas:** ${badges}`,
        `> **Saldo:** \`${profile.coins.toLocaleString('pt-BR')}\``,
        `### ${Emojis.trofeu || "📊"} Performance`,
        `> **Aproveitamento:** \`${winRate}%\``,
        `> ${createProgressBar(wins, totalGames, 15)}`,
        `> **Jogo limpo:** \`${reliability}%\``,
        `### ${Emojis.TicketLog_RkBots || "📑"} Estatísticas`,
        `- **Total de partidas:** \`${totalGames}\``,
        `> **Vitórias total:** \`${wins}\``,
        `> **Derrotas total:** \`${losses}\``,
        `> **W.O total:** \`${wo}\``,
        `### ${Emojis.raio || "⚡"} Recordes & Metas`,
        `> **Vitórias Atual:** \`${profile.currentWinStreak}\``,
        `> **Vitórias Máximas:** \`${profile.maxWinStreak}\``,
        `> **Próximo Rank:** ${rankProgressMsg}`
      ].join("\n");

      const embed = new EmbedBuilder()
        .setColor(rank.color)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
        .setDescription(description)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Erro no perfil_panel_profile:", err);
      await interaction.editReply({ content: "❌ Erro ao gerar perfil." });
    }
  },

  perfil_panel_ranking: async (interaction, client) => {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) { return; }

    try {
      const { embed, components } = await generateRankingView(interaction.guild.id, 'wins', client, interaction.guild);

      await interaction.editReply({
        embeds: [embed],
        components: components
      });

    } catch (err) {
      console.error("[PERFIL HANDLE]" + err);
      await interaction.editReply({ content: "❌ Erro ao carregar ranking." });
    }
  },

  gerenciar_botoes_ranking: async (interaction, client) => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => { });
      }

      const category = interaction.customId.replace('rank_', '');

      const guild = interaction.guild || client.guilds.cache.get(interaction.guildId);

      if (!guild) {
        return interaction.followUp({ content: "❌ Erro: Servidor não encontrado.", flags: MessageFlags.Ephemeral });
      }

      const { embed, components } = await generateRankingView(guild.id, category, client, guild);

      await interaction.editReply({
        embeds: [embed],
        components: components
      });

    } catch (err) {
      console.error("Erro ao atualizar ranking:", err);
    }
  },
};