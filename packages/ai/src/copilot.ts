import type { AiClient, AiReply, AiRequest, Turn } from './client.ts';
import { AiError } from './errors.ts';
import { jsonOf, schemaInstruction } from './instructions.ts';

export interface CopilotOptions {
  /** The signed-in user's delegated Microsoft Graph token. Used for this request only; never stored or logged (URS-AI-010). */
  token: string;
  /** Graph base, default the beta endpoint that hosts the Copilot Chat API. */
  baseUrl?: string;
  /** IANA time zone for `locationHint`. */
  timeZone?: string;
  /** Injected for tests. */
  fetch?: typeof fetch;
}

export const COPILOT_MODEL = 'microsoft-365-copilot';
const GRAPH_BETA = 'https://graph.microsoft.com/beta';

/** Text of a turn; Copilot takes text only. */
function textOf(t: Turn): string {
  return t.content
    .map((b) => {
      const x = b as { type?: string; text?: string };
      if (x.type === 'text') return x.text ?? '';
      if (x.type === 'document' || x.type === 'image') throw new AiError('ai.input', 'Microsoft 365 Copilot takes text only; use Claude for PDF and image files');
      return '';
    })
    .join('\n');
}

/** The whole exchange as one message: Copilot conversations are created fresh for each call, so nothing depends on server-side state. */
const transcript = (messages: readonly Turn[]) =>
  messages.length === 1 ? textOf(messages[0]!) : messages.map((t) => `${t.role === 'user' ? 'User' : 'Your earlier reply'}:\n${textOf(t)}`).join('\n\n');

async function failure(res: Response): Promise<AiError> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: unknown } };
  const m = typeof body.error?.message === 'string' ? `: ${body.error.message.slice(0, 300)}` : '';
  if (res.status === 401 || res.status === 403)
    return new AiError('ai.config', `Microsoft 365 Copilot refused the request (${res.status})${m}. It needs a Microsoft 365 Copilot licence and consent to the Graph permissions.`);
  if (res.status === 429) return new AiError('ai.rate-limit', 'Microsoft 365 Copilot is rate limiting requests; try again shortly');
  return new AiError('ai.upstream', `Microsoft 365 Copilot failed (${res.status})${m}`);
}

/**
 * Microsoft 365 Copilot through the Microsoft Graph Copilot Chat API (URS-AI-023): delegated, on behalf
 * of the signed-in user. It has no structured outputs, so the schema is sent as instructions and the
 * generation loop validates and repairs the reply. Usage and cost are not reported.
 */
export function copilotClient(opts: CopilotOptions): AiClient {
  const base = (opts.baseUrl ?? GRAPH_BETA).replace(/\/$/, '');
  const call = async (path: string, body: object, signal?: AbortSignal) => {
    let res: Response;
    try {
      res = await (opts.fetch ?? fetch)(`${base}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...(signal && { signal }),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new AiError('ai.upstream', 'Microsoft 365 Copilot could not be reached');
    }
    if (!res.ok) throw await failure(res);
    return res.json() as Promise<Record<string, unknown>>;
  };
  const prompt = (req: AiRequest) => `${req.system}\n\n${schemaInstruction(req.schema)}`;

  return {
    async complete(req, signal): Promise<AiReply> {
      const message = transcript(req.messages);
      const { id } = (await call('/copilot/conversations', {}, signal)) as { id?: string };
      if (!id) throw new AiError('ai.upstream', 'Microsoft 365 Copilot did not start a conversation');
      const out = await call(
        `/copilot/conversations/${encodeURIComponent(id)}/chat`,
        {
          message: { text: message },
          locationHint: { timeZone: opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone },
          additionalContext: [{ text: prompt(req), description: 'Instructions and the required output format' }],
        },
        signal,
      );
      const replies = ((out.messages as { text?: unknown }[] | undefined) ?? []).filter((m) => typeof m.text === 'string' && m.text !== message);
      const text = (replies.at(-1)?.text as string | undefined) ?? '';
      if (!text) throw new AiError('ai.upstream', 'Microsoft 365 Copilot returned no reply');
      return { content: [{ type: 'text', text }], text: jsonOf(text), stop: 'end_turn', model: COPILOT_MODEL, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    },
    // No token counting endpoint: estimate at four characters per token, which is enough for the input limit.
    countTokens: async (req) => Math.ceil((prompt(req).length + transcript(req.messages).length) / 4),
  };
}
