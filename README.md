# roll20-ficha-sync

Atualiza uma ficha de personagem de D&D 5e existente no Roll20
("5th Edition OGL by Roll20") a partir de um PDF preenchível oficial da
Wizards of the Coast.

## Uso rápido (Windows, sem digitar comando nenhum)

1. Baixe este projeto inteiro (botão verde **Code → Download ZIP** no
   GitHub, ou `git clone`) e descompacte numa pasta.
2. Dê dois cliques em **`sincronizar.bat`**.
   - Na primeira vez, ele instala tudo sozinho e cria um `config.json`
     — vai pedir pra você editar esse arquivo com a URL do SEU
     personagem no Roll20 e rodar de novo.
3. Nas próximas vezes, dê dois cliques em `sincronizar.bat` de novo (ou
   arraste o PDF da ficha em cima do arquivo `.bat`) — ele pede o
   caminho do PDF, mostra um preview do que vai mudar, pergunta se pode
   aplicar de verdade, e no final avisa com um som e uma janela quando
   terminar.

Precisa ter o [Node.js](https://nodejs.org/) instalado (versão LTS) e o
Google Chrome ou Microsoft Edge (o Edge já vem no Windows).

## Uso via terminal

```bash
npm install
cp config.example.json config.json
# edite config.json com a URL do personagem
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

1. Uma janela do navegador abre sozinha — o script procura o **Google
   Chrome** e, se não achar, o **Microsoft Edge** (que já vem instalado
   no Windows) nos locais mais comuns de cada sistema operacional. Se
   nenhum dos dois for encontrado (instalação em local não padrão), edite
   a lista de caminhos em `localizarNavegador()` no
   `src/roll20-updater.js`.
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
