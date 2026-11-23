import { error, type Diagnostic } from './diagnostics.ts';
import { compileBestEffort } from './best-effort.ts';
import { compile } from './compile.ts';
import type { Geometry } from './geometry.ts';
import type { GraphIR } from './ir/types.ts';
import type { Registry } from './registry/registry.ts';
import { withLegend } from './layout/legend.ts';
import { withNotes } from './layout/notes.ts';
import { applyStyles } from './render/styles.ts';
import { renderSvg } from './render/svg/index.ts';

/** Size limits checked after compiling, before layout (URS-API-006). */
export interface RenderOptions {
  maxNodes?: number;
  maxEdges?: number;
  /** With errors, draw what can be drawn, leaving out what the errors point at (URS-WEB-032). */
  bestEffort?: boolean;
}

export interface RenderResult {
  svg?: string;
  geometry?: Geometry;
  /** The compiled IR; its `src` pointers map drawn elements back to the source (URS-WEB-009). */
  ir?: GraphIR;
  diagnostics: Diagnostic[];
  /** Drawn with something left out, because of errors (URS-WEB-032); `omitted` says what, as source pointers. */
  partial?: boolean;
  omitted?: string[];
}

const over = (count: number, max: number | undefined, what: string) =>
  max !== undefined && count > max ? [error(`limit.${what}`, `${count} ${what} exceeds the limit of ${max}`)] : [];

/** compile → limits → layout (type's engine) → SVG. */
export function render(doc: unknown, reg: Registry, opts: RenderOptions = {}): RenderResult {
  const first = compile(doc, reg);
  const best = !first.ir && opts.bestEffort ? compileBestEffort(doc, reg) : undefined;
  const c = best?.ir ? best : first;
  if (!c.ir || !c.type) return { diagnostics: c.diagnostics };
  const partial = best?.ir ? { partial: true, omitted: best.omitted } : {};
  const limits = [...over(c.ir.nodes.length, opts.maxNodes, 'nodes'), ...over(c.ir.edges.length, opts.maxEdges, 'edges')];
  if (limits.length) return { diagnostics: [...c.diagnostics, ...limits] };
  const engine = reg.engine(c.type.engine);
  if (!engine) return { diagnostics: [...c.diagnostics, error('layout.engine', `no layout engine '${c.type.engine}' registered`)] };
  const layout = engine.layout(c.ir);
  const geometry = withLegend(withNotes(applyStyles(layout.geometry, c.ir), c.ir.nodes), c.ir.legend);
  const diagnostics = layout.diagnostics;
  const svg = renderSvg(geometry, { ...(c.ir.title !== undefined && { title: c.ir.title }), ...(c.ir.meta && { meta: c.ir.meta }), className: `jtd-${c.type.id}` });
  return { svg, geometry, ir: c.ir, diagnostics: [...c.diagnostics, ...diagnostics], ...partial };
}
