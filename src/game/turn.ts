// Один ход игры: фильтр → арбитр → страж → движок → рассказчик → память.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArbiterDecision, GameState, NarratorResponse, TurnRecord } from '../types.ts';
import type { AiClient, ChatMessage, ChatResult, Role, TurnHint } from '../ai/client.ts';
import { AiError, costRub } from '../ai/client.ts';
import { buildUserMessage, engineResultBlock } from '../ai/context.ts';
import { extractJson, validateArbiter, validateNarrator } from '../ai/validate.ts';
import { ARBITER_SCHEMA, NARRATOR_SCHEMA } from '../ai/schemas.ts';
import { prefilterAction } from '../engine/prefilter.ts';
import { guardDecision } from '../engine/guard.ts';
import type { EngineResult } from '../engine/resolve.ts';
import { REST_RE, resolveRest, resolveTurn } from '../engine/resolve.ts';
import type { Rng } from '../engine/dice.ts';
import { config, ROOT } from '../config.ts';

const PROMPTS = {
  arbiter: readFileSync(join(ROOT, 'prompts', 'arbiter.md'), 'utf8'),
  narrator: readFileSync(join(ROOT, 'prompts', 'narrator.md'), 'utf8'),
};
const MAX_MEMORY = 40;
const MAX_HISTORY = 300;

export class GameError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

interface Usage { rub: number; tokensIn: number; tokensOut: number; cached: number; ms: number; retries: number; fallbacks: string[] }

async function ask<T>(ai: AiClient, role: Role, user: string, hint: TurnHint, usage: Usage,
  validate: (raw: unknown) => { value: T | null; errors: string[] }): Promise<T | null> {
  const messages: ChatMessage[] = [{ role: 'system', content: PROMPTS[role] }, { role: 'user', content: user }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const r: ChatResult = await ai.chat(role, messages, role === 'arbiter' ? ARBITER_SCHEMA : NARRATOR_SCHEMA, hint);
    usage.rub += costRub(role, r, ai.name === 'mock');
    usage.tokensIn += r.tokensIn;
    usage.cached += r.cached;
    usage.tokensOut += r.tokensOut;
    usage.ms += r.ms;
    let errors: string[];
    try {
      const v = validate(extractJson(r.text));
      if (v.value) return v.value;
      errors = v.errors;
    } catch (e) {
      errors = [(e as Error).message];
    }
    if (attempt === 0) {
      usage.retries++;
      messages.push({ role: 'assistant', content: r.text.slice(0, 2000) },
        { role: 'user', content: `Ответ не по формату: ${errors.join('; ')}. Верни только один JSON-объект со всеми полями, без пояснений.` });
    }
  }
  return null;
}

function fallbackDecision(text: string): ArbiterDecision {
  return {
    allowed: true, action_type: 'trivial', normalized_action: text.slice(0, 150), check: null, targets: [], weapon: null,
    spell: null, consumes: [], spell_slot: null, effects_on_success: [], effects_on_failure: [], correction_note: null,
  };
}

function fallbackNarration(r: EngineResult, normalized: string, state: GameState): NarratorResponse {
  const text = [normalized + '.', ...r.events, ...r.enemyActions, ...r.after].join(' ');
  return {
    narration: text.length > 30 ? text : `${text} Мир вокруг замирает в ожидании твоего следующего шага.`,
    choices: [
      { id: 'c1', label: 'Осмотреться', icon: 'explore' },
      { id: 'c2', label: 'Двигаться дальше', icon: 'move' },
      { id: 'c3', label: state.history.length ? 'Обдумать, что делать' : 'Расспросить местных', icon: 'other' },
    ],
    scene_tags: [], memory_note: null, safety: 'ok',
  };
}

export interface TurnOutput { record: TurnRecord; engine: EngineResult; decision: ArbiterDecision; debug: { fixes: string[]; usage: Usage; filtered: boolean } }

export async function playTurn(state: GameState, rawAction: string, ai: AiClient, rng: Rng): Promise<TurnOutput> {
  if (state.status === 'won') throw new GameError('finished', 'Кампания завершена. Начни новую игру.');
  if (state.energy.value < config.energy.perTurn) throw new GameError('no_energy', 'Энергия закончилась. Она восстановится завтра.');
  const pf = prefilterAction(rawAction);
  if (!pf.text) throw new GameError('empty', 'Опиши, что делает твой герой.');

  const usage: Usage = { rub: 0, tokensIn: 0, tokensOut: 0, cached: 0, ms: 0, retries: 0, fallbacks: [] };
  const hint: TurnHint = { state, playerText: pf.text };

  // 1. арбитр (ошибка сети здесь — ход не начат, состояние не тронуто). Отдых решает движок без арбитра.
  const isRest = REST_RE.test(pf.text);
  let decision = isRest ? null : await ask(ai, 'arbiter', buildUserMessage(state, pf.text), hint, usage, validateArbiter);
  if (!decision) {
    if (!isRest) usage.fallbacks.push('arbiter');
    decision = fallbackDecision(isRest ? 'Устраивает привал' : pf.text);
  }

  // 2. страж и движок
  const g = isRest ? { decision, notes: [] as string[], fixes: [] as string[] } : guardDecision(decision, state, pf.text);
  const notes = [...g.notes];
  if (pf.removed) notes.push('Служебные вставки в скобках убраны из заявки — мастер слышит только слова героя.');
  if (pf.truncated) notes.push('Заявка обрезана до 300 символов.');
  const engine = isRest ? resolveRest(state) : resolveTurn(state, g.decision, rng, notes);
  if (isRest) engine.notes.push(...notes);

  // 3. рассказчик (если упал — показываем текст движка, ход не теряется)
  let narr: NarratorResponse | null = null;
  try {
    narr = await ask(ai, 'narrator', buildUserMessage(state, pf.text, { engine: engineResultBlock(engine, g.decision.normalized_action) }),
      { ...hint, engine, normalized: g.decision.normalized_action }, usage, validateNarrator);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
  }
  if (!narr) {
    usage.fallbacks.push('narrator');
    narr = fallbackNarration(engine, g.decision.normalized_action, state);
  }

  // 4. память
  if (narr.memory_note) state.memory.push(narr.memory_note); // факты reveal_info движок уже записал сам
  if (state.memory.length > MAX_MEMORY) state.memory = state.memory.slice(-MAX_MEMORY);

  state.turn += 1;
  state.energy.value -= config.energy.perTurn;
  const record: TurnRecord = {
    n: state.turn, at: new Date().toISOString(), player: pf.text, normalized: g.decision.normalized_action,
    roll: engine.roll, outcome: engine.outcome, narration: narr.narration, choices: narr.choices,
    notes: [...new Set(engine.notes)], events: [...engine.events, ...engine.enemyActions, ...engine.after],
    cost: { rub: Math.round(usage.rub * 10000) / 10000, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, cached: usage.cached, ms: usage.ms },
  };
  state.history.push(record);
  if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY);
  state.updatedAt = record.at;
  return { record, engine, decision: g.decision, debug: { fixes: g.fixes, usage, filtered: pf.removed } };
}
