import { parse } from 'yaml';
import { error } from '../diagnostics.ts';
import type { ParseResult } from './json.ts';

/** YAML source adapter (URS-IN-007). Alias expansion is capped to stop "billion laughs" input. */
export function parseYaml(text: string): ParseResult {
  try {
    return { value: parse(text, { maxAliasCount: 100, prettyErrors: false }), diagnostics: [] };
  } catch (e) {
    return { diagnostics: [error('parse.yaml', e instanceof Error ? e.message.split('\n')[0]! : 'invalid YAML')] };
  }
}
