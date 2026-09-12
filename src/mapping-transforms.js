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
