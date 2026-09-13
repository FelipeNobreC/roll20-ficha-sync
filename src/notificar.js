const { spawn } = require('node:child_process');

// Notificacao de conclusao: um beep simples (funciona em qualquer
// terminal) mais, no Windows, uma janela de popup que fica visivel mesmo
// se a pessoa saiu do terminal pra fazer outra coisa. E so uma
// conveniencia — se o popup falhar por qualquer motivo (powershell
// bloqueado, sistema diferente, etc.) o script principal nao deve quebrar
// por causa disso.
function notificarConclusao(mensagem) {
  process.stdout.write('\x07');

  if (process.platform !== 'win32') return;

  const mensagemEscapada = mensagem.replace(/'/g, "''");
  const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${mensagemEscapada}', 'roll20-ficha-sync') | Out-Null`;

  try {
    const processo = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
      detached: true,
      stdio: 'ignore',
    });
    processo.unref();
  } catch {
    // notificacao e so uma conveniencia, uma falha aqui nao deve derrubar o script.
  }
}

module.exports = { notificarConclusao };
