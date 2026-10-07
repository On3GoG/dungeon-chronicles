// Серверные проверки решения арбитра (GDD, раздел 4.1).
// Модель отвечает за смысл (навык, сложность, последствия); ресурсы, кубы и правила класса проверяет код.
import type { Ability, ArbiterDecision, Effect, GameState, Skill } from '../types.ts';
import { CLASSES, ITEMS, SKILL_ABILITY, SPELLS } from '../data/rules_data.ts';
import { isValidDice, maxDice } from './dice.ts';
import {
  bestWeapon, campaignOf, countItem, entitiesHere, findEntity, freeSlot, itemName, livingHostiles,
  locationDef, here, weaponAbility, spellSaveDc,
} from './state.ts';

const DC_SCALE = [5, 10, 15, 20, 25, 30];
const ABILITIES: Ability[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const EFFECT_KINDS = new Set(['damage', 'heal', 'condition', 'npc_attitude', 'reveal_info', 'flag', 'move', 'take_item']);
const CONDITIONS = new Set(['prone', 'frightened', 'restrained', 'poisoned', 'charmed', 'blinded', 'grappled', 'unconscious']);
const IMPROVISED_DAMAGE_CAP = '2d6';

export interface GuardResult { decision: ArbiterDecision; notes: string[]; fixes: string[] }

function snapDc(dc: unknown): number {
  const n = typeof dc === 'number' && Number.isFinite(dc) ? dc : 15;
  return DC_SCALE.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), 15);
}

function reject(d: ArbiterDecision, note: string, res: GuardResult): GuardResult {
  d.allowed = false;
  d.action_type = d.action_type === 'out_of_game' ? 'out_of_game' : 'impossible';
  d.check = null;
  d.effects_on_success = [];
  d.effects_on_failure = [];
  d.consumes = [];
  d.spell_slot = null;
  d.correction_note = note;
  res.notes.push(note);
  return res;
}

function damagingCantrip(state: GameState): string | null {
  return state.hero.spells.find((s) => SPELLS[s]?.level === 0 && (SPELLS[s].kind === 'attack' || SPELLS[s].kind === 'save')) ?? null;
}

function guessSpell(state: GameState, d: ArbiterDecision, playerText: string): string | null {
  const text = `${d.normalized_action} ${playerText}`.toLowerCase().replace(/ё/g, 'е');
  for (const id of Object.keys(SPELLS)) {
    const stem = SPELLS[id].name.toLowerCase().replace(/ё/g, 'е').split(' ')[0].slice(0, 6);
    if (stem.length >= 4 && text.includes(stem)) return id;
  }
  return null;
}

