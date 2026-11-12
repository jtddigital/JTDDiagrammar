import { compile, error, hasErrors, validateSchema, warning, type Diagnostic, type DiagramType, type JsonSchema, type Registry } from '@jtd/core';
import type { ClaudeClient, ClaudeReply, InputBlock, Turn, Usage } from './client.ts';
import { AiError } from './errors.ts';
import { ingest, type IngestLimits, type InputFile } from './ingest/files.ts';
import { cost, type Price } from './pricing.ts';
import { editPrompt, refineTurn, repairTurn, selection, systemPrompt, userTurn } from './prompt.ts';

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

/** What the model is asked for: prompt, reply schema, and whether that schema can be enforced as a structured output. */
interface Task {
  system: string;
  schema: JsonSchema;
  strict?: boolean;
}

/**
 * Shared loop: check the token budget, ask under the task's schema, convert with `finish`,
 * validate fully, repair until valid or out of attempts. Returns the best attempt either way.
 */
async function attempts(task: Task, first: Turn, o: GenerateOptions, meter: Meter, req: Common, finish: (generated: unknown) => unknown) {
  const messages: Turn[] = [first];
  const tokens = await o.client.countTokens({ ...task, messages });
  if (tokens > o.maxInputTokens) throw new AiError('limit.tokens', `the material is ${tokens} tokens; the limit is ${o.maxInputTokens}`);

  let best: { source: unknown; diagnostics: Diagnostic[]; svg?: string; errors: number } | undefined;
  const total = 1 + o.maxRepairs;
  for (let attempt = 1; attempt <= total; attempt++) {
    req.onProgress?.({ stage: attempt === 1 ? 'generate' : 'repair', attempt });
    const reply = await o.client.complete({ ...task, messages }, req.signal);
    meter.add(reply);
    checkStop(reply);
    req.onProgress?.({ stage: 'validate', attempt });
    let r: { source: unknown; diagnostics: Diagnostic[]; svg?: string };
    try {
      const generated: unknown = JSON.parse(reply.text);
      // Checked here too: a schema the API refused to compile is sent as instructions, not enforced (URS-AI-004).
      const shape = validateSchema(task.schema, generated);
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
  const t = chosen.type;
  const run = await attempts({ system: systemPrompt(t), schema: t.ai.schema }, userTurn(blocks), o, meter, req, (g) => t.ai.fromGenerated(g));
  return result(t, run, meter, 'reason' in chosen ? chosen.reason : undefined);
}

/**
 * Existing diagram + instruction → updated, validated diagram (URS-AI-013). The model edits the
 * authoring source itself, with the full authoring schema and the type's examples, so any change the
 * language allows is possible. That schema is outside the structured-output subset, so it is sent as
 * instructions and the reply is validated and repaired like any other.
 */
export async function refine(req: RefineRequest, o: GenerateOptions): Promise<GenerateResult> {
  if (!req.instruction.trim()) fail('say what to change');
  const c = compile(req.source, o.registry);
  if (!c.type) fail(c.diagnostics[0]?.message ?? 'not a diagram');
  const t = c.type!;
  const meter = new Meter(o.prices);
  const run = await attempts({ system: editPrompt(t), schema: t.schema, strict: false }, refineTurn(req.source, req.instruction), o, meter, req, (g) => g);
  const r = result(t, run, meter);
  if (run.valid && canonical(run.best.source) === canonical(req.source)) r.diagnostics = [...r.diagnostics, warning('ai.unchanged', 'the AI made no change')];
  return r;
}

/** JSON with sorted keys, for comparing sources. */
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

function fail(message: string): never {
  throw new AiError('ai.input', message);
}
