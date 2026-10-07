// Готовые герои для прототипа (создание персонажа с нуля — в MVP).
import type { Hero } from '../types.ts';

export interface HeroPreset { id: string; title: string; blurb: string; hero: Hero }

export const HERO_PRESETS: HeroPreset[] = [
  {
    id: 'fighter', title: 'Воин', blurb: 'Крепкий боец с мечом и щитом. Прост в игре, держит удар.',
    hero: {
      name: 'Борислав', origin: 'Человек', classId: 'fighter', level: 1, xp: 0, hp: 12, maxHp: 12, ac: 18,
      abilities: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      proficient: ['athletics', 'intimidation', 'perception', 'survival'],
      spells: [], slots: {},
      inventory: [{ item: 'longsword', qty: 1 }, { item: 'shield', qty: 1 }, { item: 'torch', qty: 3 },
        { item: 'rope', qty: 1 }, { item: 'rations', qty: 3 }, { item: 'healing_potion', qty: 1 }],
      gold: 12, conditions: [],
    },
  },
  {
    id: 'rogue', title: 'Плут', blurb: 'Ловкий и хитрый: скрытность, замки, обман, точный выстрел.',
    hero: {
      name: 'Лиса', origin: 'Полурослик', classId: 'rogue', level: 1, xp: 0, hp: 9, maxHp: 9, ac: 14,
      abilities: { STR: 8, DEX: 17, CON: 12, INT: 13, WIS: 12, CHA: 14 },
      proficient: ['stealth', 'sleight_of_hand', 'deception', 'persuasion', 'acrobatics', 'investigation', 'perception'],
      spells: [], slots: {},
      inventory: [{ item: 'shortsword', qty: 1 }, { item: 'shortbow', qty: 1 }, { item: 'arrow', qty: 20 },
        { item: 'thieves_tools', qty: 1 }, { item: 'dagger', qty: 2 }, { item: 'torch', qty: 1 }],
      gold: 8, conditions: [],
    },
  },
  {
    id: 'wizard', title: 'Волшебник', blurb: 'Хрупкий, но опасный: огонь, волшебные стрелы, сон для врагов.',
    hero: {
      name: 'Аэлин', origin: 'Эльф', classId: 'wizard', level: 1, xp: 0, hp: 7, maxHp: 7, ac: 12,
      abilities: { STR: 8, DEX: 14, CON: 12, INT: 17, WIS: 13, CHA: 10 },
      proficient: ['arcana', 'history', 'investigation', 'insight'],
      spells: ['fire_bolt', 'light', 'mage_hand', 'magic_missile', 'shield_spell', 'sleep'],
      slots: { '1': { max: 2, used: 0 } },
      inventory: [{ item: 'quarterstaff', qty: 1 }, { item: 'spellbook', qty: 1 }, { item: 'component_pouch', qty: 1 },
        { item: 'healing_potion', qty: 1 }],
      gold: 15, conditions: [],
    },
  },
  {
    id: 'cleric', title: 'Жрец', blurb: 'Боевой лекарь в тяжёлой броне: лечит, благословляет, жжёт священным пламенем.',
    hero: {
      name: 'Отец Гримм', origin: 'Дварф', classId: 'cleric', level: 1, xp: 0, hp: 11, maxHp: 11, ac: 18,
      abilities: { STR: 14, DEX: 10, CON: 15, INT: 10, WIS: 16, CHA: 12 },
      proficient: ['religion', 'medicine', 'insight', 'persuasion'],
      spells: ['sacred_flame', 'guidance', 'healing_word', 'cure_wounds', 'bless'],
      slots: { '1': { max: 2, used: 0 } },
      inventory: [{ item: 'mace', qty: 1 }, { item: 'shield', qty: 1 }, { item: 'holy_symbol', qty: 1 }, { item: 'torch', qty: 2 }],
      gold: 10, conditions: [],
    },
  },
];
