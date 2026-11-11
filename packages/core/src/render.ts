import { error, type Diagnostic } from './diagnostics.ts';
import { compile } from './compile.ts';
import type { Geometry } from './geometry.ts';
import type { Registry } from './registry/registry.ts';
import { renderSvg } from './render/svg/index.ts';

export interface RenderResult {
  svg?: string;
  geometry?: Geometry;
  diagnostics: Diagnostic[];
}

/** compile → layout (type's engine) → SVG. */
export function render(doc: unknown, reg: Registry): RenderResult {
  const c = compile(doc, reg);
  if (!c.ir || !c.type) return { diagnostics: c.diagnostics };
  const engine = reg.engine(c.type.engine);
  if (!engine) return { diagnostics: [...c.diagnostics, error('layout.engine', `no layout engine '${c.type.engine}' registered`)] };
  const { geometry, diagnostics } = engine.layout(c.ir);
  const svg = renderSvg(geometry, { ...(c.ir.title !== undefined && { title: c.ir.title }), className: `jtd-${c.type.id}` });
  return { svg, geometry, diagnostics: [...c.diagnostics, ...diagnostics] };
}
