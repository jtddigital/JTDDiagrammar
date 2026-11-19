import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, utf8, zip } from '../src/index.ts';

const deflate = async (b: Uint8Array) => new Uint8Array(deflateRawSync(b));

describe('zip writer (URS-WS-005, D-007)', () => {
  it('computes CRC-32 as ZIP does', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes an archive the platform unzip reads back exactly, folders and UTF-8 names included', async () => {
    const big = 'line of text\n'.repeat(5000);
    const bytes = await zip([
      { path: 'docs/', modified: new Date(2026, 10, 19, 10, 30) },
      { path: 'docs/readme.md', text: '# Hello\n\nÜnïcödé ✓\n' },
      { path: 'docs/big.txt', text: big },
      { path: 'flow.json', text: '{"version":"1"}' },
      { path: 'empty.txt', text: '' },
    ], deflate);
    // Deflated: much smaller than the content.
    expect(bytes.length).toBeLessThan(big.length / 10);
    const dir = mkdtempSync(join(tmpdir(), 'jtd-zip-'));
    writeFileSync(join(dir, 'a.zip'), bytes);
    // Python's zipfile checks every CRC and size as it reads.
    const out = execFileSync('python3', ['-I', '-c', 'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({i.filename: z.read(i).decode() for i in z.infolist()}))', join(dir, 'a.zip')], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual({ 'docs/': '', 'docs/readme.md': '# Hello\n\nÜnïcödé ✓\n', 'docs/big.txt': big, 'flow.json': '{"version":"1"}', 'empty.txt': '' });
    expect(readFileSync(join(dir, 'a.zip')).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    // Without a deflate function, files are stored.
    writeFileSync(join(dir, 'b.zip'), await zip([{ path: 'a.txt', text: 'stored' }]));
    expect(execFileSync('python3', ['-I', '-c', 'import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("a.txt").decode())', join(dir, 'b.zip')], { encoding: 'utf8' }).trim()).toBe('stored');
  });

  it('encodes UTF-8 as the platform does', () => {
    for (const s of ['', 'abc', 'Ünïcödé', '✓ ≠ ∑', '😀 𝄞', '\ud800 lone']) expect(Buffer.from(utf8(s))).toEqual(Buffer.from(s, 'utf8'));
  });
});
