const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const CHROME_DEBUG_PORT = 9222;
const CHROME_PROFILE_DIR = path.join(os.homedir(), '.roll20-ficha-sync', 'chrome-profile');

// Procura o Chrome (preferido) ou o Edge (fallback — vem instalado por
// padrao no Windows, entao um amigo sem Chrome ainda consegue rodar) nos
// locais mais comuns de cada sistema operacional. Precisa do caminho do
// executavel de verdade (nao da pra usar so `channel: 'chrome'` do
// Playwright aqui) porque o navegador e lancado por fora do Playwright via
// `child_process.spawn`, pra nao herdar a flag --enable-automation que faz
// a Cloudflare bloquear o login (ver comentario em conectarChrome).
function localizarNavegador() {
  const pf = process.env['PROGRAMFILES'] || 'C:/Program Files';
  const pfx86 = process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)';
  const localAppData = process.env['LOCALAPPDATA'] || '';

  const candidatos = [
    // Windows - Chrome
    path.join(pf, 'Google/Chrome/Application/chrome.exe'),
    path.join(pfx86, 'Google/Chrome/Application/chrome.exe'),
    localAppData && path.join(localAppData, 'Google/Chrome/Application/chrome.exe'),
    // Windows - Edge (vem instalado por padrao no Windows 10/11)
    path.join(pfx86, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);

  const encontrado = candidatos.find((caminho) => fs.existsSync(caminho));
  if (!encontrado) {
    throw new Error(
      'Nao foi possivel encontrar o Google Chrome ou o Microsoft Edge instalado nesta maquina. ' +
        'Instale um dos dois, ou edite a lista de caminhos em localizarNavegador() (src/roll20-updater.js).'
    );
  }
  return encontrado;
}

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
    localizarNavegador(),
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

// attr_equipment, attr_features_and_traits e attr_other_proficiencies_and_
// languages so existem no DOM quando a ficha esta configurada no modo
// "Simple" (em vez do padrao "Compendium Compatible", que usa secoes
// repetiveis estruturadas em vez de um campo de texto livre). Esses 3
// selects ficam na aba "options" (engrenagem) da propria ficha. Testado ao
// vivo: `locator.selectOption()` do Playwright as vezes nao gruda o valor
// (o campo volta pro valor antigo sozinho) — setar o `.value` e disparar
// um evento "change" manualmente e o jeito que se mostrou confiavel.
const CAMPOS_MODO_SIMPLES = ['attr_simpleinventory', 'attr_simpletraits', 'attr_simpleproficencies'];

