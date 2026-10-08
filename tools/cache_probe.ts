// Проверка кэша и состава токенов в Yandex AI Studio. Запуск: cache_probe.bat (≈ 1–2 ₽).
// Отправляет одинаковые и похожие запросы подряд и печатает prompt_tokens / cached_tokens.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from '../src/config.ts';
import { newGame } from '../src/engine/state.ts';
import { buildUserMessage } from '../src/ai/context.ts';
import { ARBITER_SCHEMA } from '../src/ai/schemas.ts';

const { apiKey, folderId, baseUrl } = config.yandex;
if (!apiKey || !folderId) {
  console.error('Нет YANDEX_API_KEY / YANDEX_FOLDER_ID (keys.bat или .env).');
  process.exit(1);
}
const system = readFileSync(join(ROOT, 'prompts', 'arbiter.md'), 'utf8');
const state = newGame('rogue', undefined, 50);
const userA = buildUserMessage(state, 'Расспросить старосту о гоблинах');
const userB = buildUserMessage(state, 'Зайти в таверну за слухами');
const model = process.argv[2] ?? config.arbiter.model;

async function call(label: string, user: string, schema: boolean) {
  const body: Record<string, unknown> = {
    model: `gpt://${folderId}/${model}`, temperature: 0.2, max_tokens: 400,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'arbiter', schema: ARBITER_SCHEMA } };
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${apiKey}`, 'OpenAI-Project': folderId },
    body: JSON.stringify(body),
  });
  const data = await res.json() as Record<string, any>;
  if (!res.ok) { console.log(label.padEnd(44), 'HTTP', res.status, JSON.stringify(data).slice(0, 200)); return; }
  const u = data.usage ?? {};
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  console.log(label.padEnd(44), `вход ${String(u.prompt_tokens).padStart(5)}  из кэша ${String(cached).padStart(5)}  выход ${String(u.completion_tokens).padStart(4)}  ${Date.now() - t0} мс`);
  return u;
}

console.log(`Модель: ${model}. Системный промпт ${system.length} симв., сообщение ${userA.length} симв.\n`);
await call('1. запрос со схемой JSON', userA, true);
await call('2. тот же запрос со схемой, повтор', userA, true);
await call('3. тот же запрос без схемы', userA, false);
await call('4. без схемы, повтор', userA, false);
await new Promise((r) => setTimeout(r, 3000));
await call('5. без схемы, повтор через 3 с', userA, false);
await call('6. другой ход (та же система), без схемы', userB, false);
await call('7. другой ход, со схемой', userB, true);
console.log('\nСкопируйте эти строки и пришлите в чат.');
