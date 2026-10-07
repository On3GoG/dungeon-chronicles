// Разрешение хода: броски, применение эффектов, ходы врагов, поражение, опыт, победа.
// Здесь нет ИИ — только детерминированный код (при заданном генераторе случайных чисел).
import type { Ability, Advantage, ArbiterDecision, Effect, Entity, GameState, RollResult } from '../types.ts';
import { CLASSES, CREATURES, ITEMS, RU_ABILITY, RU_ABILITY_GEN, RU_SKILL, SPELLS, XP_LEVELS } from '../data/rules_data.ts';
import type { Rng } from './dice.ts';
import { rollD20, rollDice, withMod } from './dice.ts';
import {
  abilityMod, addItem, campaignOf, castingMod, entitiesHere, findEntity, here, inCombat, itemName,
  livingHostiles, locationDef, mod, profBonus, removeItem, spellName,
} from './state.ts';

export interface EngineResult {
  outcome: 'success' | 'failure' | 'auto' | 'rejected';
  summary: string;
  roll: RollResult | null;
  events: string[];          // что произошло, для рассказчика и журнала
  enemyActions: string[];
  notes: string[];           // пояснения игроку
  correction_note: string | null;
  moved: string | null;      // id новой локации
  defeated: boolean;
  victory: boolean;
  levelUp: number | null;
}

const RU_COND: Record<string, string> = {
  prone: 'сбит с ног', frightened: 'напуган', restrained: 'обездвижен', poisoned: 'отравлен',
  charmed: 'очарован', blinded: 'ослеплён', grappled: 'схвачен', unconscious: 'без сознания',
};

function combineAdv(a: Advantage, b: Advantage): Advantage {
  if (a === b) return a;
  if (a === 'none') return b;
  if (b === 'none') return a;
  return 'none';
}

function nameOf(state: GameState, id: string): string {
  return id === 'hero' ? state.hero.name : findEntity(state, id)?.name ?? id;
}

function creatureMod(e: Entity, a: Ability): number {
  return (e.template && CREATURES[e.template]?.mods[a]) ?? 0;
}

function damageEntity(state: GameState, target: Entity, amount: number, type: string, events: string[]): void {
  if (target.kind === 'object') {
    events.push(`${target.name}: получено ${amount} урона (${type}).`);
    return;
  }
  target.hp = Math.max(0, (target.hp ?? 1) - amount);
  target.aware = true;
  target.conditions = target.conditions.filter((c) => c !== 'unconscious');
  if (target.hp <= 0) {
    target.alive = false;
    const t = target.template ? CREATURES[target.template] : undefined;
    events.push(`${target.name} получает ${amount} урона и погибает.`);
    if (t) {
      state.hero.xp += t.xp;
      const loc = here(state);
      for (const l of t.loot ?? []) {
        const ex = loc.items.find((i) => i.item === l.item);
        if (ex) ex.qty += l.qty; else loc.items.push({ ...l });
      }
      loc.gold += t.gold ?? 0;
      if ((t.loot?.length ?? 0) > 0 || t.gold) events.push(`У тела ${target.name}: ${[...(t.loot ?? []).map((l) => itemName(l.item)), t.gold ? `${t.gold} зол.` : ''].filter(Boolean).join(', ')}.`);
    }
  } else {
    events.push(`${target.name} получает ${amount} урона (${type}), осталось ${target.hp} из ${target.maxHp} хитов.`);
  }
}

function damageHero(state: GameState, amount: number, type: string, source: string, events: string[]): void {
  state.hero.hp = Math.max(0, state.hero.hp - amount);
  events.push(`${source}: ${state.hero.name} получает ${amount} урона (${type}), хиты ${state.hero.hp}/${state.hero.maxHp}.`);
}

function healTarget(state: GameState, id: string, amount: number, events: string[]): void {
  if (id === 'hero') {
    const before = state.hero.hp;
    state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + amount);
    state.hero.conditions = state.hero.conditions.filter((c) => c !== 'unconscious');
    events.push(`${state.hero.name} восстанавливает ${state.hero.hp - before} хитов (${state.hero.hp}/${state.hero.maxHp}).`);
  } else {
    const e = findEntity(state, id);
    if (!e || e.hp === undefined) return;
    const before = e.hp;
    e.hp = Math.min(e.maxHp ?? e.hp + amount, e.hp + amount);
    e.conditions = e.conditions.filter((c) => c !== 'unconscious');
    events.push(`${e.name} восстанавливает ${e.hp - before} хитов.`);
  }
}

