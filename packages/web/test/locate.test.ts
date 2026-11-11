import { error, type Diagnostic } from '@jtd/core';
import { describe, expect, it } from 'vitest';
import { locate } from '../src/editor/locate.ts';

const text = `{
  "type": "flowchart",
  "nodes": [
    { "id": "a", "shape": "hex" },
    { "label": "x" }
  ],
  "a/b": 1
}`;
const at = (d: Diagnostic) => {
  const r = locate(text, d);
  return text.slice(r.from, r.to);
};

describe('diagnostic → source range (URS-WEB-004)', () => {
  it('highlights the key of a property', () => {
    expect(at(error('schema.enum', '', '/nodes/0/shape'))).toBe('"shape"');
    expect(at(error('x', '', '/a~1b'))).toBe('"a/b"');
  });

  it('highlights the opening bracket of array elements', () => {
    expect(at(error('schema.required', '', '/nodes/1'))).toBe('{');
  });

  it('falls back to the nearest existing ancestor', () => {
    expect(at(error('x', '', '/nodes/9/id'))).toBe('"nodes"');
  });

  it('places parse errors where the parser stopped', () => {
    const bad = '{ "a": 1,, }';
    const r = locate(bad, error('parse.json', ''));
    expect(r.from).toBe(9);
  });

  it('never returns a range outside the text', () => {
    const r = locate('', error('envelope.object', '', ''));
    expect(r).toEqual({ from: 0, to: 0 });
  });
});
