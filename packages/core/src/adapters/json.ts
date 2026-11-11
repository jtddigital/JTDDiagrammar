import { error, type Diagnostic } from '../diagnostics.ts';

export interface ParseResult {
  value?: unknown;
  diagnostics: Diagnostic[];
}

/** JSON source adapter (URS-IN-001). */
export function parseJson(text: string): ParseResult {
  try {
    return { value: JSON.parse(text), diagnostics: [] };
  } catch (e) {
    return { diagnostics: [error('parse.json', e instanceof Error ? e.message : 'invalid JSON')] };
  }
}
