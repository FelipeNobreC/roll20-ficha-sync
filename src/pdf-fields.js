const fs = require('node:fs');
const { PDFDocument } = require('pdf-lib');

async function readPdfFields(caminhoPdf) {
  const bytes = fs.readFileSync(caminhoPdf);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const campos = {};

  for (const campo of form.getFields()) {
    const nome = campo.getName();
    const tipo = campo.constructor.name;

    if (tipo === 'PDFTextField') {
      campos[nome] = campo.getText() || '';
    } else if (tipo === 'PDFCheckBox') {
      campos[nome] = campo.isChecked();
    }
    // PDFButton (campos de imagem, ex. foto do personagem) e outros tipos
    // nao tem valor de texto/checkbox util e sao ignorados.
  }

  return campos;
}

module.exports = { readPdfFields };
