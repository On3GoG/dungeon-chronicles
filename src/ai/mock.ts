// Заглушка ИИ для разработки без сети и для автотестов.
// Это не «умный» мастер: простые правила по ключевым словам, чтобы можно было пройти кампанию целиком.
import type { ArbiterDecision, Choice, Entity, GameState, NarratorResponse } from '../types.ts';
import type { EngineResult } from '../engine/resolve.ts';
import { SPELLS } from '../data/rules_data.ts';
import { bestWeapon, countItem, entitiesHere, here, livingHostiles, locationDef } from '../engine/state.ts';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
const stems = (s: string) => norm(s).split(/[^a-zа-я]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5));
const mentions = (text: string, name: string) => stems(name).some((st) => text.includes(st));

function base(over: Partial<ArbiterDecision>): ArbiterDecision {
  return {
    allowed: true, action_type: 'trivial', normalized_action: 'Действие героя', check: null, targets: [], weapon: null,
    spell: null, consumes: [], spell_slot: null, effects_on_success: [], effects_on_failure: [], correction_note: null, ...over,
  };
}

function pickTarget(state: GameState, text: string, pool: Entity[]): Entity | undefined {
  return pool.find((e) => mentions(text, e.name) || text.includes(e.id)) ?? pool[0];
}

export function mockArbiter(state: GameState, playerText: string): ArbiterDecision {
  const t = norm(playerText);
  const hero = state.hero;
  const def = locationDef(state);
  const alive = entitiesHere(state).filter((e) => e.alive);
  const hostiles = livingHostiles(state);
  const npcs = alive.filter((e) => e.kind === 'npc');
  const has = (re: RegExp) => re.test(t);

  // освободить детей
  if (state.locationId === 'waterfall_pen' && has(/освобод|загон|детей|дети|отпер/)) {
    if (countItem(hero, 'chief_key')) {
      return base({ action_type: 'item_use', normalized_action: 'Отпирает загон ключом вождя',
        effects_on_success: [{ kind: 'flag', flag: 'pen_unlocked' }, { kind: 'flag', flag: 'children_freed', description: 'Дети идут за героем' }] });
    }
    if (hostiles.some((e) => e.template === 'chief_wolf')) {
      return base({ allowed: false, action_type: 'impossible', normalized_action: 'Пытается пробраться к загону',
        correction_note: 'Волк вожака не подпустит тебя к загону, пока жив.' });
    }
    return base({ action_type: 'skill_check', normalized_action: 'Выламывает жерди загона',
      check: { kind: 'ability_check', ability: 'STR', skill: 'athletics', dc: 15, advantage: 'none', reason: 'крепкие жерди' },
      effects_on_success: [{ kind: 'flag', flag: 'pen_unlocked' }, { kind: 'flag', flag: 'children_freed', description: 'Дети идут за героем' }] });
  }

  // зелье
  if (has(/зель|выпи/)) {
    return base({ action_type: 'item_use', normalized_action: 'Выпивает зелье лечения', consumes: ['healing_potion'] });
  }

  // заклинание
  const spell = hero.spells.find((s) => mentions(t, SPELLS[s].name))
    ?? (has(/заклин|колду|магие|магию/) ? hero.spells.find((s) => ['attack', 'save', 'auto_damage'].includes(SPELLS[s].kind)) : undefined);
  if (spell) {
    const s = SPELLS[spell];
    const target = s.kind === 'heal' || s.kind === 'utility' ? undefined : pickTarget(state, t, hostiles);
    return base({ action_type: 'spell', normalized_action: `Творит «${s.name}»${target ? ` по цели: ${target.name}` : ''}`,
      spell, targets: target ? [target.id] : s.kind === 'heal' ? ['hero'] : [] });
  }

  // атака
  if (has(/атак|бью|удар|руб|колю|стрел|убит|напад|добит|сраж|бить/) && hostiles.length) {
    const target = pickTarget(state, t, hostiles)!;
    const ranged = has(/стрел|лук/);
    const weapon = bestWeapon(hero, ranged) ?? bestWeapon(hero, !ranged) ?? 'unarmed';
    return base({ action_type: 'attack', normalized_action: `Атакует: ${target.name}`, targets: [target.id], weapon,
      check: { kind: 'attack_roll', ability: 'STR', skill: null, dc: target.ac ?? 12, advantage: 'none', reason: 'КД цели' } });
  }

  // переход
  if (has(/ид[уит]|пойт|отправ|вернут|направ|войт|зайт|спуст|уйти|бежат|назад|обратно|к /)) {
    const score = (e: { to: string; description: string }) => {
      const name = locationDef(state, e.to).name;
      if (t.includes(norm(name))) return 100;
      return [...stems(name), ...stems(e.description)].filter((st) => t.includes(st)).length;
    };
    const best = [...def.exits].sort((a, b) => score(b) - score(a))[0];
    const exit = best && score(best) > 0 ? best : undefined;
    if (exit) {
      return base({ action_type: 'movement', normalized_action: `Идёт: ${exit.description}`, effects_on_success: [{ kind: 'move', location: exit.to }] });
    }
  }

  // сундук
  if (alive.some((e) => e.id === 'chest') && has(/сундук|замок|взлом/) && !state.flags.includes('chest_opened')) {
    const tools = countItem(hero, 'thieves_tools') > 0;
    return base({ action_type: 'skill_check', normalized_action: 'Вскрывает замок сундука',
      check: { kind: 'ability_check', ability: 'DEX', skill: 'sleight_of_hand', dc: 15, advantage: tools ? 'advantage' : 'none', reason: 'простой навесной замок' },
      effects_on_success: [{ kind: 'flag', flag: 'chest_opened', description: 'Сундук открыт' }] });
  }

  // подобрать
  if (has(/взять|возьм|подобр|забра|обыск|собра/)) {
    const ls = here(state);
    const effects = ls.items.map((i) => ({ kind: 'take_item' as const, item: i.item, qty: i.qty }));
    if (ls.gold > 0) effects.push({ kind: 'take_item', item: 'gold', qty: ls.gold });
    if (effects.length) return base({ action_type: 'trivial', normalized_action: 'Обыскивает место и забирает находки', effects_on_success: effects });
  }

  // разговор
  const talkTo = pickTarget(state, t, [...npcs, ...hostiles.filter((e) => e.template === 'goblin_chief')]);
  if (has(/говор|спрос|расспрос|убед|сказа|попрос|договор|предлож/) && talkTo) {
    const chief = talkTo.template === 'goblin_chief';
    return base({ action_type: 'dialogue', normalized_action: `Разговаривает: ${talkTo.name}`, targets: [talkTo.id],
      check: { kind: 'ability_check', ability: 'CHA', skill: 'persuasion', dc: chief ? 15 : 10, advantage: 'none', reason: chief ? 'вождь недоверчив' : 'собеседник не против поговорить' },
      effects_on_success: [
        { kind: 'npc_attitude', delta: 10, targets: [talkTo.id] },
        chief ? { kind: 'flag', flag: 'chief_negotiating', description: 'Вождь готов торговаться' } : { kind: 'reveal_info', description: `${talkTo.name}: ${talkTo.description ?? 'делится слухами'}` },
      ] });
  }

  // скрытность
  if (has(/крад|скрыт|тихо|подкра|затаи|прятат/)) {
    return base({ action_type: 'skill_check', normalized_action: 'Крадётся, стараясь не шуметь',
      check: { kind: 'ability_check', ability: 'DEX', skill: 'stealth', dc: 10, advantage: 'none', reason: 'полумрак' },
      effects_on_failure: hostiles.length ? [{ kind: 'flag', flag: 'alarm_raised', description: 'Героя заметили' }] : [] });
  }

  // осмотр
  if (has(/осмотр|изуч|ищ|иска|оглядет|разгляд|следы/)) {
    const objects = alive.filter((e) => e.kind === 'object').map((e) => `${e.name}: ${e.description}`).join('; ');
    return base({ action_type: 'skill_check', normalized_action: 'Внимательно осматривается',
      check: { kind: 'ability_check', ability: 'WIS', skill: 'perception', dc: 10, advantage: 'none', reason: 'обычный осмотр' },
      effects_on_success: [{ kind: 'reveal_info', description: (objects || def.description).slice(0, 200) }] });
  }

  return base({ action_type: 'trivial', normalized_action: playerText.slice(0, 120) || 'Ждёт' });
}