function checkLabel(d: ArbiterDecision): string {
  const c = d.check!;
  if (c.kind === 'attack_roll') {
    const what = d.spell ? `заклинанием «${spellName(d.spell)}»` : d.weapon && d.weapon !== 'unarmed' ? `(${itemName(d.weapon)})` : 'без оружия';
    return `Атака ${what}`;
  }
  if (c.kind === 'saving_throw') return `Спасбросок цели (${RU_ABILITY[c.ability]}) против «${spellName(d.spell ?? '')}»`;
  if (c.kind === 'contest') return `Состязание: ${RU_ABILITY[c.ability]}${c.skill ? ` (${RU_SKILL[c.skill]})` : ''}`;
  return `Проверка ${RU_ABILITY_GEN[c.ability]}${c.skill ? ` (${RU_SKILL[c.skill]})` : ''}`;
}

function rollCheck(state: GameState, d: ArbiterDecision, rng: Rng): RollResult {
  const hero = state.hero;
  const c = d.check!;
  const target = d.targets[0] ? findEntity(state, d.targets[0]) : undefined;
  let adv: Advantage = c.advantage;
  if (hero.conditions.includes('poisoned') && c.kind !== 'saving_throw') adv = combineAdv(adv, 'disadvantage');
  if (target && c.kind === 'attack_roll' && (target.conditions.includes('unconscious') || target.conditions.includes('restrained'))) adv = combineAdv(adv, 'advantage');
  if (target && c.kind === 'attack_roll' && target.conditions.includes('prone')) adv = combineAdv(adv, d.weapon && ITEMS[d.weapon]?.ranged ? 'disadvantage' : 'advantage');

  if (c.kind === 'saving_throw') {
    const { dice, natural } = rollD20('none', rng);
    const m = target ? creatureMod(target, c.ability) : 0;
    const total = natural + m;
    const targetFails = total < c.dc;
    return { kind: c.kind, label: checkLabel(d), dice, natural, modifier: m, total, dc: c.dc, advantage: 'none', success: targetFails, critical: false };
  }
  const { dice, natural } = rollD20(adv, rng);
  let m = c.kind === 'attack_roll' && d.spell ? castingMod(hero) + profBonus(hero.level) : abilityMod(hero, c.ability);
  if (c.kind === 'attack_roll' && !d.spell && d.weapon !== 'unarmed') m += profBonus(hero.level);
  if ((c.kind === 'ability_check' || c.kind === 'contest') && c.skill && hero.proficient.includes(c.skill)) m += profBonus(hero.level);
  let dc = c.dc;
  if (c.kind === 'contest' && target) {
    const opp = rollD20('none', rng).natural + Math.max(creatureMod(target, 'STR'), creatureMod(target, 'DEX'));
    dc = opp;
  }
  const total = natural + m;
  let success = total >= dc;
  let critical = false;
  if (c.kind === 'attack_roll') {
    if (natural === 20) { success = true; critical = true; }
    if (natural === 1) success = false;
  }
  return { kind: c.kind, label: checkLabel(d), dice, natural, modifier: m, total, dc, advantage: adv, success, critical };
}

function applyEffects(state: GameState, effects: Effect[], rng: Rng, res: EngineResult): void {
  const loc = here(state);
  for (const e of effects) {
    switch (e.kind) {
      case 'damage': {
        for (const t of e.targets ?? []) {
          const r = rollDice(e.dice!, rng).total;
          if (t === 'hero') damageHero(state, r, e.damage_type ?? 'урон', 'Последствия', res.events);
          else { const ent = findEntity(state, t); if (ent?.alive) damageEntity(state, ent, r, e.damage_type ?? 'урон', res.events); }
        }
        break;
      }
      case 'heal':
        for (const t of e.targets ?? []) healTarget(state, t, rollDice(e.dice!, rng).total, res.events);
        break;
      case 'condition':
        for (const t of e.targets ?? []) {
          if (t === 'hero') { if (!state.hero.conditions.includes(e.condition!)) state.hero.conditions.push(e.condition!); }
          else { const ent = findEntity(state, t); if (ent && !ent.conditions.includes(e.condition!)) ent.conditions.push(e.condition!); }
          res.events.push(`${nameOf(state, t)}: ${RU_COND[e.condition!] ?? e.condition}.`);
        }
        break;
      case 'npc_attitude':
        for (const t of e.targets ?? []) {
          const ent = findEntity(state, t);
          if (!ent) continue;
          ent.attitude = Math.max(-100, Math.min(100, ent.attitude + (e.delta ?? 0)));
          if (ent.attitude <= -50 && ent.kind === 'creature') ent.hostile = true;
          if (ent.kind === 'creature' && ent.attitude >= 0) ent.hostile = false;
          res.events.push(`Отношение: ${ent.name} ${e.delta! > 0 ? '+' : ''}${e.delta} (теперь ${ent.attitude}).`);
        }
        break;
      case 'reveal_info':
        state.memory.push(e.description!);
        res.events.push(`Герой узнаёт: ${e.description}`);
        break;
      case 'flag':
        if (!state.flags.includes(e.flag!)) state.flags.push(e.flag!);
        res.events.push(`Сюжет: ${campaignOf(state).flags.find((f) => f.id === e.flag)?.description ?? e.flag}.`);
        break;
      case 'move':
        res.moved = e.location!;
        break;
      case 'take_item':
        if (e.item === 'gold') {
          const q = Math.min(loc.gold, e.qty ?? 0);
          loc.gold -= q; state.hero.gold += q;
          res.events.push(`Подобрано золото: ${q}.`);
        } else {
          const have = loc.items.find((i) => i.item === e.item);
          if (!have) break;
          const q = Math.min(have.qty, e.qty ?? 1);
          have.qty -= q;
          if (have.qty <= 0) loc.items = loc.items.filter((i) => i !== have);
          addItem(state.hero, e.item!, q);
          res.events.push(`Подобрано: ${itemName(e.item!)}${q > 1 ? ` ×${q}` : ''}.`);
        }
        break;
    }
  }
}

