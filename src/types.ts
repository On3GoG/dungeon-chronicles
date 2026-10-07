// Общие типы прототипа «Хроники Подземелий».
// Код запускается Node.js напрямую (type stripping), поэтому: только `import type` для типов,
// без enum, namespace и параметров-свойств в конструкторах.

export type Ability = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
export type Skill =
  | 'acrobatics' | 'animal_handling' | 'arcana' | 'athletics' | 'deception' | 'history'
  | 'insight' | 'intimidation' | 'investigation' | 'medicine' | 'nature' | 'perception'
  | 'performance' | 'persuasion' | 'religion' | 'sleight_of_hand' | 'stealth' | 'survival';
export type Condition =
  | 'prone' | 'frightened' | 'restrained' | 'poisoned' | 'charmed' | 'blinded' | 'grappled' | 'unconscious';
export type Advantage = 'none' | 'advantage' | 'disadvantage';
export type CheckKind = 'ability_check' | 'attack_roll' | 'saving_throw' | 'contest';
export type ActionType =
  | 'skill_check' | 'attack' | 'spell' | 'item_use' | 'movement' | 'dialogue' | 'trivial' | 'impossible' | 'out_of_game';

// ----------------------------------------------------------------- справочники

export interface ItemDef {
  id: string;
  name: string;
  kind: 'weapon' | 'armor' | 'shield' | 'consumable' | 'tool' | 'ammo' | 'misc';
  damage?: string;          // кубы урона оружия, например "1d8"
  damageType?: string;
  ability?: Ability;        // чем бьют: STR, DEX; finesse → лучшая из двух
  finesse?: boolean;
  ranged?: boolean;
  ammo?: string;            // id боеприпаса
  heal?: string;            // кубы лечения (зелья)
  value?: number;           // цена в золоте
}

export interface SpellDef {
  id: string;
  name: string;
  level: number;            // 0 — заговор
  kind: 'attack' | 'save' | 'auto_damage' | 'heal' | 'condition' | 'utility';
  damage?: string;
  damageType?: string;
  heal?: string;            // кубы + модификатор заклинателя
  save?: Ability;
  condition?: Condition;    // для kind=condition при проваленном спасброске
  addMod?: boolean;         // добавлять модификатор заклинателя к урону/лечению
}

export interface CreatureDef {
  id: string;
  name: string;
  ac: number;
  hp: number;
  attack: { name: string; bonus: number; damage: string; damageType: string; ranged?: boolean };
  mods: Partial<Record<Ability, number>>;
  xp: number;
  loot?: { item: string; qty: number }[];
  gold?: number;
}

export interface ClassDef {
  id: string;
  name: string;
  hitDie: number;
  saves: Ability[];
  castingAbility?: Ability;
}

// ----------------------------------------------------------------- состояние игры

export interface InventoryEntry { item: string; qty: number }

export interface Hero {
  name: string;
  origin: string;
  classId: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  ac: number;
  abilities: Record<Ability, number>;
  proficient: Skill[];
  spells: string[];
  slots: Record<string, { max: number; used: number }>;
  inventory: InventoryEntry[];
  gold: number;
  conditions: Condition[];
}

export interface Entity {
  id: string;
  name: string;
  kind: 'creature' | 'npc' | 'object';
  template?: string;        // id CreatureDef
  description?: string;
  hp?: number;
  maxHp?: number;
  ac?: number;
  hostile: boolean;
  aware: boolean;           // заметил героя (участвует в бою)
  alive: boolean;
  attitude: number;         // −100…100
  conditions: Condition[];
  flags?: string[];
}

export interface LocationDef {
  id: string;
  name: string;
  description: string;
  tags: string[];
  exits: { to: string; description: string }[];
  entities: Entity[];       // начальные существа и предметы обстановки
  items: InventoryEntry[];  // что можно подобрать
  gold?: number;
  safe?: boolean;           // здесь герой приходит в себя после поражения
}

export interface CampaignDef {
  id: string;
  title: string;
  premise: string;          // для ИИ: завязка, злодей, цели
  skeleton: string;         // для ИИ: акты и ключевые события
  intro: string;            // первый текст игроку
  introChoices: string[];
  start: string;
  locations: LocationDef[];
  flags: { id: string; description: string }[]; // сюжетные флаги, которые может ставить арбитр
  victoryFlag: string;     // ставит движок, когда условие победы выполнено
}

export interface LocationState {
  visited: boolean;
  entities: Record<string, Entity>;
  items: InventoryEntry[];
  gold: number;
}

export interface TurnRecord {
  n: number;
  at: string;
  player: string;
  normalized?: string;
  roll?: RollResult | null;
  outcome: Outcome;
  narration: string;
  choices: Choice[];
  notes: string[];          // пояснения игроку (исправления, отказы)
  events: string[];         // что сделал движок, коротко
  cost?: { rub: number; tokensIn: number; tokensOut: number; ms: number };
}

export interface GameState {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  campaignId: string;
  hero: Hero;
  locationId: string;
  locations: Record<string, LocationState>;
  flags: string[];
  memory: string[];         // долгая память: важные факты
  summary: string;          // сводка прошлых глав
  history: TurnRecord[];
  turn: number;
  energy: { value: number; lastRefill: string };
  ads?: { day: string; count: number };   // просмотры рекламы за день (прототип монетизации)
  status: 'playing' | 'won';
}

// ----------------------------------------------------------------- ИИ и разрешение хода

export interface Effect {
  kind: 'damage' | 'heal' | 'condition' | 'npc_attitude' | 'reveal_info' | 'flag' | 'move' | 'take_item';
  dice?: string;
  damage_type?: string;
  condition?: Condition;
  delta?: number;
  targets?: string[];
  description?: string;
  location?: string;        // move: id выхода
  flag?: string;            // flag: id сюжетного флага кампании
  item?: string;            // take_item: id предмета или "gold"
  qty?: number;
}

export interface ArbiterDecision {
  allowed: boolean;
  action_type: ActionType;
  normalized_action: string;
  check: null | {
    kind: CheckKind;
    ability: Ability;
    skill: Skill | null;
    dc: number;
    advantage: Advantage;
    reason: string;
  };
  targets: string[];
  weapon: string | null;
  spell: string | null;
  consumes: string[];
  spell_slot: number | null;
  effects_on_success: Effect[];
  effects_on_failure: Effect[];
  correction_note: string | null;
}

export interface RollResult {
  kind: CheckKind;
  label: string;            // «Проверка Харизмы (Убеждение)»
  dice: number[];           // выпавшие к20
  natural: number;
  modifier: number;
  total: number;
  dc: number;
  advantage: Advantage;
  success: boolean;
  critical: boolean;
}

export type Outcome = 'success' | 'failure' | 'auto' | 'rejected' | 'intro';

export interface Choice { id: string; label: string; icon: string }

export interface NarratorResponse {
  narration: string;
  choices: Choice[];
  scene_tags: string[];
  memory_note: string | null;
  safety: 'ok' | 'redirected';
}
