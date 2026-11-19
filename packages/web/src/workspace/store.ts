import type { Kv } from './kv.ts';
import { subtree, type WsNode } from './tree.ts';

/** One save of a file (URS-WS-020). Its text is the blob `hash`. */
export interface Version {
  file: string;
  n: number;
  at: number;
  hash: string;
  size: number;
}

/** A 64-bit FNV-1a hash of the text as 16 hex digits; collisions are caught by comparing the stored text. */
export function hashText(s: string): string {
  let h1 = 0x811c9dc5,
    h2 = 0x050c5d1f;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h1 >>> 15);
  }
  return [h1, h2].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

const versionKey = (file: string, n: number) => `${file}#${String(n).padStart(8, '0')}`;

/** A save that did not fit (URS-WS-007). */
export class StorageFull extends Error {
  constructor() {
    super('Browser storage is full: export the workspace and empty the trash, then save again. Your edit is kept.');
  }
}
const full = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
const guard = async <T,>(f: () => Promise<T>) => {
  try {
    return await f();
  } catch (e) {
    throw full(e) ? new StorageFull() : e;
  }
};

/**
 * The workspace store (D-006): nodes, a version per save kept forever with identical texts stored once, and
 * drafts of unsaved edits. Everything goes through a `Kv`, so tests use memory and the app IndexedDB.
 */
export class Store {
  private readonly kv: Kv;
  constructor(kv: Kv) {
    this.kv = kv;
  }

  nodes = () => this.kv.list<WsNode>('nodes');
  putNode = (n: WsNode) => guard(() => this.kv.put('nodes', n.id, n));

  versions = (file: string) => this.kv.list<Version>('versions', `${file}#`);
  async latest(file: string): Promise<Version | undefined> {
    return (await this.versions(file)).at(-1);
  }
  read = (hash: string) => this.kv.get<string>('blobs', hash);
  /** The text of a file's latest version; empty for a file never saved. */
  async content(file: string): Promise<string> {
    const v = await this.latest(file);
    return v ? ((await this.read(v.hash)) ?? '') : '';
  }

  /** Record a version; its text is stored once however often it is saved. */
  async save(file: string, text: string, at = Date.now()): Promise<Version> {
    return guard(async () => {
      let hash = hashText(text);
      for (let i = 2; ; i++) {
        const stored = await this.read(hash);
        if (stored === undefined) await this.kv.put('blobs', hash, text);
        if (stored === undefined || stored === text) break;
        hash = `${hashText(text)}-${i}`;
      }
      const n = ((await this.latest(file))?.n ?? 0) + 1;
      const v: Version = { file, n, at, hash, size: text.length };
      await this.kv.put('versions', versionKey(file, n), v);
      await this.kv.del('drafts', file);
      return v;
    });
  }

  draft = (file: string) => this.kv.get<string>('drafts', file);
  setDraft = (file: string, text: string | undefined) => guard(() => (text === undefined ? this.kv.del('drafts', file) : this.kv.put('drafts', file, text)));
  /** Ids of files with unsaved edits. */
  async drafted(): Promise<Set<string>> {
    const nodes = await this.nodes();
    const ids = await Promise.all(nodes.map(async (n) => ((await this.draft(n.id)) !== undefined ? n.id : undefined)));
    return new Set(ids.filter((x): x is string => x !== undefined));
  }

  meta = <T,>(key: string) => this.kv.get<T>('meta', key);
  setMeta = (key: string, value: unknown) => this.kv.put('meta', key, value);

  /** Delete nodes for good, with their versions and drafts; then drop texts no version refers to. */
  async purge(ids: readonly string[]): Promise<void> {
    const nodes = await this.nodes();
    const gone = new Set(ids.flatMap((id) => subtree(nodes, id).map((n) => n.id)));
    for (const id of gone) {
      for (const v of await this.versions(id)) await this.kv.del('versions', versionKey(id, v.n));
      await this.kv.del('drafts', id);
      await this.kv.del('nodes', id);
    }
    const used = new Set((await this.kv.list<Version>('versions')).map((v) => v.hash));
    for (const hash of await this.kv.keys('blobs')) if (!used.has(hash)) await this.kv.del('blobs', hash);
  }
}