export function guardDecision(input: ArbiterDecision, state: GameState, playerText = ''): GuardResult {
  const d: ArbiterDecision = structuredClone(input);
  const res: GuardResult = { decision: d, notes: [], fixes: [] };
  const hero = state.hero;
  d.targets = Array.isArray(d.targets) ? d.targets : [];
  d.consumes = Array.isArray(d.consumes) ? d.consumes : [];
  d.effects_on_success = Array.isArray(d.effects_on_success) ? d.effects_on_success : [];
  d.effects_on_failure = Array.isArray(d.effects_on_failure) ? d.effects_on_failure : [];
  d.weapon = d.weapon ?? null;
  d.spell = d.spell ?? null;
  if (d.correction_note) res.notes.push(d.correction_note);

  if (!d.allowed || d.action_type === 'impossible' || d.action_type === 'out_of_game') {
    return reject(d, d.correction_note || 'Так сделать не получится.', { ...res, notes: [] });
  }

  // --- цели: только живые существа и объекты этой локации или сам герой
  const validIds = new Set(entitiesHere(state).filter((e) => e.alive).map((e) => e.id).concat('hero'));
  const badTargets = d.targets.filter((t) => !validIds.has(t));
  d.targets = d.targets.filter((t) => validIds.has(t));
  if (badTargets.length) res.fixes.push(`убраны несуществующие цели: ${badTargets.join(', ')}`);

  // --- заклинания
  const wantsSpell = d.action_type === 'spell' || !!d.spell;
  if (wantsSpell) {
    if (!hero.spells.length) return reject(d, 'Ты не владеешь магией — это под силу только заклинателям.', res);
    let spell = d.spell && SPELLS[d.spell] ? d.spell : guessSpell(state, d, playerText);
    if (!spell || !hero.spells.includes(spell)) {
      const cantrip = damagingCantrip(state);
      const hostileTarget = d.targets.some((t) => findEntity(state, t)?.hostile);
      if (cantrip && hostileTarget) {
        res.notes.push(`Этого заклинания ты не знаешь — вместо него «${SPELLS[cantrip].name}».`);
        spell = cantrip;
      } else {
        return reject(d, spell ? `Ты не знаешь заклинания «${SPELLS[spell]?.name ?? spell}».` : 'Непонятно, какое заклинание ты хочешь сотворить.', res);
      }
    }
    const def = SPELLS[spell];
    if (def.level > 0) {
      const slot = freeSlot(hero, def.level);
      if (slot === null) {
        const cantrip = damagingCantrip(state);
        if (cantrip && (def.kind === 'attack' || def.kind === 'auto_damage' || def.kind === 'save')) {
          res.notes.push(`Силы для «${def.name}» иссякли — ты бьёшь заговором «${SPELLS[cantrip].name}».`);
          spell = cantrip;
          d.spell_slot = null;
        } else {
          return reject(d, `Магические силы исчерпаны: для «${def.name}» нужен отдых.`, res);
        }
      } else d.spell_slot = slot;
    } else d.spell_slot = null;
    d.spell = spell;
    d.action_type = 'spell';
    const sdef = SPELLS[spell];
    const castAb: Ability = CLASSES[hero.classId]?.castingAbility ?? 'INT';
    if ((sdef.kind === 'attack' || sdef.kind === 'save' || sdef.kind === 'auto_damage' || sdef.kind === 'condition') &&
        !d.targets.some((t) => t !== 'hero')) {
      const h = livingHostiles(state)[0];
      if (!h) return reject(d, 'Здесь не в кого направить заклинание.', res);
      d.targets = [h.id];
    }
    const target = d.targets[0] ? findEntity(state, d.targets[0]) : undefined;
    if (sdef.kind === 'attack') {
      d.check = { kind: 'attack_roll', ability: castAb, skill: null, dc: target?.ac ?? 12, advantage: d.check?.advantage ?? 'none', reason: 'атака заклинанием против КД цели' };
    } else if (sdef.kind === 'save' || sdef.kind === 'condition') {
      d.check = { kind: 'saving_throw', ability: sdef.save!, skill: null, dc: spellSaveDc(hero), advantage: 'none', reason: 'спасбросок цели против заклинания' };
    } else {
      d.check = null; // авто-урон, лечение, утилиты
    }
    if (sdef.kind === 'heal' && !d.targets.length) d.targets = ['hero'];
    // урон и лечение заклинаний считает движок
    d.effects_on_success = d.effects_on_success.filter((e) => e.kind !== 'damage' && e.kind !== 'heal');
  }

  // --- атака оружием
  if (d.action_type === 'attack' && !d.spell) {
    let target = d.targets.map((t) => findEntity(state, t)).find((e) => e && e.kind !== 'object' && e.alive);
    const objectTarget = d.targets.map((t) => findEntity(state, t)).find((e) => e && e.kind === 'object');
    if (!target && !objectTarget) {
      const h = livingHostiles(state)[0];
      if (!h) return reject(d, 'Здесь некого атаковать.', res);
      target = h;
      d.targets = [h.id];
      res.fixes.push(`цель выбрана автоматически: ${h.name}`);
    }
    if (target) {
      let weapon = d.weapon && countItem(hero, d.weapon) > 0 && ITEMS[d.weapon]?.kind === 'weapon' ? d.weapon : null;
      if (d.weapon && !weapon) res.notes.push(`У тебя нет предмета «${itemName(d.weapon)}» — бьёшь тем, что есть.`);
      if (weapon && ITEMS[weapon].ammo && countItem(hero, ITEMS[weapon].ammo!) === 0) {
        res.notes.push(`Кончились боеприпасы для «${itemName(weapon)}».`);
        weapon = null;
      }
      weapon = weapon ?? bestWeapon(hero, false) ?? bestWeapon(hero, true);
      d.weapon = weapon ?? 'unarmed';
      d.check = {
        kind: 'attack_roll', ability: weapon ? weaponAbility(hero, weapon) : 'STR', skill: null,
        dc: target.ac ?? 10, advantage: d.check?.advantage ?? 'none', reason: d.check?.reason || 'атака против КД цели',
      };
      d.targets = [target.id, ...d.targets.filter((t) => t !== target!.id)];
      // урон по цели атаки считает движок по таблице оружия
      d.effects_on_success = d.effects_on_success.filter((e) => !(e.kind === 'damage' && (e.targets ?? []).includes(target!.id)));
    }
  }

  // --- проверка: заполнить и привести к шкале
  if (d.check) {
    const c = d.check;
    if (!['ability_check', 'attack_roll', 'saving_throw', 'contest'].includes(c.kind)) c.kind = 'ability_check';
    if (c.skill && !(c.skill in SKILL_ABILITY)) c.skill = null;
    if (!ABILITIES.includes(c.ability)) c.ability = c.skill ? SKILL_ABILITY[c.skill as Skill] : 'DEX';
    if (!['none', 'advantage', 'disadvantage'].includes(c.advantage)) c.advantage = 'none';
    if (c.kind === 'ability_check' || c.kind === 'contest') {
      const snapped = snapDc(c.dc);
      if (snapped !== c.dc) res.fixes.push(`СЛ ${c.dc} → ${snapped}`);
      c.dc = snapped;
    }
    c.reason = String(c.reason ?? '').slice(0, 200);
  }

  // --- траты: только своё и по средствам
  const consumes: string[] = [];
  for (const c of d.consumes) {
    const s = String(c);
    if (s.startsWith('gold')) {
      const want = Math.max(0, parseInt(s.split(':')[1] ?? '0', 10) || 0);
      if (want > hero.gold) {
        res.notes.push(hero.gold > 0 ? `У тебя только ${hero.gold} зол. — отдаёшь всё, что есть.` : 'У тебя нет золота.');
        if (hero.gold > 0) consumes.push(`gold:${hero.gold}`);
        else if (d.action_type !== 'skill_check' && d.action_type !== 'dialogue') return reject(d, 'У тебя нет золота.', res);
      } else if (want > 0) consumes.push(`gold:${want}`);
    } else if (countItem(hero, s) > 0) {
      consumes.push(s);
    } else {
      if (d.action_type === 'item_use') return reject(d, `У тебя нет предмета «${itemName(s)}».`, res);
      res.fixes.push(`убран предмет, которого нет: ${s}`);
    }
  }
  d.consumes = consumes;

  // --- зелья: лечение только из реального зелья
  const potionHeal = d.consumes.includes('healing_potion');
  const healFromAi = [...d.effects_on_success, ...d.effects_on_failure].some((e) => e.kind === 'heal');
  if (healFromAi && !d.spell && !potionHeal) {
    if (d.action_type === 'item_use' && countItem(hero, 'healing_potion') === 0) {
      return reject(d, 'У тебя нет зелья лечения.', res);
    }
    if (countItem(hero, 'healing_potion') > 0 && d.action_type === 'item_use') d.consumes.push('healing_potion');
  }
  if (d.consumes.includes('healing_potion')) {
    d.effects_on_success = d.effects_on_success.filter((e) => e.kind !== 'heal');
    d.effects_on_failure = d.effects_on_failure.filter((e) => e.kind !== 'heal');
    if (!d.targets.length) d.targets = ['hero'];
    d.check = null;
    d.action_type = 'item_use';
  }

  // --- эффекты
  const loc = here(state);
  const exits = new Set(locationDef(state).exits.map((x) => x.to));
  const flags = new Set(campaignOf(state).flags.map((f) => f.id));
  const clean = (effects: Effect[]): Effect[] => {
    const out: Effect[] = [];
    for (const raw of effects) {
      if (!raw || typeof raw !== 'object' || !EFFECT_KINDS.has(raw.kind)) continue;
      const e: Effect = { ...raw, targets: (raw.targets ?? []).filter((t) => validIds.has(t)) };
      switch (e.kind) {
        case 'damage':
          if (!e.targets!.length) continue;
          if (!isValidDice(e.dice) || maxDice(e.dice!) > maxDice(IMPROVISED_DAMAGE_CAP)) {
            res.fixes.push(`урон ${e.dice ?? '?'} → ${IMPROVISED_DAMAGE_CAP}`);
            e.dice = IMPROVISED_DAMAGE_CAP;
          }
          break;
        case 'heal':
          if (!isValidDice(e.dice) || maxDice(e.dice!) > 12) e.dice = '1d4';
          if (!e.targets!.length) e.targets = ['hero'];
          break;
        case 'condition':
          if (!CONDITIONS.has(e.condition as string) || !e.targets!.length) continue;
          break;
        case 'npc_attitude': {
          const n = Number(e.delta);
          if (!Number.isFinite(n) || !e.targets!.length) continue;
          e.delta = Math.max(-30, Math.min(30, Math.round(n)));
          break;
        }
        case 'move':
          if (!e.location || !exits.has(e.location)) {
            if (e.location) res.fixes.push(`переход в «${e.location}» невозможен отсюда`);
            continue;
          }
          break;
        case 'take_item': {
          if (e.item === 'gold') {
            const q = Math.max(0, Math.min(loc.gold, Number(e.qty) || loc.gold));
            if (!q) { res.notes.push('Золота здесь нет.'); continue; }
            e.qty = q;
          } else {
            const have = loc.items.find((i) => i.item === e.item);
            if (!have) { res.notes.push(`Здесь нет предмета «${itemName(e.item ?? '?')}».`); continue; }
            e.qty = Math.max(1, Math.min(have.qty, Number(e.qty) || have.qty));
          }
          break;
        }
        case 'flag':
          if (!e.flag || !flags.has(e.flag)) {
            if (e.description) out.push({ kind: 'reveal_info', description: e.description });
            continue;
          }
          break;
        case 'reveal_info':
          if (!e.description) continue;
          e.description = String(e.description).slice(0, 300);
          break;
      }
      out.push(e);
    }
    return out;
  };
  d.effects_on_success = clean(d.effects_on_success);
  d.effects_on_failure = clean(d.effects_on_failure);
  d.normalized_action = String(d.normalized_action || playerText || 'Действие').slice(0, 200);
  return res;
}
