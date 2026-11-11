import type { ClaudeClient, ClaudeReply, ClaudeRequest } from './client.ts';

export interface ScriptedReply {
  /** Reply body as JSON (serialised) or raw text. */
  json?: unknown;
  text?: string;
  stop?: string;
}

/** Deterministic stand-in for Claude: replays scripted replies and records requests (URS-AI-020). */
export class MockClaude implements ClaudeClient {
  readonly requests: ClaudeRequest[] = [];
  readonly #replies: ScriptedReply[];
  readonly #tokens: number;

  constructor(replies: ScriptedReply[], tokens = 1000) {
    this.#replies = [...replies];
    this.#tokens = tokens;
  }

  async complete(req: ClaudeRequest, signal?: AbortSignal): Promise<ClaudeReply> {
    signal?.throwIfAborted();
    this.requests.push({ ...req, messages: [...req.messages] });
    const r = this.#replies.shift();
    if (!r) throw new Error('MockClaude: no scripted reply left');
    const text = r.text ?? JSON.stringify(r.json);
    return { content: [{ type: 'text', text }], text, stop: r.stop ?? 'end_turn', model: 'mock', usage: { input: 100, output: 50, cacheRead: 80, cacheWrite: 0 } };
  }

  async countTokens(): Promise<number> {
    return this.#tokens;
  }
}
