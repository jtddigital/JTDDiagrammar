import { describe, expect, it } from 'vitest';
import { detectSeparator, numeric, parseCsv } from '../src/index.ts';

describe('CSV parser (URS-WS-012, D-007)', () => {
  it('splits plain rows and ignores the final line break', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toMatchObject({ rows: [['a', 'b', 'c'], ['1', '2', '3']], lines: [1, 2], separator: ',', problems: [] });
    expect(parseCsv('a,b\r\n1,2').rows).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r1,2\r').rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('follows RFC 4180: quotes, doubled quotes, separators and line breaks inside quotes', () => {
    const csv = 'name,note\n"Smith, J","said ""hi"""\n"multi\r\nline",x\n';
    const r = parseCsv(csv);
    expect(r.rows).toEqual([
      ['name', 'note'],
      ['Smith, J', 'said "hi"'],
      ['multi\r\nline', 'x'],
    ]);
    expect(r.lines).toEqual([1, 2, 3]);
    expect(r.problems).toEqual([]);
  });

  it('keeps empty fields and an empty quoted field', () => {
    expect(parseCsv('a,,c\n"",b,\n').rows).toEqual([
      ['a', '', 'c'],
      ['', 'b', ''],
    ]);
  });

  it('reports malformed rows at their line and goes on', () => {
    const r = parseCsv('a,b\n1,2,3\n"open,4\n5,6\n');
    expect(r.problems).toEqual([
      { line: 2, message: 'row has 3 fields; the header has 2' },
      { line: 3, message: 'a quoted field is never closed' },
      { line: 3, message: 'row has 1 field; the header has 2' },
    ]);
    expect(parseCsv('a,b\n"x"y,2\n').problems).toEqual([{ line: 2, message: 'text after a closing quote' }]);
    expect(parseCsv('a,b\n"x"y,2\n').rows[1]).toEqual(['xy', '2']);
  });

  it('detects comma, semicolon or tab, quotes and all', () => {
    expect(detectSeparator('a;b;c\n1;2,5;3\n4;5;6\n')).toBe(';');
    expect(detectSeparator('a\tb\n1\t2\n')).toBe('\t');
    expect(detectSeparator('"a;b",c\n"x;y",z\n')).toBe(',');
    expect(detectSeparator('just one column\nsecond\n')).toBe(',');
    expect(parseCsv('a;b\n1;2\n').rows).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\n1,2\n', '\t').rows).toEqual([['a,b'], ['1,2']]);
  });

  it('drops a byte order mark and reads blank lines as empty rows without complaint', () => {
    expect(parseCsv('﻿a,b\n\n1,2\n')).toMatchObject({ rows: [['a', 'b'], [''], ['1', '2']], problems: [] });
  });

  it('parses 100,000 rows quickly', () => {
    const big = `id,name,value\n${Array.from({ length: 100_000 }, (_, i) => `${i},"Item ${i}",${i * 1.5}`).join('\n')}\n`;
    const t = performance.now();
    const r = parseCsv(big);
    expect(r.rows.length).toBe(100_001);
    expect(performance.now() - t).toBeLessThan(1500);
  });

  it('recognises numbers', () => {
    for (const s of ['1', '-2.5', '+3', '1,234,567.89', '1e6', '45%', ' 7 ']) expect(numeric(s), s).toBe(true);
    for (const s of ['', 'abc', '1.2.3', '12a', '1,23', '-']) expect(numeric(s), s).toBe(false);
  });
});
