import type { JsonSchema } from '@jtd/core';

/** Content we send: text, or a PDF passed through as a document block. */
export type InputBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; title: string; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'image'; source: { type: 'base64'; media_type: ImageType; data: string } };

export type ImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/** Assistant turns carry the model's content blocks verbatim (thinking blocks must round-trip unchanged). */
export interface Turn {
  role: 'user' | 'assistant';
  content: readonly unknown[];
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ClaudeRequest {
  system: string;
  messages: readonly Turn[];
  /** Structured-output schema the reply must match (URS-AI-003). */
  schema: JsonSchema;
  effort?: Effort;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ClaudeReply {
  content: readonly unknown[];
  /** Concatenated text blocks: the JSON document. */
  text: string;
  stop: string;
  usage: Usage;
  model: string;
}

/** Seam between generation logic and the Anthropic SDK; tests use MockClaude (URS-AI-020). */
export interface ClaudeClient {
  complete(req: ClaudeRequest, signal?: AbortSignal): Promise<ClaudeReply>;
  countTokens(req: ClaudeRequest): Promise<number>;
}
