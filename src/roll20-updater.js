const { chromium } = require('playwright');

async function fazerLogin(page, config) {
  await page.goto('https://app.roll20.net/sessions/new', { waitUntil: 'domcontentloaded' });

  // app.roll20.net fica atras de um desafio Cloudflare; com headless:false
  // a pessoa consegue resolver manualmente se aparecer um captcha aqui.
  await page.locator('input[name="email"]').fill(config.email);
  await page.locator('input[name="password"]').fill(config.password);
  await page.locator('button[type="submit"]').click();

  await page.waitForLoadState('networkidle');

  const erroLogin = page.locator('text=/senha (incorreta|invalida)|invalid.*password/i');
  if (await erroLogin.count()) {
    throw new Error('Login falhou: e-mail ou senha incorretos (ou a Roll20 pediu verificacao extra).');
  }

  const captcha = page.locator('iframe[src*="captcha" i], iframe[src*="turnstile" i], [class*="captcha" i], [class*="turnstile" i]');
  if (await captcha.count()) {
    throw new Error('Login falhou: a Roll20 apresentou um desafio de captcha (Cloudflare Turnstile ou similar) que precisa ser resolvido manualmente.');
  }

  const verificacao = page.locator('text=/verification|two-factor|2fa/i');
  if (await verificacao.count()) {
    throw new Error('Login falhou: a Roll20 pediu verificacao adicional (2FA/codigo de verificacao) que precisa ser resolvida manualmente.');
  }
}

async function abrirFicha(page, characterUrl) {
  await page.goto(characterUrl, { waitUntil: 'domcontentloaded' });
  const acessoNegado = page.locator('text=/not authorized|acesso negado|404/i');
  if (await acessoNegado.count()) {
    throw new Error(`Nao foi possivel abrir a ficha em ${characterUrl} (URL invalida ou sem permissao).`);
  }
  await page.waitForSelector('iframe');
}

async function garantirLinhasDeArma(page, fichaFrame, quantidade) {
  const linhaLocator = fichaFrame.locator('.repeating_attack .attack');
  const atuais = await linhaLocator.count();
  const botaoAdicionar = fichaFrame.locator('.repeating_attack').locator('.repcontrol_add').first();
  for (let i = atuais; i < quantidade; i++) {
    await botaoAdicionar.click();
    await page.waitForTimeout(300); // Roll20 injeta a linha nova de forma assincrona
  }
}

async function escreverCampo(fichaFrame, instrucao) {
  const seletor = `[name="attr_${instrucao.attr}"]`;
  const localizador =
    instrucao.linhaArma !== undefined
      ? fichaFrame.locator('.repeating_attack .attack').nth(instrucao.linhaArma).locator(seletor)
      : fichaFrame.locator(seletor).first();

  if ((await localizador.count()) === 0) {
    const local = instrucao.linhaArma !== undefined ? ` (arma ${instrucao.linhaArma + 1})` : '';
    throw new Error(`campo attr_${instrucao.attr}${local} não encontrado no DOM da ficha`);
  }

  if (instrucao.tipo === 'text') {
    await localizador.fill(String(instrucao.valor));
    await localizador.blur(); // Roll20 só salva com autosave no blur
  } else if (instrucao.tipo === 'checkbox') {
    await localizador.setChecked(Boolean(instrucao.valor));
  } else if (instrucao.tipo === 'select') {
    await localizador.selectOption({ value: String(instrucao.valor) });
  } else {
    throw new Error(`tipo de instrução desconhecido: ${instrucao.tipo}`);
  }
}

async function atualizarFicha(config, instrucoes) {
  const browser = await chromium.launch({ headless: false });
  const escritos = [];
  const pulados = [];

  try {
    const page = await browser.newPage();
    await fazerLogin(page, config);
    await abrirFicha(page, config.characterUrl);

    const fichaFrame = page.frameLocator('iframe').first();

    const linhasDeArmaNecessarias = 1 + Math.max(-1, ...instrucoes.map((i) => (i.linhaArma ?? -1)));
    if (linhasDeArmaNecessarias > 0) {
      await garantirLinhasDeArma(page, fichaFrame, linhasDeArmaNecessarias);
    }

    for (const instrucao of instrucoes) {
      try {
        await escreverCampo(fichaFrame, instrucao);
        escritos.push(instrucao);
      } catch (erro) {
        pulados.push({ ...instrucao, motivo: erro.message });
      }
    }
  } finally {
    await browser.close();
  }

  return { escritos, pulados };
}

module.exports = { atualizarFicha };
