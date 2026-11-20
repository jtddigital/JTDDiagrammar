import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { cellNumber, column, sheetName, xlsx } from '../src/index.ts';

const deflate = async (b: Uint8Array) => new Uint8Array(deflateRawSync(b));

/** Reads the workbook back with Python's zipfile and XML parser: every part must be well-formed. */
const READ = `
import sys, zipfile, json, xml.etree.ElementTree as ET
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
parts = {n: ET.fromstring(z.read(n)) for n in z.namelist()}
sheet = parts['xl/worksheets/sheet1.xml']
cells = {}
for c in sheet.iter('{%s}c' % ns['m']):
    v = c.find('m:v', ns); t = c.find('m:is/m:t', ns)
    cells[c.get('r')] = [c.get('t'), c.get('s'), v.text if v is not None else t.text]
name = parts['xl/workbook.xml'].find('m:sheets/m:sheet', ns).get('name')
print(json.dumps({'parts': sorted(parts), 'cells': cells, 'name': name, 'frozen': sheet.find('m:sheetViews/m:sheetView/m:pane', ns).get('state')}))
`;

describe('Excel workbook writer (URS-WS-045, D-007)', () => {
  it('names columns as Excel does', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(column)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
    expect(sheetName('costs/2026: Q1 [draft]')).toBe('costs 2026  Q1  draft');
    expect(sheetName('x'.repeat(40))).toHaveLength(31);
  });

  it('stores numbers as numbers with their format, and codes with leading zeros as text', () => {
    expect(cellNumber('42')).toEqual({ value: 42, style: 0 });
    expect(cellNumber('-3.5')).toEqual({ value: -3.5, style: 0 });
    expect(cellNumber('1,234')).toEqual({ value: 1234, style: 2 });
    expect(cellNumber('1,234.50')).toEqual({ value: 1234.5, style: 3 });
    expect(cellNumber('15%')).toEqual({ value: 0.15, style: 4 });
    expect(cellNumber('2.5e3')?.value).toBe(2500);
    for (const text of ['007', 'abc', '', '1,23', '12345678901234567', '1.2.3', '.', '-']) expect(cellNumber(text), text).toBeUndefined();
  });

  it('writes a workbook whose parts read back: header bold and frozen, values in place, text escaped', async () => {
    const bytes = await xlsx(
      [
        ['Item', 'Cost', 'Note'],
        ['Bolt', '1,200', 'a <b> & "c"'],
        ['Nut', '15%', ' padded '],
        ['007', '', 'Ünïcödé ✓'],
      ],
      'Stock: Q1',
      deflate,
    );
    const dir = mkdtempSync(join(tmpdir(), 'jtd-xlsx-'));
    writeFileSync(join(dir, 'a.xlsx'), bytes);
    writeFileSync(join(dir, 'read.py'), READ);
    const out = JSON.parse(execFileSync('python3', ['-I', join(dir, 'read.py'), join(dir, 'a.xlsx')], { encoding: 'utf8' })) as { parts: string[]; cells: Record<string, [string | null, string | null, string]>; name: string; frozen: string };
    expect(out.parts).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
    expect(out.name).toBe('Stock  Q1');
    expect(out.frozen).toBe('frozen');
    expect(out.cells.A1).toEqual(['inlineStr', '1', 'Item']);
    expect(out.cells.B2).toEqual([null, '2', '1200']);
    expect(out.cells.C2).toEqual(['inlineStr', null, 'a <b> & "c"']);
    expect(out.cells.B3).toEqual([null, '4', '0.15']);
    expect(out.cells.C3![2]).toBe(' padded ');
    expect(out.cells.A4).toEqual(['inlineStr', null, '007']);
    expect(out.cells.B4).toBeUndefined();
    expect(out.cells.C4![2]).toBe('Ünïcödé ✓');
  });
});
