import { compile, error, hasErrors, validateSchema, type Diagnostic, type DiagramType, type Registry } from '@jtd/core';
import type { ClaudeClient, ClaudeReply, InputBlock, Turn, Usage } from './client.ts';
import { AiError } from './errors.ts';
import { ingest, type IngestLimits, type InputFile } from './ingest/files.ts';
import { cost, type Price } from './pricing.ts';
import { refineTurn, repairTurn, selection, systemPrompt, userTurn } from './prompt.ts';

export interface GenerateOptions {
  registry: Registry;
  client: ClaudeClient;
  /** Full validation + layout of a candidate source (URS-AI-005). The API passes its worker pool. */
  render(source: unknown): Promise<{ svg?: string; diagnostics: Diagnostic[] }>;
  /** Repair attempts after the first (URS-AI-006). */
  maxRepairs: number;
  maxInputTokens: number;
  limits: IngestLimits;
  /** Price table override (URS-AI-017). */
  prices?: Record<string, Price>;
}

/** Stages reported while working (URS-AI-015). */
export type Progress = { stage: 'ingest' | 'select' | 'generate' | 'validate' | 'repair' } & { attempt?: number };

interface Common {
  signal?: AbortSignal;
  onProgress?(p: Progress): void;
}

export interface GenerateRequest extends Common {
  text?: string;
  files: readonly InputFile[];
  /** A registered type id, or 'auto'. */
  type: string;
}

export interface RefineRequest extends Common {
  /** The current diagram (authoring source). */
  source: unknown;
  /** What to change, in plain language. */
  instruction: string;
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
  /** Token totals plus an estimated cost in USD when every model used has a known price. */
  usage: Usage & { costUsd?: number };
}

