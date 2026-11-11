/**
 * Positions closest (least squares) to `want` that keep their order with minimum spacing:
 * x[i] - x[i-1] ≥ sep[i]. Pool-adjacent-violators isotonic regression; O(n).
 */
export function pack(want: readonly number[], sep: readonly number[]): number[] {
  const off: number[] = [];
  want.forEach((_, i) => off.push(i ? off[i - 1]! + sep[i]! : 0));
  const blocks: { sum: number; n: number }[] = [];
  want.forEach((w, i) => {
    blocks.push({ sum: w - off[i]!, n: 1 });
    for (let k = blocks.length - 1; k > 0 && blocks[k - 1]!.sum / blocks[k - 1]!.n > blocks[k]!.sum / blocks[k]!.n; k--) {
      const last = blocks.pop()!;
      blocks[k - 1]!.sum += last.sum;
      blocks[k - 1]!.n += last.n;
    }
  });
  return blocks.flatMap((b) => Array<number>(b.n).fill(b.sum / b.n)).map((y, i) => y + off[i]!);
}
