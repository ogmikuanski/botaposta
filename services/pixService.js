const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { QrCodePix } = require("qrcode-pix");
const Emojis = require("../Emojis.json");

function applyBotFooter(embed, interaction) {
  if (process.env.BOT_MARCACOES_PIX === "true") {
    embed.setFooter({
      text: process.env.DEFAULT_FOOTER_TEXT,
      iconURL: process.env.DEFAULT_FOOTER_ICON || null,
    });
  } else {
  }
  return embed;
}

async function generatePixEmbed(
  assignedMediatorData,
  matchData,
  mediatorMember,
  interaction
) {
  const valorAPagarFormatado = matchData.valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const pixEmbed = new EmbedBuilder()
    .setAuthor({
      name: mediatorMember.displayName,
      iconURL: mediatorMember.displayAvatarURL(),
    })
    .setTitle("PIX DO MEDIADOR")
    .setColor(process.env.botcolor)
    .addFields(
      {
        name: `${Emojis.dinheiro} Valor a Pagar:\n> \`${valorAPagarFormatado}\``,
        value: ` `,
      },
      {
        name: `${Emojis.text} Conta: ( \`${assignedMediatorData.bankName}\` )`,
        value: `\`${assignedMediatorData.accountName}\``,
      },
      {
        name: `${Emojis.pix} Pix:`,
        value: `\`${assignedMediatorData.pixKey}\``,
      }
    );

  applyBotFooter(pixEmbed, interaction);

  const pixRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mediator_copy_pix:${assignedMediatorData.pixKey}`)
      .setLabel("Copiar Chave Pix")
      .setEmoji(Emojis.pix)
      .setStyle(ButtonStyle.Secondary)
  );

  let qrAttachment = null;

  const pixReceiverName = assignedMediatorData.accountName || null;
  const pixKey = assignedMediatorData.pixKey || null;
  const rawCity = process.env.PIX_RECEIVER_CITY || null;

  try {
    if (!pixReceiverName || !pixKey || !rawCity) {
      throw new Error(
        `Dados PIX ausentes: name=${pixReceiverName}, key=${pixKey}, city=${rawCity}`
      );
    }

    const saneCity = String(rawCity)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .trim()
      .substring(0, 15);

    const saneName = String(pixReceiverName)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9 ]/gi, "")
      .trim()
      .substring(0, 25);

    if (!saneCity.length || !saneName.length) {
      throw new Error(
        "Sanitização inválida — cidade ou nome vazios após limpeza."
      );
    }

    const pix = QrCodePix({
      version: "01",
      key: String(pixKey),
      name: saneName,
      city: saneCity,
      transactionId: (matchData.matchId || "APOSTADO")
        .substring(0, 25)
        .replace(/[^a-zA-Z0-9]/g, "A"),
    });

    const base64Image = await pix.base64();
    const buffer = Buffer.from(base64Image.split(",")[1], "base64");
    qrAttachment = new AttachmentBuilder(buffer, { name: "qrcode.png" });

    pixEmbed.addFields({
      name: "\u200B",
      value: "Caso Prefira Temos o QrCode:",
    });
    pixEmbed.setImage("attachment://qrcode.png");
  } catch (qrErr) {
    console.error("Falha ao gerar QR Code VÁLIDO (qrcode-pix):", qrErr);
  }

  return {
    embeds: [pixEmbed],
    files: qrAttachment ? [qrAttachment] : [],
    components: [pixRow],
  };
}

module.exports = {
  generatePixEmbed,
};
