// JSON-схемы ответов для response_format (структурированный вывод Yandex AI Studio).
const nullable = (s: object) => ({ anyOf: [{ type: 'null' }, s] });

const effect = {
  type: 'object',
  required: ['kind'],
  properties: {
    kind: { enum: ['damage', 'heal', 'condition', 'npc_attitude', 'reveal_info', 'flag', 'move', 'take_item'] },
    dice: { type: 'string', pattern: '^[1-9][0-9]?d(4|6|8|10|12|20)([+-][0-9]{1,2})?$' },
    damage_type: { type: 'string' },
    condition: { enum: ['prone', 'frightened', 'restrained', 'poisoned', 'charmed', 'blinded', 'grappled', 'unconscious'] },
    delta: { type: 'integer', minimum: -30, maximum: 30 },
    targets: { type: 'array', items: { type: 'string' } },
    description: { type: 'string', maxLength: 200 },
    location: { type: 'string' },
    flag: { type: 'string' },
    item: { type: 'string' },
    qty: { type: 'integer', minimum: 1, maximum: 99 },
  },
};

export const ARBITER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['allowed', 'action_type', 'normalized_action', 'check', 'targets', 'weapon', 'spell', 'consumes',
    'spell_slot', 'effects_on_success', 'effects_on_failure', 'correction_note'],
  properties: {
    allowed: { type: 'boolean' },
    action_type: { enum: ['skill_check', 'attack', 'spell', 'item_use', 'movement', 'dialogue', 'trivial', 'impossible', 'out_of_game'] },
    normalized_action: { type: 'string', minLength: 3, maxLength: 200 },
    check: nullable({
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'ability', 'skill', 'dc', 'advantage', 'reason'],
      properties: {
        kind: { enum: ['ability_check', 'attack_roll', 'saving_throw', 'contest'] },
        ability: { enum: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
        skill: nullable({ enum: ['acrobatics', 'animal_handling', 'arcana', 'athletics', 'deception', 'history', 'insight',
          'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion',
          'sleight_of_hand', 'stealth', 'survival'] }),
        dc: { type: 'integer', minimum: 5, maximum: 30 },
        advantage: { enum: ['none', 'advantage', 'disadvantage'] },
        reason: { type: 'string', maxLength: 200 },
      },
    }),
    targets: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    weapon: nullable({ type: 'string' }),
    spell: nullable({ type: 'string' }),
    consumes: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    spell_slot: nullable({ type: 'integer', minimum: 1, maximum: 9 }),
    effects_on_success: { type: 'array', items: effect, maxItems: 6 },
    effects_on_failure: { type: 'array', items: effect, maxItems: 6 },
    correction_note: nullable({ type: 'string', maxLength: 300 }),
  },
};

export const NARRATOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['narration', 'choices', 'scene_tags', 'memory_note', 'safety'],
  properties: {
    narration: { type: 'string', minLength: 50, maxLength: 1600 },
    choices: {
      type: 'array', minItems: 3, maxItems: 4,
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'label', 'icon'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string', maxLength: 60 },
          icon: { enum: ['attack', 'magic', 'talk', 'sneak', 'explore', 'item', 'rest', 'move', 'other'] },
        },
      },
    },
    scene_tags: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    memory_note: nullable({ type: 'string', maxLength: 200 }),
    safety: { enum: ['ok', 'redirected'] },
  },
};
