import type { Usage } from './client.ts';

/** USD per million tokens. Cache writes use the 5-minute TTL rate (1.25x input). */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Published Anthropic prices as of 2026-11 (URS-AI-017). Prices change: override with the
 * AI_PRICES environment variable (JSON of this shape) rather than trusting this table forever.
 */
export const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-fable-5-2': { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 10 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

/** Estimated cost of one reply in USD, or undefined for a model without a known price. */
export function cost(model: string, u: Usage, prices: Record<string, Price> = PRICES): number | undefined {
  const p = prices[model];
  return p && (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1e6;
}
