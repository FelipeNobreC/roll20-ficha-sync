// test/cli.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'atualizar-ficha.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'ficha-exemplo.pdf');

test('--dry-run imprime o mapeamento sem tentar abrir navegador', () => {
  const saida = execFileSync('node', [CLI, FIXTURE, '--dry-run'], { encoding: 'utf8' });
  assert.match(saida, /attr_character_name \[text\] -> "Vau"/);
  assert.match(saida, /attr_class \[select\] -> "Fighter"/);
  assert.match(saida, /attr_strength \[text\] -> "18"/);
  assert.match(saida, /attr_atkname \(arma 1\) \[text\] -> "Espada longa"/);
});

test('reclama de forma clara quando o PDF nao existe', () => {
  assert.throws(() => {
    execFileSync('node', [CLI, '/caminho/inexistente.pdf', '--dry-run'], { encoding: 'utf8', stdio: 'pipe' });
  }, /ENOENT|não encontrado/);
});
