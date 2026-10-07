import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YandexClient, AiError, costRub } from '../src/ai/client.ts';

test('клиент Яндекса: адрес, заголовки, модель, схема; при 400 — повтор без схемы', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (calls.length === 1) return new Response('{"error":"schema"}', { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }],
      usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 800 } } }), { status: 200 });
  }) as typeof fetch;
  try {
    const c = new YandexClient('KEY', 'b1gfolder', 'https://ai.api.cloud.yandex.net/v1');
    const r = await c.chat('arbiter', [{ role: 'user', content: 'hi' }], { type: 'object' });
    assert.equal(calls[0].url, 'https://ai.api.cloud.yandex.net/v1/chat/completions');
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal(h.Authorization, 'Api-Key KEY');
    assert.equal(h['OpenAI-Project'], 'b1gfolder');
    const b0 = JSON.parse(String(calls[0].init.body));
    assert.equal(b0.model, 'gpt://b1gfolder/aliceai-llm-flash');
    assert.ok(b0.response_format);
    assert.equal(JSON.parse(String(calls[1].init.body)).response_format, undefined);
    assert.equal(r.text, '{"a":1}');
    assert.equal(r.cached, 800);
    // (200 × 0.1 + 800 × 0.025 + 200 × 0.2) / 1000 = 0.08 ₽
    assert.ok(Math.abs(costRub('arbiter', r, false) - 0.08) < 1e-9);
  } finally {
    globalThis.fetch = orig;
  }
});

test('клиент Яндекса: без ключа — понятная ошибка', () => {
  assert.throws(() => new YandexClient('', '', 'x'), AiError);
});
