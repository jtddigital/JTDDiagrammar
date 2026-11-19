/** Changed words inside a changed line (URS-WS-030). */
import { diff } from './myers.ts';

export interface Part {
  text: string;
  changed: boolean;
}

const TOKEN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

export const tokens = (line: string): string[] => line.match(TOKEN) ?? [];

/** Each side cut into unchanged and changed parts. A lone space between two changes counts as changed. */
export function diffWords(a: string, b: string): { a: Part[]; b: Part[] } {
  const ta = tokens(a);
  const tb = tokens(b);
  const left: Part[] = [];
  const right: Part[] = [];
  const add = (parts: Part[], text: string, changed: boolean) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last && last.changed === changed) last.text += text;
    else parts.push({ text, changed });
  };
  for (const op of diff(ta, tb)) {
    if (op.type === 'same') {
      const text = ta.slice(op.a, op.a + op.n).join('');
      add(left, text, false);
      add(right, text, false);
    } else if (op.type === 'del') add(left, ta.slice(op.a, op.a + op.n).join(''), true);
    else add(right, tb.slice(op.b, op.b + op.n).join(''), true);
  }
  return { a: bridge(left), b: bridge(right) };
}

/** Merge `changed, whitespace, changed` into one changed part, so a reworded phrase reads as one change. */
function bridge(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const prev = out[out.length - 1];
    const next = parts[i + 1];
    if (prev?.changed && !p.changed && /^\s+$/.test(p.text) && next?.changed) {
      prev.text += p.text + next.text;
      i++;
    } else out.push({ ...p });
  }
  return out;
}
