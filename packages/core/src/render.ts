import { error, type Diagnostic } from './diagnostics.ts';
import { compile } from './compile.ts';
import type { Geometry } from './geometry.ts';
import type { GraphIR } from './ir/types.ts';
import type { Registry } from './registry/registry.ts';
import { applyStyles } from './render/styles.ts';
import { renderSvg } from './render/svg/index.ts';

/** Size limits checked after compiling, before layout (URS-API-006). */
export interface RenderOptions {
  maxNodes?: number;
  maxEdges?: number;
}

export interface RenderResult {
  svg?: string;
  geometry?: Geometry;
  /** The compiled IR; its `src` pointers map drawn elements back to the source (URS-WEB-009). */
  ir?: GraphIR;
  diagnostics: Diagnostic[];
}

const over = (count: number, max: number | undefined, what: string) =>
  max !== undefined && count > max ? [error(`limit.${what}`, `${count} ${what} exceeds the limit of ${max}`)] : [];

/** compile → limits → layout (type's engine) → SVG. */
export function render(doc: unknown, reg: Registry, opts: RenderOptions = {}): RenderResult {
  const c = compile(doc, reg);
  if (!c.ir || !c.type) return { diagnostics: c.diagnostics };
  const limits = [...over(c.ir.nodes.length, opts.maxNodes, 'nodes'), ...over(c.ir.edges.length, opts.maxEdges, 'edges')];
  if (limits.length) return { diagnostics: [...c.diagnostics, ...limits] };
  const engine = reg.engine(c.type.engine);
  if (!engine) return { diagnostics: [...c.diagnostics, error('layout.engine', `no layout engine '${c.type.engine}' registered`)] };
  const layout = engine.layout(c.ir);
  const geometry = applyStyles(layout.geometry, c.ir);
  const diagnostics = layout.diagnostics;
  const svg = renderSvg(geometry, { ...(c.ir.title !== undefined && { title: c.ir.title }), className: `jtd-${c.type.id}` });
  return { svg, geometry, ir: c.ir, diagnostics: [...c.diagnostics, ...diagnostics] };
}
