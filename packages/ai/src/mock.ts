import type { AiClient, AiReply, AiRequest } from './client.ts';

export interface ScriptedReply {
  /** Reply body as JSON (serialised) or raw text. */
  json?: unknown;
  text?: string;
  stop?: string;
  /** Model reported as having served the reply (default 'mock'). */
  model?: string;
}

/** Deterministic stand-in for Claude: replays scripted replies and records requests (URS-AI-020). */
export class MockClaude implements AiClient {
  readonly requests: AiRequest[] = [];
  readonly #replies: ScriptedReply[];
  readonly #tokens: number;

  constructor(replies: ScriptedReply[], tokens = 1000) {
    this.#replies = [...replies];
    this.#tokens = tokens;
  }

  async complete(req: AiRequest, signal?: AbortSignal): Promise<AiReply> {
    signal?.throwIfAborted();
    this.requests.push({ ...req, messages: [...req.messages] });
    const r = this.#replies.shift();
    if (!r) throw new Error('MockClaude: no scripted reply left');
    const text = r.text ?? JSON.stringify(r.json);
    return { content: [{ type: 'text', text }], text, stop: r.stop ?? 'end_turn', model: r.model ?? 'mock', usage: { input: 100, output: 50, cacheRead: 80, cacheWrite: 0 } };
  }

  async countTokens(): Promise<number> {
    return this.#tokens;
  }
}
