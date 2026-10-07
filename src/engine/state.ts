// Создание игры и вспомогательные функции состояния.
import { randomUUID } from 'node:crypto';
import type { Ability, CampaignDef, Entity, GameState, Hero, LocationState } from '../types.ts';
import { HERO_PRESETS } from '../data/heroes.ts';
import { CAMPAIGNS } from '../data/campaign_goblins.ts';
import { CLASSES, ITEMS, SPELLS } from '../data/rules_data.ts';

export const mod = (score: number): number => Math.floor((score - 10) / 2);
export const profBonus = (level: number): number => 2 + Math.floor((Math.max(1, level) - 1) / 4);

export function campaignOf(state: GameState): CampaignDef {
  return CAMPAIGNS[state.campaignId];
}

export function newGame(presetId: string, heroName: string | undefined, energyStart: number, campaignId = 'goblin_lair'): GameState {
  const preset = HERO_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`Неизвестный герой: ${presetId}`);
  const campaign = CAMPAIGNS[campaignId];
  const hero: Hero = structuredClone(preset.hero);
  if (heroName && heroName.trim()) hero.name = heroName.trim().slice(0, 30);
  const locations: Record<string, LocationState> = {};
  for (const loc of campaign.locations) {
    locations[loc.id] = {
      visited: loc.id === campaign.start,
      entities: Object.fromEntries(loc.entities.map((e) => [e.id, structuredClone(e)])),
      items: structuredClone(loc.items),
      gold: loc.gold ?? 0,
    };
  }
  const now = new Date().toISOString();
  return {
    id: randomUUID(), version: 1, createdAt: now, updatedAt: now, campaignId,
    hero, locationId: campaign.start, locations, flags: [], memory: [], summary: '',
    history: [], turn: 0, energy: { value: energyStart, lastRefill: now.slice(0, 10) }, status: 'playing',
  };
}

export function here(state: GameState): LocationState {
  return state.locations[state.locationId];
}

export function locationDef(state: GameState, id = state.locationId) {
  return campaignOf(state).locations.find((l) => l.id === id)!;
}

export function entitiesHere(state: GameState): Entity[] {
  return Object.values(here(state).entities);
}

export function livingHostiles(state: GameState): Entity[] {
  return entitiesHere(state).filter((e) => e.kind === 'creature' && e.alive && e.hostile);
}

export function inCombat(state: GameState): boolean {
  return livingHostiles(state).some((e) => e.aware && !e.conditions.includes('unconscious'));
}

export function findEntity(state: GameState, id: string): Entity | undefined {
  return here(state).entities[id];
}

export function countItem(hero: Hero, item: string): number {
  return hero.inventory.find((i) => i.item === item)?.qty ?? 0;
}

export function removeItem(hero: Hero, item: string, qty = 1): boolean {
  const e = hero.inventory.find((i) => i.item === item);
  if (!e || e.qty < qty) return false;
  e.qty -= qty;
  if (e.qty <= 0) hero.inventory = hero.inventory.filter((i) => i !== e);
  return true;
}

export function addItem(hero: Hero, item: string, qty = 1): void {
  const e = hero.inventory.find((i) => i.item === item);
  if (e) e.qty += qty;
  else hero.inventory.push({ item, qty });
}

export function abilityMod(hero: Hero, a: Ability): number {
  return mod(hero.abilities[a]);
}

export function castingMod(hero: Hero): number {
  const a = CLASSES[hero.classId]?.castingAbility;
  return a ? abilityMod(hero, a) : 0;
}

export function spellSaveDc(hero: Hero): number {
  return 8 + profBonus(hero.level) + castingMod(hero);
}

export function freeSlot(hero: Hero, minLevel: number): number | null {
  for (const [lvl, s] of Object.entries(hero.slots).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (Number(lvl) >= minLevel && s.used < s.max) return Number(lvl);
  }
  return null;
}

/** Лучшее оружие героя для ближнего или дальнего боя. */
export function bestWeapon(hero: Hero, ranged = false): string | null {
  const ws = hero.inventory.map((i) => ITEMS[i.item]).filter((d) => d?.kind === 'weapon' && !!d.ranged === ranged);
  const usable = ws.filter((w) => !w.ammo || countItem(hero, w.ammo) > 0);
  return usable[0]?.id ?? null;
}

export function weaponAbility(hero: Hero, weaponId: string): Ability {
  const w = ITEMS[weaponId];
  if (w?.finesse) return abilityMod(hero, 'DEX') >= abilityMod(hero, 'STR') ? 'DEX' : 'STR';
  return w?.ability ?? 'STR';
}

export function itemName(id: string): string {
  return ITEMS[id]?.name ?? id;
}

export function spellName(id: string): string {
  return SPELLS[id]?.name ?? id;
}

/** Ежедневное пополнение энергии (прототип: без покупок и рекламы). */
export function refillEnergy(state: GameState, daily: number, cap: number): void {
  const today = new Date().toISOString().slice(0, 10);
  if (state.energy.lastRefill !== today) {
    state.energy.value = Math.max(state.energy.value, Math.min(cap, state.energy.value + daily));
    state.energy.lastRefill = today;
  }
}
