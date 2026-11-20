import { zip, type ZipEntry } from '@jtd/documents';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '../download.ts';
import { csvXlsx, filePdf } from '../export/filePdf.ts';
import { toEditorText } from '../files.ts';
import { decode, restore as restoreSession } from '../persist.ts';
import { examples, pretty, registry } from '../registry.ts';
import { indexedKv } from './kv.ts';
import { kindOf } from './kinds.ts';
import { StorageFull, Store, type Version } from './store.ts';
import { freeName, inTrash, move as moveNode, pathOf, rename as renameNode, restore as restoreNode, subtree, type WsNode } from './tree.ts';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const deflateRaw = async (bytes: Uint8Array) => new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What the app needs from the workspace (URS-WS-001..007). */
export interface Workspace {
  ready: boolean;
  nodes: WsNode[];
  open?: WsNode;
  /** The open file's path. */
  path?: string;
  /** An example being looked at, not yet a file: its name if saved (URS-WEB-007). */
  scratch?: string;
  /** Show text that is not a file yet, e.g. an example; Save makes it one. */
  openScratch(name: string, text: string): Promise<void>;
  kind: ReturnType<typeof kindOf>;
  text: string;
  setText(t: string): void;
  dirty: boolean;
  /** Files with unsaved edits. */
  drafts: ReadonlySet<string>;
  note?: { text: string; undo?(): void };
  setNote(text?: string): void;
  openFile(id: string): Promise<void>;
  save(): Promise<void>;
  create(parent: string | null, kind: 'folder' | 'file', name: string, text?: string): Promise<string | undefined>;
  rename(id: string, name: string): Promise<string | undefined>;
  move(id: string, to: string | null): Promise<void>;
  duplicate(id: string): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  purge(id: string): Promise<void>;
  emptyTrash(): Promise<void>;
  importFiles(files: readonly File[], parent: string | null): Promise<void>;
  exportNode(id: string | null): Promise<void>;
  /** Download a file as a PDF, or a CSV file as an Excel workbook (URS-WS-045, WS-046). */
  exportAs(id: string, format: 'pdf' | 'xlsx'): Promise<void>;
  /** A path relative to the open file's folder (`..` allowed), as a live file, if there is one (URS-WS-041). */
  resolve(path: string): WsNode | undefined;
  /** The current text of a file: its draft, else its latest version. */
  read(id: string): Promise<string | undefined>;
  /** A file's versions, oldest first (URS-WS-021). */
  versions(id: string): Promise<Version[]>;
  /** The text a version saved. */
  versionText(v: Version): Promise<string>;
  /** Open the file and save the version's text as its newest version; nothing is lost (URS-WS-021). */
  restoreVersion(v: Version): Promise<void>;
}

/**
 * The browser workspace (D-006): loads the tree, opens files into the editor, keeps unsaved edits as drafts
 * (written a moment after typing stops), saves versions, and runs the context menu's commands.
 */
