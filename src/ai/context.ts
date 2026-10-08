// Сборка контекста для арбитра и рассказчика из состояния игры.
// Порядок блоков: сначала неизменное (кампания), потом меняющееся — так лучше работает кэш промпта.
import type { GameState } from '../types.ts';
import type { EngineResult } from '../engine/resolve.ts';
import { CLASSES, CREATURES, SPELLS } from '../data/rules_data.ts';
import { abilityMod, campaignOf, entitiesHere, here, itemName, locationDef, spellSaveDc } from '../engine/state.ts';

// Арбитру и рассказчику нужны разные части состояния: арбитру — id и цифры механики,
// рассказчику — имена, описание и последние события. Лишнее не отправляем: каждый токен стоит денег.
export type Role = 'arbiter' | 'narrator';
const MEMORY_FACTS: Record<Role, number> = { arbiter: 6, narrator: 8 };
const RECENT_TURNS: Record<Role, number> = { arbiter: 2, narrator: 2 };
const NARRATION_SNIPPET = 220;

export function campaignBlock(state: GameState, role: Role = 'narrator'): string {
  const c = campaignOf(state);
  return role === 'arbiter' ? `«${c.title}». ${c.brief ?? c.premise}` : `«${c.title}». ${c.premise}\n${c.skeleton}`;
}

export function memoryBlock(state: GameState, role: Role = 'narrator'): string {
  const facts = [...new Set(state.memory)].slice(-MEMORY_FACTS[role]);
  const parts: string[] = [];
  if (state.summary) parts.push(`Ранее: ${state.summary}`);
  if (facts.length) parts.push(facts.map((f) => `- ${f}`).join('\n'));
  if (state.flags.length) {
    const desc = new Map(campaignOf(state).flags.map((f) => [f.id, f.description]));
    parts.push(`Мир: ${state.flags.map((f) => desc.get(f) ?? f).join('; ')}.`);
  }
  return parts.join('\n') || 'Пока ничего важного.';
}

export function sceneBlock(state: GameState, role: Role = 'arbiter'): string {
  const def = locationDef(state);
  const ls = here(state);
  if (role === 'narrator') {
    const items = ls.items.map((i) => itemName(i.item));
    if (ls.gold > 0) items.push('золото');
    return `${def.name}. ${def.description}\nВыходы: ${def.exits.map((e) => e.description).join('; ')}.` +
      (items.length ? `\nЛежит: ${items.join(', ')}.` : '');
  }
  const exits = def.exits.map((e) => `${e.to} — ${e.description}`).join('; ');
  const items = ls.items.map((i) => `${i.item}${i.qty > 1 ? ` ×${i.qty}` : ''}`);
  if (ls.gold > 0) items.push(`gold ×${ls.gold}`);
  const flags = campaignOf(state).flags.filter((f) => !state.flags.includes(f.id) && f.id !== campaignOf(state).victoryFlag)
    .map((f) => `${f.id} — ${f.description}`).join('; ');
  return `${def.name} (${def.id}). ${def.description}\n<exits>${exits}</exits>\n<items_here>${items.join(', ') || 'нет'}</items_here>\n<story_flags>${flags || 'нет'}</story_flags>`;
}

function hpWord(hp: number, max: number): string {
  const r = hp / Math.max(1, max);
  return r >= 1 ? 'невредим' : r > 0.5 ? 'ранен' : r > 0.2 ? 'тяжело ранен' : 'при смерти';
}

export function entitiesBlock(state: GameState, role: Role = 'arbiter'): string {
  const list = entitiesHere(state).filter((e) => e.alive);
  if (!list.length) return 'Никого нет.';
  return list.map((e) => {
    const bits = [role === 'arbiter' ? `${e.id}: ${e.name}` : e.name];
    if (e.description) bits.push(e.description);
    if (e.kind === 'creature') {
      if (role === 'arbiter') bits.push(`КД ${e.ac}, хиты ${e.hp}/${e.maxHp}`);
      else bits.push(hpWord(e.hp ?? 1, e.maxHp ?? 1));
      const t = e.template ? CREATURES[e.template] : undefined;
      if (t && role === 'arbiter') bits.push(`атака: ${t.attack.name}`);
      if (!e.aware) bits.push('не замечает героя');
    }
    if (e.kind !== 'object') {
      bits.push(e.hostile ? 'враждебен' : 'не враждебен');
      if (role === 'arbiter') bits.push(`отношение ${e.attitude}`);
    }
    if (e.conditions.length) bits.push(e.conditions.join(', '));
    return `- ${bits.join('; ')}`;
  }).join('\n');
}

