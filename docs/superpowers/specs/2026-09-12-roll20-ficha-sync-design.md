# Roll20 Ficha Sync — Design

## Objetivo

Atualizar automaticamente uma ficha de personagem de D&D 5e no Roll20 a
partir de um PDF preenchível (formulário oficial da Wizards of the
Coast), sem depender da API oficial do Roll20 (que não tem acesso à
rede e não serve para importar PDFs).

## Contexto / restrições confirmadas

- PDF de origem: formulário AcroForm preenchível oficial da WotC
  (confirmado lendo os 334 campos do PDF real do usuário — campos como
  `STR`, `DEX`, `ProfBonus`, `ST Strength`, `Check Box N`, etc.).
- Ficha alvo no Roll20: **5th Edition OGL by Roll20** (oficial).
- Usuário não tem assinatura Roll20 Pro → sem acesso à API sandbox
  (`ChatSetAttr`/scripts Mod). Única via viável é automação de
  navegador.
- Uso inicial: só o personagem do próprio usuário. Ele pretende
  disponibilizar para outros jogadores da mesa depois — o design deve
  deixar isso barato de fazer (config por jogador), sem construir a
  parte multiusuário agora.
- Login: credenciais (email/senha) salvas em arquivo de config local,
  fora do controle de versão.
- Gatilho: comando manual no terminal (sem pasta monitorada, sem UI
  web nesta v1).
- Personagem já existe no Roll20 — o script só edita uma ficha
  existente, nunca cria uma nova (criar uma ficha nova pelo Roll20
  aciona o Charactermancer, que substitui a interação normal com
  `setAttrs`/DOM e foge do escopo).

## Não-objetivos (v1)

- Conjuração/magias (a ficha OGL tem ~250 campos só de spells; o
  personagem de teste não é conjurador). Fica para uma v2 se alguém
  precisar.
- Criação de personagem novo no Roll20.
- Suporte à ficha "Shaped" ou outros sistemas além de D&D 5e OGL.
- Sincronização automática/agendada — é sempre um comando manual.
- Multiusuário de verdade (fila, painel, etc.) — só a estrutura de
  config por arquivo que barateia adicionar o segundo usuário depois.

## Arquitetura

```
ficha.pdf ──> pdf-fields.js ──> {nomeCampoPDF: valor} ──┐
                                                          ├─> mapping.js ──> [{attrRoll20, valor}]
config.json (login, url do personagem) ─────────────────┘                        │
                                                                                   v
                                                                   roll20-updater.js (Playwright)
                                                                     - login
                                                                     - abre ficha do personagem
                                                                     - por campo: localizar input no
                                                                       iframe e escrever valor
                                                                     - relatório final (ok/pulado)
```

Orquestrado por `atualizar-ficha.js <pdf> [--config caminho] [--dry-run]`.

### `pdf-fields.js`

Lê o PDF com `pdf-lib` e retorna um dicionário simples
`{ nomeDoCampo: valorTexto | boolean }`. Já validado manualmente contra
o PDF real do usuário (334 campos extraídos corretamente, incluindo
texto multi-linha e checkboxes).

### `mapping.js`

Lista declarativa de regras, cada uma:

```js
{ target: 'attr_strength', source: 'STR' }
{ target: 'attr_class', source: 'ClassLevel', transform: parseClassLevel }
```

- A maioria das regras é 1:1 (renomear campo).
- Regras com `transform` cobrem os casos onde o PDF junta informação
  que o Roll20 quer separada (ex.: `ClassLevel` = "Guerreiro 4 - Guarda
  de Brecha" → classe, nível, subclasse) ou onde múltiplos checkboxes
  do PDF viram um único valor no Roll20 (ex.: dados de proficiência em
  salvaguardas).
- Fica em arquivo próprio (não misturado com login/navegador) para que
  outro jogador com o mesmo template de PDF só precise validar/ajustar
  esse arquivo, não o motor de automação.
- Os nomes de campo `attr_*` do lado Roll20 são obtidos consultando o
  HTML público da ficha 5th Edition OGL no repositório
  `Roll20/roll20-character-sheets` no GitHub, não "de memória" — isso
  evita mapear para um nome de atributo errado.

### `roll20-updater.js`

Script Playwright:

1. Loga no Roll20 com email/senha do `config.json`.
2. Navega até a URL do personagem (também do `config.json`).
3. Para armas (até 3, seção repetível "Attacks & Spellcasting"): clica
   no botão de adicionar linha uma vez por arma antes de preencher,
   porque essa seção usa IDs de linha gerados dinamicamente pelo
   Roll20.
4. Para cada regra do mapping: localiza o input dentro do iframe da
   ficha pelo `name`; se for texto, usa `fill` + dispara `blur`
   (necessário para o autosave do Roll20 registrar a mudança); se for
   checkbox, marca/desmarca conforme o valor.
5. Ao final, imprime um relatório: quantos campos foram escritos,
   quais foram pulados (não encontrados no DOM) e quais tiveram valor
   suspeito (ex.: esperava número e o PDF trouxe texto).

Nenhum campo ausente derruba o script inteiro — é um aviso no
relatório, para o script sobreviver a pequenas divergências entre
personagens/versões da ficha.

### `config.json` (não versionado)

```json
{
  "email": "...",
  "password": "...",
  "characterUrl": "https://app.roll20.net/campaigns/characters/<id>"
}
```

Um arquivo por jogador. Quando o segundo jogador quiser usar, ele cria
o seu próprio `config.json` (e, se o PDF dele for de outro template,
ajusta `mapping.js`) — sem tocar no motor.

### CLI: `atualizar-ficha.js`

```
node atualizar-ficha.js caminho/ficha.pdf --config caminho/config.json [--dry-run]
```

`--dry-run` roda a extração do PDF e a aplicação do mapping, e imprime
a tabela `attrRoll20 -> valor` sem abrir navegador nenhum. É o modo
recomendado antes de qualquer atualização real, para revisar o
mapeamento sem risco de estragar a ficha ao vivo.

## Tratamento de erros

- Falha de login (senha errada, captcha, 2FA): aborta antes de tocar
  no personagem, com mensagem clara.
- URL de personagem sem permissão/inexistente: aborta com mensagem
  clara.
- Campo mapeado não encontrado no DOM: log de aviso, continua com os
  demais, aparece no relatório final.

## Testes

- Unitário para `pdf-fields.js`: contra o PDF real de exemplo,
  verificar valores conhecidos (`STR` = "18", `CharacterName` = "Vau",
  checkbox específico marcado/desmarcado).
- Unitário para as funções de `transform` em `mapping.js` (ex.:
  `parseClassLevel("Guerreiro 4 - Guarda de Brecha")` retorna
  `{classe: "Guerreiro", nivel: 4, subclasse: "Guarda de Brecha"}`),
  puras, sem precisar de navegador.
- `roll20-updater.js` (parte com Playwright) não é testável
  automaticamente sem uma conta Roll20 real — verificação manual: rodar
  em `--dry-run` primeiro, depois rodar de verdade contra o personagem
  do usuário e conferir visualmente na ficha.

## Stack

Node.js + Playwright (automação de navegador) + pdf-lib (leitura de
AcroForm). Escolhido em vez de Python/Selenium por o Playwright lidar
melhor com esperar elementos carregarem dentro do iframe da ficha do
Roll20, que é o ponto mais frágil da automação.
