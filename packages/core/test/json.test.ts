import { describe, expect, it } from 'vitest';
import { parseJson } from '../src/index.ts';

describe('JSON adapter (URS-IN-001)', () => {
  it('parses valid JSON', () => {
    expect(parseJson('{"a":1}')).toEqual({ value: { a: 1 }, diagnostics: [] });
  });

  it('returns a diagnostic instead of throwing', () => {
    const { value, diagnostics } = parseJson('{"a":');
    expect(value).toBeUndefined();
    expect(diagnostics[0]?.code).toBe('parse.json');
  });
});
