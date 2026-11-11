import type { Registry } from '@jtd/core';
import type { RouteHandlerMethod } from 'fastify';
import type { RenderPool } from '../pool.ts';

export interface Ctx {
  reg: Registry;
  pool: RenderPool;
}

/** A route plus the facts the OpenAPI document needs; one table drives both (URS-API-008). */
export interface Route {
  method: 'GET' | 'POST';
  url: string;
  summary: string;
  /** Request body is a diagram document. */
  body?: boolean;
  responses: Record<number, string>;
  handler: RouteHandlerMethod;
}
