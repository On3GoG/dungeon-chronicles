// Сохранения: по JSON-файлу на игру в data/saves. Для прототипа этого достаточно (в бою — PostgreSQL).
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameState } from '../types.ts';
import { config } from '../config.ts';
import { campaignOf, newGame, refillEnergy } from '../engine/state.ts';

const SAVES = join(config.dataDir, 'saves');
const LOGS = join(config.dataDir, 'logs');
const ID_RE = /^[0-9a-f-]{36}$/;

function ensureDirs(): void {
  mkdirSync(SAVES, { recursive: true });
  mkdirSync(LOGS, { recursive: true });
}

export function createGame(presetId: string, heroName?: string): GameState {
  ensureDirs();
  const state = newGame(presetId, heroName, config.energy.start);
  const c = campaignOf(state);
  state.history.push({
    n: 0, at: state.createdAt, player: '', outcome: 'intro', narration: c.intro, roll: null,
    choices: c.introChoices.map((label, i) => ({ id: `c${i + 1}`, label, icon: i === 0 ? 'talk' : i === 1 ? 'explore' : 'move' })),
    notes: [], events: [],
  });
  saveGame(state);
  return state;
}

export function loadGame(id: string): GameState | null {
  if (!ID_RE.test(id)) return null;
  const p = join(SAVES, `${id}.json`);
  if (!existsSync(p)) return null;
  const state = JSON.parse(readFileSync(p, 'utf8')) as GameState;
  refillEnergy(state, config.energy.daily, config.energy.cap);
  return state;
}

export function saveGame(state: GameState): void {
  ensureDirs();
  const p = join(SAVES, `${state.id}.json`);
  writeFileSync(`${p}.tmp`, JSON.stringify(state));
  renameSync(`${p}.tmp`, p); // атомарная замена: файл не побьётся при падении
}

export function logTurn(entry: Record<string, unknown>): void {
  ensureDirs();
  appendFileSync(join(LOGS, 'turns.jsonl'), JSON.stringify(entry) + '\n');
}

export function readTurnLog(): Record<string, unknown>[] {
  const p = join(LOGS, 'turns.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((x): x is Record<string, unknown> => !!x);
}
