# Roll20 Ficha Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI (`atualizar-ficha.js`) that reads a filled WotC D&D 5e
PDF character sheet and writes the matching values into an existing
character sheet on Roll20 ("5th Edition OGL by Roll20"), via browser
automation, without touching the Roll20 API.

**Architecture:** Three pure/testable layers (`pdf-fields.js` extracts a
flat `{campo: valor}` dict from the PDF; `mapping-transforms.js` + `mapping.js`
turn that dict into a declarative list of Roll20 write-instructions; `config.js`
loads local credentials) feed a fourth, not-unit-testable layer
(`roll20-updater.js`, Playwright) that logs into Roll20 and applies the
instructions to the character sheet's iframe DOM. `atualizar-ficha.js` wires
them together and supports `--dry-run` to preview the instruction list with
zero browser interaction.

**Tech Stack:** Node.js (CommonJS, built-in `node:test` runner — no extra
test framework needed), `pdf-lib` (AcroForm reading), `playwright`
(browser automation, Chromium).

**Spec:** [docs/superpowers/specs/2026-09-12-roll20-ficha-sync-design.md](../specs/2026-09-12-roll20-ficha-sync-design.md)
**Roll20 attribute reference (researched for this plan):** [docs/roll20-5e-ogl-sheet-attrs.md](../../roll20-5e-ogl-sheet-attrs.md)

## Global Constraints

