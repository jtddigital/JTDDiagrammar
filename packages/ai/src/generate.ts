import { error, hasErrors, type Diagnostic, type DiagramType, type Registry } from '@jtd/core';
import type { ClaudeClient, ClaudeReply, InputBlock, Turn, Usage } from './client.ts';
import { AiError } from './errors.ts';
import { ingest, type IngestLimits, type InputFile } from './ingest/files.ts';
import { repairTurn, selection, systemPrompt, userTurn } from './prompt.ts';

export interface GenerateOptions {
  registry: Registry;
  client: ClaudeClient;
  /** Full validation + layout of a candidate source (URS-AI-005). The API passes its worker pool. */
  render(source: unknown): Promise<{ svg?: string; diagnostics: Diagnostic[] }>;
  /** Repair attempts after the first (URS-AI-006). */
  maxRepairs: number;
  maxInputTokens: number;
  limits: IngestLimits;
}

export interface GenerateRequest {
  text?: string;
  files: readonly InputFile[];
  /** A registered type id, or 'auto'. */
  type: string;
  signal?: AbortSignal;
}

export interface GenerateResult {
  type: string;
  /** Why `auto` chose this type. */
  reason?: string;
  source: unknown;
  valid: boolean;
  diagnostics: Diagnostic[];
  svg?: string;
  attempts: number;
  usage: Usage;
}

const addUsage = (a: Usage, b: Usage): void => {
  a.input += b.input;
  a.output += b.output;
  a.cacheRead += b.cacheRead;
  a.cacheWrite += b.cacheWrite;
};

/** Refusals and truncation are failures, never parsed as output (URS-AI-008). */
function checkStop(r: ClaudeReply): void {
  if (r.stop === 'refusal') throw new AiError('ai.refusal', 'the AI declined to process this material');
  if (r.stop === 'max_tokens') throw new AiError('ai.truncated', 'the generated diagram was too long and was cut off');
}

async function pickType(blocks: readonly InputBlock[], o: GenerateOptions, usage: Usage, signal?: AbortSignal): Promise<{ type: DiagramType; reason: string }> {
  const types = o.registry.types();
  if (types.length === 1) return { type: types[0]!, reason: 'only one diagram type is available' };
  const { system, schema } = selection(types);
  const reply = await o.client.complete({ system, messages: [userTurn(blocks)], schema, effort: 'low' }, signal);
  addUsage(usage, reply.usage);
  checkStop(reply);
  const choice = JSON.parse(reply.text) as { type: string; reason: string };
  return { type: o.registry.type(choice.type) ?? types[0]!, reason: choice.reason };
}

async function evaluate(reply: ClaudeReply, t: DiagramType, o: GenerateOptions) {
  let generated: unknown;
  try {
    generated = JSON.parse(reply.text);
  } catch {
    return { source: undefined, diagnostics: [error('ai.json', 'the reply was not valid JSON')] };
  }
  const source = t.ai.fromGenerated(generated);
  return { source, ...(await o.render(source)) };
}

/**
 * Material → validated diagram source (URS-AI-001..008): ingest, pick the type, check the token
 * budget, generate under the type's schema, validate fully, and repair until valid or out of attempts.
 * Returns the best attempt either way; `valid` is only true when nothing failed.
 */
export async function generate(req: GenerateRequest, o: GenerateOptions): Promise<GenerateResult> {
  const blocks = await ingest(req.files, req.text, o.limits);
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const chosen =
    req.type === 'auto'
      ? await pickType(blocks, o, usage, req.signal)
      : { type: o.registry.type(req.type) ?? fail(`unknown type '${req.type}'`) };

  const t = chosen.type;
  const system = systemPrompt(t);
  const messages: Turn[] = [userTurn(blocks)];
  const tokens = await o.client.countTokens({ system, messages, schema: t.ai.schema });
  if (tokens > o.maxInputTokens) throw new AiError('limit.tokens', `the material is ${tokens} tokens; the limit is ${o.maxInputTokens}`);

  let best: { source: unknown; diagnostics: Diagnostic[]; svg?: string; errors: number } | undefined;
  const total = 1 + o.maxRepairs;
  for (let attempt = 1; attempt <= total; attempt++) {
    const reply = await o.client.complete({ system, messages, schema: t.ai.schema }, req.signal);
    addUsage(usage, reply.usage);
    checkStop(reply);
    const r = await evaluate(reply, t, o);
    const errors = r.diagnostics.filter((d) => d.severity === 'error').length;
    if (!best || errors < best.errors) best = { ...r, errors };
    if (!hasErrors(r.diagnostics)) return result(chosen, best, true, attempt, usage);
    if (attempt < total) messages.push({ role: 'assistant', content: reply.content }, repairTurn(r.diagnostics));
  }
  return result(chosen, best!, false, total, usage);
}

function fail(message: string): never {
  throw new AiError('ai.input', message);
}

function result(chosen: { type: DiagramType; reason?: string }, best: { source: unknown; diagnostics: Diagnostic[]; svg?: string }, valid: boolean, attempts: number, usage: Usage): GenerateResult {
  return {
    type: chosen.type.id,
    ...(chosen.reason !== undefined && { reason: chosen.reason }),
    source: best.source ?? null,
    valid,
    diagnostics: best.diagnostics,
    ...(valid && best.svg !== undefined && { svg: best.svg }),
    attempts,
    usage,
  };
}
