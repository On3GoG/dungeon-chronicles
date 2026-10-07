// Сборка контекста для арбитра и рассказчика из состояния игры.
// Порядок блоков: сначала неизменное (кампания), потом меняющееся — так лучше работает кэш промпта.
import type { GameState } from '../types.ts';
import type { EngineResult } from '../engine/resolve.ts';
import { CLASSES, CREATURES, RU_SKILL, SPELLS } from '../data/rules_data.ts';
import { abilityMod, campaignOf, entitiesHere, here, itemName, locationDef, spellSaveDc } from '../engine/state.ts';

const RECENT_TURNS = 4;

export function campaignBlock(state: GameState): string {
  const c = campaignOf(state);
  return `«${c.title}». ${c.premise}\n${c.skeleton}`;
}

export function memoryBlock(state: GameState): string {
  const facts = state.memory.slice(-20);
  const parts: string[] = [];
  if (state.summary) parts.push(`Ранее: ${state.summary}`);
  if (facts.length) parts.push(facts.map((f) => `- ${f}`).join('\n'));
  if (state.flags.length) {
    const desc = new Map(campaignOf(state).flags.map((f) => [f.id, f.description]));
    parts.push(`Состояние мира: ${state.flags.map((f) => desc.get(f) ?? f).join('; ')}.`);
  }
  return parts.join('\n') || 'Пока ничего важного не произошло.';
}

export function sceneBlock(state: GameState): string {
  const def = locationDef(state);
  const ls = here(state);
  const exits = def.exits.map((e) => `- ${e.to}: ${e.description} (${locationDef(state, e.to).name})`).join('\n');
  const items = ls.items.map((i) => `- ${i.item}: ${itemName(i.item)} ×${i.qty}`);
  if (ls.gold > 0) items.push(`- gold: золото ×${ls.gold}`);
  const flags = campaignOf(state).flags.filter((f) => !state.flags.includes(f.id) && f.id !== campaignOf(state).victoryFlag)
    .map((f) => `- ${f.id}: ${f.description}`).join('\n');
  return `${def.name} (${def.id}). ${def.description}\n\n<exits>\n${exits}\n</exits>\n\n<items_here>\n${items.join('\n') || 'нет'}\n</items_here>\n\n<story_flags>\n${flags || 'нет'}\n</story_flags>`;
}

export function entitiesBlock(state: GameState): string {
  const list = entitiesHere(state).filter((e) => e.alive);
  if (!list.length) return 'Никого нет.';
  return list.map((e) => {
    const bits = [`${e.id}: ${e.name}`];
    if (e.kind === 'object') bits.push(`предмет обстановки — ${e.description ?? ''}`);
    else {
      if (e.description) bits.push(e.description);
      if (e.kind === 'creature') {
        const t = e.template ? CREATURES[e.template] : undefined;
        bits.push(`КД ${e.ac}, хиты ${e.hp}/${e.maxHp}`);
        if (t) bits.push(`атака: ${t.attack.name}`);
      }
      bits.push(e.hostile ? 'враждебен' : 'не враждебен');
      if (e.kind === 'creature' && !e.aware) bits.push('не замечает героя');
      bits.push(`отношение ${e.attitude}`);
      if (e.conditions.length) bits.push(`состояния: ${e.conditions.join(', ')}`);
    }
    return `- ${bits.join('; ')}`;
  }).join('\n');
}

export function characterBlock(state: GameState): string {
  const h = state.hero;
  const cls = CLASSES[h.classId];
  const ab = (Object.keys(h.abilities) as (keyof typeof h.abilities)[])
    .map((a) => `${a} ${h.abilities[a]} (${abilityMod(h, a) >= 0 ? '+' : ''}${abilityMod(h, a)})`).join(', ');
  const inv = h.inventory.map((i) => `${i.item} (${itemName(i.item)}${i.qty > 1 ? ` ×${i.qty}` : ''})`).join(', ') || 'пусто';
  const lines = [
    `${h.name}, ${h.origin}, ${cls?.name ?? h.classId} ${h.level} уровня.`,
    `Хиты ${h.hp}/${h.maxHp}, КД ${h.ac}. Характеристики: ${ab}.`,
    `Навыки: ${h.proficient.map((s) => `${s} (${RU_SKILL[s]})`).join(', ') || 'нет'}.`,
    `Оружие и снаряжение: ${inv}. Золото: ${h.gold}.`,
  ];
  if (h.spells.length) {
    const slots = Object.entries(h.slots).map(([l, s]) => `${l} ур.: ${s.max - s.used} из ${s.max}`).join(', ');
    lines.push(`Заклинания: ${h.spells.map((s) => `${s} (${SPELLS[s]?.name}, ${SPELLS[s]?.level ? `${SPELLS[s].level} ур.` : 'заговор'})`).join(', ')}.`);
    lines.push(`Свободные ячейки: ${slots || 'нет'}. СЛ спасброска от заклинаний: ${spellSaveDc(h)}.`);
  } else {
    lines.push('Заклинаний нет.');
  }
  if (h.conditions.length) lines.push(`Состояния: ${h.conditions.join(', ')}.`);
  return lines.join('\n');
}

export function recentTurnsBlock(state: GameState): string {
  const turns = state.history.slice(-RECENT_TURNS);
  if (!turns.length) return 'Это первый ход.';
  return turns.map((t) => {
    const short = t.narration.length > 260 ? `${t.narration.slice(0, 260)}…` : t.narration;
    return `Ход ${t.n}. Игрок: ${t.player || '—'}\nИтог: ${t.outcome}. ${short}`;
  }).join('\n\n');
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
  const parts = [
    `<campaign>\n${campaignBlock(state)}\n</campaign>`,
    `<memory>\n${memoryBlock(state)}\n</memory>`,
    `<scene>\n${sceneBlock(state)}\n</scene>`,
    `<creatures_and_objects>\n${entitiesBlock(state)}\n</creatures_and_objects>`,
    `<character>\n${characterBlock(state)}\n</character>`,
    `<recent_turns>\n${recentTurnsBlock(state)}\n</recent_turns>`,
    `<player_action>\n${playerAction}\n</player_action>`,
  ];
  if (extra) parts.push(`<engine_result>\n${extra.engine}\n</engine_result>`, 'Верни JSON рассказчика.');
  else parts.push('Верни JSON арбитра.');
  return parts.join('\n\n');
}
