const MatchService = require("../../services/matchService.js");
const LogService = require("../../services/logService");
const { MessageFlags } = require("discord.js");

module.exports = {
  confirm_presence: (interaction, client) =>
    MatchService.handleConfirmPresence(interaction, client),
  cancel_match: (interaction, client) =>
    MatchService.handleCancelMatch(interaction, client),
  cancelar_apostado: (interaction, client) =>
    MatchService.handleCancelPostConfirm(interaction, client),

  notify_member: (interaction, client) =>
    MatchService.handleNotifyMember(interaction, client),
  alterar_valor: (interaction, client) =>
    MatchService.handleAlterarValor(interaction, client),
  modal_alterar_valor_submit: (interaction, client) =>
    MatchService.handleSubmitAlterarValor(interaction, client),

  definir_vencedor: (interaction, client) =>
    MatchService.handleDefineWinner(interaction, client),
  select_vitoria: (interaction, client) =>
    MatchService.handleWinnerSelectionType(interaction, client, "vitoria"),
  select_wo: (interaction, client) =>
    MatchService.handleWinnerSelectionType(interaction, client, "wo"),
  submit_vencedor_final: (interaction, client) =>
    MatchService.handleSubmitWinner(interaction, client),
  alterar_vencedor: (interaction, client) =>
    MatchService.handleAlterWinner(interaction, client),
  confirmar_e_fechar: (interaction, client) =>
    MatchService.handleConfirmAndClose(interaction, client),
  finalizar_apostado: (interaction, client) =>
    MatchService.handleFinalizarApostado(interaction, client),

  finalizar_apostado_force: (interaction, client) =>
    MatchService.handleCancelPostConfirm(interaction, client),

  get_transcript: (interaction, client) =>
    LogService.handleGetTranscript(interaction, client),

  copy_sala_id: async (interaction) => {
    const id = interaction.customId.split(":")[1];
    await interaction.reply({ content: id, flags: MessageFlags.Ephemeral });
  },
  copy_sala_senha: async (interaction) => {
    const senha = interaction.customId.split(":")[1];
    await interaction.reply({ content: senha, flags: MessageFlags.Ephemeral });
  },
};