export function useWorkspace(): Workspace {
  const store = useRef<Store | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [nodes, setNodes] = useState<WsNode[]>([]);
  const [openId, setOpenId] = useState<string>();
  const [scratch, setScratch] = useState<string>();
  const [text, setTextState] = useState('');
  const [saved, setSaved] = useState('');
  const [kindText, setKindText] = useState('');
  const [drafts, setDrafts] = useState<ReadonlySet<string>>(new Set());
  const [note, setNoteState] = useState<Workspace['note']>();
  const setNote = useCallback((t?: string) => setNoteState(t ? { text: t } : undefined), []);
  const fail = useCallback((e: unknown) => setNoteState({ text: e instanceof StorageFull ? e.message : `Could not complete that: ${message(e)}` }), []);

  const reload = useCallback(async () => {
    const s = store.current!;
    setNodes(await s.nodes());
    setDrafts(await s.drafted());
  }, []);

  const load = useCallback(async (id: string) => {
    const s = store.current!;
    const content = await s.content(id);
    const draft = await s.draft(id);
    setOpenId(id);
    setScratch(undefined);
    setSaved(content);
    setTextState(draft ?? content);
    setKindText(draft ?? content);
    await s.setMeta('open', id);
  }, []);

  // Open the store; on the first run, bring in the editor's last session (URS-WS-006); open a shared link as a new file.
  useEffect(() => {
    void (async () => {
      try {
        const s = new Store(await indexedKv());
        store.current = s;
        void navigator.storage?.persist?.().catch(() => false);
        if (!(await s.meta('initialised'))) {
          const first = (await restoreSession()) ?? pretty(examples[0]!.source);
          const id = newId();
          await s.putNode({ id, parent: null, name: 'Untitled.json', kind: 'file', created: Date.now(), modified: Date.now() });
          await s.save(id, first);
          await s.setMeta('open', id);
          await s.setMeta('initialised', true);
        }
        let open = await s.meta<string>('open');
        if (location.hash.startsWith('#src=')) {
          const shared = await decode(location.hash.slice(5)).catch(() => undefined);
          if (shared !== undefined) {
            const all = await s.nodes();
            open = newId();
            await s.putNode({ id: open, parent: null, name: freeName(all, null, 'Shared.json'), kind: 'file', created: Date.now(), modified: Date.now() });
            await s.save(open, shared);
            history.replaceState(null, '', location.pathname);
          }
        }
        const all = await s.nodes();
        const target = all.find((n) => n.id === open && n.kind === 'file' && !inTrash(all, n.id)) ?? all.find((n) => n.kind === 'file' && !inTrash(all, n.id));
        await reload();
        if (target) await load(target.id);
        setReady(true);
      } catch (e) {
        fail(e);
        setReady(true);
      }
    })();
  }, [load, reload, fail]);

  // Unsaved edits are written as a draft at once, so they survive switching files and reloading (URS-WS-004).
  // While a write is under way, later edits wait, and only the latest is written next.
  const queued = useRef<{ id: string; text: string | undefined }>(undefined);
  const writing = useRef(false);
  const writeDrafts = useCallback(async () => {
    if (writing.current || !store.current) return;
    writing.current = true;
    for (let job = queued.current; job; job = queued.current) {
      queued.current = undefined;
      try {
        await store.current.setDraft(job.id, job.text);
        const { id, text: draft } = job;
        setDrafts((d) => {
          if (d.has(id) === (draft !== undefined)) return d;
          const next = new Set(d);
          if (draft === undefined) next.delete(id);
          else next.add(id);
          return next;
        });
      } catch (e) {
        fail(e);
      }
    }
    writing.current = false;
  }, [fail]);
  useEffect(() => {
    if (!openId || !store.current) return;
    queued.current = { id: openId, text: text === saved ? undefined : text };
    void writeDrafts();
  }, [text, saved, openId, writeDrafts]);

  const flush = useCallback(async () => {
    if (openId && store.current) await store.current.setDraft(openId, text === saved ? undefined : text);
  }, [openId, text, saved]);

  const open = nodes.find((n) => n.id === openId);
  const shownName = open?.name ?? scratch;
  const kind = useMemo(() => (shownName ? kindOf(shownName, kindText, registry) : { kind: 'text' as const }), [shownName, kindText]);

  const put = async (n: WsNode) => {
    await store.current!.putNode(n);
    await reload();
  };
  const run = async (f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      fail(e);
    }
  };

  const create: Workspace['create'] = async (parent, k, name, content = '') => {
    let id: string | undefined;
    await run(async () => {
      const s = store.current!;
      const all = await s.nodes();
      id = newId();
      await s.putNode({ id, parent, name: freeName(all, parent, name), kind: k, created: Date.now(), modified: Date.now() });
      if (k === 'file') await s.save(id, content);
      await reload();
      if (k === 'file') {
        await flush();
        await load(id);
      }
    });
    return id;
  };

  /** A path relative to a folder (`..` allowed), as a live file, if there is one. */
  const resolveIn = (folder: string | null, path: string): WsNode | undefined => {
    const parts = path.startsWith('/') ? [] : pathOf(nodes, folder ?? '').split('/').filter(Boolean);
    for (const seg of path.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg && seg !== '.') parts.push(seg);
    }
    const target = parts.join('/');
    return nodes.find((n) => n.kind === 'file' && !inTrash(nodes, n.id) && pathOf(nodes, n.id) === target);
  };
  const resolve = (path: string) => resolveIn(open?.parent ?? null, path);
  const textOf = async (id: string) => (id === openId ? text : ((await store.current?.draft(id)) ?? (await store.current?.content(id))));

  return {
    ready,
    resolve,
    versions: async (id) => (await store.current?.versions(id)) ?? [],
    versionText: async (v) => (await store.current?.read(v.hash)) ?? '',
    restoreVersion: (v) =>
      run(async () => {
        const s = store.current!;
        const content = (await s.read(v.hash)) ?? '';
        if (v.file !== openId) {
          await flush();
          await load(v.file);
        }
        const saved = await s.save(v.file, content);
        setTextState(content);
        setSaved(content);
        setKindText(content);
        await reload();
        setNote(`Restored version ${v.n} as version ${saved.n}`);
      }),
    read: async (id) => (id === openId ? text : ((await store.current?.draft(id)) ?? (await store.current?.content(id)))),
    nodes,
    ...(open && { open, path: pathOf(nodes, open.id) }),
    ...(scratch !== undefined && { scratch }),
    openScratch: (name, t) =>
      run(async () => {
        await flush();
        setOpenId(undefined);
        setScratch(name);
        setTextState(t);
        setSaved('');
        setKindText(t);
      }),
    kind,
    text,
    setText: setTextState,
    dirty: scratch !== undefined || text !== saved,
    drafts,
    ...(note && { note }),
    setNote,
    openFile: (id) =>
      run(async () => {
        if (id === openId) return;
        await flush();
        await load(id);
        await reload();
      }),
    save: () =>
      run(async () => {
        // An example becomes a file in the top folder when saved.
        if (scratch !== undefined) {
          const id = await create(null, 'file', scratch, text);
          if (id) setNote(`Saved ${scratch}`);
          return;
        }
        if (!openId) return;
        await store.current!.save(openId, text);
        setSaved(text);
        setKindText(text);
        await reload();
        setNote(`Saved ${open?.name ?? ''}`);
      }),
    create,
    rename: async (id, name) => {
      const r = renameNode(nodes, id, name);
      if (typeof r === 'string') return r;
      await run(() => put(r));
      if (id === openId) setKindText(text);
      return undefined;
    },
    move: (id, to) =>
      run(async () => {
        const r = moveNode(nodes, id, to);
        if (typeof r === 'string') return setNote(r);
        await put(r);
      }),
    duplicate: (id) =>
      run(async () => {
        const s = store.current!;
        const all = await s.nodes();
        const copy = async (n: WsNode, parent: string | null, name: string) => {
          const id2 = newId();
          await s.putNode({ ...n, id: id2, parent, name, created: Date.now(), modified: Date.now() });
          if (n.kind === 'file') await s.save(id2, n.id === openId ? text : ((await s.draft(n.id)) ?? (await s.content(n.id))));
          for (const c of all.filter((x) => x.parent === n.id && x.trashed === undefined)) await copy(c, id2, c.name);
        };
        const n = all.find((x) => x.id === id)!;
        await copy(n, n.parent, freeName(all, n.parent, n.name));
        await reload();
      }),
    trash: (id) =>
      run(async () => {
        const n = nodes.find((x) => x.id === id)!;
        await put({ ...n, trashed: Date.now() });
        const all = await store.current!.nodes();
        if (openId && inTrash(all, openId)) {
          await flush();
          const next = all.find((x) => x.kind === 'file' && !inTrash(all, x.id));
          if (next) await load(next.id);
          else {
            setOpenId(undefined);
            setTextState('');
            setSaved('');
          }
        }
        setNoteState({ text: `Moved ${n.name} to the trash`, undo: () => void run(() => put({ ...n })) });
      }),
    restore: (id) => run(() => put(restoreNode(nodes, id))),
    purge: (id) =>
      run(async () => {
        await store.current!.purge([id]);
        await reload();
      }),
    emptyTrash: () =>
      run(async () => {
        await store.current!.purge(nodes.filter((n) => n.trashed !== undefined).map((n) => n.id));
        await reload();
        setNote('Emptied the trash');
      }),
    importFiles: (files, parent) =>
      run(async () => {
        let last: string | undefined;
        for (const f of files) {
          const content = await f.text();
          const isDiagram = /\.(ya?ml|xml)$/i.test(f.name) && kindOf(f.name, content, registry).kind === 'diagram';
          // YAML and XML diagrams become JSON, the editor's language (URS-WEB-019).
          const converted = isDiagram ? toEditorText(f.name, content, registry) : undefined;
          const name = converted?.text !== undefined ? f.name.replace(/\.[^.]*$/, '.json') : f.name;
          last = await create(parent, 'file', name, converted?.text ?? content);
        }
        if (last) setNote(`Imported ${files.length} file${files.length === 1 ? '' : 's'}`);
      }),
    exportAs: (id, format) =>
      run(async () => {
        const n = nodes.find((x) => x.id === id)!;
        const content = (await textOf(id)) ?? '';
        const base = n.name.replace(/\.[^.]+$/, '');
        if (format === 'xlsx') return downloadBlob(new Blob([(await csvXlsx(n.name, content)) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}.xlsx`);
        const bytes = await filePdf(n.name, content, async (path) => {
          const f = resolveIn(n.parent, path);
          return f ? textOf(f.id) : undefined;
        });
        downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${base}.pdf`);
      }),
    exportNode: (id) =>
      run(async () => {
        const s = store.current!;
        const all = await s.nodes();
        const textOf = async (n: WsNode) => (n.id === openId ? text : ((await s.draft(n.id)) ?? (await s.content(n.id))));
        const n = id === null ? undefined : all.find((x) => x.id === id)!;
        if (n?.kind === 'file') return downloadBlob(new Blob([await textOf(n)], { type: 'text/plain' }), n.name);
        const items = n ? subtree(all, n.id) : all.filter((x) => !inTrash(all, x.id));
        const base = n ? pathOf(all, n.parent ?? '') : '';
        const rel = (x: WsNode) => pathOf(all, x.id).slice(base ? base.length + 1 : 0);
        const entries: ZipEntry[] = [];
        for (const x of items.filter((y) => !inTrash(all, y.id)).sort((a, b) => rel(a).localeCompare(rel(b))))
          entries.push(x.kind === 'folder' ? { path: `${rel(x)}/`, modified: new Date(x.modified) } : { path: rel(x), text: await textOf(x), modified: new Date(x.modified) });
        downloadBlob(new Blob([(await zip(entries, deflateRaw)) as BlobPart], { type: 'application/zip' }), `${n?.name ?? 'workspace'}.zip`);
      }),
  };
}
