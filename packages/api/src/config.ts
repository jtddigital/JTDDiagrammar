import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** AI generation settings (URS-AI-002, URS-AI-009). */
export interface AiConfig {
  /** Credentials present (ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN). Read by the SDK, never by us (URS-AI-010). */
  enabled: boolean;
  model: string;
  effort: Effort;
  fallbacks: boolean;
  maxRepairs: number;
  maxInputTokens: number;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxPdfPages: number;
}

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
  ai: AiConfig;
}

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && Number.isInteger(n) && n > 0 ? n : fallback;
};

const count = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && Number.isInteger(n) && n >= 0 ? n : fallback;
};

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

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
    // An external package may export createRegistry() with extra types (URS-EXT-008).
    registryModule: env.REGISTRY_MODULE ?? '@jtd/core',
    ai: {
      enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
      model: env.AI_MODEL ?? 'claude-opus-5-5',
      effort: EFFORTS.find((e) => e === env.AI_EFFORT) ?? 'high',
      fallbacks: env.AI_FALLBACKS !== 'off',
      maxRepairs: count(env.AI_MAX_REPAIRS, 2),
      maxInputTokens: int(env.AI_MAX_INPUT_TOKENS, 200_000),
      maxFiles: int(env.AI_MAX_FILES, 5),
      maxFileBytes: int(env.AI_MAX_FILE_BYTES, 20_000_000),
      maxTotalBytes: int(env.AI_MAX_TOTAL_BYTES, 20_000_000),
      maxPdfPages: int(env.AI_MAX_PDF_PAGES, 600),
    },
  };
};
