import { describe, expect, it } from 'vitest';
import { children, clash, freeName, inTrash, move, moveProblem, nameProblem, pathOf, rename, restore, subtree, trash, type WsNode } from '../src/workspace/tree.ts';

const n = (id: string, parent: string | null, name: string, kind: WsNode['kind'] = 'file', trashed?: number): WsNode => ({ id, parent, name, kind, created: 0, modified: 0, ...(trashed !== undefined && { trashed }) });
const nodes: WsNode[] = [
  n('docs', null, 'docs', 'folder'),
  n('img', 'docs', 'img', 'folder'),
  n('a', 'docs', 'Item 10.md'),
  n('b', 'docs', 'item 2.md'),
  n('c', 'img', 'logo.svg'),
  n('top', null, 'flow.json'),
  n('old', null, 'old', 'folder', 5),
  n('inold', 'old', 'x.txt'),
];

describe('workspace tree (URS-WS-001..003, WS-022)', () => {
  it('lists children folders first, numbers in order, and hides the trash', () => {
    expect(children(nodes, null).map((x) => x.name)).toEqual(['docs', 'flow.json']);
    expect(children(nodes, 'docs').map((x) => x.name)).toEqual(['img', 'item 2.md', 'Item 10.md']);
  });

  it('checks names: empty, separators, dots, spaces, length; and clashes ignoring case', () => {
    expect(['', ' ', 'a/b', 'a\\b', '.', '..', ' a', 'a ', 'x'.repeat(256)].map(nameProblem).every(Boolean)).toBe(true);
    expect(nameProblem('Notes (draft).md')).toBeUndefined();
    expect(clash(nodes, 'docs', 'ITEM 2.MD')).toBe(true);
    expect(clash(nodes, 'docs', 'item 2.md', 'b')).toBe(false);
    // A name in the trash is free again.
    expect(clash(nodes, null, 'old')).toBe(false);
  });

  it('finds a free name', () => {
    expect(freeName(nodes, null, 'new.md')).toBe('new.md');
    expect(freeName(nodes, 'docs', 'item.md')).toBe('item.md');
    expect(freeName(nodes, 'docs', 'item 2.md')).toBe('item 3.md');
    expect(freeName([...nodes, n('d', null, 'docs 2', 'folder')], null, 'docs')).toBe('docs 3');
  });

  it('gives paths and subtrees', () => {
    expect(pathOf(nodes, 'c')).toBe('docs/img/logo.svg');
    expect(subtree(nodes, 'docs').map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'docs', 'img']);
  });

  it('moves, but never into itself, into a file or onto a taken name', () => {
    expect(moveProblem(nodes, 'docs', 'img')).toBe('A folder cannot move into itself');
    expect(moveProblem(nodes, 'docs', 'docs')).toBe('A folder cannot move into itself');
    expect(moveProblem(nodes, 'c', 'top')).toBe('Only a folder can hold files');
    expect(moveProblem([...nodes, n('e', null, 'LOGO.svg')], 'e', 'img')).toBe('There is already a LOGO.svg there');
    expect(move(nodes, 'c', null, 9)).toEqual({ ...nodes[4], parent: null, modified: 9 });
  });

  it('renames, refusing bad or taken names', () => {
    expect(rename(nodes, 'a', 'item 2.md')).toBe('There is already a item 2.md here');
    expect(rename(nodes, 'a', 'a/b')).toBe('A name cannot contain / or \\');
    expect(rename(nodes, 'a', 'ITEM 10.md', 3)).toEqual({ ...nodes[2], name: 'ITEM 10.md', modified: 3 });
  });

  it('keeps the trash: nested items go with their folder and come back under a free name', () => {
    expect(inTrash(nodes, 'inold')).toBe(true);
    expect(trash(nodes).map((x) => x.id)).toEqual(['old']);
    const taken = [...nodes, n('new', null, 'old', 'folder')];
    expect(restore(taken, 'old', 7)).toEqual({ id: 'old', parent: null, name: 'old 2', kind: 'folder', created: 0, modified: 7 });
    // Its folder gone: back at the top.
    expect(restore([n('f', 'gone', 'f.md', 'file', 1)], 'f').parent).toBeNull();
  });
});
