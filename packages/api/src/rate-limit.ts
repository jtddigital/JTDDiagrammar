/** Sliding-window limiter per key (client IP) for the AI endpoints (URS-AI-019). In memory: one process. */
export class RateLimiter {
  readonly #hits = new Map<string, number[]>();
  readonly #limit: number;
  readonly #windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  /** Record a request; when over the limit, say how many seconds until the oldest hit expires. */
  take(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterS: number } {
    if (this.#limit <= 0) return { ok: true };
    const recent = (this.#hits.get(key) ?? []).filter((t) => t > now - this.#windowMs);
    if (recent.length >= this.#limit) {
      this.#hits.set(key, recent);
      return { ok: false, retryAfterS: Math.ceil((recent[0]! + this.#windowMs - now) / 1000) };
    }
    recent.push(now);
    this.#hits.set(key, recent);
    return { ok: true };
  }
}