function enemyTurn(state: GameState, rng: Rng, res: EngineResult): void {
  for (const e of livingHostiles(state)) {
    if (!e.aware || e.conditions.includes('unconscious') || e.conditions.includes('restrained')) continue;
    if (e.conditions.includes('frightened')) {
      delete here(state).entities[e.id];
      res.enemyActions.push(`${e.name} в ужасе убегает.`);
      continue;
    }
    const t = e.template ? CREATURES[e.template] : undefined;
    if (!t) continue;
    let adv: Advantage = state.hero.conditions.includes('prone') && !t.attack.ranged ? 'advantage' : 'none';
    if (e.conditions.includes('prone') || e.conditions.includes('poisoned')) adv = combineAdv(adv, 'disadvantage');
    const { natural } = rollD20(adv, rng);
    const total = natural + t.attack.bonus;
    if ((total >= state.hero.ac && natural !== 1) || natural === 20) {
      const dmg = rollDice(t.attack.damage, rng, natural === 20).total;
      damageHero(state, dmg, t.attack.damageType, `${e.name} (${t.attack.name}${natural === 20 ? ', критическое попадание' : ''})`, res.enemyActions);
    } else {
      res.enemyActions.push(`${e.name} атакует (${t.attack.name}), но промахивается.`);
    }
    if (state.hero.hp <= 0) break;
  }
}

function handleDefeat(state: GameState, res: EngineResult): void {
  const safe = campaignOf(state).locations.find((l) => l.safe)!;
  const lost = Math.floor(state.hero.gold / 4);
  state.hero.gold -= lost;
  state.hero.hp = Math.max(1, Math.floor(state.hero.maxHp / 2));
  state.hero.conditions = [];
  state.locationId = safe.id;
  state.locations[safe.id].visited = true;
  res.defeated = true;
  res.events.push(`${state.hero.name} падает без сознания. Очнулся в безопасном месте: ${safe.name}. Потеряно золота: ${lost}. Хиты ${state.hero.hp}/${state.hero.maxHp}.`);
}

function checkLevelUp(state: GameState, res: EngineResult): void {
  const hero = state.hero;
  const next = XP_LEVELS[hero.level];
  if (next === undefined || hero.xp < next) return;
  hero.level += 1;
  const cls = CLASSES[hero.classId];
  const gain = Math.max(1, Math.floor(cls.hitDie / 2) + 1 + mod(hero.abilities.CON));
  hero.maxHp += gain;
  hero.hp += gain;
  if (cls.castingAbility) {
    hero.slots['1'] = { max: hero.level >= 3 ? 4 : 3, used: 0 };
    if (hero.level >= 3) hero.slots['2'] = { max: 2, used: 0 };
  }
  res.levelUp = hero.level;
  res.events.push(`Новый уровень: ${hero.level}! Максимум хитов +${gain}${cls.castingAbility ? ', ячейки заклинаний восстановлены' : ''}.`);
}

