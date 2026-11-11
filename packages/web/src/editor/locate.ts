import type { Diagnostic } from '@jtd/core';
import { parseTree, type Node, type ParseError } from 'jsonc-parser';

export interface Range {
  from: number;
  to: number;
}

const segments = (pointer: string) => (pointer ? pointer.slice(1).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~')) : []);

function walk(root: Node, path: readonly string[]): Node | undefined {
  let n: Node | undefined = root;
  for (const seg of path) {
    if (n?.type === 'array') n = n.children?.[Number(seg)];
    else if (n?.type === 'object') n = n.children?.find((p) => p.children?.[0]?.value === seg)?.children?.[1];
    else return undefined;
  }
  return n;
}

/**
 * Source range for a diagnostic (URS-WEB-004): parse errors at the parser's offset; otherwise the
 * element its JSON Pointer names (nearest existing ancestor if it is missing). Properties highlight
 * their key, objects and arrays their opening bracket.
 */
export function locate(text: string, d: Pick<Diagnostic, 'code' | 'path'>): Range {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  const clamp = (r: Range): Range => ({ from: Math.min(r.from, text.length), to: Math.min(Math.max(r.to, r.from + 1), text.length) });
  if (d.code.startsWith('parse.') || !root) return clamp(errors[0] ? { from: errors[0].offset, to: errors[0].offset + errors[0].length } : { from: 0, to: 1 });

  let path = segments(d.path);
  let n = walk(root, path);
  while (!n && path.length) n = walk(root, (path = path.slice(0, -1)));
  const node = n ?? root;
  const key = node.parent?.type === 'property' ? node.parent.children?.[0] : undefined;
  if (key) return clamp({ from: key.offset, to: key.offset + key.length });
  const container = node.type === 'object' || node.type === 'array';
  return clamp({ from: node.offset, to: node.offset + (container ? 1 : node.length) });
}
