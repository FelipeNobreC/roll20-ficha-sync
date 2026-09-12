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
- Perícias (ordem alfabética do PDF): `23`=Acrobatics, `24`=Animal
  Handling, `25`=Arcana, `26`=Athletics, `27`=Deception, `28`=History,
  `29`=Insight, `30`=Intimidation, `31`=Investigation, `32`=Medicine,
  `33`=Nature, `34`=Perception, `35`=Performance, `36`=Persuasion,
  `37`=Religion, `38`=Sleight of Hand, `39`=Stealth, `40`=Survival.

Esses números de checkbox são específicos da *versão* do template
PDF (a mesma pra todas as fichas exportadas dele, incluindo os PDFs
de nível 2 e nível 4 do usuário — os dois batem os mesmos IDs). Se o
segundo jogador (fora do escopo do v1) usar um PDF de uma revisão
diferente do template da WotC, esses números podem mudar e precisam
ser reconferidos com o mesmo método (posição x/y por página).
