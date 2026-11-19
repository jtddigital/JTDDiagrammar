import { describe, expect, it } from 'vitest';
import { changeStarts, diff, diffBlocks, diffLines, diffTable, diffWords, fold, parseMarkdown, plainText, splitLines, type Op } from '../src/index.ts';

/** A small deterministic random source, so failures repeat. */
function random(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
}

const apply = <T>(a: T[], b: T[], ops: Op[]) =>
  ops.flatMap((op) => (op.type === 'same' ? a.slice(op.a, op.a + op.n) : op.type === 'ins' ? b.slice(op.b, op.b + op.n) : []));

/** Length of the longest common subsequence, the slow way. */
function lcs<T>(a: T[], b: T[]) {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) t[i]![j] = a[i - 1] === b[j - 1] ? t[i - 1]![j - 1]! + 1 : Math.max(t[i - 1]![j]!, t[i]![j - 1]!);
  return t[a.length]![b.length]!;
}

describe('shortest edit script (URS-WS-030)', () => {
  it('turns the old sequence into the new one with the fewest edits, on random inputs', () => {
    const rnd = random(7);
    for (let trial = 0; trial < 500; trial++) {
      const make = () => Array.from({ length: Math.floor(rnd() * 30) }, () => 'abcd'[Math.floor(rnd() * 4)]!);
      const a = make();
      const b = make();
      const ops = diff(a, b);
      expect(apply(a, b, ops)).toEqual(b);
      // Every old item is either kept or removed, in order.
      expect(ops.filter((o) => o.type !== 'ins').reduce((n, o) => (expect(o.a).toBe(n), n + o.n), 0)).toBe(a.length);
      const same = ops.filter((o) => o.type === 'same').reduce((n, o) => n + o.n, 0);
      expect(same).toBe(lcs(a, b));
    }
  });

  it('reports one removal then one addition between unchanged runs', () => {
    expect(diff([...'abcxyzdef'], [...'abc123def'])).toEqual([
      { type: 'same', a: 0, b: 0, n: 3 },
      { type: 'del', a: 3, b: 3, n: 3 },
      { type: 'ins', a: 6, b: 3, n: 3 },
      { type: 'same', a: 6, b: 6, n: 3 },
    ]);
    expect(diff([], ['x'])).toEqual([{ type: 'ins', a: 0, b: 0, n: 1 }]);
    expect(diff(['x'], [])).toEqual([{ type: 'del', a: 0, b: 0, n: 1 }]);
    expect(diff([], [])).toEqual([]);
  });

});

describe('line rows and folding', () => {
  const old = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n');
  const now = ['a', 'b', 'C', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].join('\n');

  it('pairs a line changed in place, and counts additions and removals', () => {
    const d = diffLines(old, now);
    expect(d.rows[2]).toEqual({ kind: 'change', a: 2, b: 2 });
    expect(d.rows.at(-1)).toEqual({ kind: 'ins', b: 10 });
    expect([d.added, d.removed]).toEqual([2, 1]);
    expect(changeStarts(d.rows)).toEqual([2, 10]);
    expect(diffLines('x\r\ny', 'x\ny').rows.every((r) => r.kind === 'same')).toBe(true);
    // A final line break ends the last line.
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('a\n\n')).toEqual(['a', '']);
    expect(splitLines('')).toEqual([]);
  });

  it('folds unchanged stretches beyond the context', () => {
    const d = diffLines(old, now);
    const segments = fold(d.rows, 1);
    expect(segments.map((s) => ('fold' in s ? `fold ${s.fold}` : s.rows.length))).toEqual([4, 'fold 5', 2]);
    expect(fold(diffLines('a', 'a').rows)).toEqual([{ rows: [{ kind: 'same', a: 0, b: 0 }], start: 0 }]);
  });
});

describe('changed words', () => {
  it('marks only the words that changed, and reads a reworded phrase as one change', () => {
    const { a, b } = diffWords('The quick brown fox jumps.', 'The slow red fox jumps!');
    expect(a).toEqual([
      { text: 'The ', changed: false },
      { text: 'quick brown', changed: true },
      { text: ' fox jumps', changed: false },
      { text: '.', changed: true },
    ]);
    expect(b.filter((p) => p.changed).map((p) => p.text)).toEqual(['slow red', '!']);
    expect(diffWords('Größe 10', 'Größe 12').b).toEqual([
      { text: 'Größe ', changed: false },
      { text: '12', changed: true },
    ]);
  });
});

describe('Markdown blocks (URS-WS-033)', () => {
  it('marks added, removed and changed blocks: paragraphs, items, table rows, code', () => {
    const old = parseMarkdown('# Plan\n\nKeep this.\n\n- [ ] one\n- two\n\n| a |\n|---|\n| 1 |\n| 2 |\n\n```js\nx\n```\n\nGone.\n', { gfm: true });
    const now = parseMarkdown('# Plan\n\nKeep this.\n\n- [x] one\n- two\n- three\n\n| a |\n|---|\n| 1 |\n| 3 |\n\n```js\ny\n```\n', { gfm: true });
    const d = diffBlocks(old, now);
    const show = (m: typeof d.a) => [...m].map(([n, mark]) => `${mark} ${n.type} ${plainText(n) || n.literal.trim()}`);
    expect(show(d.a)).toEqual(['changed item one', 'changed table_row 2', 'changed code_block x', 'removed paragraph Gone.']);
    expect(show(d.b)).toEqual(['changed item one', 'added item three', 'changed table_row 3', 'changed code_block y']);
    expect([d.added, d.removed, d.changed]).toEqual([1, 1, 3]);
  });
});

describe('CSV tables (URS-WS-034)', () => {
  const old = [['id', 'name', 'qty'], ['1', 'Bolt', '10'], ['2', 'Nut', '5'], ['3', 'Gear', '1']];
  const now = [['id', 'name', 'qty', 'bin'], ['1', 'Bolt', '12', 'A'], ['3', 'Gear', '1', ''], ['4', 'Cog', '7', 'B']];

  it('matches rows by a key column and marks changed cells', () => {
    const d = diffTable(old, now, 'id');
    expect(d.columns).toEqual(['id', 'name', 'qty', 'bin']);
    expect(d.addedColumns).toEqual(['bin']);
    expect(d.rows.map((r) => `${r.kind} ${(r.b ?? r.a)![0]}`)).toEqual(['changed 1', 'removed 2', 'same 3', 'added 4']);
    expect(d.rows[0]!.cells).toEqual([false, false, true, true]);
  });

  it('matches rows by position without a key, pairing rows changed in place', () => {
    const d = diffTable(old, [old[0]!, old[1]!, ['2', 'Nut', '6'], old[3]!]);
    expect(d.rows.map((r) => r.kind)).toEqual(['same', 'changed', 'same']);
    expect(d.rows[1]!.cells).toEqual([false, false, true]);
    expect([d.added, d.removed, d.changed]).toEqual([0, 0, 1]);
  });
});
