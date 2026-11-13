import { describe, expect, it } from 'vitest';
import { copilotClient } from '../src/copilot.ts';
import { AiError } from '../src/errors.ts';

type Call = { url: string; init: RequestInit };
/** Stand-in for Graph: answers each call in turn. */
function fakeFetch(...answers: (object | [number, object])[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const a = answers.shift()!;
    const [status, body] = Array.isArray(a) ? a : [200, a];
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const body = (c: Call) => JSON.parse(String(c.init.body)) as Record<string, unknown>;
const req = { system: 'sys', messages: [{ role: 'user' as const, content: [{ type: 'text', text: 'hi' }] }], schema: { type: 'object' } };
const err = (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e as AiError);

describe('Microsoft 365 Copilot client (URS-AI-023)', () => {
  it('starts a conversation and chats with the schema as instructions, as the signed-in user', async () => {
    const { f, calls } = fakeFetch({ id: 'c1' }, { id: 'c1', messages: [{ text: 'hi' }, { text: 'Sure:\n```json\n{"a":1}\n```' }] });
    const reply = await copilotClient({ token: 'tok', fetch: f, timeZone: 'Europe/London' }).complete(req);
    expect(calls.map((c) => c.url)).toEqual(['https://graph.microsoft.com/beta/copilot/conversations', 'https://graph.microsoft.com/beta/copilot/conversations/c1/chat']);
    expect(calls.every((c) => (c.init.headers as Record<string, string>).authorization === 'Bearer tok')).toBe(true);
    expect(body(calls[0]!)).toEqual({});
    const chat = body(calls[1]!);
    expect(chat).toMatchObject({ message: { text: 'hi' }, locationHint: { timeZone: 'Europe/London' } });
    expect((chat.additionalContext as { text: string }[])[0]!.text).toBe('sys\n\nReply with one JSON object and nothing else: no prose, no code fences. It must match this JSON Schema exactly:\n{"type":"object"}');
    expect(reply).toMatchObject({ text: '{"a":1}', stop: 'end_turn', model: 'microsoft-365-copilot', usage: { input: 0, output: 0 } });
  });

  it('sends repair turns as one transcript, in a fresh conversation', async () => {
    const { f, calls } = fakeFetch({ id: 'c2' }, { messages: [{ text: '{"b":2}' }] });
    const turns = [...req.messages, { role: 'assistant' as const, content: [{ type: 'text', text: '{"a":1}' }] }, { role: 'user' as const, content: [{ type: 'text', text: 'fix /a' }] }];
    await copilotClient({ token: 't', fetch: f, baseUrl: 'https://example.test/v1/' }).complete({ ...req, messages: turns });
    expect(calls[1]!.url).toBe('https://example.test/v1/copilot/conversations/c2/chat');
    expect(body(calls[1]!).message).toEqual({ text: 'User:\nhi\n\nYour earlier reply:\n{"a":1}\n\nUser:\nfix /a' });
  });

  it('takes text only', async () => {
    const pdf = { ...req, messages: [{ role: 'user' as const, content: [{ type: 'document', title: 'a.pdf', source: {} }] }] };
    const e = await err(copilotClient({ token: 't', fetch: fakeFetch().f }).complete(pdf));
    expect(e).toMatchObject({ code: 'ai.input' });
  });

  it('maps Graph errors without echoing the token', async () => {
    const cases: [number, string][] = [[403, 'ai.config'], [401, 'ai.config'], [429, 'ai.rate-limit'], [500, 'ai.upstream']];
    for (const [status, code] of cases) {
      const e = await err(copilotClient({ token: 'secret-token', fetch: fakeFetch([status, { error: { message: 'nope' } }]).f }).complete(req));
      expect(e, String(status)).toMatchObject({ code });
      expect(e!.message).not.toContain('secret-token');
    }
    expect((await err(copilotClient({ token: 't', fetch: fakeFetch([403, { error: { message: 'Required license missing' } }]).f }).complete(req)))!.message).toContain('Required license missing');
    expect(await err(copilotClient({ token: 't', fetch: fakeFetch({ id: 'c' }, { messages: [] }).f }).complete(req))).toMatchObject({ code: 'ai.upstream' });
  });

  it('estimates tokens from the text', async () => {
    expect(await copilotClient({ token: 't', fetch: fakeFetch().f }).countTokens(req)).toBeGreaterThan(20);
  });
});
