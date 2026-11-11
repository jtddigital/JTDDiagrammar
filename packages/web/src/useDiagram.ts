import { parseJson, render, type Diagnostic } from '@jtd/core';
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
}

function compute(source: string, lastSvg?: string): DiagramState {
  const parsed = parseJson(source);
  const r: { svg?: string; diagnostics: Diagnostic[] } = parsed.value === undefined ? parsed : render(parsed.value, registry);
  const title = (parsed.value as { title?: unknown } | undefined)?.title;
  return {
    ...((r.svg ?? lastSvg) !== undefined && { svg: r.svg ?? lastSvg }),
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
    const t = setTimeout(() => setState((prev) => compute(text, prev.svg)), delay);
    return () => clearTimeout(t);
  }, [text, delay, state.source]);
  return state;
}