export function characterBlock(state: GameState, role: Role = 'arbiter'): string {
  const h = state.hero;
  const cls = CLASSES[h.classId];
  const head = `${h.name}, ${h.origin}, ${cls?.name ?? h.classId} ${h.level} ур. Хиты ${h.hp}/${h.maxHp}.`;
  if (role === 'narrator') {
    const inv = h.inventory.map((i) => `${itemName(i.item)}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || 'пусто';
    const lines = [head, `Снаряжение: ${inv}. Золото: ${h.gold}.`];
    if (h.spells.length) lines.push(`Заклинания: ${h.spells.map((s) => SPELLS[s]?.name ?? s).join(', ')}.`);
    if (h.conditions.length) lines.push(`Состояния: ${h.conditions.join(', ')}.`);
    return lines.join('\n');
  }
  const ab = (Object.keys(h.abilities) as (keyof typeof h.abilities)[])
    .map((a) => `${a} ${abilityMod(h, a) >= 0 ? '+' : ''}${abilityMod(h, a)}`).join(', ');
  const inv = h.inventory.map((i) => `${i.item}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || 'пусто';
  const lines = [
    `${head} КД ${h.ac}. Модификаторы: ${ab}.`,
    `Навыки: ${h.proficient.join(', ') || 'нет'}.`,
    `Инвентарь: ${inv}. Золото: ${h.gold}.`,
  ];
  if (h.spells.length) {
    const slots = Object.entries(h.slots).map(([l, s]) => `${l} ур. ${s.max - s.used}/${s.max}`).join(', ');
    lines.push(`Заклинания: ${h.spells.map((s) => `${s}${SPELLS[s]?.level ? ` (${SPELLS[s].level} ур.)` : ' (заговор)'}`).join(', ')}.`);
    lines.push(`Ячейки: ${slots || 'нет'}. СЛ заклинаний ${spellSaveDc(h)}.`);
  } else {
    lines.push('Заклинаний нет.');
  }
  if (h.conditions.length) lines.push(`Состояния: ${h.conditions.join(', ')}.`);
  return lines.join('\n');
}

export function recentTurnsBlock(state: GameState, role: Role = 'narrator'): string {
  const turns = state.history.filter((t) => t.outcome !== 'intro').slice(-RECENT_TURNS[role]);
  if (!turns.length) return 'Это первый ход.';
  if (role === 'arbiter') return turns.map((t) => `- ${t.normalized ?? t.player} (${t.outcome})`).join('\n');
  return turns.map((t) => {
    const short = t.narration.length > NARRATION_SNIPPET ? `${t.narration.slice(0, NARRATION_SNIPPET)}…` : t.narration;
    return `- Игрок: ${t.player}. ${short}`;
  }).join('\n');
}

export function engineResultBlock(r: EngineResult, normalized: string): string {
  const lines = [`Действие: ${normalized}`, `Исход: ${r.outcome === 'rejected' ? 'не выполнено' : r.summary}`];
  if (r.correction_note) lines.push(`correction_note: ${r.correction_note}`);
  if (r.events.length) lines.push(`События:\n${r.events.map((e) => `- ${e}`).join('\n')}`);
  if (r.enemyActions.length) lines.push(`Ход противников:\n${r.enemyActions.map((e) => `- ${e}`).join('\n')}`);
  if (r.after.length) lines.push(`Итоги:\n${r.after.map((e) => `- ${e}`).join('\n')}`);
  if (r.defeated) lines.push('Герой побеждён и приходит в себя в безопасном месте.');
  if (r.levelUp) lines.push(`Герой достиг ${r.levelUp} уровня.`);
  if (r.victory) lines.push('ПОБЕДА: кампания завершена.');
  return lines.join('\n');
}

export function buildUserMessage(state: GameState, playerAction: string, extra?: { engine: string }): string {
  const role: Role = extra ? 'narrator' : 'arbiter';
  // Неизменная часть (кампания) — первой: одинаковое начало запроса может попасть в кэш провайдера.
  const parts = [
    `<campaign>${campaignBlock(state, role)}</campaign>`,
    `<memory>\n${memoryBlock(state, role)}\n</memory>`,
    `<scene>\n${sceneBlock(state, role)}\n</scene>`,
    `<creatures_and_objects>\n${entitiesBlock(state, role)}\n</creatures_and_objects>`,
    `<character>\n${characterBlock(state, role)}\n</character>`,
    `<recent_turns>\n${recentTurnsBlock(state, role)}\n</recent_turns>`,
    `<player_action>${playerAction}</player_action>`,
  ];
  if (extra) parts.push(`<engine_result>\n${extra.engine}\n</engine_result>`);
  return parts.join('\n');
}
