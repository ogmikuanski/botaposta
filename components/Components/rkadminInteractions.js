const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

const {
    execEquipeList,
    execBLList,
    execServidoresList,
    execBLPagina,
    execServersPagina,
    execEquipeAddSubmit,
    execEquipeRemoveSubmit,
    execBLAddSubmit,
    execBLRemoveSubmit,
    execBLCheckSubmit,
    execServidoresInfoSubmit,
    execServidoresConviteSubmit,
    execServidoresRemoveSubmit,
    execManutencaoOn,
    execManutencaoOff
} = require("./rkadminSubmit");

const {
    renderMonitoramento,
    renderEquipeMenu,
    renderGerenciarMenu,
    renderServidoresMenu,
    renderManutencaoMenu,
    renderVoltarPainel
} = require("./rkadminPanelHandler");

const openModal = async (interaction, customId, title, fields) => {
    const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
    const rows = fields.map(f => {
        const input = new TextInputBuilder()
            .setCustomId(f.id)
            .setLabel(f.label)
            .setStyle(f.style || TextInputStyle.Short)
            .setRequired(f.required ?? true);
        
        if (f.placeholder) input.setPlaceholder(f.placeholder);
        
        return new ActionRowBuilder().addComponents(input);
    });
    modal.addComponents(...rows);
    await interaction.showModal(modal);
};

const rkadmin_main_menu_select = async (interaction) => {
    await interaction.deferUpdate();
    const value = interaction.values[0];
    const map = {
        "rkadmin_monitoramento": renderMonitoramento,
        "rkadmin_equipe_menu": renderEquipeMenu,
        "rkadmin_gerenciar_menu": renderGerenciarMenu,
        "rkadmin_servidores_menu": renderServidoresMenu,
        "rkadmin_manutencao_menu": renderManutencaoMenu
    };
    if (map[value]) await map[value](interaction, interaction.client);
};

const rkadmin_equipe_select = async (interaction) => {
    const value = interaction.values[0];
    if (value === "rkadmin_equipe_add_modal") return openModal(interaction, "rkadmin_equipe_add_submit", "Adicionar Developer", [{ id: "user_id", label: "ID do Usuário", placeholder: "Ex: 123456789..." }]);
    if (value === "rkadmin_equipe_remove_modal") return openModal(interaction, "rkadmin_equipe_remove_submit", "Remover Developer", [{ id: "user_id", label: "ID do Usuário" }]);
    
    await interaction.deferUpdate();
    if (value === "rkadmin_equipe_list") await execEquipeList(interaction);
};

const rkadmin_gerenciar_select = async (interaction) => {
    const value = interaction.values[0];
    
    if (value.includes("modal")) {
        const type = value.includes("user") ? "user" : "guild";
        const action = value.includes("add") ? "add" : "remove";
        
        const fields = [{ id: "id", label: `ID ${type === "user" ? "Usuário" : "Servidor"}` }];
        if (action === "add") {
            fields.push({ id: "motivo", label: "Motivo do Bloqueio", style: TextInputStyle.Paragraph });
            fields.push({ id: "prova", label: "Link da Prova (Opcional)", required: false });
        }
        return openModal(interaction, `rkadmin_bl_${action}_submit:${type}`, `${action === "add" ? "Bloquear" : "Desbloquear"} ${type}`, fields);
    }

    if (value === "rkadmin_bl_check_modal") return openModal(interaction, "rkadmin_bl_check_submit", "Verificar Status", [{ id: "id", label: "ID para verificar" }]);

    await interaction.deferUpdate();
    if (value === "rkadmin_bl_list_users") return execBLList(interaction, "user");
    if (value === "rkadmin_bl_list_guilds") return execBLList(interaction, "guild");
};

const rkadmin_servidores_select = async (interaction) => {
    const value = interaction.values[0];
    
    if (value === "rkadmin_servidores_info_modal") return openModal(interaction, "rkadmin_servidores_info_submit", "Info Detalhada", [{ id: "guild_id", label: "ID do Servidor" }]);
    if (value === "rkadmin_servidores_convite_modal") return openModal(interaction, "rkadmin_servidores_convite_submit", "Forçar Convite", [{ id: "guild_id", label: "ID do Servidor" }]);
    if (value === "rkadmin_servidores_remove_modal") return openModal(interaction, "rkadmin_servidores_remove_submit", "Sair (Force Leave)", [{ id: "guild_id", label: "ID do Servidor", placeholder: "O bot sairá deste servidor." }]);

    await interaction.deferUpdate();
    if (value === "rkadmin_servidores_list") return execServidoresList(interaction, interaction.client);
};

module.exports = {
    rkadmin_main_menu_select,
    rkadmin_equipe_select,
    rkadmin_gerenciar_select,
    rkadmin_servidores_select,

    rkadmin_monitoramento: async (i) => { await i.deferUpdate(); renderMonitoramento(i, i.client); },
    rkadmin_voltar_painel: async (i) => { await i.deferUpdate(); renderVoltarPainel(i); },
    
    rkadmin_manutencao_on: execManutencaoOn,
    rkadmin_manutencao_off: execManutencaoOff,

    rkadmin_bl_pagina: execBLPagina,
    rkadmin_servers_pagina: execServersPagina,

    rkadmin_equipe_add_submit: async (i) => execEquipeAddSubmit(i, i.client),
    rkadmin_equipe_remove_submit: async (i) => execEquipeRemoveSubmit(i, i.client),
    rkadmin_bl_add_submit: execBLAddSubmit,
    rkadmin_bl_remove_submit: execBLRemoveSubmit,
    rkadmin_bl_check_submit: execBLCheckSubmit,
    rkadmin_servidores_info_submit: async (i) => execServidoresInfoSubmit(i, i.client),
    rkadmin_servidores_convite_submit: async (i) => execServidoresConviteSubmit(i, i.client),
    rkadmin_servidores_remove_submit: async (i) => execServidoresRemoveSubmit(i, i.client)
};