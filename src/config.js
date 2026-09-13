const fs = require('node:fs');

function loadConfig(caminho) {
  if (!fs.existsSync(caminho)) {
    throw new Error(
      `Arquivo de config não encontrado: ${caminho}. Copie config.example.json para config.json e preencha.`
    );
  }
  const config = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  // email/password nao sao mais exigidos: o login na Roll20 e sempre
  // manual (a Cloudflare bloqueia login automatizado), entao o script
  // nunca le essas credenciais.
  if (!config.characterUrl) {
    throw new Error(`Config inválida: campo "characterUrl" ausente em ${caminho}`);
  }
  return config;
}

module.exports = { loadConfig };
