import { parseJson, parseSource, render, type Diagnostic, type GraphIR, type SourceFormat } from '@jtd/core';
import { parse as lenient, type ParseError } from 'jsonc-parser';
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
  /** Drawn as far as it can be, with what is in error left out (URS-WEB-032). */
  partial?: boolean;
}

/** JSON read as far as it goes, for a drawing while the text is mid-edit; undefined when nothing usable is left. */
const salvage = (source: string): unknown => {
  const errors: ParseError[] = [];
  const v: unknown = lenient(source, errors, { allowTrailingComma: true });
  return v && typeof v === 'object' && !Array.isArray(v) ? v : undefined;
};

function compute(source: string, last?: DiagramState, format: SourceFormat | 'none' = 'json'): DiagramState {
  // Not a diagram (URS-WS-010): nothing to render, nothing to report.
  if (format === 'none') return { current: true, diagnostics: [], source };
  const parsed = format === 'json' ? parseJson(source) : parseSource(source, format, registry);
  // Best effort (URS-WEB-032): errors leave out what they point at; JSON that does not parse is read as far as it goes.
  const salvaged = parsed.value === undefined && format === 'json' ? salvage(source) : undefined;
  const drawn = parsed.value ?? salvaged;
  const r: { svg?: string; ir?: GraphIR; diagnostics: Diagnostic[]; partial?: boolean } = drawn === undefined ? parsed : render(drawn, registry, { bestEffort: true });
  if (salvaged !== undefined) r.diagnostics = parsed.diagnostics;
  const title = (parsed.value as { title?: unknown } | undefined)?.title;
  return {
    ...(r.svg !== undefined ? { svg: r.svg, ...(r.ir && { ir: r.ir }) } : last?.svg !== undefined && { svg: last.svg, ...(last.ir && { ir: last.ir }) }),
    ...(parsed.value !== undefined && { value: parsed.value }),
    current: r.svg !== undefined,
    ...((r.partial || salvaged !== undefined) && r.svg !== undefined && { partial: true }),
    diagnostics: r.diagnostics,
    source,
    ...(typeof title === 'string' && { title }),
  };
}

/**
 * Debounced client-side render of the editor text (URS-WEB-002), in the file's format; `none` for a file that is
 * not a diagram. Switching format renders at once, without the last file's drawing.
 */
export function useDiagram(text: string, format: SourceFormat | 'none' = 'json', delay = 250): DiagramState {
  const [state, setState] = useState(() => ({ ...compute(text, undefined, format), format }));
  useEffect(() => {
    if (format !== state.format) return setState({ ...compute(text, undefined, format), format });
    if (text === state.source) return;
    const t = setTimeout(() => setState((prev) => ({ ...compute(text, prev, format), format })), delay);
    return () => clearTimeout(t);
  }, [text, format, delay, state.source, state.format]);
  return state;
}
