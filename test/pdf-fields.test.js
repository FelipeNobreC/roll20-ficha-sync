// test/pdf-fields.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readPdfFields } = require('../src/pdf-fields');

const FIXTURE = path.join(__dirname, 'fixtures', 'ficha-exemplo.pdf');

test('extrai campos de texto conhecidos do PDF de exemplo', async () => {
  const campos = await readPdfFields(FIXTURE);
  assert.equal(campos['CharacterName'], 'Vau');
  assert.equal(campos['STR'], '18');
  assert.equal(campos['ClassLevel'], 'Guerreiro 4 - Guarda de Brecha');
  assert.equal(campos['HDTotal'], '4d10');
});

test('extrai checkboxes conhecidos do PDF de exemplo', async () => {
  const campos = await readPdfFields(FIXTURE);
  assert.equal(campos['Check Box 11'], true); // salvaguarda de Forca, marcada
  assert.equal(campos['Check Box 18'], false); // salvaguarda de Destreza, nao marcada
});

test('ignora campos de botao de imagem e mantem os demais 332 campos', async () => {
  const campos = await readPdfFields(FIXTURE);
  assert.equal(Object.keys(campos).length, 332);
});
