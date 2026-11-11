import { parseJson, render, type Diagnostic, type GraphIR } from '@jtd/core';
import { useEffect, useState } from 'react';
import { registry } from './registry.ts';

export interface DiagramState {
  /** Last successful render; kept while the source has errors (URS-WEB-002). */
  svg?: string;
  /** True when `svg` reflects `source`. */
  current: boolean;
  diagnostics: Diagnostic[];
  /** The text these diagnostics belong to. */
  source: string;
  title?: string;
  /** IR of `svg`, mapping drawn elements back to source pointers (URS-WEB-009). */
  ir?: GraphIR;
  /** `source` parsed, when it parses. */
  value?: unknown;
}

function compute(source: string, last?: DiagramState): DiagramState {
  const parsed = parseJson(source);
  const r: { svg?: string; ir?: GraphIR; diagnostics: Diagnostic[] } = parsed.value === undefined ? parsed : render(parsed.value, registry);
  const title = (parsed.value as { title?: unknown } | undefined)?.title;
  return {
    ...(r.svg !== undefined ? { svg: r.svg, ...(r.ir && { ir: r.ir }) } : last?.svg !== undefined && { svg: last.svg, ...(last.ir && { ir: last.ir }) }),
    ...(parsed.value !== undefined && { value: parsed.value }),
    current: r.svg !== undefined,
    diagnostics: r.diagnostics,
    source,
    ...(typeof title === 'string' && { title }),
  };
}

/** Debounced client-side render of the editor text (URS-WEB-002). */
export function useDiagram(text: string, delay = 250): DiagramState {
  const [state, setState] = useState(() => compute(text));
  useEffect(() => {
    if (text === state.source) return;
    const t = setTimeout(() => setState((prev) => compute(text, prev)), delay);
    return () => clearTimeout(t);
  }, [text, delay, state.source]);
  return state;
}