async function garantirModoSimples(page, fichaFrame) {
  await fichaFrame.locator('input[name="attr_tab"][value="options"]').first().evaluate((el) => el.click());
  await page.waitForTimeout(500);

  for (const nome of CAMPOS_MODO_SIMPLES) {
    const select = fichaFrame.locator(`select[name="${nome}"]`).first();
    const valorAtual = await select.inputValue();
    if (valorAtual !== 'simple') {
      await select.evaluate((el) => {
        el.value = 'simple';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForTimeout(500);
    }
  }

  await fichaFrame.locator('input[name="attr_tab"][value="core"]').first().evaluate((el) => el.click());
  await page.waitForTimeout(500);
}

// Testado ao vivo: `.repeating_attack .attack` e `.repeating_attack
// .repcontrol_add` (do HTML estatico pesquisado) nao existem no DOM real —
// a Roll20 gera a secao repetivel em runtime como
// `.repcontainer[data-groupname="repeating_attack"]` (ha ate 3 copias na
// pagina, so uma visivel) com as linhas em `.repitem` dentro dela, e o
// botao de adicionar num `.repcontrol` IRMAO do repcontainer (nao filho):
// `<div class="repcontrol" data-groupname="repeating_attack">
//    <button class="repcontrol_edit">Modify</button>
//    <button class="repcontrol_add">+Add</button></div>`
const SELETOR_REPCONTAINER_ARMA = '.repcontainer[data-groupname="repeating_attack"]:visible';

// Testado ao vivo: logo depois que `attr_character_name` fica visivel (o
// sinal que `abrirFicha` usa pra saber que a ficha "carregou"), a secao de
// armas ainda pode estar com ZERO linhas — os dados das linhas existentes
// (vindos do servidor) chegam de forma assincrona e mais devagar que o
// resto da ficha. Contar as linhas nesse momento da uma contagem errada
// (baixa demais), o que desalinha toda a logica de "quantas linhas faltam
// adicionar" e de indice de linha pra cada arma. Espera a contagem parar
// de mudar por duas leituras seguidas antes de confiar nela.
async function esperarLinhasDeArmaEstabilizar(fichaFrame) {
  const linhaLocator = fichaFrame.locator(SELETOR_REPCONTAINER_ARMA).locator('.repitem');
  let anterior = -1;
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const atual = await linhaLocator.count();
    if (atual === anterior) return atual;
    anterior = atual;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return anterior;
}

async function garantirLinhasDeArma(page, fichaFrame, quantidade) {
  const linhaLocator = fichaFrame.locator(SELETOR_REPCONTAINER_ARMA).locator('.repitem');
  const atuais = await esperarLinhasDeArmaEstabilizar(fichaFrame);
  const botaoAdicionar = fichaFrame.locator(`${SELETOR_REPCONTAINER_ARMA} + .repcontrol .repcontrol_add`);
  for (let i = atuais; i < quantidade; i++) {
    await botaoAdicionar.evaluate((el) => el.click());
    // Testado ao vivo: 300ms fixo nao bastava pra linha nova terminar de
    // montar (o checkbox attr_options-flag dela demorava mais que isso pra
    // aparecer, o que travava tudo depois em timeout). Espera o proprio
    // checkbox da nova linha existir antes de seguir.
    await linhaLocator.nth(i).locator('input[name="attr_options-flag"]').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
  }
}

// Testado ao vivo: a ordem das linhas dentro de `.repcontainer` NAO e
// estavel durante uma execucao — a secao repetitiva pode reordenar
// sozinha entre uma escrita de campo e outra. Confiar so no indice
// posicional (linhaArma) fez campos de armas diferentes se misturarem
// (o dano de uma arma foi escrito na linha de outra). Localizar a linha
// pelo NOME atual da arma (attr_atkname) e muito mais confiavel; o indice
// so serve de ultimo recurso, para o primeiro campo (atkname) de uma
// arma que ainda nao tem nome nenhum escrito (linha nova, recem-criada).
async function localizarLinhaDaArma(fichaFrame, instrucao) {
  const linhas = fichaFrame.locator(SELETOR_REPCONTAINER_ARMA).locator('.repitem');
  const total = await linhas.count();
  const alvo = instrucao.nomeArma.trim().toLowerCase();
  for (let i = 0; i < total; i++) {
    const nomeAtual = await linhas
      .nth(i)
      .locator('[name="attr_atkname"]')
      .first()
      .evaluate((el) => (el.value !== undefined ? el.value : el.textContent))
      .catch(() => '');
    if (String(nomeAtual).trim().toLowerCase() === alvo) {
      return linhas.nth(i);
    }
  }
  return linhas.nth(instrucao.linhaArma);
}

// Cada linha de arma renderiza por padrao em "modo exibicao" (um <span
// name="attr_atkname"> dentro de um botao de rolar, nao um <input>) e so
// fica editavel depois de clicar no checkbox `attr_options-flag` daquela
// linha especifica (o mesmo name se repete em toda linha — tem que ser
// escopado dentro do `.repitem` certo, nunca `:first()` da pagina toda).
// Testado ao vivo: a relacao entre o estado "checked" desse checkbox e
// qual dos dois modos (span/input) fica visivel NAO e um toggle previsivel
// — em execucoes diferentes, tanto marcar quanto desmarcar revelou o
// <input>. Em vez de tentar adivinhar a direcao certa a partir do
// `checked` atual, verifica o RESULTADO de verdade (attr_atkname virou
// <input>?) depois de cada clique, e clica de novo se ainda nao virou —
// no maximo 2 cliques (as duas direcoes possiveis do toggle).
async function garantirLinhaArmaEditavel(repitem) {
  const nomeCampo = repitem.locator('[name="attr_atkname"]:visible').first();
  const flag = repitem.locator('input[name="attr_options-flag"]').first();

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const tag = await nomeCampo.evaluate((el) => el.tagName).catch(() => null);
    if (tag === 'INPUT') return;
    await flag.evaluate((el) => el.click());
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}

// Testado ao vivo: varios campos so aparecem no DOM depois de uma
// interacao especifica na ficha:
// - age/height/weight/eyes/skin/hair/allies_and_organizations/
//   character_backstory/treasure ficam atras da aba interna "BIO" da
//   propria ficha (radio <input name="attr_tab" value="bio">, diferente
//   do link externo "Biografia e informacoes" do Roll20, que abre um
//   modal completamente à parte, sem relacao com esses campos).
// - background/alignment/experience ficam num painel "display" que so
//   aparece quando o checkbox <input name="attr_options-class-selection">
//   esta DESMARCADO — quando marcado (padrao), o painel "options" mostra
//   os campos de classe/subclasse/nivel no lugar, escondendo esses.
// Clicar via `.evaluate(el => el.click())` diretamente no elemento real
// (radio/checkbox), nao no <span> visual ao lado — cliques do Playwright
// no <span> sao interceptados por outro elemento sobreposto (framework
// Vue por baixo) e nao mudam o estado.
const ABA_POR_CAMPO = {
  age: 'bio',
  height: 'bio',
  weight: 'bio',
  eyes: 'bio',
  skin: 'bio',
  hair: 'bio',
  allies_and_organizations: 'bio',
  character_backstory: 'bio',
  treasure: 'bio',
};
const CAMPOS_QUE_PRECISAM_OPTIONS_CLASSE_DESMARCADO = new Set(['background', 'alignment', 'experience']);

async function ajustarEstadoDaFicha(page, fichaFrame, estadoAtual, instrucao) {
  const abaNecessaria = ABA_POR_CAMPO[instrucao.attr] || 'core';
  if (estadoAtual.aba !== abaNecessaria) {
    await fichaFrame.locator(`input[name="attr_tab"][value="${abaNecessaria}"]`).first().evaluate((el) => el.click());
    estadoAtual.aba = abaNecessaria;
    await page.waitForTimeout(500);
  }

  const precisaDesmarcado = CAMPOS_QUE_PRECISAM_OPTIONS_CLASSE_DESMARCADO.has(instrucao.attr);
  const marcadoNecessario = !precisaDesmarcado;
  if (estadoAtual.optionsClasseMarcado !== marcadoNecessario) {
    await fichaFrame
      .locator('input[name="attr_options-class-selection"]:visible')
      .first()
      .evaluate((el) => el.click());
    estadoAtual.optionsClasseMarcado = marcadoNecessario;
    await page.waitForTimeout(500);
  }
}

async function escreverCampo(fichaFrame, instrucao) {
  // ":visible" filtra as copias escondidas do campo (ver comentario em
  // abrirFicha) — sem isso o Playwright pode escrever numa copia da ficha
  // que nao esta sendo mostrada (ou, pior, num <span> de exibicao em vez
  // do <input> editavel de verdade).
  let linhaDaArma = null;
  if (instrucao.linhaArma !== undefined) {
    linhaDaArma = await localizarLinhaDaArma(fichaFrame, instrucao);
    await garantirLinhaArmaEditavel(linhaDaArma);
  }

  const seletor = `[name="attr_${instrucao.attr}"]:visible`;
  const localizador = linhaDaArma ? linhaDaArma.locator(seletor).first() : fichaFrame.locator(seletor).first();

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
    // Testado ao vivo: localizador.setChecked() usa clique com deteccao de
    // sobreposicao do Playwright, que trava em varios checkboxes desta
    // ficha (um elemento vizinho "intercepta" o clique na posicao exata,
    // mesmo o alvo estando visivel/habilitado) — mesma familia de problema
    // ja visto nas abas. Ler/alternar o estado direto via JS, sem passar
    // pela deteccao de clique do Playwright, evita isso.
    const valorAlvo = Boolean(instrucao.valor);
    const marcadoAtual = await localizador.evaluate((el) => el.checked);
    if (marcadoAtual !== valorAlvo) {
      await localizador.evaluate((el) => el.click());
    }
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

    try {
      await garantirModoSimples(page, fichaFrame);
    } catch {
      // Se isso falhar, os campos que dependem do modo Simple (equipment,
      // features_and_traits, other_proficiencies_and_languages) vao cair
      // no aviso generico de "campo nao encontrado" mais abaixo, que ja
      // explica que a ficha precisa estar em modo Simple — degrada sozinho
      // pro comportamento de antes dessa automacao existir.
    }

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

    // Le o estado real em vez de assumir um valor fixo: o checkbox
    // "options-class-selection" preserva seu estado entre execucoes (a
    // Roll20 guarda essa preferencia), entao supor que ele sempre comeca
    // marcado faz o codigo desmarcar quando na verdade precisava marcar
    // (e vice-versa) — bug real, ja aconteceu ao vivo.
    const optionsClasseMarcadoInicial = await fichaFrame
      .locator('input[name="attr_options-class-selection"]:visible')
      .first()
      .evaluate((el) => el.checked);
    const estadoDaFicha = { aba: 'core', optionsClasseMarcado: optionsClasseMarcadoInicial };
    for (const instrucao of instrucoes) {
      if (criacaoDeLinhasFalhou && instrucao.linhaArma !== undefined) {
        pulados.push({
          ...instrucao,
          motivo: `nao foi possivel garantir as linhas de repeating_attack no Roll20: ${criacaoDeLinhasFalhou.message}`,
        });
        continue;
      }
      try {
        await ajustarEstadoDaFicha(page, fichaFrame, estadoDaFicha, instrucao);
        await escreverCampo(fichaFrame, instrucao);
        escritos.push(instrucao);
      } catch (erro) {
        pulados.push({ ...instrucao, motivo: erro.message });
      }
    }

    // Testado ao vivo: campos de uma linha de arma que ficam com o
    // "options-flag" da linha ainda desmarcado (modo edicao aberto) quando
    // a pagina fecha as vezes NAO persistem no servidor, mesmo a leitura
    // imediata apos o fill() confirmando o valor certo — o autosave dessa
    // secao repetitiva parece precisar da linha ser recolhida de volta
    // (checkbox marcado de novo) pra realmente disparar. Recolhe cada
    // linha de arma usada antes de fechar a pagina, best-effort (uma
    // falha aqui nao desfaz nada que ja foi escrito).
    if (linhasDeArmaNecessarias > 0 && !criacaoDeLinhasFalhou) {
      const todasAsLinhas = fichaFrame.locator(SELETOR_REPCONTAINER_ARMA).locator('.repitem');
      const totalLinhas = await todasAsLinhas.count().catch(() => 0);
      // Recolhe QUALQUER linha que tenha ficado aberta (nao so as que este
      // programa tocou) — mais simples e mais robusto do que rastrear por
      // indice ou nome, ja que a lista pode ter reordenado durante a
      // execucao.
      for (let i = 0; i < totalLinhas; i++) {
        try {
          const repitem = todasAsLinhas.nth(i);
          const nomeCampo = repitem.locator('[name="attr_atkname"]:visible').first();
          const tag = await nomeCampo.evaluate((el) => el.tagName);
          if (tag === 'INPUT') {
            await repitem.locator('input[name="attr_options-flag"]').first().evaluate((el) => el.click());
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        } catch {
          // best-effort: se nao der pra recolher, os campos ja escritos
          // continuam valendo a tentativa, so corre o risco de nao
          // persistir por causa desse detalhe especifico.
        }
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
