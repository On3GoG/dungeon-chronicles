// Справочники механики. Совместимо с 5E (SRD 5.2, CC-BY-4.0), упрощено для мобильного формата.
import type { ClassDef, CreatureDef, ItemDef, Skill, Ability, SpellDef } from '../types.ts';

export const SKILL_ABILITY: Record<Skill, Ability> = {
  acrobatics: 'DEX', animal_handling: 'WIS', arcana: 'INT', athletics: 'STR', deception: 'CHA',
  history: 'INT', insight: 'WIS', intimidation: 'CHA', investigation: 'INT', medicine: 'WIS',
  nature: 'INT', perception: 'WIS', performance: 'CHA', persuasion: 'CHA', religion: 'INT',
  sleight_of_hand: 'DEX', stealth: 'DEX', survival: 'WIS',
};

export const RU_ABILITY: Record<Ability, string> = {
  STR: 'Сила', DEX: 'Ловкость', CON: 'Телосложение', INT: 'Интеллект', WIS: 'Мудрость', CHA: 'Харизма',
};
export const RU_ABILITY_GEN: Record<Ability, string> = {
  STR: 'Силы', DEX: 'Ловкости', CON: 'Телосложения', INT: 'Интеллекта', WIS: 'Мудрости', CHA: 'Харизмы',
};
export const RU_SKILL: Record<Skill, string> = {
  acrobatics: 'Акробатика', animal_handling: 'Уход за животными', arcana: 'Магия', athletics: 'Атлетика',
  deception: 'Обман', history: 'История', insight: 'Проницательность', intimidation: 'Запугивание',
  investigation: 'Анализ', medicine: 'Медицина', nature: 'Природа', perception: 'Внимательность',
  performance: 'Выступление', persuasion: 'Убеждение', religion: 'Религия', sleight_of_hand: 'Ловкость рук',
  stealth: 'Скрытность', survival: 'Выживание',
};

export const CLASSES: Record<string, ClassDef> = {
  fighter: { id: 'fighter', name: 'Воин', hitDie: 10, saves: ['STR', 'CON'] },
  rogue: { id: 'rogue', name: 'Плут', hitDie: 8, saves: ['DEX', 'INT'] },
  wizard: { id: 'wizard', name: 'Волшебник', hitDie: 6, saves: ['INT', 'WIS'], castingAbility: 'INT' },
  cleric: { id: 'cleric', name: 'Жрец', hitDie: 8, saves: ['WIS', 'CHA'], castingAbility: 'WIS' },
};

const list = <T extends { id: string }>(xs: T[]): Record<string, T> => Object.fromEntries(xs.map((x) => [x.id, x]));

export const ITEMS: Record<string, ItemDef> = list<ItemDef>([
  { id: 'longsword', name: 'Длинный меч', kind: 'weapon', damage: '1d8', damageType: 'рубящий', ability: 'STR', value: 15 },
  { id: 'shortsword', name: 'Короткий меч', kind: 'weapon', damage: '1d6', damageType: 'колющий', finesse: true, value: 10 },
  { id: 'dagger', name: 'Кинжал', kind: 'weapon', damage: '1d4', damageType: 'колющий', finesse: true, value: 2 },
  { id: 'shortbow', name: 'Короткий лук', kind: 'weapon', damage: '1d6', damageType: 'колющий', ability: 'DEX', ranged: true, ammo: 'arrow', value: 25 },
  { id: 'quarterstaff', name: 'Боевой посох', kind: 'weapon', damage: '1d6', damageType: 'дробящий', ability: 'STR', value: 1 },
  { id: 'mace', name: 'Булава', kind: 'weapon', damage: '1d6', damageType: 'дробящий', ability: 'STR', value: 5 },
  { id: 'scimitar', name: 'Скимитар', kind: 'weapon', damage: '1d6', damageType: 'рубящий', finesse: true, value: 25 },
  { id: 'shield', name: 'Щит', kind: 'shield', value: 10 },
  { id: 'arrow', name: 'Стрела', kind: 'ammo', value: 0 },
  { id: 'torch', name: 'Факел', kind: 'tool', value: 0 },
  { id: 'rope', name: 'Верёвка, 15 м', kind: 'tool', value: 1 },
  { id: 'rations', name: 'Паёк', kind: 'consumable', value: 1 },
  { id: 'thieves_tools', name: 'Воровские инструменты', kind: 'tool', value: 25 },
  { id: 'spellbook', name: 'Книга заклинаний', kind: 'misc' },
  { id: 'component_pouch', name: 'Мешочек с компонентами', kind: 'misc' },
  { id: 'holy_symbol', name: 'Священный символ', kind: 'misc' },
  { id: 'healing_potion', name: 'Зелье лечения', kind: 'consumable', heal: '2d4+2', value: 50 },
  { id: 'wooden_horse', name: 'Деревянная лошадка', kind: 'misc' },
  { id: 'cave_map', name: 'Нацарапанная карта пещер', kind: 'misc' },
  { id: 'silver_pouch', name: 'Мешочек серебра', kind: 'misc', value: 15 },
  { id: 'chief_key', name: 'Ключ вождя', kind: 'tool' },
]);