export function resolveTurn(state: GameState, d: ArbiterDecision, rng: Rng, notes: string[] = []): EngineResult {
  const res: EngineResult = {
    outcome: 'auto', summary: '', roll: null, events: [], enemyActions: [], notes: [...notes],
    correction_note: d.correction_note, moved: null, defeated: false, victory: false, levelUp: null,
  };
  if (!d.allowed) {
    res.outcome = 'rejected';
    res.summary = `Действие не выполнено: ${d.correction_note ?? 'невозможно'}`;
    return res;
  }
  const hero = state.hero;
  const wasInCombat = inCombat(state);

  // траты
  for (const c of d.consumes) {
    if (c.startsWith('gold:')) {
      const q = Math.min(hero.gold, parseInt(c.split(':')[1], 10) || 0);
      hero.gold -= q;
      res.events.push(`Потрачено золота: ${q} (осталось ${hero.gold}).`);
    } else if (removeItem(hero, c)) {
      res.events.push(`Израсходовано: ${itemName(c)}.`);
    }
  }
  if (d.weapon && ITEMS[d.weapon]?.ammo) removeItem(hero, ITEMS[d.weapon].ammo!, 1);
  if (d.spell_slot) hero.slots[String(d.spell_slot)].used += 1;

  // бросок
  let success = true;
  if (d.check) {
    res.roll = rollCheck(state, d, rng);
    success = res.roll.success;
    res.outcome = success ? 'success' : 'failure';
  }

  // урон и лечение, которые считает движок
  const target = d.targets[0] && d.targets[0] !== 'hero' ? findEntity(state, d.targets[0]) : undefined;
  if (d.action_type === 'attack' && !d.spell && target && success && target.kind !== 'object') {
    const w = d.weapon && d.weapon !== 'unarmed' ? ITEMS[d.weapon] : undefined;
    const ab = d.check?.ability ?? 'STR';
    const dmg = w?.damage ? rollDice(withMod(w.damage, abilityMod(hero, ab)), rng, res.roll?.critical).total
      : Math.max(1, 1 + abilityMod(hero, 'STR'));
    damageEntity(state, target, dmg, w?.damageType ?? 'дробящий', res.events);
  }
  if (d.spell) {
    const s = SPELLS[d.spell];
    if (s.kind === 'heal') {
      const expr = s.addMod ? withMod(s.heal!, castingMod(hero)) : s.heal!;
      for (const t of d.targets.length ? d.targets : ['hero']) healTarget(state, t, rollDice(expr, rng).total, res.events);
    } else if (target && success && (s.kind === 'attack' || s.kind === 'save' || s.kind === 'auto_damage') && s.damage) {
      const expr = s.addMod ? withMod(s.damage, castingMod(hero)) : s.damage;
      damageEntity(state, target, rollDice(expr, rng, res.roll?.critical).total, s.damageType ?? 'магия', res.events);
    } else if (target && success && s.kind === 'condition' && s.condition) {
      if (!target.conditions.includes(s.condition)) target.conditions.push(s.condition);
      res.events.push(`${target.name}: ${RU_COND[s.condition]}.`);
    } else if (s.kind === 'utility') {
      res.events.push(`Сотворено заклинание «${s.name}».`);
    }
    if (target) target.aware = true;
  }
  if (d.consumes.includes('healing_potion')) healTarget(state, 'hero', rollDice(ITEMS.healing_potion.heal!, rng).total, res.events);

  // эффекты от арбитра
  applyEffects(state, success ? d.effects_on_success : d.effects_on_failure, rng, res);

  // атака или заклинание по врагу будит всех врагов в локации
  if ((d.action_type === 'attack' || d.spell) && target?.hostile) {
    for (const e of livingHostiles(state)) e.aware = true;
  }

  // ход врагов (если герой не ушёл из локации)
  if (!res.moved && hero.hp > 0 && (wasInCombat || inCombat(state))) enemyTurn(state, rng, res);

  // переход
  if (res.moved && hero.hp > 0) {
    state.locationId = res.moved;
    const ls = state.locations[res.moved];
    const first = !ls.visited;
    ls.visited = true;
    const def = locationDef(state);
    const who = entitiesHere(state).filter((e) => e.alive).map((e) => e.name);
    res.events.push(`${first ? 'Новое место' : 'Возвращение'}: ${def.name}. ${def.description}${who.length ? ` Здесь: ${who.join(', ')}.` : ''}`);
  }

  if (hero.hp <= 0) handleDefeat(state, res);
  checkLevelUp(state, res);

  // победа: дети освобождены и герой вернулся в деревню
  const camp = campaignOf(state);
  if (state.flags.includes('children_freed') && state.locationId === camp.start && !state.flags.includes(camp.victoryFlag)) {
    state.flags.push(camp.victoryFlag);
    state.status = 'won';
    res.victory = true;
    res.events.push('Победа: дети вернулись домой в Вересковку!');
  }

  const parts: string[] = [];
  if (res.roll) parts.push(`${res.roll.label}: ${res.roll.total} против ${res.roll.dc} — ${res.roll.success ? (res.roll.critical ? 'критический успех' : 'успех') : 'провал'}.`);
  else parts.push('Действие выполнено без броска.');
  res.summary = parts.join(' ');
  return res;
}
