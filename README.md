# roll20-ficha-sync

Atualiza uma ficha de personagem de D&D 5e existente no Roll20
("5th Edition OGL by Roll20") a partir de um PDF preenchível oficial da
Wizards of the Coast.

## Uso

```bash
npm install
cp config.example.json config.json
# edite config.json com a URL do personagem (email/senha nao sao mais
# usados pelo script — ver "Login" abaixo)
# (o comando "cp" acima e Unix/Git Bash; no cmd.exe do Windows, que nao e o
# PowerShell, use "copy config.example.json config.json" no lugar)

# revise o mapeamento antes de tocar na ficha de verdade:
node atualizar-ficha.js caminho/ficha.pdf --dry-run

# depois de revisar, aplique de verdade:
node atualizar-ficha.js caminho/ficha.pdf --config config.json
```

O modo "Simple" (Inventory/FEATURES & TRAITS/Proficiencies) é ativado
automaticamente pelo próprio script a cada execução — não precisa mexer
nas configurações da ficha manualmente.

## Login

A Roll20 bloqueia login automatizado (Cloudflare). Por isso, ao rodar
sem `--dry-run`:

1. Uma janela do **Google Chrome** abre sozinha (precisa estar instalado
   em `C:\Program Files\Google\Chrome\Application\chrome.exe` — o
   caminho está fixo em `src/roll20-updater.js`, ajuste lá se o seu
   Chrome estiver em outro lugar).
2. Na primeira vez, a janela abre na página de login da Roll20 e o
   terminal fica esperando — **faça login manualmente** (até 5 minutos
   de prazo). Da segunda execução em diante, a sessão fica salva num
   perfil próprio (`~/.roll20-ficha-sync/chrome-profile`, fora do
   projeto) e você não precisa logar de novo, a menos que a sessão
   expire.
3. O script então navega até o personagem e preenche os campos sozinho,
   na mesma janela.

## Limitações conhecidas

- **Atributos de habilidade (Força, Destreza, etc.) não são
  preenchidos.** Nessa versão da ficha, o campo editável é o valor
  *antes* do bônus racial, e o PDF só traz o valor final (já somado) —
  escrever direto causaria bônus racial em dobro. Precisa ser ajustado
  manualmente na ficha.
- Não sincroniza magias/conjuração.
- Não cria personagem novo — só edita um que já existe.
- Suporta só a ficha "5th Edition OGL by Roll20" e o PDF oficial
  preenchível da WotC.
- Um `config.json` por jogador/personagem.
- Perícias/proficiências "personalizadas" com ferramentas específicas
  (tabela separada da ficha) não são preenchidas automaticamente — o
  texto já preenchido em "Outras Proficiências e Idiomas" cobre a
  mesma informação em formato livre.

Detalhes técnicos completos de cada descoberta (seletores, bugs de
timing, etc.) estão em `docs/roll20-5e-ogl-sheet-attrs.md`.
