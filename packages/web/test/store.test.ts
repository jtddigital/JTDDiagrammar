import { describe, expect, it } from 'vitest';
import { memoryKv } from '../src/workspace/kv.ts';
import { hashText, StorageFull, Store } from '../src/workspace/store.ts';
import type { WsNode } from '../src/workspace/tree.ts';

const file = (id: string, parent: string | null = null): WsNode => ({ id, parent, name: `${id}.md`, kind: 'file', created: 0, modified: 0 });

describe('workspace store (URS-WS-004, WS-007, WS-020, D-006)', () => {
  it('records a version per save, newest last, and reads the latest', async () => {
    const s = new Store(memoryKv());
    await s.putNode(file('a'));
    expect(await s.content('a')).toBe('');
    await s.save('a', 'one', 1);
    await s.save('a', 'two', 2);
    await s.save('a', 'one', 3);
    expect((await s.versions('a')).map((v) => [v.n, v.at, v.size])).toEqual([
      [1, 1, 3],
      [2, 2, 3],
      [3, 3, 3],
    ]);
    expect(await s.content('a')).toBe('one');
    // Identical texts are stored once.
    expect((await s.versions('a'))[0]!.hash).toBe((await s.versions('a'))[2]!.hash);
  });

  it('keeps drafts until the next save', async () => {
    const s = new Store(memoryKv());
    await s.putNode(file('a'));
    await s.setDraft('a', 'unsaved');
    expect(await s.draft('a')).toBe('unsaved');
    expect(await s.drafted()).toEqual(new Set(['a']));
    await s.save('a', 'unsaved');
    expect(await s.draft('a')).toBeUndefined();
  });

  it('survives a hash collision by comparing the stored text', async () => {
    const kv = memoryKv();
    const s = new Store(kv);
    await kv.put('blobs', hashText('real'), 'impostor');
    const v = await s.save('a', 'real');
    expect(v.hash).toBe(`${hashText('real')}-2`);
    expect(await s.read(v.hash)).toBe('real');
  });

  it('purges a folder with its files, versions and drafts, and drops unused texts only', async () => {
    const s = new Store(memoryKv());
    await s.putNode({ ...file('f'), kind: 'folder', name: 'f' });
    await s.putNode(file('in', 'f'));
    await s.putNode(file('out'));
    await s.save('in', 'shared');
    await s.save('in', 'mine');
    await s.save('out', 'shared');
    await s.setDraft('in', 'x');
    await s.purge(['f']);
    expect((await s.nodes()).map((n) => n.id)).toEqual(['out']);
    expect(await s.versions('in')).toEqual([]);
    expect(await s.draft('in')).toBeUndefined();
    expect(await s.read(hashText('shared'))).toBe('shared');
    expect(await s.read(hashText('mine'))).toBeUndefined();
  });

  it('reports full storage as StorageFull (URS-WS-007)', async () => {
    const kv = memoryKv();
    kv.put = async () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    await expect(new Store(kv).save('a', 'x')).rejects.toBeInstanceOf(StorageFull);
  });
});
