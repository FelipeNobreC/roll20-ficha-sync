# Referência: atributos da ficha "5th Edition OGL by Roll20"

Levantado consultando o código-fonte público da ficha em
`Roll20/roll20-character-sheets`, pasta `DD5thEditionLegacy/`
(`5th Edition Legacy.html`), commit `93a40a9` (branch `master`).

Confirmado que é a ficha certa porque:
- `sheet.json` tem `"compendium": "dnd5e"` e é a única pasta do repositório
  cujo `<select name="attr_class">` lista as classes reais de D&D 5e
  (Artificer, Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin,
  Ranger, Rogue, Sorcerer, Warlock, Wizard).
- (`DnD_5e/` é uma ficha *diferente*, antiga e comunitária, marcada
  `"legacy": true` só nesse sentido de "sheet antiga"; `Redsky/` é uma
  ficha de um jogo próprio da Roll20 chamado Redsky, não D&D — as duas
  foram descartadas depois de inspecionadas.)

## Atualização (testado ao vivo contra uma conta Roll20 real)

A Roll20 **redesenhou visualmente** essa ficha depois do commit consultado
acima — o layout real (dashboard em cards, tabs PÚBLICO/MESTRE,
BASE/BIO/MAGIAS) não se parece em nada com o HTML estático pesquisado.
**Os nomes `attr_*` continuam os mesmos** (confirmado: `attr_character_name`,
`attr_strength`, `attr_class`, os `*_prof` de perícia/salvaguarda, etc.
todos bateram com dados reais do personagem), então a tabela abaixo
continua válida para *quais* atributos usar — só a estrutura do DOM em volta
deles mudou. Descobertas que mudam como `roll20-updater.js` precisa
manipular o DOM:

- **A ficha carrega dentro de um iframe específico**, não "o primeiro
  iframe da página" (a página tem outros iframes: pixel do doubleclick,
  widgets do Stripe). O iframe certo tem `src` contendo `legacy-sheets` e
  `charsheettype=ogl5e` na query string.
- **É uma SPA que demora ~10-15s pra montar o formulário** dentro do
  iframe — esperar só o `<iframe>` existir no DOM não basta, é preciso
  esperar um campo de verdade (ex. `attr_character_name`) aparecer.
- **Cada campo tem até ~10 cópias no DOM ao mesmo tempo** (visões
  público/mestre, abas base/bio/magias, etc.), a maioria escondida via
  CSS. É obrigatório filtrar por `:visible` (`[name="attr_x"]:visible`) —
  sem isso o Playwright pode escrever numa cópia escondida sem efeito, ou
  falhar tentando editar um `<span>` de exibição em vez do `<input>` real.
- **Escrever muitos campos em sequência sem pausa perde alguns autosaves**
  — o campo aparenta preenchido no momento, mas o valor não persiste no
  servidor (confirmado: o mesmo campo preenchido isoladamente, com uma
  pausa depois, sempre persiste). `roll20-updater.js` agora espera ~250ms
  depois de cada campo escrito.
- **Atributos de habilidade (`attr_strength` etc.) têm uma armadilha**: a
  instância `:visible` costuma ser `<span class="finalattr" name="attr_strength">`
  (só exibição, não aceita `.fill()`) — o `<input>` editável de verdade
  não foi localizado ainda. Provavelmente segue o mesmo padrão de
  "clique pra expandir" descrito abaixo para armas.
- **Vários campos de biografia** (`background`, `alignment`, `experience`,
  `other_proficiencies_and_languages`, `age`/`height`/`weight`/`eyes`/
  `skin`/`hair`, `allies_and_organizations`, `character_backstory`,
  `treasure`) não foram encontrados no DOM na aba padrão ("BASE") — quase
  certamente ficam atrás da aba "BIO" visível no topo da ficha. Clicar
  nela programaticamente não funcionou de primeira (elemento é
  interceptado por outra camada/overlay); não foi resolvido ainda.
- **A seção de armas (`repeating_attack`) mudou de estrutura**: o HTML
  estático usa `.repeating_attack .attack` e `.repeating_attack .repcontrol_add`,
  mas o DOM real usa `.repcontainer[data-groupname="attack"] > .repitem >
  .attack` (cadeia de pais confirmada:
  `SPAN > BUTTON.btn > DIV.display > DIV.attack > DIV.repitem > DIV.repcontainer.ui-sortable`),
  e o botão de adicionar não foi localizado. Além disso o campo
  `attr_atkname` visível por padrão é um `<span>` de "modo exibição"
  dentro de um `<button>` (não aceita `.fill()`) — a linha provavelmente
  precisa ser expandida (clicar em algo) antes do `<input>` editável
  aparecer. Não resolvido — armas continuam caindo em `pulados`.

## Campos raiz (não-repetíveis)

