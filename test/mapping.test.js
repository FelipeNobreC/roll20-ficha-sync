// test/mapping.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readPdfFields } = require('../src/pdf-fields');
const { buildMapping } = require('../src/mapping');

const FIXTURE = path.join(__dirname, 'fixtures', 'ficha-exemplo.pdf');

function encontrar(instrucoes, attr, linhaArma) {
  return instrucoes.find(
    (i) => i.attr === attr && i.linhaArma === linhaArma
  );
}

test('mapeia atributos, classe e nivel do PDF de exemplo', async () => {
  const campos = await readPdfFields(FIXTURE);
  const instrucoes = buildMapping(campos);

  assert.deepEqual(encontrar(instrucoes, 'strength'), { attr: 'strength', tipo: 'text', valor: '18' });
  assert.deepEqual(encontrar(instrucoes, 'class'), { attr: 'class', tipo: 'select', valor: 'Fighter' });
  assert.deepEqual(encontrar(instrucoes, 'base_level'), { attr: 'base_level', tipo: 'text', valor: '4' });
  assert.deepEqual(encontrar(instrucoes, 'subclass'), { attr: 'subclass', tipo: 'text', valor: 'Guarda de Brecha' });
});

test('mapeia proficiencia de salvaguarda a partir dos checkboxes do PDF', async () => {
  const campos = await readPdfFields(FIXTURE);
  const instrucoes = buildMapping(campos);

  assert.deepEqual(encontrar(instrucoes, 'strength_save_prof'), { attr: 'strength_save_prof', tipo: 'checkbox', valor: true });
  assert.deepEqual(encontrar(instrucoes, 'dexterity_save_prof'), { attr: 'dexterity_save_prof', tipo: 'checkbox', valor: false });
  assert.deepEqual(encontrar(instrucoes, 'constitution_save_prof'), { attr: 'constitution_save_prof', tipo: 'checkbox', valor: true });
});

test('mapeia as 3 armas do PDF de exemplo para linhas de repeating_attack', async () => {
  const campos = await readPdfFields(FIXTURE);
  const instrucoes = buildMapping(campos);

  assert.deepEqual(encontrar(instrucoes, 'atkname', 0), { attr: 'atkname', tipo: 'text', valor: 'Espada longa', linhaArma: 0 });
  assert.deepEqual(encontrar(instrucoes, 'atkmod', 0), { attr: 'atkmod', tipo: 'text', valor: '6', linhaArma: 0 });
  assert.deepEqual(encontrar(instrucoes, 'dmgbase', 0), { attr: 'dmgbase', tipo: 'text', valor: '1d8', linhaArma: 0 });
  assert.deepEqual(encontrar(instrucoes, 'dmgmod', 0), { attr: 'dmgmod', tipo: 'text', valor: '6', linhaArma: 0 });
  assert.deepEqual(encontrar(instrucoes, 'dmgtype', 0), { attr: 'dmgtype', tipo: 'text', valor: 'Slashing', linhaArma: 0 });

  assert.deepEqual(encontrar(instrucoes, 'atkname', 2), { attr: 'atkname', tipo: 'text', valor: 'Estaca', linhaArma: 2 });
});

test('nao gera instrucoes de spellcasting', async () => {
  const campos = await readPdfFields(FIXTURE);
  const instrucoes = buildMapping(campos);
  const attrsDeSpell = instrucoes.filter((i) => i.attr.includes('spell'));
  assert.deepEqual(attrsDeSpell, []);
});
