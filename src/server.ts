// HTTP-сервер прототипа: API игры и статический веб-клиент. Без внешних зависимостей.
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import type { GameState } from './types.ts';
import { config, ROOT } from './config.ts';
import { createClient, AiError } from './ai/client.ts';
import type { AiClient } from './ai/client.ts';
import { playTurn, GameError } from './game/turn.ts';
import { createGame, loadGame, saveGame, logTurn, readTurnLog } from './game/store.ts';
import { HERO_PRESETS } from './data/heroes.ts';
import { CLASSES, ITEMS, RU_ABILITY, RU_SKILL, SPELLS, XP_LEVELS } from './data/rules_data.ts';
import { campaignOf, itemName, locationDef, spellSaveDc, abilityMod, livingHostiles } from './engine/state.ts';
import { defaultRng } from './engine/dice.ts';

const PUBLIC = join(ROOT, 'public');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const AD_REWARD = 5;
const AD_DAILY_LIMIT = 5;
const PACK_REWARD = 50;

let ai: AiClient;
try {
  ai = createClient();
} catch (e) {
  console.error(`\n[!] ${(e as Error).message}\n    Работаю с заглушкой ИИ (AI_MODE=mock).\n`);
  config.aiMode = 'mock';
  ai = createClient();
}
const busy = new Set<string>();

function send(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 8192) throw new GameError('too_large', 'Слишком большой запрос.');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new GameError('bad_json', 'Неверный JSON.'); }
}

/** То, что видит клиент: без служебных полей и без ответов на загадки кампании. */
function view(s: GameState) {
  const h = s.hero;
  const loc = locationDef(s);
  const camp = campaignOf(s);
  const ads = s.ads;
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: s.id, status: s.status, turn: s.turn, campaign: camp.title,
    energy: { value: s.energy.value, cap: config.energy.cap, perTurn: config.energy.perTurn,
      adsLeft: AD_DAILY_LIMIT - (ads?.day === today ? ads.count : 0), adReward: AD_REWARD, packReward: PACK_REWARD },
    location: { id: loc.id, name: loc.name, tags: loc.tags, danger: livingHostiles(s).some((e) => e.aware) },
    hero: {
      name: h.name, origin: h.origin, cls: CLASSES[h.classId]?.name, level: h.level, xp: h.xp, xpNext: XP_LEVELS[h.level] ?? null,
      hp: h.hp, maxHp: h.maxHp, ac: h.ac, gold: h.gold, conditions: h.conditions,
      abilities: (Object.keys(h.abilities) as (keyof typeof h.abilities)[]).map((a) => ({ id: a, name: RU_ABILITY[a], score: h.abilities[a], mod: abilityMod(h, a) })),
      skills: h.proficient.map((sk) => RU_SKILL[sk]),
      inventory: h.inventory.map((i) => ({ id: i.item, name: itemName(i.item), qty: i.qty, kind: ITEMS[i.item]?.kind ?? 'misc' })),
      spells: h.spells.map((sp) => ({ id: sp, name: SPELLS[sp]?.name ?? sp, level: SPELLS[sp]?.level ?? 0 })),
      slots: Object.entries(h.slots).map(([lvl, v]) => ({ level: Number(lvl), left: v.max - v.used, max: v.max })),
      spellDc: h.spells.length ? spellSaveDc(h) : null,
    },
    journal: s.memory.slice(-30),
    quests: camp.flags.filter((f) => s.flags.includes(f.id)).map((f) => f.description),
    history: s.history.map((t) => ({ n: t.n, player: t.player, roll: t.roll, outcome: t.outcome, narration: t.narration,
      notes: t.notes, choices: t.choices, events: t.events })),
  };
}

function stats() {
  const log = readTurnLog();
  const real = log.filter((l) => l.ai !== 'mock');
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const rub = real.map((l) => Number(l.rub) || 0);
  return {
    aiMode: config.aiMode, models: { arbiter: config.arbiter.model, narrator: config.narrator.model },
    turns: log.length, realTurns: real.length, totalRub: Math.round(rub.reduce((a, b) => a + b, 0) * 100) / 100,
    avgRubPerTurn: Math.round(avg(rub) * 10000) / 10000,
    avgMs: Math.round(avg(real.map((l) => Number(l.ms) || 0))),
    retries: log.filter((l) => Number(l.retries) > 0).length,
    fallbacks: log.filter((l) => Array.isArray(l.fallbacks) && (l.fallbacks as unknown[]).length).length,
    guardFixes: log.filter((l) => Array.isArray(l.fixes) && (l.fixes as unknown[]).length).length,
    rejected: log.filter((l) => l.outcome === 'rejected').length,
    filtered: log.filter((l) => l.filtered).length,
  };
}

