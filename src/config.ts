// Настройки из файла .env (рядом с package.json) и переменных окружения.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const file = loadEnvFile(join(ROOT, '.env'));
const env = (k: string, def = ''): string => process.env[k] ?? file[k] ?? def;
const num = (k: string, def: number): number => {
  const v = Number(env(k, String(def)));
  return Number.isFinite(v) ? v : def;
};

export interface ModelCfg { model: string; priceIn: number; priceOut: number; priceCached: number; temperature: number; maxTokens: number }

export const config = {
  port: num('PORT', 8080),
  host: env('HOST', '0.0.0.0'),
  aiMode: (env('AI_MODE', 'mock') as 'mock' | 'yandex'),
  yandex: {
    apiKey: env('YANDEX_API_KEY'),
    folderId: env('YANDEX_FOLDER_ID'),
    baseUrl: env('YANDEX_BASE_URL', 'https://ai.api.cloud.yandex.net/v1'),
  },
  // цены — рубли за 1000 токенов (Yandex AI Studio, октябрь 2026)
  arbiter: {
    model: env('ARBITER_MODEL', 'aliceai-llm-flash'), priceIn: num('ARBITER_PRICE_IN', 0.1),
    priceOut: num('ARBITER_PRICE_OUT', 0.2), priceCached: num('ARBITER_PRICE_CACHED', 0.025),
    temperature: num('ARBITER_TEMPERATURE', 0.2), maxTokens: num('ARBITER_MAX_TOKENS', 700),
  } as ModelCfg,
  narrator: {
    model: env('NARRATOR_MODEL', 'aliceai-llm-flash'), priceIn: num('NARRATOR_PRICE_IN', 0.1),
    priceOut: num('NARRATOR_PRICE_OUT', 0.2), priceCached: num('NARRATOR_PRICE_CACHED', 0.025),
    temperature: num('NARRATOR_TEMPERATURE', 0.8), maxTokens: num('NARRATOR_MAX_TOKENS', 900),
  } as ModelCfg,
  useJsonSchema: env('USE_JSON_SCHEMA', '1') !== '0',
  energy: { start: num('ENERGY_START', 50), daily: num('ENERGY_DAILY', 30), cap: num('ENERGY_CAP', 50), perTurn: num('ENERGY_PER_TURN', 1) },
  dataDir: env('DATA_DIR', join(ROOT, 'data')),
  timeoutMs: num('AI_TIMEOUT_MS', 30000),
};