function exitLabel(state: GameState, to: string): string {
  return `Идти: ${locationDef(state, to).name}`.slice(0, 60);
}

export function mockNarrator(state: GameState, r: EngineResult, normalized: string): NarratorResponse {
  const parts: string[] = [];
  if (r.outcome === 'rejected') parts.push(`Ты пытаешься, но ничего не выходит. ${r.correction_note ?? ''}`);
  else parts.push(`${normalized}. ${r.roll ? (r.roll.success ? 'Получилось!' : 'Не вышло.') : ''}`);
  parts.push(...r.events, ...r.enemyActions, ...r.after);
  if (!r.events.length && !r.enemyActions.length) parts.push(locationDef(state).description);
  parts.push('[Заглушка ИИ: это служебный текст, а не настоящий рассказчик.]');

  const choices: Choice[] = [];
  const add = (label: string, icon: string) => { if (choices.length < 4) choices.push({ id: `c${choices.length + 1}`, label, icon }); };
  if (r.victory) {
    add('Начать новое приключение', 'other');
    add('Отпраздновать в таверне', 'rest');
    add('Осмотреться напоследок', 'explore');
  } else {
    const hostiles = livingHostiles(state);
    if (hostiles[0]) add(`Атаковать: ${hostiles[0].name}`.slice(0, 60), 'attack');
    else if (state.hero.hp < state.hero.maxHp) add('Отдохнуть', 'rest');
    if (state.locationId === 'waterfall_pen' && !state.flags.includes('children_freed')) add('Освободить детей', 'item');
    const npc = entitiesHere(state).find((e) => e.kind === 'npc' && e.alive && e.id !== 'children');
    if (npc) add(`Расспросить: ${npc.name}`.slice(0, 60), 'talk');
    if (here(state).items.length || here(state).gold) add('Обыскать помещение', 'explore');
    if (entitiesHere(state).some((e) => e.id === 'chest') && !state.flags.includes('chest_opened')) add('Вскрыть сундук', 'item');
    for (const e of locationDef(state).exits) add(exitLabel(state, e.to), 'move');
    add('Осмотреться', 'explore');
  }
  return { narration: parts.join(' ').slice(0, 1500), choices, scene_tags: locationDef(state).tags, memory_note: null, safety: 'ok' };
}