async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const method = req.method ?? 'GET';
  if (path === '/api/meta' && method === 'GET') {
    return send(res, 200, {
      aiMode: config.aiMode,
      presets: HERO_PRESETS.map((p) => ({ id: p.id, title: p.title, blurb: p.blurb, name: p.hero.name, origin: p.hero.origin,
        hp: p.hero.maxHp, ac: p.hero.ac })),
    });
  }
  if (path === '/api/stats' && method === 'GET') return send(res, 200, stats());
  if (path === '/api/games' && method === 'POST') {
    const b = await readBody(req);
    const preset = String(b.preset ?? '');
    if (!HERO_PRESETS.some((p) => p.id === preset)) throw new GameError('bad_preset', 'Выбери героя.');
    const s = createGame(preset, typeof b.name === 'string' ? b.name : undefined);
    return send(res, 201, view(s));
  }
  const m = /^\/api\/games\/([0-9a-f-]{36})(\/turn|\/energy)?$/.exec(path);
  if (!m) return send(res, 404, { error: 'not_found', message: 'Нет такого адреса.' });
  const s = loadGame(m[1]);
  if (!s) return send(res, 404, { error: 'no_game', message: 'Игра не найдена. Начни новую.' });

  if (!m[2] && method === 'GET') return send(res, 200, view(s));

  if (m[2] === '/energy' && method === 'POST') {
    // Прототип монетизации: «реклама» и «покупка» без настоящих SDK и платежей.
    const b = await readBody(req);
    const st = s;
    const today = new Date().toISOString().slice(0, 10);
    if (b.source === 'ad') {
      if (!st.ads || st.ads.day !== today) st.ads = { day: today, count: 0 };
      if (st.ads.count >= AD_DAILY_LIMIT) throw new GameError('ad_limit', 'На сегодня реклама закончилась.');
      st.ads.count++;
      s.energy.value += AD_REWARD;
    } else if (b.source === 'purchase') {
      s.energy.value += PACK_REWARD;
    } else throw new GameError('bad_source', 'Неизвестный источник энергии.');
    saveGame(s);
    return send(res, 200, view(s));
  }

  if (m[2] === '/turn' && method === 'POST') {
    const b = await readBody(req);
    if (busy.has(s.id)) throw new GameError('busy', 'Мастер ещё отвечает на прошлый ход.');
    busy.add(s.id);
    try {
      const out = await playTurn(s, String(b.action ?? ''), ai, defaultRng);
      saveGame(s);
      logTurn({ at: out.record.at, game: s.id, n: out.record.n, ai: ai.name, rub: out.record.cost?.rub, ms: out.record.cost?.ms,
        tokensIn: out.record.cost?.tokensIn, tokensOut: out.record.cost?.tokensOut, outcome: out.record.outcome,
        retries: out.debug.usage.retries, fallbacks: out.debug.usage.fallbacks, fixes: out.debug.fixes, filtered: out.debug.filtered,
        player: out.record.player, action: out.decision.action_type, normalized: out.decision.normalized_action });
      const cost = out.record.cost;
      console.log(`[ход ${out.record.n}] ${s.hero.name}: «${out.record.player.slice(0, 60)}» → ${out.decision.action_type}/${out.record.outcome}` +
        `${cost ? ` · ${cost.rub.toFixed(3)} ₽ · ${(cost.ms / 1000).toFixed(1)} с` : ''}${out.debug.usage.retries ? ' · повтор' : ''}` +
        `${out.debug.usage.fallbacks.length ? ` · ЗАПАСНОЙ ВАРИАНТ: ${out.debug.usage.fallbacks.join(',')}` : ''}`);
      return send(res, 200, view(s));
    } finally {
      busy.delete(s.id);
    }
  }
  return send(res, 405, { error: 'method', message: 'Метод не поддерживается.' });
}

async function staticFile(res: ServerResponse, path: string): Promise<void> {
  const rel = normalize(decodeURIComponent(path === '/' ? '/index.html' : path)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return send(res, 403, { error: 'forbidden' });
  try {
    const data = await readFile(join(PUBLIC, rel));
    res.writeHead(200, { 'Content-Type': MIME[extname(rel)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'not_found' });
  }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  try {
    if (path.startsWith('/api/')) await api(req, res, path);
    else await staticFile(res, path);
  } catch (e) {
    if (e instanceof GameError) return send(res, e.code === 'no_energy' ? 402 : e.code === 'busy' ? 409 : 400, { error: e.code, message: e.message });
    if (e instanceof AiError) {
      console.error(`[ИИ] ${e.message}`);
      return send(res, 503, { error: 'ai', message: 'Мастер не отвечает (ошибка ИИ). Попробуй ещё раз — энергия не списана.', detail: e.message });
    }
    console.error(e);
    send(res, 500, { error: 'internal', message: 'Внутренняя ошибка сервера.' });
  }
});

server.listen(config.port, config.host, () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i!.address);
  console.log('\n  Хроники Подземелий — прототип');
  console.log(`  ИИ: ${config.aiMode === 'yandex' ? `Yandex AI Studio (${config.arbiter.model} / ${config.narrator.model})` : 'заглушка (без расходов)'}`);
  console.log(`  На этом компьютере:  http://localhost:${config.port}`);
  for (const ip of ips) console.log(`  С телефона (та же Wi-Fi сеть):  http://${ip}:${config.port}`);
  console.log('  Статистика расходов: /api/stats\n  Остановить: Ctrl+C\n');
});
