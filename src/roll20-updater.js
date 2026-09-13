const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const CHROME_DEBUG_PORT = 9222;
const CHROME_PROFILE_DIR = path.join(os.homedir(), '.roll20-ficha-sync', 'chrome-profile');
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Testado ao vivo: app.roll20.net fica atras de um desafio Cloudflare
// ("Executando verificacao de seguranca") que trava a pagina ANTES do
// formulario de login sequer aparecer, e nunca passa quando
// `navigator.webdriver` acusa automacao — verdadeiro em qualquer navegador
// que o Playwright lanca diretamente (chromium.launch), mesmo usando o
// Chrome de verdade, porque o Chrome so liga essa flag com a opcao
// --enable-automation que o Playwright sempre adiciona ao lancar. A saida
// e lancar o Chrome por fora do Playwright (sem essa flag) com uma porta de
// depuracao remota aberta, e so entao CONECTAR o Playwright nele via CDP —
// nesse modo `navigator.webdriver` fica false e a Cloudflare libera a
// pagina normalmente. O perfil fica salvo entre execucoes para nao pedir
// login toda vez (o cookie de sessao/clearance da Cloudflare persiste).
async function conectarChrome() {
  try {
    return await chromium.connectOverCDP(`http://localhost:${CHROME_DEBUG_PORT}`);
  } catch {
    // nenhum Chrome de depuracao rodando ainda nessa porta; lanca um novo
  }

  fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
      `--user-data-dir=${CHROME_PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
    { detached: true, stdio: 'ignore' }
  );
  chrome.unref();

  for (let tentativa = 0; tentativa < 20; tentativa++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      return await chromium.connectOverCDP(`http://localhost:${CHROME_DEBUG_PORT}`);
    } catch {
      // Chrome ainda subindo, tenta de novo
    }
  }
  throw new Error('Nao foi possivel conectar ao Chrome de automacao apos varias tentativas.');
}

async function fazerLogin(page) {
  await page.goto('https://app.roll20.net/sessions/new', { waitUntil: 'domcontentloaded' });
  if (!page.url().includes('/sessions/new')) {
    return; // ja estava logado (perfil persistente reaproveitado de uma execucao anterior)
  }
  console.log('Faca login manualmente na janela do Chrome que abriu (a Roll20 bloqueia login automatizado). Aguardando ate 5 minutos...');
  await page.waitForURL((url) => !url.pathname.startsWith('/sessions/new'), { timeout: 300000 });
}

// Testado ao vivo: a pagina do personagem carrega varios iframes alem da
// ficha em si (pixel de rastreamento do doubleclick, widgets do Stripe) —
// pegar "o primeiro iframe da pagina" pega um desses por acidente, nao a
// ficha. A ficha de verdade e servida de
// storage.googleapis.com/.../legacy-sheets/index.html?charsheettype=ogl5e
// (o "ogl5e" confirma que e a ficha certa). Alem disso a ficha e uma SPA
// que demora ~10-15s pra montar o formulario dentro do iframe, entao esperar
// so o <iframe> aparecer no DOM nao basta — e preciso esperar um campo de
// verdade (attr_character_name) aparecer dentro dele.
async function abrirFicha(page, characterUrl) {
  await page.goto(characterUrl, { waitUntil: 'domcontentloaded' });
  const acessoNegado = page.locator('text=/not authorized|acesso negado|404/i');
  if (await acessoNegado.count()) {
    throw new Error(`Nao foi possivel abrir a ficha em ${characterUrl} (URL invalida ou sem permissao).`);
  }
  const fichaFrame = page.frameLocator('iframe[src*="legacy-sheets"]');
  // A ficha atual (redesenhada pela Roll20 depois do HTML estatico
  // pesquisado) renderiza ate 10 copias escondidas do mesmo campo (visoes
  // diferentes: publico/mestre, abas base/bio/magias) — so a instancia
  // visivel no momento e a editavel de verdade.
  await fichaFrame.locator('[name="attr_character_name"]:visible').first().waitFor({ timeout: 60000 });
  return fichaFrame;
}

// CONFIRMADO AO VIVO QUE ESTA FUNCAO NAO FUNCIONA na ficha redesenhada
// atual: `.repeating_attack .attack` e `.repeating_attack .repcontrol_add`
// nao existem mais no DOM real (0 matches, sempre da timeout). A estrutura
// real observada e `.repcontainer[data-groupname="attack"] > .repitem >
// .attack`, com o botao de adicionar em outro lugar (nao localizado ainda).
// Alem disso o campo attr_atkname visivel por padrao e um <span> de
// "modo exibicao" dentro de um <button>, nao o <input> editavel — a linha
// so fica editavel apos expandir (mecanismo nao mapeado). Ate isso ser
// resolvido, escrever armas sempre vai falhar aqui — o erro cai
// corretamente em `pulados` (nenhum campo de arma trava o resto da
// sincronizacao), mas nao escreve nada. Retomar a partir da cadeia de pais
// documentada: SPAN > BUTTON.btn > DIV.display > DIV.attack > DIV.repitem
// > DIV.repcontainer.ui-sortable.
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
  // ":visible" filtra as copias escondidas do campo (ver comentario em
  // abrirFicha) — sem isso o Playwright pode escrever numa copia da ficha
  // que nao esta sendo mostrada (ou, pior, num <span> de exibicao em vez
  // do <input> editavel de verdade).
  const seletor = `[name="attr_${instrucao.attr}"]:visible`;
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

  // Testado ao vivo: escrever ~90 campos em sequencia sem pausa faz alguns
  // autosaves da Roll20 se perderem (o campo aparenta ter sido preenchido,
  // mas o valor nao persiste no servidor) — o mesmo campo preenchido
  // isoladamente, com uma pausa depois, sempre persiste. Uma pausa curta
  // apos cada campo da tempo do autosave processar antes do proximo.
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function atualizarFicha(config, instrucoes) {
  const browser = await conectarChrome();
  const escritos = [];
  const pulados = [];
  let page;

  try {
    const context = browser.contexts()[0] || (await browser.newContext());
    page = await context.newPage();
    await fazerLogin(page);
    const fichaFrame = await abrirFicha(page, config.characterUrl);

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
    // Fecha so a aba que abrimos, nao o Chrome inteiro — e o navegador
    // persistente do usuario (perfil salvo entre execucoes), nao um
    // navegador descartavel criado so para este comando.
    if (page) await page.close();
    await browser.close();
  }

  return { escritos, pulados };
}

module.exports = { atualizarFicha };
