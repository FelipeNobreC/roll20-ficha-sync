const fs = require('node:fs');

function loadConfig(caminho) {
  if (!fs.existsSync(caminho)) {
    throw new Error(
      `Arquivo de config não encontrado: ${caminho}. Copie config.example.json para config.json e preencha.`
    );
  }
  const config = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  for (const campo of ['email', 'password', 'characterUrl']) {
    if (!config[campo]) {
      throw new Error(`Config inválida: campo "${campo}" ausente em ${caminho}`);
    }
  }
  return config;
}

module.exports = { loadConfig };
