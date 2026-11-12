import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient, ClaudeRequest, Effort } from './client.ts';
import { AiError } from './errors.ts';

export interface AnthropicOptions {
  model: string;
  effort: Effort;
  /** Server-side refusal fallbacks (`fallbacks: "default"`), on unless disabled (URS-AI-008). */
  fallbacks: boolean;
  maxTokens?: number;
  /** Injected for tests; defaults to an SDK client that reads credentials from the environment. */
  sdk?: Anthropic;
}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** The API's own explanation of a refused request, e.g. which field it rejected. It names no credentials. */
function reason(e: InstanceType<typeof Anthropic.APIError>): string {
  const m = (e.error as { error?: { message?: unknown } } | undefined)?.error?.message;
  return typeof m === 'string' && m ? `: ${m.slice(0, 300)}` : '';
}

function mapError(e: unknown): unknown {
  if (e instanceof Anthropic.APIUserAbortError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('ai.config', 'the AI service rejected the configured credentials');
  if (e instanceof Anthropic.RateLimitError) return new AiError('ai.rate-limit', 'the AI service is rate limiting requests; try again shortly');
  if (e instanceof Anthropic.APIError) return new AiError('ai.upstream', `the AI service failed (${e.status ?? 'network'})${reason(e)}`);
  return e;
}

/** Claude via the official TypeScript SDK (URS-AI-002): streamed, schema-constrained, system prompt cached. */
export function anthropicClient(opts: AnthropicOptions): ClaudeClient {
  const sdk = opts.sdk ?? new Anthropic();
  const base = (req: ClaudeRequest) => ({
    model: opts.model,
    // Stable prefix (system + type guide + examples) is cached (URS-AI-016).
    system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }],
    messages: req.messages as Anthropic.Beta.BetaMessageParam[],
    output_config: { effort: req.effort ?? opts.effort, format: { type: 'json_schema' as const, schema: req.schema as Record<string, unknown> } },
  });

  return {
    async complete(req, signal) {
      try {
        const msg = await sdk.beta.messages
          .stream(
            {
              ...base(req),
              max_tokens: opts.maxTokens ?? 64000,
              ...(opts.fallbacks && { betas: [FALLBACK_BETA], fallbacks: 'default' as const }),
            },
            { ...(signal && { signal }) },
          )
          .finalMessage();
        return {
          content: msg.content,
          text: msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''),
          stop: msg.stop_reason ?? 'unknown',
          model: msg.model,
          usage: {
            input: msg.usage.input_tokens,
            output: msg.usage.output_tokens,
            cacheRead: msg.usage.cache_read_input_tokens ?? 0,
            cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
          },
        };
      } catch (e) {
        throw mapError(e);
      }
    },
    async countTokens(req) {
      try {
        return (await sdk.beta.messages.countTokens(base(req))).input_tokens;
      } catch (e) {
        throw mapError(e);
      }
    },
  };
}
