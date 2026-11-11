import type { Registry } from '../registry/registry.ts';
import { parseJson, type ParseResult } from './json.ts';
import { parseXml } from './xml.ts';
import { parseYaml } from './yaml.ts';

export type SourceFormat = 'json' | 'xml' | 'yaml';

/** Pick the adapter for a source format; every adapter yields the same document model (URS-IN-006/007). */
export const parseSource = (text: string, format: SourceFormat, reg: Registry): ParseResult =>
  format === 'xml' ? parseXml(text, reg) : format === 'yaml' ? parseYaml(text) : parseJson(text);
