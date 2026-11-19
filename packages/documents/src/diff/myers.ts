/**
 * Shortest edit script between two sequences (URS-WS-030): Myers' O(ND) algorithm with the
 * linear-space refinement (split on the middle snake, recurse), after trimming the common head
 * and tail. Items with no match on the other side are set aside first (they can never be kept), which makes
 * wholesale rewrites cheap. A work budget stops pathological inputs: past it, a remaining range is reported as
 * removed then added, which is still a correct, if longer, script.
 */
export type OpType = 'same' | 'del' | 'ins';

/** `n` items starting at `a` in the old sequence and/or `b` in the new one. */
export interface Op {
  type: OpType;
  a: number;
  b: number;
  n: number;
}

const BUDGET = 10_000_000;

export function diff<T>(a: readonly T[], b: readonly T[], key: (t: T) => unknown = (t) => t): Op[] {
  const ids = new Map<unknown, number>();
  const intern = (t: T) => {
    const k = key(t);
    let id = ids.get(k);
    if (id === undefined) ids.set(k, (id = ids.size));
    return id;
  };
  const fullA = Int32Array.from(a, intern);
  const fullB = Int32Array.from(b, intern);
  const inA = new Uint8Array(ids.size);
  const inB = new Uint8Array(ids.size);
  for (const id of fullA) inA[id] = 1;
  for (const id of fullB) inB[id] = 1;
  // Positions in the full sequences of the items that could match.
  const keepA = Int32Array.from(fullA.keys()).filter((i) => inB[fullA[i]!]);
  const keepB = Int32Array.from(fullB.keys()).filter((i) => inA[fullB[i]!]);
  const A = keepA.map((i) => fullA[i]!);
  const B = keepB.map((i) => fullB[i]!);
  const out: Op[] = [];
  let work = 0;

  const push = (type: OpType, x: number, y: number, n: number) => {
    if (n === 0) return;
    const last = out[out.length - 1];
    if (last?.type === type) last.n += n;
    else out.push({ type, a: x, b: y, n });
  };

  /** A point on an optimal path through the box, or undefined when the budget is spent or nothing matches. */
  const middle = (x0: number, x1: number, y0: number, y1: number): [number, number] | undefined => {
    const N = x1 - x0;
    const M = y1 - y0;
    const max = Math.ceil((N + M) / 2);
    const off = max + 1;
    const size = 2 * max + 3;
    const v1 = new Int32Array(size).fill(-1);
    const v2 = new Int32Array(size).fill(-1);
    v1[off + 1] = 0;
    v2[off + 1] = 0;
    const delta = N - M;
    const odd = (delta & 1) !== 0;
    let k1lo = 0, k1hi = 0, k2lo = 0, k2hi = 0;
    for (let d = 0; d < max; d++) {
      if ((work += 2 * d + 2) > BUDGET) return undefined;
      for (let k = -d + k1lo; k <= d - k1hi; k += 2) {
        const i = off + k;
        let x = k === -d || (k !== d && v1[i - 1]! < v1[i + 1]!) ? v1[i + 1]! : v1[i - 1]! + 1;
        let y = x - k;
        while (x < N && y < M && A[x0 + x] === B[y0 + y]) {
          x++;
          y++;
        }
        v1[i] = x;
        if (x > N) k1hi += 2;
        else if (y > M) k1lo += 2;
        else if (odd) {
          const j = off + delta - k;
          if (j >= 0 && j < size && v2[j] !== -1 && x >= N - v2[j]!) return [x0 + x, y0 + y];
        }
      }
      for (let k = -d + k2lo; k <= d - k2hi; k += 2) {
        const i = off + k;
        let x = k === -d || (k !== d && v2[i - 1]! < v2[i + 1]!) ? v2[i + 1]! : v2[i - 1]! + 1;
        let y = x - k;
        while (x < N && y < M && A[x1 - x - 1] === B[y1 - y - 1]) {
          x++;
          y++;
        }
        v2[i] = x;
        if (x > N) k2hi += 2;
        else if (y > M) k2lo += 2;
        else if (!odd) {
          const j = off + delta - k;
          if (j >= 0 && j < size && v1[j] !== -1) {
            const fx = v1[j]!;
            if (fx >= N - x) return [x0 + fx, y0 + fx - (j - off)];
          }
        }
      }
    }
    return undefined;
  };

  const walk = (x0: number, x1: number, y0: number, y1: number) => {
    let head = 0;
    while (x0 + head < x1 && y0 + head < y1 && A[x0 + head] === B[y0 + head]) head++;
    push('same', x0, y0, head);
    x0 += head;
    y0 += head;
    let tail = 0;
    while (x1 - tail > x0 && y1 - tail > y0 && A[x1 - tail - 1] === B[y1 - tail - 1]) tail++;
    x1 -= tail;
    y1 -= tail;
    if (x0 === x1 || y0 === y1) {
      push('del', x0, y0, x1 - x0);
      push('ins', x1, y0, y1 - y0);
    } else {
      const m = middle(x0, x1, y0, y1);
      if (m) {
        walk(x0, m[0], y0, m[1]);
        walk(m[0], x1, m[1], y1);
      } else {
        push('del', x0, y0, x1 - x0);
        push('ins', x1, y0, y1 - y0);
      }
    }
    push('same', x1, y1, tail);
  };

  walk(0, A.length, 0, B.length);
  return expand(out, keepA, keepB, a.length, b.length);
}

/** The script over the full sequences: between kept pairs, whatever is left was removed or added. */
function expand(ops: Op[], keepA: Int32Array, keepB: Int32Array, na: number, nb: number): Op[] {
  const out: Op[] = [];
  let x = 0, y = 0;
  const gap = (toA: number, toB: number) => {
    if (toA > x) out.push({ type: 'del', a: x, b: y, n: toA - x });
    if (toB > y) out.push({ type: 'ins', a: toA, b: y, n: toB - y });
    x = toA;
    y = toB;
  };
  for (const op of ops) {
    if (op.type !== 'same') continue;
    for (let j = 0; j < op.n; j++) {
      const pa = keepA[op.a + j]!;
      const pb = keepB[op.b + j]!;
      gap(pa, pb);
      const last = out[out.length - 1];
      if (last?.type === 'same') last.n++;
      else out.push({ type: 'same', a: pa, b: pb, n: 1 });
      x++;
      y++;
    }
  }
  gap(na, nb);
  return out;
}

