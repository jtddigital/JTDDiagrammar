/** Key-value tables under the workspace store (D-006): IndexedDB in the app, memory in tests. */
export const TABLES = ['nodes', 'versions', 'blobs', 'drafts', 'meta'] as const;
export type Table = (typeof TABLES)[number];

export interface Kv {
  get<T>(table: Table, key: string): Promise<T | undefined>;
  put(table: Table, key: string, value: unknown): Promise<void>;
  del(table: Table, key: string): Promise<void>;
  /** Values whose keys start with `prefix`, in key order. */
  list<T>(table: Table, prefix?: string): Promise<T[]>;
  keys(table: Table): Promise<string[]>;
}

export function memoryKv(): Kv {
  const data = new Map<Table, Map<string, unknown>>(TABLES.map((t) => [t, new Map()]));
  const clone = <T,>(v: T): T => (v === undefined ? v : structuredClone(v));
  return {
    get: async (t, k) => clone(data.get(t)!.get(k)) as never,
    put: async (t, k, v) => void data.get(t)!.set(k, clone(v)),
    del: async (t, k) => void data.get(t)!.delete(k),
    list: async (t, p = '') =>
      [...data.get(t)!]
        .filter(([k]) => k.startsWith(p))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, v]) => clone(v)) as never,
    keys: async (t) => [...data.get(t)!.keys()],
  };
}

const done = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => ((r.onsuccess = () => resolve(r.result)), (r.onerror = () => reject(r.error))));

/** The browser's IndexedDB, one object store per table with string keys. */
export async function indexedKv(name = 'jtd-workspace'): Promise<Kv> {
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => TABLES.forEach((t) => open.result.objectStoreNames.contains(t) || open.result.createObjectStore(t));
  const db = await done(open);
  const store = (t: Table, mode: IDBTransactionMode) => db.transaction(t, mode).objectStore(t);
  return {
    get: (t, k) => done(store(t, 'readonly').get(k)),
    put: async (t, k, v) => void (await done(store(t, 'readwrite').put(v, k))),
    del: async (t, k) => void (await done(store(t, 'readwrite').delete(k))),
    list: (t, p = '') => done(store(t, 'readonly').getAll(p ? IDBKeyRange.bound(p, `${p}\uffff`) : undefined)),
    keys: async (t) => (await done(store(t, 'readonly').getAllKeys())).map(String),
  };
}