| Roll20 `attr_*` | Tipo DOM | Observação |
|---|---|---|
| `character_name` | text | |
| `race` | text | |
| `background` | text | |
| `alignment` | text | |
| `experience` | text | XP |
| `class` | `<select>` | valores em inglês: Artificer, Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard |
| `subclass` | text | livre |
| `base_level` | number | nível da classe principal |
| `strength`,`dexterity`,`constitution`,`intelligence`,`wisdom`,`charisma` | number | valor bruto do atributo (Roll20 calcula o modificador) |
| `strength_save_prof`,`dexterity_save_prof`,`constitution_save_prof`,`intelligence_save_prof`,`wisdom_save_prof`,`charisma_save_prof` | checkbox | proficiência em salvaguarda |
| `acrobatics_prof`,`animal_handling_prof`,`arcana_prof`,`athletics_prof`,`deception_prof`,`history_prof`,`insight_prof`,`intimidation_prof`,`investigation_prof`,`medicine_prof`,`nature_prof`,`perception_prof`,`performance_prof`,`persuasion_prof`,`religion_prof`,`sleight_of_hand_prof`,`stealth_prof`,`survival_prof` | checkbox | proficiência em pericia |
| `inspiration` | checkbox | |
| `speed` | text | |
| `hp` | number | PV atual |
| `hp_max` | number | |
| `hp_temp` | number | |
| `hit_dice` | number | dados de vida atuais |
| `hit_dice_max` | text | aceita string tipo `"4d10"` |
| `deathsave_succ1/2/3`, `deathsave_fail1/2/3` | checkbox | |
| `personality_traits`, `ideals`, `bonds`, `flaws` | textarea | |
| `equipment` | textarea | **só usado quando a opção "Inventory" da ficha está em "Simple"** (default da ficha é "Compendium Compatible", que usa `repeating_inventory` em vez disso) |
| `features_and_traits` | textarea | **só usado quando "FEATURES & TRAITS" está em "Simple"** (default é "Compendium Compatible", que usa `repeating_traits`) |
| `other_proficiencies_and_languages` | textarea | sempre presente, não depende de toggle |
| `cp`,`sp`,`ep`,`gp`,`pp` | number | moedas |
| `age`,`height`,`weight`,`eyes`,`skin`,`hair` | text | aba BIO |
| `allies_and_organizations` | textarea | aba BIO |
| `character_backstory` | textarea | aba BIO |
| `treasure` | textarea | aba BIO |

Campos **calculados/desabilitados** (não escrever — Playwright não
consegue dar `fill` neles, e não deveriam ser sobrescritos mesmo que
desse): `ac`, `pb` (bonus de proficiência), `initiative`, todos os
`*_mod` de atributo, os `*_bonus` de pericia/salvaguarda, `passive_wisdom`.

Pré-requisito de configuração manual (uma vez, na ficha do Roll20,
aba Settings): mudar **Inventory** e **FEATURES & TRAITS** para
"Simple" antes de rodar a sincronização — senão os campos
`attr_equipment`/`attr_features_and_traits` não existem no DOM (a
ficha usa as seções repetíveis em vez deles) e o relatório final vai
listá-los como pulados.

## Seção repetível `repeating_attack` (armas)

Cada linha nova é criada clicando no botão "+" que a Roll20 injeta no
final do `fieldset.repeating_attack` (classe `repcontrol_add`, gerada
em runtime pela própria Roll20 — não existe no HTML estático da
ficha). Depois de adicionar N linhas, elas aparecem em ordem no DOM
dentro de `.repeating_attack .attack`, então dá pra selecionar a
linha pelo índice (`nth(i)`) em vez de precisar saber o ID aleatório
que a Roll20 gera pra cada linha.

Campos por linha usados no v1 (os demais — alcance, munição,
descrição, salvaguarda — ficam de fora):

| Roll20 `attr_*` (dentro da linha) | Tipo | Uso |
|---|---|---|
| `atkname` | text | nome da arma |
| `atkattr_base` | `<select>` | zerar (`value="0"`, opção "-") porque o bônus de ataque do PDF já vem somado |
| `atkmod` | text (numérico) | bônus de ataque final, ex. `+6` → `6` |
| `atkprofflag` | checkbox | desmarcar (o bônus já inclui proficiência) |
| `dmgbase` | text | dado de dano, ex. `1d8` |
| `dmgattr` | `<select>` | zerar (`value="0"`) pelo mesmo motivo do `atkattr_base` |
| `dmgmod` | text (numérico) | bônus de dano fixo |
| `dmgtype` | text | tipo de dano em inglês (ex. `Slashing`) |

## Correlação dos checkboxes do PDF (WotC fillable oficial)

No PDF real do usuário (`test/fixtures/ficha-exemplo.pdf`, 334 campos)
os checkboxes de proficiência **não têm nome semântico** — são só
`Check Box N`. Foi necessário abrir o PDF com `pdf-lib`, pegar a
posição (`rect`/página) de cada widget e cruzar com os campos de
texto vizinhos (mesma linha) pra descobrir a qual pericia/salvaguarda
cada um corresponde. Resultado (validado batendo com o texto de
`ProficienciesLang` do PDF de exemplo: salvaguardas Força e
Constituição marcadas, casa com `Check Box 11` e `Check Box 19`
marcados como `true` nesse PDF):

