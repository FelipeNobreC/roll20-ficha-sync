#!/usr/bin/env node
const path = require('node:path');
const { readPdfFields } = require('./src/pdf-fields');
const { buildMapping } = require('./src/mapping');

function parseArgs(argv) {
  const args = { pdf: null, config: 'config.json', dryRun: false };
  const resto = [...argv];
  while (resto.length) {
    const atual = resto.shift();
    if (atual === '--config') {
      args.config = resto.shift();
    } else if (atual === '--dry-run') {
      args.dryRun = true;
    } else if (!args.pdf) {
      args.pdf = atual;
    } else {
      throw new Error(`Argumento inesperado: ${atual}`);
    }
  }
  if (!args.pdf) {
    throw new Error('Uso: node atualizar-ficha.js <pdf> [--config caminho] [--dry-run]');
  }
  return args;
}

function imprimirInstrucoes(instrucoes) {
  console.log('attrRoll20 -> valor (dry-run, nenhum navegador foi aberto)');
  for (const instrucao of instrucoes) {
    const linha = instrucao.linhaArma !== undefined ? ` (arma ${instrucao.linhaArma + 1})` : '';
    console.log(`  attr_${instrucao.attr}${linha} [${instrucao.tipo}] -> ${JSON.stringify(instrucao.valor)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfFields = await readPdfFields(args.pdf);
  const instrucoes = buildMapping(pdfFields);

  if (args.dryRun) {
    imprimirInstrucoes(instrucoes);
    return;
  }

  // Import tardio: so carrega o Playwright quando de fato vai abrir o navegador.
  const { loadConfig } = require('./src/config');
  const { atualizarFicha } = require('./src/roll20-updater');

  const config = loadConfig(path.resolve(args.config));
  const relatorio = await atualizarFicha(config, instrucoes);

  console.log(`Campos escritos: ${relatorio.escritos.length}`);
  console.log(`Campos pulados: ${relatorio.pulados.length}`);
  for (const pulado of relatorio.pulados) {
    console.log(`  - attr_${pulado.attr}${pulado.linhaArma !== undefined ? ` (arma ${pulado.linhaArma + 1})` : ''}: ${pulado.motivo}`);
  }
}

main().catch((erro) => {
  console.error('Erro:', erro.message);
  process.exit(1);
});
