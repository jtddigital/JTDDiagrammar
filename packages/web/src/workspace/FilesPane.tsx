import { useEffect, useMemo, useRef, useState } from 'react';
import type { Comparison } from '../compare/comparison.ts';
import { IMPORTABLE } from '../files.ts';
import { examples, pretty } from '../registry.ts';
import { Chevron, FileIcon, Folder, Trash } from '../ui/icons.tsx';
import { ContextMenu, type MenuItem } from './ContextMenu.tsx';
import { STARTERS } from './kinds.ts';
import { children, nameProblem, trash, type WsNode } from './tree.ts';
import type { Version } from './store.ts';
import type { Workspace } from './useWorkspace.ts';

const NODE = 'application/x-jtd-node';
const EXPANDED = 'jtd:expanded';
const loadExpanded = () => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(EXPANDED) ?? '[]') as string[]);
  } catch {
    return new Set<string>();
  }
};

/** A row of the tree, in display order. */
interface Row {
  node: WsNode;
  level: number;
}

/**
 * The Files pane (URS-WS-001..003): the workspace tree with a context menu on every item and on the empty
 * space, inline rename, drag and drop to move (or to import files from the computer), and the trash. The tree
 * follows the ARIA tree pattern: ↑ ↓ move, → opens or enters a folder, ← closes it or goes up, Enter opens,
 * F2 renames, Delete moves to the trash, Shift+F10 or the menu key opens the menu. Compare with… waits for
 * the second file to be chosen in the tree (URS-WS-032).
 */
