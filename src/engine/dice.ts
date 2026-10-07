// Кубы. Генератор можно подменить в тестах.
export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let s = (Math.imul(seed >>> 0, 0x9e3779b1) ^ 0x6d2b79f5) >>> 0 || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < 8; i++) next(); // прогрев: первые значения xorshift слабо перемешаны
  return next;
}

export const defaultRng: Rng = Math.random;

export function d(sides: number, rng: Rng): number {
  return 1 + Math.floor(rng() * sides);
}

const DICE_RE = /^\s*(\d{1,2})d(4|6|8|10|12|20)\s*([+-]\s*\d{1,2})?\s*$/i;

export function isValidDice(expr: string | undefined): boolean {
  return !!expr && DICE_RE.test(expr);
}

export interface DiceRoll { expr: string; rolls: number[]; bonus: number; total: number }

/** Бросок «NdM+K». При крите кубы удваиваются (бонус — нет). */
export function rollDice(expr: string, rng: Rng, crit = false): DiceRoll {
  const m = DICE_RE.exec(expr);
  if (!m) throw new Error(`Неверная формула кубов: ${expr}`);
  const n = Number(m[1]) * (crit ? 2 : 1);
  const sides = Number(m[2]);
  const bonus = m[3] ? Number(m[3].replace(/\s/g, '')) : 0;
  const rolls = Array.from({ length: n }, () => d(sides, rng));
  return { expr, rolls, bonus, total: Math.max(0, rolls.reduce((a, b) => a + b, 0) + bonus) };
}

export function withMod(expr: string, mod: number): string {
  if (!mod) return expr;
  const m = DICE_RE.exec(expr);
  if (!m) return expr;
  const base = m[3] ? Number(m[3].replace(/\s/g, '')) : 0;
  const b = base + mod;
  return `${m[1]}d${m[2]}${b === 0 ? '' : b > 0 ? `+${b}` : b}`;
}

/** Максимум формулы — для ограничения импровизированного урона. */
export function maxDice(expr: string): number {
  const m = DICE_RE.exec(expr);
  if (!m) return 0;
  return Number(m[1]) * Number(m[2]) + (m[3] ? Number(m[3].replace(/\s/g, '')) : 0);
}

/** к20 с преимуществом/помехой. */
export function rollD20(adv: 'none' | 'advantage' | 'disadvantage', rng: Rng): { dice: number[]; natural: number } {
  if (adv === 'none') {
    const r = d(20, rng);
    return { dice: [r], natural: r };
  }
  const a = d(20, rng), b = d(20, rng);
  return { dice: [a, b], natural: adv === 'advantage' ? Math.max(a, b) : Math.min(a, b) };
}
