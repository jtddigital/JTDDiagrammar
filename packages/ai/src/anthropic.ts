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
const apiMessage = (e: InstanceType<typeof Anthropic.APIError>): string => {
  const m = (e.error as { error?: { message?: unknown } } | undefined)?.error?.message;
  return typeof m === 'string' ? m : '';
};

function mapError(e: unknown): unknown {
  if (e instanceof Anthropic.APIUserAbortError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('ai.config', 'the AI service rejected the configured credentials');
  if (e instanceof Anthropic.RateLimitError) return new AiError('ai.rate-limit', 'the AI service is rate limiting requests; try again shortly');
  if (e instanceof Anthropic.APIError) {
    const m = apiMessage(e);
    return new AiError('ai.upstream', `the AI service failed (${e.status ?? 'network'})${m ? `: ${m.slice(0, 300)}` : ''}`);
  }
  return e;
}

/** The API refused to compile the schema into a grammar (too large or too complex). */
const tooLarge = (e: unknown) => e instanceof Anthropic.BadRequestError && /grammar is too large|too complex for compilation/i.test(apiMessage(e));

/** Without structured outputs, the schema goes into the instructions instead. */
const schemaInstruction = (schema: unknown) =>
  `Reply with one JSON object and nothing else: no prose, no code fences. It must match this JSON Schema exactly:\n${JSON.stringify(schema)}`;

/** The JSON object in a reply that may wrap it in prose or a code fence. */
const jsonOf = (text: string) => {
  const [a, b] = [text.indexOf('{'), text.lastIndexOf('}')];
  return a >= 0 && b > a ? text.slice(a, b + 1) : text;
};

/**
 * Claude via the official TypeScript SDK (URS-AI-002): streamed, schema-constrained, system prompt cached.
 * A schema the API refuses to compile is remembered and sent as instructions instead (URS-AI-004);
 * the generation loop validates and repairs the reply either way.
 */
export function anthropicClient(opts: AnthropicOptions): ClaudeClient {
  const sdk = opts.sdk ?? new Anthropic();
  const refused = new WeakSet<object>();
  const base = (req: ClaudeRequest, strict: boolean) => ({
    model: opts.model,
    // Stable prefix (system + type guide + examples) is cached (URS-AI-016).
    system: [{ type: 'text' as const, text: strict ? req.system : `${req.system}\n\n${schemaInstruction(req.schema)}`, cache_control: { type: 'ephemeral' as const } }],
    messages: req.messages as Anthropic.Beta.BetaMessageParam[],
    output_config: { effort: req.effort ?? opts.effort, ...(strict && { format: { type: 'json_schema' as const, schema: req.schema as Record<string, unknown> } }) },
  });
  /** Strict first; on a refused schema, once more without it. */
  const withFallback = async <T>(req: ClaudeRequest, run: (strict: boolean) => Promise<T>): Promise<T> => {
    try {
      if (!refused.has(req.schema)) {
        try {
          return await run(true);
        } catch (e) {
          if (!tooLarge(e)) throw e;
          refused.add(req.schema);
        }
      }
      return await run(false);
    } catch (e) {
      throw mapError(e);
    }
  };

  return {
    complete: (req, signal) =>
      withFallback(req, async (strict) => {
        const msg = await sdk.beta.messages
          .stream(
            { ...base(req, strict), max_tokens: opts.maxTokens ?? 64000, ...(opts.fallbacks && { betas: [FALLBACK_BETA], fallbacks: 'default' as const }) },
            { ...(signal && { signal }) },
          )
          .finalMessage();
        const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        return {
          content: msg.content,
          text: strict ? text : jsonOf(text),
          stop: msg.stop_reason ?? 'unknown',
          model: msg.model,
          usage: {
            input: msg.usage.input_tokens,
            output: msg.usage.output_tokens,
            cacheRead: msg.usage.cache_read_input_tokens ?? 0,
            cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
          },
        };
      }),
    countTokens: (req) => withFallback(req, async (strict) => (await sdk.beta.messages.countTokens(base(req, strict))).input_tokens),
  };
}
