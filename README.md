# roll20-ficha-sync

Atualiza uma ficha de personagem de D&D 5e existente no Roll20
("5th Edition OGL by Roll20") a partir de um PDF preenchível oficial da
Wizards of the Coast.

## Uso

```bash
npm install
npx playwright install chromium
cp config.example.json config.json
# edite config.json com seu email, senha e a URL do personagem

# revise o mapeamento antes de tocar na ficha de verdade:
node atualizar-ficha.js caminho/ficha.pdf --dry-run

# depois de revisar, aplique de verdade:
node atualizar-ficha.js caminho/ficha.pdf --config config.json
```

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
