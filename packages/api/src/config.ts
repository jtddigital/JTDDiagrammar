import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

import type { Price } from '@jtd/ai';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const json = (v: string | undefined): Record<string, Price> | undefined => {
  try {
    return v ? (JSON.parse(v) as Record<string, Price>) : undefined;
  } catch {
    return undefined;
  }
};

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
  /** Output budget per Claude call. */
  maxOutputTokens: number;
  /** AI requests per client per minute; 0 disables (URS-AI-019). */
  ratePerMinute: number;
  /** Price table override, USD per million tokens (URS-AI-017). */
  prices?: Record<string, Price>;
  /** Microsoft 365 Copilot through Microsoft Graph, on behalf of the signed-in user (URS-AI-023). */
  copilot?: CopilotConfig;
}

/** Public settings for Microsoft sign-in in the browser; there is no secret (the app registration is a single-page app). */
export interface CopilotConfig {
  /** Entra ID application (client) id. */
  clientId: string;
  /** Tenant id or domain; `organizations` for any work or school account. */
  tenantId: string;
  graphUrl: string;
  /** Delegated Graph permissions the Copilot Chat API needs. */
  scopes: string[];
  /**
   * `browser`: Microsoft sign-in popup, for a single-page app registration. `device`: a device code,
   * as `Connect-MgGraph -UseDeviceCode` does, for a public client app (URS-AI-024).
   */
  signIn: 'browser' | 'device';
  /** Microsoft identity platform host. */
  loginUrl: string;
}

/**
 * Microsoft Graph Command Line Tools: Microsoft's public client app that `Connect-MgGraph` signs in
 * with. The default, so Copilot needs no app registration and no settings (URS-AI-024).
 */
export const GRAPH_CLI_APP = '14d82eec-204b-4c2f-b7e8-296a70dab67e';

/** Delegated permissions the Microsoft 365 Copilot Chat API requires, all together. Override with COPILOT_SCOPES. */
export const COPILOT_SCOPES = ['Sites.Read.All', 'Mail.Read', 'People.Read.All', 'OnlineMeetingTranscript.Read.All', 'Chat.Read', 'ChannelMessage.Read.All', 'ExternalItem.Read.All'];

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
      maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 64000),
      ratePerMinute: count(env.AI_RATE_LIMIT, 10),
      ...(json(env.AI_PRICES) && { prices: json(env.AI_PRICES)! }),
      // On unless COPILOT=off: with no settings, device sign-in through Microsoft's own public app.
      ...(env.COPILOT !== 'off' && {
        copilot: {
          clientId: env.COPILOT_CLIENT_ID || GRAPH_CLI_APP,
          tenantId: env.COPILOT_TENANT_ID || 'organizations',
          graphUrl: env.COPILOT_GRAPH_URL || 'https://graph.microsoft.com/beta',
          // A registered single-page app signs in with a popup; Microsoft's public app with a device code.
          signIn: (env.COPILOT_SIGNIN || ((env.COPILOT_CLIENT_ID || GRAPH_CLI_APP) === GRAPH_CLI_APP ? 'device' : 'browser')) === 'device' ? ('device' as const) : ('browser' as const),
          loginUrl: (env.COPILOT_LOGIN_URL || 'https://login.microsoftonline.com').replace(/\/$/, ''),
          scopes: (env.COPILOT_SCOPES ? env.COPILOT_SCOPES.split(/[\s,]+/).filter(Boolean) : COPILOT_SCOPES).map((s) => (s.includes('://') ? s : `https://graph.microsoft.com/${s}`)),
        },
      }),
    },
  };
};
