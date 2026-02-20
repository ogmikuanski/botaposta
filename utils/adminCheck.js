const { PermissionsBitField } = require("discord.js");

async function enforceGoldenRule(guild) {
  if (!guild) return false;

  try {
    const me =
      guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!me) return false;

    return me.permissions.has(PermissionsBitField.Flags.Administrator);
  } catch (err) {
    console.error(
      `[Regra de Ouro] Erro ao verificar permissões: ${err.message}`
    );
    return false;
  }
}

module.exports = { enforceGoldenRule };
