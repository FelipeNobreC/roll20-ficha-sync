// test/config.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/config');

function escreverConfigTemp(conteudo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roll20-config-'));
  const caminho = path.join(dir, 'config.json');
  fs.writeFileSync(caminho, JSON.stringify(conteudo));
  return caminho;
}

test('carrega um config.json valido', () => {
  const caminho = escreverConfigTemp({
    email: 'a@b.com',
    password: 'segredo',
    characterUrl: 'https://app.roll20.net/campaigns/characters/123',
  });
  const config = loadConfig(caminho);
  assert.equal(config.email, 'a@b.com');
  assert.equal(config.characterUrl, 'https://app.roll20.net/campaigns/characters/123');
});

test('rejeita arquivo inexistente', () => {
  assert.throws(() => loadConfig('/caminho/que/nao/existe.json'), /não encontrado/);
});

test('rejeita config sem characterUrl', () => {
  const caminho = escreverConfigTemp({ email: 'a@b.com', password: 'segredo' });
  assert.throws(() => loadConfig(caminho), /characterUrl/);
});
