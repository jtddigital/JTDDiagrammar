import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { anthropicClient } from '../src/anthropic.ts';
import { AiError } from '../src/errors.ts';

/** Fake SDK capturing the request; no network (URS-AI-020). */
function fakeSdk(result: object | Error) {
  const calls: { params: Record<string, unknown>; options: unknown }[] = [];
  const sdk = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>, options: unknown) => {
          calls.push({ params, options });
          return { finalMessage: async () => (result instanceof Error ? Promise.reject(result) : result) };
        },
        countTokens: async (params: Record<string, unknown>) => (calls.push({ params, options: undefined }), { input_tokens: 1234 }),
      },
    },
  } as unknown as Anthropic;
  return { sdk, calls };
}

const message = {
  content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }],
  stop_reason: 'end_turn',
  model: 'claude-opus-5-5',
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 },
};
const req = { system: 'sys', messages: [{ role: 'user' as const, content: [{ type: 'text', text: 'hi' }] }], schema: { type: 'object' } };

describe('Anthropic client (URS-AI-002, URS-AI-003, URS-AI-008, URS-AI-016)', () => {
  it('streams a schema-constrained request with cached system prompt and refusal fallbacks', async () => {
    const { sdk, calls } = fakeSdk(message);
    const signal = new AbortController().signal;
    const reply = await anthropicClient({ model: 'claude-opus-5-5', effort: 'high', fallbacks: true, sdk }).complete(req, signal);
    expect(calls[0]!.params).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      system: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
      output_config: { effort: 'high', format: { type: 'json_schema', schema: { type: 'object' } } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(calls[0]!.options).toEqual({ signal });
    expect(reply).toEqual({ content: message.content, text: '{"a":1}', stop: 'end_turn', model: 'claude-opus-5-5', usage: { input: 10, output: 5, cacheRead: 7, cacheWrite: 3 } });
  });

  it('omits fallbacks when disabled and honours per-request effort', async () => {
    const { sdk, calls } = fakeSdk(message);
    await anthropicClient({ model: 'm', effort: 'high', fallbacks: false, sdk }).complete({ ...req, effort: 'low' });
    expect(calls[0]!.params).not.toHaveProperty('fallbacks');
    expect(calls[0]!.params).toMatchObject({ output_config: { effort: 'low' } });
  });

  it('counts tokens with the same prompt', async () => {
    const { sdk, calls } = fakeSdk(message);
    expect(await anthropicClient({ model: 'm', effort: 'high', fallbacks: true, sdk }).countTokens(req)).toBe(1234);
    expect(calls[0]!.params).toMatchObject({ model: 'm', system: [{ text: 'sys' }], messages: req.messages });
  });

  it.each([
    [Anthropic.AuthenticationError, 'ai.config'],
    [Anthropic.RateLimitError, 'ai.rate-limit'],
    [Anthropic.InternalServerError, 'ai.upstream'],
  ])('maps %o to %s', async (cls, code) => {
    const e = Object.assign(Object.create(cls.prototype) as Error, { status: 500, message: 'x' });
    const { sdk } = fakeSdk(e);
    const err = await anthropicClient({ model: 'm', effort: 'high', fallbacks: true, sdk }).complete(req).catch((x: unknown) => x);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).code).toBe(code);
  });

  it("passes on the API's explanation of a refused request", async () => {
    const body = { type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format.schema: too many optional properties' } };
    const e = Object.assign(Object.create(Anthropic.BadRequestError.prototype) as Error, { status: 400, message: '400', error: body });
    const { sdk } = fakeSdk(e);
    const err = await anthropicClient({ model: 'm', effort: 'high', fallbacks: true, sdk }).complete(req).catch((x: unknown) => x);
    expect((err as AiError).message).toBe('the AI service failed (400): output_config.format.schema: too many optional properties');
  });

  describe('schemas the API refuses to compile (URS-AI-004)', () => {
    const refusal = () =>
      Object.assign(Object.create(Anthropic.BadRequestError.prototype) as Error, {
        status: 400,
        message: '400',
        error: { type: 'error', error: { type: 'invalid_request_error', message: 'The compiled grammar is too large, which would cause performance issues.' } },
      });
    /** Refuses every strict request, as the API did for the lifecycle schema. */
    function strictRefusingSdk(reply: object) {
      const calls: Record<string, unknown>[] = [];
      const strict = (p: Record<string, unknown>) => !!(p.output_config as { format?: unknown }).format;
      const sdk = {
        beta: {
          messages: {
            stream: (params: Record<string, unknown>) => {
              calls.push(params);
              return { finalMessage: async () => (strict(params) ? Promise.reject(refusal()) : reply) };
            },
            countTokens: async (params: Record<string, unknown>) => {
              calls.push(params);
              if (strict(params)) throw refusal();
              return { input_tokens: 99 };
            },
          },
        },
      } as unknown as Anthropic;
      return { sdk, calls };
    }
    const fenced = { ...message, content: [{ type: 'text', text: 'Here it is:\n```json\n{"a":1}\n```' }] };

    it('sends the schema as instructions instead, extracts the JSON, and remembers the refusal', async () => {
      const { sdk, calls } = strictRefusingSdk(fenced);
      const client = anthropicClient({ model: 'm', effort: 'high', fallbacks: true, sdk });
      expect((await client.complete(req)).text).toBe('{"a":1}');
      expect(calls).toHaveLength(2);
      expect(calls[1]).toMatchObject({ output_config: { effort: 'high' } });
      expect(calls[1]!.output_config).not.toHaveProperty('format');
      expect((calls[1]!.system as { text: string }[])[0]!.text).toContain('sys\n\nReply with one JSON object and nothing else');
      expect((calls[1]!.system as { text: string }[])[0]!.text).toContain('{"type":"object"}');
      // Known refused: later calls go straight to instructions.
      await client.complete(req);
      expect(await client.countTokens(req)).toBe(99);
      expect(calls).toHaveLength(4);
    });

    it('counts tokens the same way', async () => {
      const { sdk, calls } = strictRefusingSdk(fenced);
      expect(await anthropicClient({ model: 'm', effort: 'high', fallbacks: true, sdk }).countTokens(req)).toBe(99);
      expect(calls.map((c) => !!(c.output_config as { format?: unknown }).format)).toEqual([true, false]);
    });

    it('does not retry other refusals', async () => {
      const other = Object.assign(Object.create(Anthropic.BadRequestError.prototype) as Error, { status: 400, message: '400', error: { error: { message: 'messages: field required' } } });
      const { sdk, calls } = fakeSdk(other);
      const err = await anthropicClient({ model: 'm', effort: 'high', fallbacks: true, sdk }).complete(req).catch((x: unknown) => x);
      expect((err as AiError).message).toBe('the AI service failed (400): messages: field required');
      expect(calls).toHaveLength(1);
    });
  });
});
