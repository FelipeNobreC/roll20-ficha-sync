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