- Node.js + Playwright + pdf-lib only (per spec's Stack section) — no other
  browser-automation or PDF library.
- `config.json` is never committed (`.gitignore`); a `config.example.json`
  ships instead.
- The script only edits an existing Roll20 character — never triggers the
  Charactermancer, never creates a character.
- No field failure may abort the whole run — every per-field write is
  wrapped so one missing/unexpected field becomes a warning in the final
  report, not a crash (per spec's "Tratamento de erros").
- `--dry-run` must never open a browser.
- Spell-casting fields are out of scope (non-objetivo v1) — nothing in
  `mapping.js` may reference the ~250 spell fields.
- Roll20 `attr_*` names used anywhere in `mapping.js` must come from
  [docs/roll20-5e-ogl-sheet-attrs.md](../../roll20-5e-ogl-sheet-attrs.md)
  (already verified against the sheet's public source), never guessed.

---

## Contexto adicional descoberto durante o planejamento

Estas descobertas não estavam no spec original e mudam detalhes de
implementação (documentadas com mais detalhe em
`docs/roll20-5e-ogl-sheet-attrs.md`):

1. **A ficha "5th Edition OGL by Roll20" no repositório
   `Roll20/roll20-character-sheets` fica na pasta `DD5thEditionLegacy/`**
   (arquivo `5th Edition Legacy.html`) — não em `DnD_5e/` (ficha antiga e
   diferente, comunitária) nem em `Redsky/` (ficha de outro jogo). Isso foi
   confirmado comparando as classes reais de D&D no `<select name="attr_class">`.
2. **`attr_equipment` e `attr_features_and_traits` só existem no DOM quando
   a ficha está configurada com as opções "Inventory" e "FEATURES & TRAITS"
   em "Simple"** (aba Settings da ficha no Roll20; o padrão é "Compendium
   Compatible", que usa seções repetíveis em vez desses campos). O usuário
   precisa mudar essas duas opções manualmente uma vez antes do primeiro
   `atualizar-ficha.js` sem `--dry-run`. `roll20-updater.js` deve avisar no
   relatório se esses dois campos não forem encontrados, mencionando essa
   configuração.
3. **Os checkboxes de proficiência do PDF de origem não têm nome
   semântico** (`Check Box 11`, `Check Box 23`, etc.) — a correspondência
   com salvaguarda/perícia foi descoberta cruzando a posição (x/y/página)
   de cada checkbox com o campo de texto vizinho, e está tabulada em
   `docs/roll20-5e-ogl-sheet-attrs.md`. `mapping.js` usa essa tabela
   diretamente (Task 3).
4. **`repeating_attack` (armas) não precisa descobrir o ID de linha gerado
   pela Roll20**: dá pra localizar cada linha pelo índice de aparição no
   DOM (`.repeating_attack .attack` `nth(i)`) depois de clicar "adicionar"
   uma vez por arma, na ordem. Mais simples que tentar capturar o ID
   dinâmico.
5. **O PDF de origem já traz o bônus de ataque e o dano totalmente
   calculados** (ex. `+6`, `1d8+6 cort.`), então em vez de tentar
   reconstruir força/proficiência dentro do Roll20, a estratégia é zerar
   os multiplicadores automáticos da linha de ataque (`atkattr_base=0`,
   `atkprofflag` desmarcado, `dmgattr=0`) e jogar os números já prontos em
   `atkmod`/`dmgmod`/`dmgbase`/`dmgtype`.
6. **`app.roll20.net` está atrás de um desafio Cloudflare** (confirmado:
   uma requisição HTTP simples sem browser recebe 403 com
   `Cf-Mitigated: challenge`). Isso não impede o Playwright (que usa um
   browser de verdade), mas por isso o login deve rodar com
   `headless: false` — se aparecer um desafio Cloudflare/captcha na
   primeira execução, a pessoa tem uma janela visível para resolvê-lo
   manualmente antes do script continuar.
7. Existe um segundo PDF de exemplo do mesmo personagem em nível 2
   (`ClassLevel` = `"Guerreiro 2"`, sem subclasse) — útil para confirmar
   que `parseClassLevel` lida com o caso sem subclasse. Não precisa virar
   fixture separada; o teste unitário de `parseClassLevel` cobre os dois
   formatos diretamente com strings literais.

---

### Task 0: Scaffolding do projeto

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `config.example.json`

**Interfaces:**
- Produces: layout de diretórios (`src/`, `test/`, `test/fixtures/`) que
  todas as tasks seguintes assumem.

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "roll20-ficha-sync",
  "version": "1.0.0",
  "private": true,
  "description": "Sincroniza uma ficha de D&D 5e em PDF preenchivel com uma ficha existente no Roll20 via automacao de navegador.",
  "main": "atualizar-ficha.js",
  "scripts": {
    "test": "node --test test/"
  },
  "dependencies": {
    "pdf-lib": "^1.17.1",
    "playwright": "^1.47.0"
  }
}
```

- [ ] **Step 2: Instalar dependências**

Run: `npm install`
Expected: cria `node_modules/` e `package-lock.json` sem erros.

- [ ] **Step 3: Instalar o browser do Playwright**

Run: `npx playwright install chromium`
Expected: baixa o binário do Chromium usado pelo Playwright (necessário
antes de rodar a Task 5 pela primeira vez; pode ser adiado até lá se
preferir, mas registrar aqui evita esquecer).

- [ ] **Step 4: Criar `.gitignore`**

```
node_modules/
config.json
```

- [ ] **Step 5: Criar `config.example.json`**

```json
{
  "email": "seu-email@exemplo.com",
  "password": "sua-senha",
  "characterUrl": "https://app.roll20.net/campaigns/characters/SEU_ID_AQUI"
}
```

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore config.example.json
git commit -m "chore: scaffolding inicial do projeto roll20-ficha-sync

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(`package-lock.json` e `node_modules/` — o segundo já está no
`.gitignore`; adicione o lockfile também com `git add package-lock.json`
se quiser fixar versões exatas.)

---

### Task 1: `pdf-fields.js` — extração dos campos do PDF

**Files:**
- Create: `src/pdf-fields.js`
- Test: `test/pdf-fields.test.js`
- Fixture já existente: `test/fixtures/ficha-exemplo.pdf` (cópia real do
  PDF do usuário, personagem "Vau", nível 4 — 334 campos de formulário,
  2 deles são botões de imagem e são ignorados pela extração)

**Interfaces:**
- Produces: `readPdfFields(caminhoPdf: string): Promise<Record<string, string | boolean>>`
  — chave é o nome exato do campo AcroForm; texto vira `string`, checkbox
  vira `boolean`. Usado por `mapping.js` (Task 3) e `atualizar-ficha.js`
  (Task 4).

- [ ] **Step 1: Escrever o teste (campos de texto conhecidos)**

```js
// test/pdf-fields.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readPdfFields } = require('../src/pdf-fields');

const FIXTURE = path.join(__dirname, 'fixtures', 'ficha-exemplo.pdf');

test('extrai campos de texto conhecidos do PDF de exemplo', async () => {
  const campos = await readPdfFields(FIXTURE);
  assert.equal(campos['CharacterName'], 'Vau');
  assert.equal(campos['STR'], '18');
  assert.equal(campos['ClassLevel'], 'Guerreiro 4 - Guarda de Brecha');
  assert.equal(campos['HDTotal'], '4d10');
});

test('extrai checkboxes conhecidos do PDF de exemplo', async () => {
  const campos = await readPdfFields(FIXTURE);
  assert.equal(campos['Check Box 11'], true); // salvaguarda de Forca, marcada
  assert.equal(campos['Check Box 18'], false); // salvaguarda de Destreza, nao marcada
});

test('ignora campos de botao de imagem e mantem os demais 332 campos', async () => {
  const campos = await readPdfFields(FIXTURE);
  assert.equal(Object.keys(campos).length, 332);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test test/pdf-fields.test.js`
Expected: FAIL — `Cannot find module '../src/pdf-fields'`.

- [ ] **Step 3: Implementar `src/pdf-fields.js`**

```js
const fs = require('node:fs');
const { PDFDocument } = require('pdf-lib');

async function readPdfFields(caminhoPdf) {
  const bytes = fs.readFileSync(caminhoPdf);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const campos = {};

  for (const campo of form.getFields()) {
    const nome = campo.getName();
    const tipo = campo.constructor.name;

    if (tipo === 'PDFTextField') {
      campos[nome] = campo.getText() || '';
    } else if (tipo === 'PDFCheckBox') {
      campos[nome] = campo.isChecked();
    }
    // PDFButton (campos de imagem, ex. foto do personagem) e outros tipos
    // nao tem valor de texto/checkbox util e sao ignorados.
  }

  return campos;
}

module.exports = { readPdfFields };
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test test/pdf-fields.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/pdf-fields.js test/pdf-fields.test.js test/fixtures/ficha-exemplo.pdf
git commit -m "feat: extrair campos de formulario do PDF da ficha de D&D

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `mapping-transforms.js` — funções puras de conversão

**Files:**
- Create: `src/mapping-transforms.js`
- Test: `test/mapping-transforms.test.js`

**Interfaces:**
- Consumes: nada (funções puras sobre strings).
- Produces:
  - `parseClassLevel(texto: string): { classePt: string, nivel: number, subclasse?: string }`
  - `classeParaRoll20(classePt: string): string` (lança erro se a classe
    não for reconhecida)
  - `parseInspiracao(valor: string): boolean`
  - `parseBonusAtaque(valor: string): number`
  - `parseDano(valor: string): { dado: string, bonus: number, tipo: string, tipoReconhecido: boolean }`
  Usadas por `mapping.js` (Task 3).

- [ ] **Step 1: Escrever os testes**

```js
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/mapping-transforms.test.js`
Expected: FAIL — `Cannot find module '../src/mapping-transforms'`.

- [ ] **Step 3: Implementar `src/mapping-transforms.js`**

```js
const CLASSES_PT_PARA_EN = {
  guerreiro: 'Fighter',
  barbaro: 'Barbarian',
  bardo: 'Bard',
  clerigo: 'Cleric',
  druida: 'Druid',
  monge: 'Monk',
  paladino: 'Paladin',
  patrulheiro: 'Ranger',
  ladino: 'Rogue',
  feiticeiro: 'Sorcerer',
  bruxo: 'Warlock',
  mago: 'Wizard',
  artifice: 'Artificer',
};

const TIPOS_DANO_PT_PARA_EN = {
  'cort.': 'Slashing',
  cortante: 'Slashing',
  'perf.': 'Piercing',
  perfurante: 'Piercing',
  'cont.': 'Bludgeoning',
  contundente: 'Bludgeoning',
};

// Faixa Unicode das marcas diacriticas combinantes (acentos) que sobram
// depois de normalize('NFD'); construida via codigos de caractere para nao
// deixar um caractere de combinacao literal (invisivel) no arquivo-fonte.
const MARCAS_DIACRITICAS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .toLowerCase()
    .trim();
}

function parseClassLevel(texto) {
  const match = /^(.+?)\s+(\d+)(?:\s*-\s*(.+))?$/.exec(String(texto).trim());
  if (!match) {
    throw new Error(`ClassLevel em formato inesperado: "${texto}"`);
  }
  const [, classePt, nivelStr, subclasse] = match;
  return {
    classePt: classePt.trim(),
    nivel: Number(nivelStr),
    subclasse: subclasse ? subclasse.trim() : undefined,
  };
}

function classeParaRoll20(classePt) {
  const classeEn = CLASSES_PT_PARA_EN[normalizar(classePt)];
  if (!classeEn) {
    throw new Error(`Classe nao reconhecida: "${classePt}"`);
  }
  return classeEn;
}

function parseInspiracao(valor) {
  return Boolean(String(valor || '').trim());
}

function parseBonusAtaque(valor) {
  const numero = Number(String(valor || '0').replace('+', '').trim());
  if (Number.isNaN(numero)) {
    throw new Error(`Bonus de ataque em formato inesperado: "${valor}"`);
  }
  return numero;
}

function parseDano(valor) {
  const texto = String(valor || '').trim();
  const match = /^(\d+d\d+)\s*([+-]\s*\d+)?\s*(.*)$/.exec(texto);
  if (!match) {
    throw new Error(`Dano em formato inesperado: "${valor}"`);
  }
  const [, dado, bonusStr, tipoTexto] = match;
  const bonus = bonusStr ? Number(bonusStr.replace(/\s+/g, '')) : 0;
  const tipoChave = tipoTexto.trim().toLowerCase();
  const tipoConhecido = TIPOS_DANO_PT_PARA_EN[tipoChave];
  return {
    dado,
    bonus,
    tipo: tipoConhecido || tipoTexto.trim(),
    tipoReconhecido: Boolean(tipoConhecido),
  };
}

module.exports = {
  parseClassLevel,
  classeParaRoll20,
  parseInspiracao,
  parseBonusAtaque,
  parseDano,
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/mapping-transforms.test.js`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add src/mapping-transforms.js test/mapping-transforms.test.js
git commit -m "feat: funcoes de transformacao PT-BR -> Roll20 para classe e dano

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `mapping.js` — tabela declarativa PDF → Roll20

**Files:**
- Create: `src/mapping.js`
- Test: `test/mapping.test.js`

**Interfaces:**
- Consumes: `readPdfFields` (Task 1), `parseClassLevel`/`classeParaRoll20`/
  `parseInspiracao`/`parseBonusAtaque`/`parseDano` (Task 2).
- Produces: `buildMapping(pdfFields: Record<string, string|boolean>): Instrucao[]`
  onde cada `Instrucao` é
  `{ attr: string, tipo: 'text'|'checkbox'|'select', valor: string|boolean, linhaArma?: number }`.
  `attr` é o nome **sem** o prefixo `attr_` (ex. `'strength'`, não
  `'attr_strength'`) — quem adiciona o prefixo no DOM é `roll20-updater.js`
  (Task 5). `linhaArma` (0, 1 ou 2), quando presente, indica que a
  instrução vai para a N-ésima linha da seção repetível `repeating_attack`
  em vez de um campo raiz da ficha. Consumida por `atualizar-ficha.js`
  (Task 4, modo `--dry-run`) e por `roll20-updater.js` (Task 5).

- [ ] **Step 1: Escrever o teste (integração real PDF → instruções)**

```js
// test/mapping.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readPdfFields } = require('../src/pdf-fields');
const { buildMapping } = require('../src/mapping');

const FIXTURE = path.join(__dirname, 'fixtures', 'ficha-exemplo.pdf');

function encontrar(instrucoes, attr, linhaArma) {
  return instrucoes.find(
    (i) => i.attr === attr && i.linhaArma === linhaArma
  );
}

test('mapeia atributos, classe e nivel do PDF de exemplo', async () => {
  const campos = await readPdfFields(FIXTURE);
  const instrucoes = buildMapping(campos);

  assert.deepEqual(encontrar(instrucoes, 'strength'), { attr: 'strength', tipo: 'text', valor: '18' });
  assert.deepEqual(encontrar(instrucoes, 'class'), { attr: 'class', tipo: 'select', valor: 'Fighter' });
  assert.deepEqual(encontrar(instrucoes, 'base_level'), { attr: 'base_level', tipo: 'text', valor: '4' });
  assert.deepEqual(encontrar(instrucoes, 'subclass'), { attr: 'subclass', tipo: 'text', valor: 'Guarda de Brecha' });
});

test('mapeia proficiencia de salvaguarda a partir dos checkboxes do PDF', async () => {
  const campos = await readPdfFields(FIXTURE);
  const instrucoes = buildMapping(campos);

  assert.deepEqual(encontrar(instrucoes, 'strength_save_prof'), { attr: 'strength_save_prof', tipo: 'checkbox', valor: true });
  assert.deepEqual(encontrar(instrucoes, 'dexterity_save_prof'), { attr: 'dexterity_save_prof', tipo: 'checkbox', valor: false });
  assert.deepEqual(encontrar(instrucoes, 'constitution_save_prof'), { attr: 'constitution_save_prof', tipo: 'checkbox', valor: true });
});

test('mapeia as 3 armas do PDF de exemplo para linhas de repeating_attack', async () => {
  const campos = await readPdfFields(FIXTURE);
  const instrucoes = buildMapping(campos);

  assert.deepEqual(encontrar(instrucoes, 'atkname', 0), { attr: 'atkname', tipo: 'text', valor: 'Espada longa', linhaArma: 0 });
  assert.deepEqual(encontrar(instrucoes, 'atkmod', 0), { attr: 'atkmod', tipo: 'text', valor: '6', linhaArma: 0 });
  assert.deepEqual(encontrar(instrucoes, 'dmgbase', 0), { attr: 'dmgbase', tipo: 'text', valor: '1d8', linhaArma: 0 });
  assert.deepEqual(encontrar(instrucoes, 'dmgmod', 0), { attr: 'dmgmod', tipo: 'text', valor: '6', linhaArma: 0 });
  assert.deepEqual(encontrar(instrucoes, 'dmgtype', 0), { attr: 'dmgtype', tipo: 'text', valor: 'Slashing', linhaArma: 0 });

  assert.deepEqual(encontrar(instrucoes, 'atkname', 2), { attr: 'atkname', tipo: 'text', valor: 'Estaca', linhaArma: 2 });
});

test('nao gera instrucoes de spellcasting', async () => {
  const campos = await readPdfFields(FIXTURE);
  const instrucoes = buildMapping(campos);
  const attrsDeSpell = instrucoes.filter((i) => i.attr.includes('spell'));
  assert.deepEqual(attrsDeSpell, []);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/mapping.test.js`
Expected: FAIL — `Cannot find module '../src/mapping'`.

- [ ] **Step 3: Implementar `src/mapping.js`**

```js
const {
  parseClassLevel,
  classeParaRoll20,
  parseInspiracao,
  parseBonusAtaque,
  parseDano,
} = require('./mapping-transforms');

const SALVAGUARDAS = [
  ['Check Box 11', 'strength_save_prof'],
  ['Check Box 18', 'dexterity_save_prof'],
  ['Check Box 19', 'constitution_save_prof'],
  ['Check Box 20', 'intelligence_save_prof'],
  ['Check Box 21', 'wisdom_save_prof'],
  ['Check Box 22', 'charisma_save_prof'],
];

const MORTES = [
  ['Check Box 12', 'deathsave_succ1'],
  ['Check Box 13', 'deathsave_succ2'],
  ['Check Box 14', 'deathsave_succ3'],
  ['Check Box 15', 'deathsave_fail1'],
  ['Check Box 16', 'deathsave_fail2'],
  ['Check Box 17', 'deathsave_fail3'],
];

const PERICIAS = [
  ['Check Box 23', 'acrobatics_prof'],
  ['Check Box 24', 'animal_handling_prof'],
  ['Check Box 25', 'arcana_prof'],
  ['Check Box 26', 'athletics_prof'],
  ['Check Box 27', 'deception_prof'],
  ['Check Box 28', 'history_prof'],
  ['Check Box 29', 'insight_prof'],
  ['Check Box 30', 'intimidation_prof'],
  ['Check Box 31', 'investigation_prof'],
  ['Check Box 32', 'medicine_prof'],
  ['Check Box 33', 'nature_prof'],
  ['Check Box 34', 'perception_prof'],
  ['Check Box 35', 'performance_prof'],
  ['Check Box 36', 'persuasion_prof'],
  ['Check Box 37', 'religion_prof'],
  ['Check Box 38', 'sleight_of_hand_prof'],
  ['Check Box 39', 'stealth_prof'],
  ['Check Box 40', 'survival_prof'],
];

const CAMPOS_DIRETOS_TEXTO = [
  ['CharacterName', 'character_name'],
  ['Race ', 'race'],
  ['Background', 'background'],
  ['Alignment', 'alignment'],
  ['XP', 'experience'],
  ['Speed', 'speed'],
  ['HPMax', 'hp_max'],
  ['HPCurrent', 'hp'],
  ['HPTemp', 'hp_temp'],
  ['HD', 'hit_dice'],
  ['HDTotal', 'hit_dice_max'],
  ['STR', 'strength'],
  ['DEX', 'dexterity'],
  ['CON', 'constitution'],
  ['INT', 'intelligence'],
  ['WIS', 'wisdom'],
  ['CHA', 'charisma'],
  ['PersonalityTraits ', 'personality_traits'],
  ['Ideals', 'ideals'],
  ['Bonds', 'bonds'],
  ['Flaws', 'flaws'],
  ['Equipment', 'equipment'],
  ['Features and Traits', 'features_and_traits'],
  ['ProficienciesLang', 'other_proficiencies_and_languages'],
  ['CP', 'cp'],
  ['SP', 'sp'],
  ['EP', 'ep'],
  ['GP', 'gp'],
  ['PP', 'pp'],
  ['Age', 'age'],
  ['Height', 'height'],
  ['Weight', 'weight'],
  ['Eyes', 'eyes'],
  ['Skin', 'skin'],
  ['Hair', 'hair'],
  ['Allies', 'allies_and_organizations'],
  ['Backstory', 'character_backstory'],
  ['Treasure', 'treasure'],
];

const ARMAS = [
  { nome: 'Wpn Name', bonus: 'Wpn1 AtkBonus', dano: 'Wpn1 Damage' },
  { nome: 'Wpn Name 2', bonus: 'Wpn2 AtkBonus ', dano: 'Wpn2 Damage ' },
  { nome: 'Wpn Name 3', bonus: 'Wpn3 AtkBonus  ', dano: 'Wpn3 Damage ' },
];

function buildMapping(pdfFields) {
  const instrucoes = [];

  for (const [campoPdf, attr] of CAMPOS_DIRETOS_TEXTO) {
    if (campoPdf in pdfFields) {
      instrucoes.push({ attr, tipo: 'text', valor: String(pdfFields[campoPdf] ?? '') });
    }
  }

  for (const [campoPdf, attr] of [...SALVAGUARDAS, ...MORTES, ...PERICIAS]) {
    if (campoPdf in pdfFields) {
      instrucoes.push({ attr, tipo: 'checkbox', valor: Boolean(pdfFields[campoPdf]) });
    }
  }

  if ('Inspiration' in pdfFields) {
    instrucoes.push({
      attr: 'inspiration',
      tipo: 'checkbox',
      valor: parseInspiracao(pdfFields['Inspiration']),
    });
  }

  if (pdfFields['ClassLevel']) {
    const { classePt, nivel, subclasse } = parseClassLevel(pdfFields['ClassLevel']);
    instrucoes.push({ attr: 'class', tipo: 'select', valor: classeParaRoll20(classePt) });
    instrucoes.push({ attr: 'base_level', tipo: 'text', valor: String(nivel) });
    if (subclasse) {
      instrucoes.push({ attr: 'subclass', tipo: 'text', valor: subclasse });
    }
  }

  ARMAS.forEach((arma, linhaArma) => {
    const nome = pdfFields[arma.nome];
    if (!nome || !String(nome).trim()) return;

    instrucoes.push({ attr: 'atkname', tipo: 'text', valor: String(nome), linhaArma });
    instrucoes.push({ attr: 'atkattr_base', tipo: 'select', valor: '0', linhaArma });
    instrucoes.push({ attr: 'atkprofflag', tipo: 'checkbox', valor: false, linhaArma });

    if (pdfFields[arma.bonus]) {
      instrucoes.push({
        attr: 'atkmod',
        tipo: 'text',
        valor: String(parseBonusAtaque(pdfFields[arma.bonus])),
        linhaArma,
      });
    }

    if (pdfFields[arma.dano]) {
      const { dado, bonus, tipo } = parseDano(pdfFields[arma.dano]);
      instrucoes.push({ attr: 'dmgbase', tipo: 'text', valor: dado, linhaArma });
      instrucoes.push({ attr: 'dmgattr', tipo: 'select', valor: '0', linhaArma });
      instrucoes.push({ attr: 'dmgmod', tipo: 'text', valor: String(bonus), linhaArma });
      instrucoes.push({ attr: 'dmgtype', tipo: 'text', valor: tipo, linhaArma });
    }
  });

  return instrucoes;
}

module.exports = { buildMapping };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/mapping.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/mapping.js test/mapping.test.js
git commit -m "feat: mapear campos do PDF para atributos da ficha Roll20

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `config.js` + CLI com `--dry-run`

**Files:**
- Create: `src/config.js`
- Create: `atualizar-ficha.js`
- Test: `test/config.test.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: `readPdfFields` (Task 1), `buildMapping` (Task 3).
- Produces:
  - `loadConfig(caminho: string): { email: string, password: string, characterUrl: string }`
    (lança erro com mensagem clara se o arquivo não existir ou faltar
    campo) — consumida por `atualizar-ficha.js` e, na Task 5, indiretamente
    pelo README/uso manual.
  - CLI `node atualizar-ficha.js <pdf> [--config caminho] [--dry-run]` —
    `--dry-run` não deve importar `src/roll20-updater.js` no topo do
    arquivo (só dentro do caminho não-dry-run), para nenhum teste de
    `--dry-run` precisar do Playwright instalado.

- [ ] **Step 1: Escrever o teste de `config.js`**

```js
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/config.test.js`
Expected: FAIL — módulo `../src/config` não existe.

- [ ] **Step 3: Implementar `src/config.js`**

```js
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
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/config.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Escrever o teste do CLI em `--dry-run`**

```js
// test/cli.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'atualizar-ficha.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'ficha-exemplo.pdf');

test('--dry-run imprime o mapeamento sem tentar abrir navegador', () => {
  const saida = execFileSync('node', [CLI, FIXTURE, '--dry-run'], { encoding: 'utf8' });
  assert.match(saida, /attr_character_name -> "Vau"/);
  assert.match(saida, /attr_class -> "Fighter"/);
  assert.match(saida, /attr_strength -> "18"/);
  assert.match(saida, /attr_atkname \(arma 1\) -> "Espada longa"/);
});

test('reclama de forma clara quando o PDF nao existe', () => {
  assert.throws(() => {
    execFileSync('node', [CLI, '/caminho/inexistente.pdf', '--dry-run'], { encoding: 'utf8', stdio: 'pipe' });
  }, /ENOENT|não encontrado/);
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `node --test test/cli.test.js`
Expected: FAIL — `atualizar-ficha.js` não existe.

- [ ] **Step 7: Implementar `atualizar-ficha.js`**

```js
#!/usr/bin/env node
const path = require('node:path');
const { readPdfFields } = require('./src/pdf-fields');
const { buildMapping } = require('./src/mapping');

function parseArgs(argv) {
  const args = { pdf: null, config: 'config.json', dryRun: false };
  const resto = [...argv];
  while (resto.length) {
    const atual = resto.shift();
    if (atual === '--config') {
      args.config = resto.shift();
    } else if (atual === '--dry-run') {
      args.dryRun = true;
    } else if (!args.pdf) {
      args.pdf = atual;
    } else {
      throw new Error(`Argumento inesperado: ${atual}`);
    }
  }
  if (!args.pdf) {
    throw new Error('Uso: node atualizar-ficha.js <pdf> [--config caminho] [--dry-run]');
  }
  return args;
}

function imprimirInstrucoes(instrucoes) {
  console.log('attrRoll20 -> valor (dry-run, nenhum navegador foi aberto)');
  for (const instrucao of instrucoes) {
    const linha = instrucao.linhaArma !== undefined ? ` (arma ${instrucao.linhaArma + 1})` : '';
    console.log(`  attr_${instrucao.attr}${linha} -> ${JSON.stringify(instrucao.valor)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfFields = await readPdfFields(args.pdf);
  const instrucoes = buildMapping(pdfFields);

  if (args.dryRun) {
    imprimirInstrucoes(instrucoes);
    return;
  }

  // Import tardio: so carrega o Playwright quando de fato vai abrir o navegador.
  const { loadConfig } = require('./src/config');
  const { atualizarFicha } = require('./src/roll20-updater');

  const config = loadConfig(path.resolve(args.config));
  const relatorio = await atualizarFicha(config, instrucoes);

  console.log(`Campos escritos: ${relatorio.escritos.length}`);
  console.log(`Campos pulados: ${relatorio.pulados.length}`);
  for (const pulado of relatorio.pulados) {
    console.log(`  - attr_${pulado.attr}${pulado.linhaArma !== undefined ? ` (arma ${pulado.linhaArma + 1})` : ''}: ${pulado.motivo}`);
  }
}

main().catch((erro) => {
  console.error('Erro:', erro.message);
  process.exit(1);
});
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `node --test test/cli.test.js`
Expected: PASS (2 testes). (`src/roll20-updater.js` ainda não existe, mas
como ele só é exigido pelo `require` dentro do branch não-dry-run, os
testes de `--dry-run` passam sem ele.)

- [ ] **Step 9: Rodar a suíte inteira até aqui**

Run: `npm test`
Expected: todos os testes de `test/pdf-fields.test.js`,
`test/mapping-transforms.test.js`, `test/mapping.test.js`,
`test/config.test.js` e `test/cli.test.js` passam.

- [ ] **Step 10: Commit**

```bash
git add src/config.js atualizar-ficha.js test/config.test.js test/cli.test.js
git commit -m "feat: CLI atualizar-ficha.js com modo --dry-run

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `roll20-updater.js` — automação Playwright

Esta é a única parte que o próprio spec já reconhece como não testável
automaticamente (precisa de conta Roll20 real). Não há passo de "rodar
teste automatizado" aqui — a verificação é manual, no fim da task.

**Files:**
- Create: `src/roll20-updater.js`

**Interfaces:**
- Consumes: `config` de `loadConfig` (Task 4:
  `{ email, password, characterUrl }`), `instrucoes` de `buildMapping`
  (Task 3: `Instrucao[]` como definido lá).
- Produces: `atualizarFicha(config, instrucoes): Promise<{ escritos: Instrucao[], pulados: Array<Instrucao & { motivo: string }> }>`
  — consumida por `atualizar-ficha.js` (Task 4).

- [ ] **Step 1: Implementar `src/roll20-updater.js`**

```js
const { chromium } = require('playwright');

const CAMPOS_REPETIVEIS = new Set(['atkname', 'atkattr_base', 'atkprofflag', 'atkmod', 'dmgbase', 'dmgattr', 'dmgmod', 'dmgtype']);

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
}

async function abrirFicha(page, characterUrl) {
  await page.goto(characterUrl, { waitUntil: 'domcontentloaded' });
  const acessoNegado = page.locator('text=/not authorized|acesso negado|404/i');
  if (await acessoNegado.count()) {
    throw new Error(`Nao foi possivel abrir a ficha em ${characterUrl} (URL invalida ou sem permissao).`);
  }
  await page.waitForSelector('iframe');
}

async function garantirLinhasDeArma(fichaFrame, quantidade) {
  const linhaLocator = fichaFrame.locator('.repeating_attack .attack');
  const atuais = await linhaLocator.count();
  const botaoAdicionar = fichaFrame.locator('.repeating_attack').locator('.repcontrol_add').first();
  for (let i = atuais; i < quantidade; i++) {
    await botaoAdicionar.click();
    await fichaFrame.waitForTimeout(300); // Roll20 injeta a linha nova de forma assincrona
  }
}

async function escreverCampo(fichaFrame, instrucao) {
  const seletor = `[name="attr_${instrucao.attr}"]`;
  const localizador =
    instrucao.linhaArma !== undefined
      ? fichaFrame.locator('.repeating_attack .attack').nth(instrucao.linhaArma).locator(seletor)
      : fichaFrame.locator(seletor).first();

  if ((await localizador.count()) === 0) {
    throw new Error('campo não encontrado no DOM da ficha');
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
      await garantirLinhasDeArma(fichaFrame, linhasDeArmaNecessarias);
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
```

- [ ] **Step 2: Verificação manual — dry-run primeiro**

Run: `node atualizar-ficha.js caminho/para/sua-ficha.pdf --dry-run`
Expected: lista de `attr_* -> valor` no terminal, sem nenhuma janela de
navegador abrindo. Revisar a lista à mão contra o PDF antes de prosseguir.

- [ ] **Step 3: Preparar a ficha no Roll20**

Na ficha do personagem no Roll20 (aba de engrenagem/Settings da ficha,
não do jogo): mudar **Inventory** e **FEATURES & TRAITS** para "Simple"
(ver item 2 em "Contexto adicional descoberto durante o planejamento",
no topo deste plano). Sem isso, `attr_equipment` e
`attr_features_and_traits` não existem no DOM e aparecem como pulados no
relatório.

- [ ] **Step 4: Copiar e preencher o config**

Run: `cp config.example.json config.json` (ou copiar manualmente no
Windows) e preencher `email`, `password` e `characterUrl` com os dados
reais. Confirmar que `config.json` não aparece em `git status` (deve
estar ignorado).

- [ ] **Step 5: Rodar de verdade contra o personagem real**

Run: `node atualizar-ficha.js caminho/para/sua-ficha.pdf --config config.json`
Expected: uma janela do Chromium abre, loga no Roll20 (resolver
manualmente qualquer desafio Cloudflare/captcha se aparecer), abre a
ficha, preenche os campos, e o terminal termina imprimindo quantos
campos foram escritos e quais foram pulados (com o motivo). Se o login
tiver um seletor diferente do esperado (`input[name="email"]` etc.),
ajustar `fazerLogin` em `src/roll20-updater.js` inspecionando o HTML real
da página de login pelas devtools do navegador que o Playwright abriu.

- [ ] **Step 6: Conferir visualmente na ficha do Roll20**

Abrir a ficha no navegador normal (fora do Playwright) e comparar campo a
campo com o PDF: nome, raça, classe/subclasse/nível, atributos,
proficiências marcadas, PV, dados de vida, mortes, arma(s), moedas,
biografia. Qualquer divergência que não apareceu como "pulado" no
relatório é um bug em `mapping.js` (valor errado) ou em
`roll20-updater.js` (campo escrito no lugar errado) — voltar e corrigir
antes de considerar a task concluída.

- [ ] **Step 7: Commit**

```bash
git add src/roll20-updater.js
git commit -m "feat: automatizar login e preenchimento da ficha no Roll20 via Playwright

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: README de uso

**Files:**
- Create: `README.md`

- [ ] **Step 1: Escrever o README**

```markdown
# roll20-ficha-sync

Atualiza uma ficha de personagem de D&D 5e existente no Roll20
("5th Edition OGL by Roll20") a partir de um PDF preenchível oficial da
Wizards of the Coast.

## Uso

\`\`\`bash
npm install
npx playwright install chromium
cp config.example.json config.json
# edite config.json com seu email, senha e a URL do personagem

# revise o mapeamento antes de tocar na ficha de verdade:
node atualizar-ficha.js caminho/ficha.pdf --dry-run

# depois de revisar, aplique de verdade:
node atualizar-ficha.js caminho/ficha.pdf --config config.json
\`\`\`

## Antes de rodar sem --dry-run

Na ficha do personagem no Roll20 (aba Settings/engrenagem da própria
ficha), mude **Inventory** e **FEATURES & TRAITS** para "Simple". Sem
isso o script não encontra onde escrever equipamento e
características/talentos (mais detalhes em
`docs/roll20-5e-ogl-sheet-attrs.md`).

## Limitações (v1)

- Não sincroniza magias/conjuração.
- Não cria personagem novo — só edita um que já existe.
- Suporta só a ficha "5th Edition OGL by Roll20" e o PDF oficial
  preenchível da WotC.
- Um `config.json` por jogador/personagem.
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: adicionar README de uso do roll20-ficha-sync

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm test` passa inteiro (Tasks 1–4).
- [ ] `node atualizar-ficha.js test/fixtures/ficha-exemplo.pdf --dry-run`
  imprime a lista completa de instruções sem abrir navegador.
- [ ] Execução real (Task 5, Step 5) contra o personagem de verdade do
  usuário confere campo a campo com o PDF.
