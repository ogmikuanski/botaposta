const { Events, PermissionFlagsBits } = require("discord.js");

const {
  GUILD_LOG_SERVER_ID,
  SUNDOBOT,
  GUILD_LOG_SERVERTESTE_IDS,
  NOMEMARCA
} = process.env;

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (!SUNDOBOT) return;

    const guild = newMember.guild;

    const allowedGuilds = [
      GUILD_LOG_SERVER_ID,
      ...(GUILD_LOG_SERVERTESTE_IDS?.split(",") || [])
    ].filter(Boolean);

    if (allowedGuilds.includes(guild.id)) {
      return console.log(`[AntiDuplicate] 🛡️ Servidor Whitelist (${guild.name}). Tudo certo.`);
    }

    try {
      const rivalMember = await guild.members.fetch(SUNDOBOT).catch(() => null);

      if (rivalMember && rivalMember.id !== newMember.client.user.id) {
        console.warn(`[AntiDuplicate] 🚨 CONFLITO DETECTADO em ${guild.name}`);
        console.warn(`[AntiDuplicate] ⚠️ Bot duplicado encontrado. Saindo...`);
        await guild.leave();
        return;
      }
    } catch (err) {
      console.error(`[AntiDuplicate] Erro:`, err);
    }

    if (newMember.id !== newMember.client.user.id) return;

    const FIXED_NAME = NOMEMARCA;
    if (!FIXED_NAME) return;

    const currentNickname = newMember.nickname;
    if (currentNickname === FIXED_NAME) return;

    try {
      if (!guild.members.me.permissions.has(PermissionFlagsBits.ChangeNickname)) {
        return console.warn(`[AntiNick] Sem permissão em "${guild.name}".`);
      }

      console.log(`[AntiNick] 🛡️ Nome alterado em "${guild.name}". Restaurando...`);
      await newMember.setNickname(FIXED_NAME);

    } catch (err) {
      console.error(`[AntiNick] Falha em ${guild.name}:`, err);
    }
  },
};
