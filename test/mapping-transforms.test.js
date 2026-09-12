// test/mapping-transforms.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseClassLevel,
  classeParaRoll20,
  parseInspiracao,
  parseBonusAtaque,
  parseDano,
} = require('../src/mapping-transforms');

test('parseClassLevel separa classe, nivel e subclasse', () => {
  assert.deepEqual(
    parseClassLevel('Guerreiro 4 - Guarda de Brecha'),
    { classePt: 'Guerreiro', nivel: 4, subclasse: 'Guarda de Brecha' }
  );
});

test('parseClassLevel funciona sem subclasse', () => {
  assert.deepEqual(
    parseClassLevel('Guerreiro 2'),
    { classePt: 'Guerreiro', nivel: 2, subclasse: undefined }
  );
});

test('parseClassLevel rejeita formato inesperado', () => {
  assert.throws(() => parseClassLevel('sem nivel nenhum'));
});

test('classeParaRoll20 traduz nomes de classe PT-BR para o valor em ingles do Roll20', () => {
  assert.equal(classeParaRoll20('Guerreiro'), 'Fighter');
  assert.equal(classeParaRoll20('Bárbaro'), 'Barbarian');
  assert.equal(classeParaRoll20('Mago'), 'Wizard');
});

test('classeParaRoll20 rejeita classe desconhecida', () => {
  assert.throws(() => classeParaRoll20('Classe Inventada'));
});

test('parseInspiracao considera texto nao vazio como verdadeiro', () => {
  assert.equal(parseInspiracao(''), false);
  assert.equal(parseInspiracao('   '), false);
  assert.equal(parseInspiracao('x'), true);
});

test('parseBonusAtaque converte string com sinal em numero', () => {
  assert.equal(parseBonusAtaque('+6'), 6);
  assert.equal(parseBonusAtaque('-1'), -1);
  assert.equal(parseBonusAtaque('0'), 0);
});

test('parseDano separa dado, bonus e tipo, traduzindo abreviacoes conhecidas', () => {
  assert.deepEqual(
    parseDano('1d8+6 cort.'),
    { dado: '1d8', bonus: 6, tipo: 'Slashing', tipoReconhecido: true }
  );
  assert.deepEqual(
    parseDano('1d4+4 perf.'),
    { dado: '1d4', bonus: 4, tipo: 'Piercing', tipoReconhecido: true }
  );
});

test('parseDano mantem o texto original quando o tipo de dano nao e reconhecido', () => {
  const resultado = parseDano('1d10 radiante');
  assert.equal(resultado.dado, '1d10');
  assert.equal(resultado.bonus, 0);
  assert.equal(resultado.tipo, 'radiante');
  assert.equal(resultado.tipoReconhecido, false);
});
