import { compile, type CompileResult } from './compile.ts';
import type { Diagnostic } from './diagnostics.ts';
import type { GraphIR } from './ir/types.ts';
import type { Registry } from './registry/registry.ts';

/**
 * Best-effort compile (URS-WEB-032): when a document has errors, leave out what each error points at (a value, a
 * property, or the item holding it) and compile again, until nothing is in error, nothing more can be left out, or
 * a few passes have gone by. Type-agnostic: it only follows the diagnostics' JSON Pointers.
 *
 * The IR's source pointers are given in the original document's terms, so a drawn element still leads to its
 * place in the source. The diagnostics are the original document's, as a plain compile reports them: what later
 * passes find (e.g. a connection to a node left out) only follows from leaving things out.
 */
const PASSES = 16;

const segs = (p: string): string[] => p.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
const join = (s: readonly string[]): string => s.map((x) => `/${x.replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
const index = (s: string | undefined) => (s !== undefined && /^\d+$/.test(s) ? Number(s) : undefined);
/** `p` is `q` or inside it. */
const within = (p: string, q: string) => p === q || p.startsWith(`${q}/`);

/** Remove the value at a pointer: an array item is spliced out, a property deleted. */
function remove(doc: unknown, at: readonly string[]): boolean {
  let o: unknown = doc;
  for (const s of at.slice(0, -1)) o = o && typeof o === 'object' ? (o as Record<string, unknown>)[s] : undefined;
  const last = at.at(-1)!;
  const i = index(last);
  if (Array.isArray(o) && i !== undefined && i < o.length) return o.splice(i, 1), true;
  if (o && typeof o === 'object' && !Array.isArray(o) && last in o) return delete (o as Record<string, unknown>)[last], true;
  return false;
}

/** Deepest last, later array items first, so removing one does not move the others. */
const order = (a: string, b: string): number => {
  const [x, y] = [segs(a), segs(b)];
  for (let k = 0; k < Math.min(x.length, y.length); k++) {
    if (x[k] === y[k]) continue;
    const [i, j] = [index(x[k]), index(y[k])];
    return i !== undefined && j !== undefined ? j - i : y[k]! < x[k]! ? -1 : 1;
  }
  return y.length - x.length;
};

/** A pointer after a pass, as a pointer before it: array indices past removed items move back up. */
function before(p: string, removed: readonly string[]): string {
  const out: string[] = [];
  for (const s of segs(p)) {
    const i = index(s);
    if (i === undefined) {
      out.push(s);
      continue;
    }
    const base = join(out);
    const gone = removed
      .map(segs)
      .filter((r) => r.length === out.length + 1 && join(r.slice(0, -1)) === base && index(r.at(-1)) !== undefined)
      .map((r) => index(r.at(-1))!)
      .sort((a, b) => a - b);
    let n = i;
    for (const g of gone) if (g <= n) n++;
    out.push(String(n));
  }
  return join(out);
}

/** Every `src` in the IR, as a pointer of the original document. */
function mapSrc<T>(v: T, map: (p: string) => string): T {
  if (Array.isArray(v)) return v.map((x) => mapSrc(x, map)) as T;
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'src' && typeof x === 'string' ? map(x) : mapSrc(x, map)])) as T;
}

export interface BestEffort extends CompileResult {
  /** Something was left out to draw it. */
  partial: boolean;
  /** What was left out, as pointers of the original document. */
  omitted: string[];
}

export function compileBestEffort(doc: unknown, reg: Registry): BestEffort {
  const cur: unknown = JSON.parse(JSON.stringify(doc)) as unknown;
  /** Pointers removed by each pass, in that pass's input terms. */
  const passes: string[][] = [];
  const omitted: string[] = [];
  let diagnostics: Diagnostic[] = [];
  const original = (p: string) => passes.reduceRight((q, removed) => before(q, removed), p);
  for (let n = 0; n < PASSES; n++) {
    const c = compile(cur, reg);
    if (n === 0) diagnostics = c.diagnostics;
    const errors = c.diagnostics.filter((d) => d.severity === 'error').map((d) => d.path);
    if (!errors.length || !c.type) {
      const ir: GraphIR | undefined = c.ir && mapSrc(c.ir, original);
      return { ...(c.type && { type: c.type }), ...(ir && { ir }), diagnostics, partial: n > 0, omitted };
    }
    // The outermost of each nested set; the whole document cannot be left out.
    const targets = [...new Set(errors)].filter((p, _, all) => p !== '' && !all.some((q) => q !== '' && q !== p && within(p, q))).sort(order);
    const removed = targets.filter((p) => remove(cur, segs(p)));
    if (!removed.length) break;
    omitted.push(...removed.map(original));
    passes.push(removed);
  }
  return { diagnostics, partial: true, omitted };
}