- Salvaguardas: `Check Box 11`=Força, `18`=Destreza, `19`=Constituição,
  `20`=Inteligência, `21`=Sabedoria, `22`=Carisma.
- Mortes (3 sucessos + 3 falhas): `Check Box 12,13,14`=sucesso 1/2/3,
  `15,16,17`=falha 1/2/3.
- Perícias: **cuidado, isto não é "ordem alfabética do PDF" simples — foi
  corrigido após uma revisão final ter pego um erro no mapeamento
  original.** O template é o mesmo AcroForm em inglês da WotC, só que
  localizado em PT-BR: os *nomes* dos campos (`Check Box N`) ficaram
  na ordem alfabética ORIGINAL EM INGLÊS das 18 perícias, mas os
  *rótulos impressos* na página foram reordenados para a ordem
  alfabética em PORTUGUÊS. Ou seja, `Check Box 24` é o campo que, no
  template em inglês, ficava na posição de "Animal Handling" — mas
  como os rótulos foram re-triados para PT, essa posição na página
  agora imprime "Arcanismo" (2ª pericia em ordem alfabética PT). O
  nome do campo e a pericia que ele efetivamente marca **não são a
  mesma coisa**: o campo é identificado pela sua *posição* (Nª em
  ordem alfabética EN), e essa posição precisa ser reindexada contra
  a ordem alfabética PT para achar a pericia certa.

  Isto foi pego em revisão final, não assumido: o `Check Box 25`
  (nomeado "Arcana" no AcroForm) está `true` no PDF de exemplo, mas o
  modificador de pericia impresso ao lado é `+6` — impossível para
  Arcana (INT+1 nesse personagem), e exatamente o valor esperado para
  Atletismo (STR+4 com proficiência). Confirmado batendo com
  `ProficienciesLang`: as únicas 5 perícias que o texto do PDF lista
  como proficientes são Atletismo, História, Intimidação, Percepção e
  Sobrevivência — e são exatamente as 5 que saem `true` com a tabela
  corrigida abaixo.

  Tabela corrigida (campo do PDF → pericia que ele realmente marca):

  | Campo do PDF | Pericia (rótulo impresso) |
  |---|---|
  | `Check Box 23` (campo "Acrobatics") | Acrobacia |
  | `Check Box 24` (campo "Animal Handling") | Arcanismo |
  | `Check Box 25` (campo "Arcana") | Atletismo |
  | `Check Box 26` (campo "Athletics") | Atuação |
  | `Check Box 27` (campo "Deception") | Enganação |
  | `Check Box 28` (campo "History") | Furtividade |
  | `Check Box 29` (campo "Insight") | História |
  | `Check Box 30` (campo "Intimidation") | Intimidação |
  | `Check Box 31` (campo "Investigation") | Intuição |
  | `Check Box 32` (campo "Medicine") | Investigação |
  | `Check Box 33` (campo "Nature") | Lidar com Animais |
  | `Check Box 34` (campo "Perception") | Medicina |
  | `Check Box 35` (campo "Performance") | Natureza |
  | `Check Box 36` (campo "Persuasion") | Percepção |
  | `Check Box 37` (campo "Religion") | Persuasão |
  | `Check Box 38` (campo "Sleight of Hand") | Prestidigitação |
  | `Check Box 39` (campo "Stealth") | Religião |
  | `Check Box 40` (campo "Survival") | Sobrevivência |

  E o mapeamento correspondente pra `attr_*` do Roll20 (o que está de
  fato em `src/mapping.js`):

  ```js
  const PERICIAS = [
    ['Check Box 23', 'acrobatics_prof'],
    ['Check Box 24', 'arcana_prof'],
    ['Check Box 25', 'athletics_prof'],
    ['Check Box 26', 'performance_prof'],
    ['Check Box 27', 'deception_prof'],
    ['Check Box 28', 'stealth_prof'],
    ['Check Box 29', 'history_prof'],
    ['Check Box 30', 'intimidation_prof'],
    ['Check Box 31', 'insight_prof'],
    ['Check Box 32', 'investigation_prof'],
    ['Check Box 33', 'animal_handling_prof'],
    ['Check Box 34', 'medicine_prof'],
    ['Check Box 35', 'nature_prof'],
    ['Check Box 36', 'perception_prof'],
    ['Check Box 37', 'persuasion_prof'],
    ['Check Box 38', 'sleight_of_hand_prof'],
    ['Check Box 39', 'religion_prof'],
    ['Check Box 40', 'survival_prof'],
  ];
  ```

Esses números de checkbox são específicos da *versão* do template
PDF (a mesma pra todas as fichas exportadas dele, incluindo os PDFs
de nível 2 e nível 4 do usuário — os dois batem os mesmos IDs). Se o
segundo jogador (fora do escopo do v1) usar um PDF de uma revisão
diferente do template da WotC, esses números podem mudar e precisam
ser reconferidos com o mesmo método (posição x/y por página) — e,
crucialmente, reconferindo também se aquela revisão sofre do mesmo
desalinhamento nome-do-campo vs. rótulo-impresso descrito acima (não
assumir que o nome do campo bate com a pericia impressa só porque
"parece" o nome certo).
