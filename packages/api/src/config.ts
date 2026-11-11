import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

export interface Config {
  host: string;
  port: number;
  /** Max request body in bytes (URS-API-006). */
  bodyLimit: number;
  maxNodes: number;
  maxEdges: number;
  renderTimeoutMs: number;
  renderWorkers: number;
  /** Built web app to serve at `/`, if present. */
  webDist?: string;
  /** Module exporting `createRegistry()`; lets tests register extra types (URS-EXT-002). */
  registryModule: string;
}

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && Number.isInteger(n) && n > 0 ? n : fallback;
};

const defaultWeb = fileURLToPath(new URL('../../web/dist', import.meta.url));

export const fromEnv = (env: NodeJS.ProcessEnv = process.env): Config => {
  const web = env.WEB_DIST ?? defaultWeb;
  return {
    host: env.HOST ?? '0.0.0.0',
    port: int(env.PORT, 8080),
    bodyLimit: int(env.BODY_LIMIT, 1_048_576),
    maxNodes: int(env.MAX_NODES, 1000),
    maxEdges: int(env.MAX_EDGES, 2000),
    renderTimeoutMs: int(env.RENDER_TIMEOUT_MS, 5000),
    renderWorkers: int(env.RENDER_WORKERS, Math.max(1, Math.min(4, availableParallelism() - 1))),
    ...(existsSync(web) && { webDist: web }),
    registryModule: '@jtd/core',
  };
};
