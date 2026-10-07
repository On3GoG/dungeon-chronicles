// Разбор и проверка JSON от моделей. Мелкие огрехи чиним, грубые — возвращаем как ошибки для повторного запроса.
import type { ArbiterDecision, Choice, Effect, NarratorResponse } from '../types.ts';

const ACTION_TYPES = ['skill_check', 'attack', 'spell', 'item_use', 'movement', 'dialogue', 'trivial', 'impossible', 'out_of_game'];
const CHECK_KINDS = ['ability_check', 'attack_roll', 'saving_throw', 'contest'];
const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const ADV = ['none', 'advantage', 'disadvantage'];
const ICONS = ['attack', 'magic', 'talk', 'sneak', 'explore', 'item', 'rest', 'move', 'other'];

/** Достаёт первый JSON-объект из ответа модели (срезает ```json, вступления и хвосты). */
export function extractJson(text: string): unknown {
  const t = String(text ?? '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(t); } catch { /* ищем объект внутри */ }
  const start = t.indexOf('{');
  if (start < 0) throw new Error('в ответе нет JSON');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error('JSON оборван');
}

const str = (v: unknown, max = 300): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/^\+/, '')) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
};
const strList = (v: unknown, max = 6): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()).slice(0, max) : [];

function effect(v: unknown): Effect | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const kind = str(o.kind);
  if (!kind) return null;
  const e: Effect = { kind: kind as Effect['kind'] };
  if (str(o.dice)) e.dice = str(o.dice)!.replace(/\s/g, '');
  if (str(o.damage_type)) e.damage_type = str(o.damage_type, 40)!;
  if (str(o.condition)) e.condition = str(o.condition) as Effect['condition'];
  if (int(o.delta) !== null) e.delta = int(o.delta)!;
  if (Array.isArray(o.targets)) e.targets = strList(o.targets);
  if (str(o.description)) e.description = str(o.description, 240)!;
  if (str(o.location)) e.location = str(o.location, 60)!;
  if (str(o.flag)) e.flag = str(o.flag, 60)!;
  if (str(o.item)) e.item = str(o.item, 60)!;
  if (int(o.qty) !== null) e.qty = Math.max(1, int(o.qty)!);
  return e;
}

export function validateArbiter(raw: unknown): { value: ArbiterDecision | null; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: null, errors: ['ответ не объект'] };
  const o = raw as Record<string, unknown>;
  if (typeof o.allowed !== 'boolean') errors.push('allowed должен быть true/false');
  const at = str(o.action_type);
  if (!at || !ACTION_TYPES.includes(at)) errors.push(`action_type должен быть одним из: ${ACTION_TYPES.join(', ')}`);
  let check: ArbiterDecision['check'] = null;
  if (o.check && typeof o.check === 'object') {
    const c = o.check as Record<string, unknown>;
    const kind = str(c.kind), ability = str(c.ability)?.toUpperCase(), dc = int(c.dc);
    if (!kind || !CHECK_KINDS.includes(kind)) errors.push('check.kind неверен');
    if (!ability || !ABILITIES.includes(ability)) errors.push('check.ability неверна');
    if (dc === null) errors.push('check.dc должен быть числом');
    const adv = str(c.advantage) ?? 'none';
    check = {
      kind: kind as NonNullable<ArbiterDecision['check']>['kind'], ability: ability as NonNullable<ArbiterDecision['check']>['ability'],
      skill: (str(c.skill) as NonNullable<ArbiterDecision['check']>['skill']) ?? null, dc: dc ?? 15,
      advantage: (ADV.includes(adv) ? adv : 'none') as NonNullable<ArbiterDecision['check']>['advantage'],
      reason: str(c.reason, 200) ?? '',
    };
  }
  if (errors.length) return { value: null, errors };
  const effects = (v: unknown) => (Array.isArray(v) ? v.map(effect).filter((e): e is Effect => !!e).slice(0, 6) : []);
  return {
    errors,
    value: {
      allowed: o.allowed as boolean,
      action_type: at as ArbiterDecision['action_type'],
      normalized_action: str(o.normalized_action, 200) ?? 'Действие героя',
      check,
      targets: strList(o.targets),
      weapon: str(o.weapon, 40),
      spell: str(o.spell, 40),
      consumes: strList(o.consumes, 5),
      spell_slot: int(o.spell_slot),
      effects_on_success: effects(o.effects_on_success),
      effects_on_failure: effects(o.effects_on_failure),
      correction_note: str(o.correction_note, 300),
    },
  };
}

export function validateNarrator(raw: unknown): { value: NarratorResponse | null; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: null, errors: ['ответ не объект'] };
  const o = raw as Record<string, unknown>;
  const narration = str(o.narration, 2000);
  if (!narration || narration.length < 20) errors.push('narration пуст или слишком короткий');
  const choices: Choice[] = [];
  if (Array.isArray(o.choices)) {
    for (const c of o.choices) {
      const label = typeof c === 'string' ? str(c, 80) : str((c as Record<string, unknown>)?.label, 80);
      if (!label) continue;
      const icon = typeof c === 'object' && c ? str((c as Record<string, unknown>).icon) : null;
      choices.push({ id: `c${choices.length + 1}`, label, icon: icon && ICONS.includes(icon) ? icon : 'other' });
    }
  }
  if (choices.length < 2) errors.push('нужно 3–4 варианта в choices');
  if (errors.length) return { value: null, errors };
  return {
    errors,
    value: {
      narration: narration!,
      choices: choices.slice(0, 4),
      scene_tags: strList(o.scene_tags, 8),
      memory_note: str(o.memory_note, 200),
      safety: o.safety === 'redirected' ? 'redirected' : 'ok',
    },
  };
}