export const SPELLS: Record<string, SpellDef> = list<SpellDef>([
  { id: 'fire_bolt', name: 'Огненный снаряд', level: 0, kind: 'attack', damage: '1d10', damageType: 'огонь' },
  { id: 'sacred_flame', name: 'Священное пламя', level: 0, kind: 'save', save: 'DEX', damage: '1d8', damageType: 'излучение' },
  { id: 'light', name: 'Свет', level: 0, kind: 'utility' },
  { id: 'mage_hand', name: 'Волшебная рука', level: 0, kind: 'utility' },
  { id: 'guidance', name: 'Указание', level: 0, kind: 'utility' },
  { id: 'magic_missile', name: 'Волшебная стрела', level: 1, kind: 'auto_damage', damage: '3d4+3', damageType: 'силовой' },
  { id: 'shield_spell', name: 'Щит', level: 1, kind: 'utility' },
  { id: 'sleep', name: 'Усыпление', level: 1, kind: 'condition', save: 'WIS', condition: 'unconscious' },
  { id: 'healing_word', name: 'Лечащее слово', level: 1, kind: 'heal', heal: '2d4', addMod: true },
  { id: 'cure_wounds', name: 'Лечение ран', level: 1, kind: 'heal', heal: '2d8', addMod: true },
  { id: 'bless', name: 'Благословение', level: 1, kind: 'utility' },
  { id: 'misty_step', name: 'Туманный шаг', level: 2, kind: 'utility' },
  { id: 'spiritual_weapon', name: 'Духовное оружие', level: 2, kind: 'attack', damage: '1d8', damageType: 'силовой', addMod: true },
]);

export const CREATURES: Record<string, CreatureDef> = list<CreatureDef>([
  { id: 'goblin', name: 'Гоблин', ac: 13, hp: 7, mods: { STR: -1, DEX: 2, WIS: -1 }, xp: 50,
    attack: { name: 'ржавый нож', bonus: 4, damage: '1d6+2', damageType: 'колющий' }, gold: 2 },
  { id: 'goblin_archer', name: 'Гоблин-лучник', ac: 13, hp: 7, mods: { STR: -1, DEX: 2, WIS: -1 }, xp: 50,
    attack: { name: 'короткий лук', bonus: 4, damage: '1d6+2', damageType: 'колющий', ranged: true }, loot: [{ item: 'arrow', qty: 4 }] },
  { id: 'goblin_shaman', name: 'Гоблин-шаман', ac: 12, hp: 12, mods: { DEX: 2, WIS: 2 }, xp: 100,
    attack: { name: 'огненный плевок', bonus: 4, damage: '2d4', damageType: 'огонь', ranged: true }, loot: [{ item: 'healing_potion', qty: 1 }] },
  { id: 'wolf', name: 'Волк', ac: 13, hp: 11, mods: { STR: 1, DEX: 2, WIS: 1 }, xp: 50,
    attack: { name: 'укус', bonus: 4, damage: '2d4+2', damageType: 'колющий' } },
  { id: 'chief_wolf', name: 'Волк вождя', ac: 13, hp: 16, mods: { STR: 2, DEX: 2, WIS: 1 }, xp: 100,
    attack: { name: 'укус', bonus: 5, damage: '2d4+3', damageType: 'колющий' } },
  { id: 'goblin_chief', name: 'Кривой Клык, вождь гоблинов', ac: 15, hp: 24, mods: { STR: 1, DEX: 2, CON: 1, WIS: 0 }, xp: 200,
    attack: { name: 'скимитар', bonus: 5, damage: '1d6+3', damageType: 'рубящий' },
    loot: [{ item: 'scimitar', qty: 1 }, { item: 'chief_key', qty: 1 }], gold: 25 },
]);

export const XP_LEVELS = [0, 300, 900, 2700, 6500];
