// Клиенты моделей: Yandex AI Studio (OpenAI-совместимый API) и заглушка для разработки без сети.
import type { ModelCfg } from '../config.ts';
import { config } from '../config.ts';
import type { GameState } from '../types.ts';
import type { EngineResult } from '../engine/resolve.ts';
import { mockArbiter, mockNarrator } from './mock.ts';

export type Role = 'arbiter' | 'narrator';
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatResult { text: string; tokensIn: number; tokensOut: number; cached: number; ms: number; structured: boolean }
/** Что известно о ходе — нужно только заглушке, настоящая модель видит всё в тексте. */
export interface TurnHint { state: GameState; playerText: string; engine?: EngineResult; normalized?: string }

export interface AiClient {
  name: string;
  chat(role: Role, messages: ChatMessage[], schema: object | null, hint: TurnHint): Promise<ChatResult>;
}

export class AiError extends Error {}

export class YandexClient implements AiClient {
  name = 'yandex';
  private noSchema = new Set<string>();
  private apiKey: string;
  private folderId: string;
  private baseUrl: string;

  constructor(apiKey: string, folderId: string, baseUrl: string) {
    if (!apiKey || !folderId) throw new AiError('Не заданы YANDEX_API_KEY и YANDEX_FOLDER_ID в файле .env');
    this.apiKey = apiKey;
    this.folderId = folderId;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async chat(role: Role, messages: ChatMessage[], schema: object | null): Promise<ChatResult> {
    const cfg: ModelCfg = config[role];
    const useSchema = !!schema && config.useJsonSchema && !this.noSchema.has(cfg.model);
    const body: Record<string, unknown> = {
      model: `gpt://${this.folderId}/${cfg.model}`, messages, temperature: cfg.temperature, max_tokens: cfg.maxTokens,
    };
    if (useSchema) body.response_format = { type: 'json_schema', json_schema: { name: role, schema } };
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${this.apiKey}`, 'OpenAI-Project': this.folderId },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (e) {
      throw new AiError(`Нет связи с Yandex AI Studio: ${(e as Error).message}`);
    }
    const text = await res.text();
    if (res.status === 400 && useSchema) {
      this.noSchema.add(cfg.model); // модель не поддерживает схему — дальше без неё
      return this.chat(role, messages, null);
    }
    if (!res.ok) throw new AiError(`Yandex AI Studio: HTTP ${res.status}: ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    const usage = data.usage ?? {};
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      tokensIn: Number(usage.prompt_tokens ?? 0),
      tokensOut: Number(usage.completion_tokens ?? 0),
      cached: Number(usage.prompt_tokens_details?.cached_tokens ?? 0),
      ms: Date.now() - t0,
      structured: useSchema,
    };
  }
}

/** Заглушка: простые правила по ключевым словам. Нужна для разработки интерфейса и тестов без расходов. */
export class MockClient implements AiClient {
  name = 'mock';
  breakNext = 0; // для тестов: сколько следующих ответов вернуть битыми

  async chat(role: Role, messages: ChatMessage[], _schema: object | null, hint: TurnHint): Promise<ChatResult> {
    const t0 = Date.now();
    let text: string;
    if (this.breakNext > 0) {
      this.breakNext--;
      text = 'Конечно! Вот ответ: {"allowed": tru';
    } else {
      text = JSON.stringify(role === 'arbiter' ? mockArbiter(hint.state, hint.playerText) : mockNarrator(hint.state, hint.engine!, hint.normalized ?? hint.playerText));
    }
    const len = messages.reduce((a, m) => a + m.content.length, 0);
    return { text, tokensIn: Math.round(len / 3.5), tokensOut: Math.round(text.length / 3.5), cached: 0, ms: Date.now() - t0, structured: false };
  }
}

export function createClient(): AiClient {
  return config.aiMode === 'yandex'
    ? new YandexClient(config.yandex.apiKey, config.yandex.folderId, config.yandex.baseUrl)
    : new MockClient();
}

export function costRub(role: Role, r: ChatResult, isMock: boolean): number {
  if (isMock) return 0;
  const p = config[role];
  return ((r.tokensIn - r.cached) * p.priceIn + r.cached * p.priceCached + r.tokensOut * p.priceOut) / 1000;
}
