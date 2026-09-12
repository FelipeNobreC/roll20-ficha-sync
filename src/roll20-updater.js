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

// ATENCAO: os seletores abaixo (`.repeating_attack .attack` e
// `.repeating_attack .repcontrol_add`), assim como os seletores de login em
// fazerLogin, sao uma tentativa de melhor esforco (best-effort) baseada na
// estrutura conhecida das secoes repetiveis da ficha "5th Edition OGL by
// Roll20" — a Roll20 substitui/gera o markup das secoes repetiveis em tempo
// de execucao, e as classes exatas usadas la nao puderam ser verificadas sem
// uma conta Roll20 ativa. Nao foram "chutados" outros seletores para
// substituir estes; se as armas nao aparecerem preenchidas na primeira
// execucao real, inspecionar o DOM ao vivo da ficha (aba de armas, secao
// repeating_attack) antes de mais nada.
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
    const CAMPOS_COM_TOGGLE = {
      attr_equipment: 'Inventory',
      attr_features_and_traits: 'FEATURES & TRAITS',
    };
    const toggle = CAMPOS_COM_TOGGLE[`attr_${instrucao.attr}`];
    const dica = toggle
      ? ` (verifique se a opcao "${toggle}" da ficha esta configurada como "Simple" — com "Compendium Compatible" esse campo nao existe no DOM)`
      : '';
    throw new Error(`campo attr_${instrucao.attr}${local} não encontrado no DOM da ficha${dica}`);
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
  // Usa o Google Chrome ja instalado na maquina em vez da build propria do
  // Chromium que o Playwright baixaria — evita precisar rodar
  // `npx playwright install chromium` e o download de ~150MB que isso exige.
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const escritos = [];
  const pulados = [];

  try {
    const page = await browser.newPage();
    await fazerLogin(page, config);
    await abrirFicha(page, config.characterUrl);

    const fichaFrame = page.frameLocator('iframe').first();

    const linhasDeArmaNecessarias = 1 + Math.max(-1, ...instrucoes.map((i) => (i.linhaArma ?? -1)));
    let criacaoDeLinhasFalhou = null;
    if (linhasDeArmaNecessarias > 0) {
      try {
        await garantirLinhasDeArma(page, fichaFrame, linhasDeArmaNecessarias);
      } catch (erro) {
        // Falha ao criar linhas de repeating_attack nao pode abortar o resto
        // da execucao: nenhuma falha de campo isolado tem permissao de zerar
        // o relatorio inteiro. Marcamos todas as instrucoes de arma como
        // puladas e seguimos com os demais campos normalmente.
        criacaoDeLinhasFalhou = erro;
      }
    }

    for (const instrucao of instrucoes) {
      if (criacaoDeLinhasFalhou && instrucao.linhaArma !== undefined) {
        pulados.push({
          ...instrucao,
          motivo: `nao foi possivel garantir as linhas de repeating_attack no Roll20: ${criacaoDeLinhasFalhou.message}`,
        });
        continue;
      }
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