export function FilesPane({ ws, onView, viewing, onCompare }: { ws: Workspace; onView(file: WsNode, v: Version): void; viewing?: Version | undefined; onCompare(c: Comparison): void }) {
  const [historyOf, setHistoryOf] = useState<string>();
  // The file waiting for a second one to compare with.
  const [picking, setPicking] = useState<string>();
  const pickingNode = ws.nodes.find((n) => n.id === picking);
  /** Open a file, or, while choosing one to compare with, compare it. */
  const activate = (n: WsNode) => {
    if (!picking) return void ws.openFile(n.id);
    setPicking(undefined);
    onCompare({ a: { file: picking }, b: { file: n.id } });
  };
  const compareWithSaved = async (id: string) => {
    const latest = (await ws.versions(id)).at(-1);
    onCompare({ a: { file: id, ...(latest && { version: latest.n }) }, b: { file: id } });
  };
  const [expanded, setExpanded] = useState(loadExpanded);
  const [focus, setFocus] = useState<string>();
  const [renaming, setRenaming] = useState<string>();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; label: string }>();
  const [dropOn, setDropOn] = useState<string | null>();
  const [trashOpen, setTrashOpen] = useState(false);
  const tree = useRef<HTMLUListElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const importTo = useRef<string | null>(null);

  useEffect(() => localStorage.setItem(EXPANDED, JSON.stringify([...expanded])), [expanded]);
  // The open file's folders stay open.
  useEffect(() => {
    const byId = new Map(ws.nodes.map((n) => [n.id, n]));
    const up: string[] = [];
    for (let p = ws.open?.parent; p; p = byId.get(p)?.parent ?? null) up.push(p);
    if (up.some((p) => !expanded.has(p))) setExpanded((e) => new Set([...e, ...up]));
    // Only when the open file changes.
  }, [ws.open?.id]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (parent: string | null, level: number) =>
      children(ws.nodes, parent).forEach((node) => {
        out.push({ node, level });
        if (node.kind === 'folder' && expanded.has(node.id)) walk(node.id, level + 1);
      });
    walk(null, 1);
    return out;
  }, [ws.nodes, expanded]);
  const trashed = trash(ws.nodes);
  const current = focus && rows.some((r) => r.node.id === focus) ? focus : (ws.open?.id ?? rows[0]?.node.id);

  const toggle = (id: string, open?: boolean) =>
    setExpanded((e) => {
      const next = new Set(e);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  const focusRow = (id: string) => {
    setFocus(id);
    requestAnimationFrame(() => tree.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus());
  };
  const created = (id: string | undefined, parent: string | null) => {
    if (parent) toggle(parent, true);
    if (id) {
      setFocus(id);
      setRenaming(id);
    }
  };

  /** The commands for a node, or for the empty space (null): creates go into the folder, or beside the file. */
  const commands = (n: WsNode | null): MenuItem[] => {
    const into = n === null ? null : n.kind === 'folder' ? n.id : n.parent;
    const make = async (kind: keyof typeof STARTERS) => created(await ws.create(into, 'file', STARTERS[kind].name, STARTERS[kind].text), into);
    const types = [...new Set(examples.map((e) => e.type))];
    const items: MenuItem[] = [
      { label: 'New folder', onSelect: async () => created(await ws.create(into, 'folder', 'New folder'), into) },
      {
        label: 'New diagram',
        items: types.map((t) => ({
          label: t,
          items: examples.filter((e) => e.type === t).map((e) => ({ label: e.title, onSelect: async () => created(await ws.create(into, 'file', `${e.title}.json`, pretty(e.source)), into) })),
        })),
      },
      { label: 'New Markdown file', onSelect: () => void make('markdown') },
      { label: 'New text file', onSelect: () => void make('text') },
      { label: 'New CSV file', onSelect: () => void make('csv') },
      {
        label: 'Import files…',
        separator: true,
        onSelect: () => {
          importTo.current = into;
          picker.current?.click();
        },
      },
      { label: n ? 'Export' : 'Export workspace', hint: n?.kind === 'file' ? undefined : '.zip', onSelect: () => void ws.exportNode(n?.id ?? null) },
    ];
    if (n)
      items.push(
        ...(n.kind === 'file'
          ? [
              { label: 'History', separator: true, onSelect: () => setHistoryOf(n.id) },
              { label: 'Compare with…', onSelect: () => setPicking(n.id) },
              { label: 'Compare with saved', onSelect: () => void compareWithSaved(n.id) },
            ]
          : []),
        { label: 'Rename', hint: 'F2', ...(n.kind === 'folder' && { separator: true }), onSelect: () => setRenaming(n.id) },
        { label: 'Duplicate', onSelect: () => void ws.duplicate(n.id) },
        { label: 'Delete', hint: 'Del', onSelect: () => void ws.trash(n.id) },
      );
    return items;
  };
  const openMenu = (x: number, y: number, n: WsNode | null) => setMenu({ x, y, items: commands(n), label: n ? `${n.name} actions` : 'Workspace actions' });
  const menuAt = (el: HTMLElement, n: WsNode) => {
    const r = el.getBoundingClientRect();
    openMenu(r.left + 24, r.bottom, n);
  };

  const keys = (e: React.KeyboardEvent, r: Row, i: number) => {
    if (renaming) return;
    const n = r.node;
    const go = (j: number) => rows[j] && focusRow(rows[j]!.node.id);
    const k = e.key;
    if (k === 'ArrowDown') go(i + 1);
    else if (k === 'ArrowUp') go(i - 1);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(rows.length - 1);
    else if (k === 'ArrowRight' && n.kind === 'folder') {
      if (expanded.has(n.id)) go(i + 1);
      else toggle(n.id, true);
    } else if (k === 'ArrowLeft') {
      if (n.kind === 'folder' && expanded.has(n.id)) toggle(n.id, false);
      else if (n.parent) focusRow(n.parent);
    } else if (k === 'Enter') {
      if (n.kind === 'folder') toggle(n.id);
      else activate(n);
    } else if (k === 'Escape' && picking) setPicking(undefined);
    else if (k === 'F2') setRenaming(n.id);
    else if (k === 'Delete') void ws.trash(n.id);
    else if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) menuAt(e.currentTarget as HTMLElement, n);
    else return;
    e.preventDefault();
  };

  const drop = (e: React.DragEvent, to: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDropOn(undefined);
    const id = e.dataTransfer.getData(NODE);
    if (id) return void ws.move(id, to);
    if (e.dataTransfer.files.length) void ws.importFiles([...e.dataTransfer.files], to).then(() => to && toggle(to, true));
  };
  const over = (e: React.DragEvent, to: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(NODE) ? 'move' : 'copy';
    setDropOn(to);
  };

  return (
    <div className="frame files">
      <div className="pane__header cluster">
        <span className="pane__title">Files</span>
        <button type="button" className="btn push-right" data-variant="ghost" data-size="small" aria-label="Workspace actions" onClick={(e) => openMenu(e.currentTarget.getBoundingClientRect().left, e.currentTarget.getBoundingClientRect().bottom, null)}>
          ⋯
        </button>
      </div>
      <div
        className="files__body"
        data-drop={dropOn === null || undefined}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenu(e.clientX, e.clientY, null);
        }}
        onDragOver={(e) => over(e, null)}
        onDragLeave={() => setDropOn(undefined)}
        onDrop={(e) => drop(e, null)}
      >
        {!ws.ready ? (
          <p className="text-muted text-small files__empty">Opening the workspace…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted text-small files__empty">No files yet. Right-click to create one, or drop files here.</p>
        ) : (
          <ul className="tree" role="tree" aria-label="Files" ref={tree}>
            {rows.map((r, i) => {
              const n = r.node;
              const folder = n.kind === 'folder';
              return (
                <li
                  key={n.id}
                  role="treeitem"
                  aria-label={n.name}
                  {...(ws.drafts.has(n.id) && { 'aria-description': 'unsaved changes' })}
                  data-id={n.id}
                  aria-level={r.level}
                  aria-selected={n.id === ws.open?.id}
                  {...(folder && { 'aria-expanded': expanded.has(n.id) })}
                  tabIndex={n.id === current ? 0 : -1}
                  className="tree__item"
                  data-picking={picking && !folder && n.id !== picking ? true : undefined}
                  data-drop={dropOn === n.id || undefined}
                  style={{ paddingInlineStart: `${(r.level - 1) * 14 + 6}px` }}
                  draggable={renaming !== n.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(NODE, n.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={folder ? (e) => over(e, n.id) : undefined}
                  onDrop={folder ? (e) => drop(e, n.id) : undefined}
                  onFocus={() => setFocus(n.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFocus(n.id);
                    if (folder) toggle(n.id);
                    else activate(n);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFocus(n.id);
                    openMenu(e.clientX, e.clientY, n);
                  }}
                  onKeyDown={(e) => keys(e, r, i)}
                >
                  <span className="tree__twisty" data-open={folder && expanded.has(n.id) ? true : undefined} aria-hidden="true">
                    {folder && <Chevron />}
                  </span>
                  <span className="tree__icon" aria-hidden="true">
                    {folder ? <Folder /> : <FileIcon />}
                  </span>
                  {renaming === n.id ? (
                    <RenameBox
                      name={n.name}
                      onDone={async (name) => {
                        if (name !== undefined && name !== n.name) {
                          const why = await ws.rename(n.id, name);
                          if (why) return why;
                        }
                        setRenaming(undefined);
                        focusRow(n.id);
                        return undefined;
                      }}
                    />
                  ) : (
                    <span className="tree__name" title={n.name}>
                      {n.name}
                      {ws.drafts.has(n.id) && <span aria-hidden="true"> •</span>}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {trashed.length > 0 && (
          <div className="files__trash">
            <button type="button" className="btn" data-variant="ghost" data-size="small" aria-expanded={trashOpen} onClick={() => setTrashOpen((o) => !o)}>
              <Trash /> Trash ({trashed.length})
            </button>
            {trashOpen && (
              <ul className="stack" aria-label="Trash">
                {trashed.map((n) => (
                  <li key={n.id} className="cluster files__trashed">
                    <span className="tree__name">{n.name}</span>
                    <button type="button" className="btn push-right" data-variant="ghost" data-size="small" onClick={() => void ws.restore(n.id)}>
                      Restore
                    </button>
                    <button type="button" className="btn" data-variant="ghost" data-size="small" onClick={() => window.confirm(`Delete ${n.name} and its history for good?`) && void ws.purge(n.id)}>
                      Delete
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className="btn" data-variant="ghost" data-size="small" onClick={() => window.confirm('Delete everything in the trash, with its history, for good?') && void ws.emptyTrash()}>
                    Empty trash
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
      </div>
      {historyOf && ws.nodes.some((n) => n.id === historyOf) && (
        <History ws={ws} file={ws.nodes.find((n) => n.id === historyOf)!} onView={onView} viewing={viewing} onCompare={onCompare} onClose={() => setHistoryOf(undefined)} />
      )}
      {pickingNode && (
        <p className="files__note text-small" role="status">
          Choose a file to compare with {pickingNode.name}
          <button type="button" className="btn" data-variant="ghost" data-size="small" onClick={() => setPicking(undefined)}>
            Cancel
          </button>
        </p>
      )}
      {ws.note && (
        <p className="files__note text-small" role="status">
          {ws.note.text}
          {ws.note.undo && (
            <button
              type="button"
              className="btn"
              data-variant="ghost"
              data-size="small"
              onClick={() => {
                ws.note!.undo!();
                ws.setNote();
              }}
            >
              Undo
            </button>
          )}
        </p>
      )}
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        accept={IMPORTABLE}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void ws.importFiles(files, importTo.current);
        }}
      />
      {menu && <ContextMenu {...menu} onClose={() => setMenu(undefined)} />}
    </div>
  );
}

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * A file's versions, newest first, to view, compare with the current text or restore (URS-WS-021); it follows
 * the file through renames and moves (URS-WS-022).
 */
function History({ ws, file, onView, viewing, onCompare, onClose }: { ws: Workspace; file: WsNode; onView(file: WsNode, v: Version): void; viewing?: Version | undefined; onCompare(c: Comparison): void; onClose(): void }) {
  const [versions, setVersions] = useState<Version[]>([]);
  // Saves and restores change the tree, so its versions are read again.
  useEffect(() => {
    let live = true;
    void ws.versions(file.id).then((v) => live && setVersions([...v].reverse()));
    return () => {
      live = false;
    };
  }, [ws, file.id, ws.nodes]);
  return (
    <section className="files__history" aria-label={`History of ${file.name}`}>
      <div className="cluster">
        <span className="pane__title">History · {file.name}</span>
        <button type="button" className="btn push-right" data-variant="ghost" data-size="small" aria-label="Close history" onClick={onClose}>
          ✕
        </button>
      </div>
      {versions.length === 0 ? (
        <p className="text-muted text-small">Not saved yet.</p>
      ) : (
        <ol className="files__versions">
          {versions.map((v, i) => (
            <li key={v.n} className="cluster" data-current={viewing?.file === v.file && viewing.n === v.n ? true : undefined}>
              <button type="button" className="btn" data-variant="ghost" data-size="small" title="Show this version, read-only" onClick={() => onView(file, v)}>
                <strong>v{v.n}</strong> {new Date(v.at).toLocaleString()}
              </button>
              <span className="text-muted text-small">{i === 0 ? 'latest · ' : ''}{size(v.size)}</span>
              <button type="button" className="btn push-right" data-variant="ghost" data-size="small" title="Compare with the current text" onClick={() => onCompare({ a: { file: file.id, version: v.n }, b: { file: file.id } })}>
                Compare
              </button>
              {i > 0 && (
                <button
                  type="button"
                  className="btn"
                  data-variant="ghost"
                  data-size="small"
                  onClick={() => (!(file.id === ws.open?.id && ws.dirty) || window.confirm('Restoring replaces your unsaved edits to this file. Restore?')) && void ws.restoreVersion(v)}
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Inline rename: Enter keeps, Escape cancels; a refused name stays open with the reason. */
function RenameBox({ name, onDone }: { name: string; onDone(name?: string): Promise<string | undefined> }) {
  const [value, setValue] = useState(name);
  const [why, setWhy] = useState<string>();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.focus();
    // Select the name without its extension.
    const dot = name.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : name.length);
  }, [name]);
  const finish = async (v?: string) => {
    const problem = v === undefined ? undefined : nameProblem(v);
    if (problem) return setWhy(problem);
    const refused = await onDone(v);
    if (refused) setWhy(refused);
  };
  return (
    <span className="tree__rename">
      <input
        ref={ref}
        className="input"
        aria-label="New name"
        aria-invalid={why ? true : undefined}
        value={value}
        onChange={(e) => (setValue(e.target.value), setWhy(undefined))}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') void finish(value);
          if (e.key === 'Escape') void onDone(undefined);
        }}
        onBlur={() => void finish(value)}
      />
      {why && (
        <span className="tree__why text-small" role="alert">
          {why}
        </span>
      )}
    </span>
  );
}
