/**
 * Small deterministic helpers shared across engine modules.
 * No randomness without a seed — reproducibility is a first-class requirement.
 */

/** FNV-1a 32-bit hash → stable numeric seed from any string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 — tiny, fast, deterministic PRNG seeded from a string. */
export function seededRng(seed: string): () => number {
  let a = hashString(seed);
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/** Stable short id derived from parts — same parts always give same id. */
export function stableId(prefix: string, ...parts: string[]): string {
  const h = hashString(parts.join("::")).toString(36);
  return `${prefix}_${h}`;
}

export function round(value: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(value * f) / f;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Safe division that returns 0 instead of NaN/Infinity. */
export function safeDiv(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}