class Meter {
  readonly usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  #cost: number | undefined = 0;
  readonly #prices: Record<string, Price> | undefined;
  constructor(prices?: Record<string, Price>) {
    this.#prices = prices;
  }
  add(r: ClaudeReply): void {
    for (const k of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) this.usage[k] += r.usage[k];
    const c = cost(r.model, r.usage, this.#prices);
    this.#cost = c === undefined || this.#cost === undefined ? undefined : this.#cost + c;
  }
  get total(): GenerateResult['usage'] {
    return { ...this.usage, ...(this.#cost !== undefined && { costUsd: Math.round(this.#cost * 1e6) / 1e6 }) };
  }
}

/** Refusals and truncation are failures, never parsed as output (URS-AI-008). */
function checkStop(r: ClaudeReply): void {
  if (r.stop === 'refusal') throw new AiError('ai.refusal', 'the AI declined to process this material');
  if (r.stop === 'max_tokens') throw new AiError('ai.truncated', 'the generated diagram was too long and was cut off');
}

async function pickType(blocks: readonly InputBlock[], o: GenerateOptions, meter: Meter, req: Common): Promise<{ type: DiagramType; reason: string }> {
  const types = o.registry.types();
  if (types.length === 1) return { type: types[0]!, reason: 'only one diagram type is available' };
  req.onProgress?.({ stage: 'select' });
  const { system, schema } = selection(types);
  const reply = await o.client.complete({ system, messages: [userTurn(blocks)], schema, effort: 'low' }, req.signal);
  meter.add(reply);
  checkStop(reply);
  const choice = JSON.parse(reply.text) as { type: string; reason: string };
  return { type: o.registry.type(choice.type) ?? types[0]!, reason: choice.reason };
}

/**
 * Shared loop: check the token budget, generate under the type's schema, convert with `finish`,
 * validate fully, repair until valid or out of attempts. Returns the best attempt either way.
 */
async function attempts(t: DiagramType, first: Turn, o: GenerateOptions, meter: Meter, req: Common, finish: (generated: unknown) => unknown) {
  const system = systemPrompt(t);
  const messages: Turn[] = [first];
  const tokens = await o.client.countTokens({ system, messages, schema: t.ai.schema });
  if (tokens > o.maxInputTokens) throw new AiError('limit.tokens', `the material is ${tokens} tokens; the limit is ${o.maxInputTokens}`);

  let best: { source: unknown; diagnostics: Diagnostic[]; svg?: string; errors: number } | undefined;
  const total = 1 + o.maxRepairs;
  for (let attempt = 1; attempt <= total; attempt++) {
    req.onProgress?.({ stage: attempt === 1 ? 'generate' : 'repair', attempt });
    const reply = await o.client.complete({ system, messages, schema: t.ai.schema }, req.signal);
    meter.add(reply);
    checkStop(reply);
    req.onProgress?.({ stage: 'validate', attempt });
    let r: { source: unknown; diagnostics: Diagnostic[]; svg?: string };
    try {
      const generated: unknown = JSON.parse(reply.text);
      // Checked here too: a schema the API refused to compile is sent as instructions, not enforced (URS-AI-004).
      const shape = validateSchema(t.ai.schema, generated);
      if (shape.length) r = { source: undefined, diagnostics: shape.map((d) => ({ ...d, message: `generated output: ${d.message}` })) };
      else {
        const source = finish(generated);
        r = { source, ...(await o.render(source)) };
      }
    } catch {
      r = { source: undefined, diagnostics: [error('ai.json', 'the reply was not valid JSON')] };
    }
    const errors = r.diagnostics.filter((d) => d.severity === 'error').length;
    if (!best || errors < best.errors) best = { ...r, errors };
    if (!hasErrors(r.diagnostics)) return { best, valid: true, attempt };
    if (attempt < total) messages.push({ role: 'assistant', content: reply.content }, repairTurn(r.diagnostics));
  }
  return { best: best!, valid: false, attempt: total };
}

const result = (t: DiagramType, run: Awaited<ReturnType<typeof attempts>>, meter: Meter, reason?: string): GenerateResult => ({
  type: t.id,
  ...(reason !== undefined && { reason }),
  source: run.best.source ?? null,
  valid: run.valid,
  diagnostics: run.best.diagnostics,
  ...(run.valid && run.best.svg !== undefined && { svg: run.best.svg }),
  attempts: run.attempt,
  usage: meter.total,
});

/** Material → validated diagram source (URS-AI-001..008). */
export async function generate(req: GenerateRequest, o: GenerateOptions): Promise<GenerateResult> {
  req.onProgress?.({ stage: 'ingest' });
  const blocks = await ingest(req.files, req.text, o.limits);
  const meter = new Meter(o.prices);
  const chosen = req.type === 'auto' ? await pickType(blocks, o, meter, req) : { type: o.registry.type(req.type) ?? fail(`unknown type '${req.type}'`) };
  const run = await attempts(chosen.type, userTurn(blocks), o, meter, req, (g) => chosen.type.ai.fromGenerated(g));
  return result(chosen.type, run, meter, 'reason' in chosen ? chosen.reason : undefined);
}

/**
 * Existing diagram + instruction → updated, validated diagram (URS-AI-013). The source must be
 * structurally valid; fields the generation schema cannot express are carried over by `merge`.
 */
export async function refine(req: RefineRequest, o: GenerateOptions): Promise<GenerateResult> {
  if (!req.instruction.trim()) fail('say what to change');
  const c = compile(req.source, o.registry);
  if (!c.type) fail(c.diagnostics[0]?.message ?? 'not a diagram');
  if (c.diagnostics.some((d) => d.code.startsWith('schema.'))) fail("fix the diagram's structure first; refine needs a schema-valid source");
  const t = c.type!;
  const meter = new Meter(o.prices);
  const run = await attempts(t, refineTurn(t.ai.toGenerated(req.source), req.instruction), o, meter, req, (g) => t.ai.merge(req.source, t.ai.fromGenerated(g)));
  return result(t, run, meter);
}

function fail(message: string): never {
  throw new AiError('ai.input', message);
}
