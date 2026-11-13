import type { AiClient } from '@jtd/ai';
import type { Registry } from '@jtd/core';
import type { RouteHandlerMethod } from 'fastify';
import type { AiConfig } from '../config.ts';
import type { RenderPool } from '../pool.ts';

export interface Ctx {
  reg: Registry;
  pool: RenderPool;
  ai: AiConfig;
  /** Undefined when AI is not configured (URS-API-015). */
  claude?: AiClient;
  /** A Copilot client for the signed-in user's Graph token, when Copilot is configured (URS-AI-023). */
  copilot?: (token: string, timeZone?: string) => AiClient;
}

/** A route plus the facts the OpenAPI document needs; one table drives both (URS-API-008). */
export interface Route {
  method: 'GET' | 'POST';
  url: string;
  summary: string;
  /** Request body is a diagram document. */
  body?: boolean;
  /** OpenAPI requestBody for anything else. */
  requestBody?: object;
  responses: Record<number, string>;
  handler: RouteHandlerMethod;
}
