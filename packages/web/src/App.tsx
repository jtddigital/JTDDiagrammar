import { exportDiagram, exportFormats } from '@jtd/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatPane } from './chat/ChatPane.tsx';
import type { Comparison } from './compare/comparison.ts';
import { ComparePane } from './compare/ComparePane.tsx';
import { downloadBlob, downloadPng, downloadSvg, downloadText } from './download.ts';
import { filePdf } from './export/filePdf.ts';
import { ExamplePicker } from './editor/ExamplePicker.tsx';
import { SourcePane } from './editor/SourcePane.tsx';
import { locate, type Range } from './editor/locate.ts';
import { pickFiles } from './files.ts';
import { shareUrl } from './persist.ts';
import { pointerOf } from './pick.ts';
import { elementAt, labelTarget, pointerAt, related, setAt, type Ref } from './preview/interact.ts';
import { Preview } from './preview/Preview.tsx';
import { examples, pretty, registry } from './registry.ts';
import { useEdit } from './edit/index.ts';
import { useDiagram } from './useDiagram.ts';
import { CsvTable } from './viewers/CsvTable.tsx';
import { Markdown, type MarkdownLinks } from './viewers/Markdown.tsx';
import { FilesPane } from './workspace/FilesPane.tsx';
import { loadLayout, saveLayout, toggle, type Layout, type PaneId } from './workspace/layout.ts';
import { Panes } from './workspace/Panes.tsx';
import { PANE_LABELS, Toolbar } from './workspace/Toolbar.tsx';
import { kindOf } from './workspace/kinds.ts';
import type { Version } from './workspace/store.ts';
import type { WsNode } from './workspace/tree.ts';
import { useWorkspace } from './workspace/useWorkspace.ts';

const kindLabel = { diagram: 'Diagram', markdown: 'Markdown', csv: 'CSV', text: 'Text' } as const;

export function App() {
  const ws = useWorkspace();
  const { setText } = ws;
  // An earlier version shown for reading (URS-WS-021); the open file's own text otherwise.
  const [viewing, setViewing] = useState<{ file: WsNode; version: Version; text: string }>();
  useEffect(() => setViewing(undefined), [ws.open?.id]);
  const text = viewing?.text ?? ws.text;
  const shownKind = useMemo(() => (viewing ? kindOf(viewing.file.name, viewing.text, registry) : ws.kind), [viewing, ws.kind]);
  const kind = shownKind.kind;
  const diagram = kind === 'diagram';
  const shownName = viewing?.file.name ?? ws.open?.name ?? ws.scratch;
  // An example being looked at is named, and marked as not a file yet (URS-WEB-007).
  const path = ws.path ?? (ws.scratch !== undefined ? `${ws.scratch} (example, not saved yet)` : undefined);
  const [layout, setLayout] = useState<Layout>(loadLayout);
  // The comparison on screen, if any: the Compare pane shows while there is one (URS-WS-031).
  const [comparison, setComparison] = useState<Comparison>();
  const [reveal, setReveal] = useState<Range>();
  const [cursor, setCursor] = useState<number>();
  const [shared, setShared] = useState(false);
  const d = useDiagram(text, diagram ? (shownKind.format ?? 'json') : 'none');
  const errors = d.diagnostics.filter((x) => x.severity === 'error').length;
  // The render lags the editor by the debounce; never show or export a stale result as current.
  const pending = d.source !== text;
  const ready = !pending && d.current;
  const ir = ready ? d.ir : undefined;

  useEffect(() => saveLayout(layout), [layout]);
  // A text file has nothing to preview: the pane steps aside while it is open (URS-WS-011).
  const auto: PaneId[] = [...(ws.open && kind === 'text' ? (['preview'] as const) : []), ...(comparison ? [] : (['compare'] as const))];

  const share = async () => {
    const url = await shareUrl(text);
    history.replaceState(null, '', url);
    await navigator.clipboard?.writeText(url).catch(() => {});
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  // Relative links and images in Markdown reach workspace files (URS-WS-041); rebuilt when the tree or the open file changes.
  const { resolve, openFile, read, setNote } = ws;
  const links = useMemo<MarkdownLinks>(
    () => ({
      open: (path) => {
        const f = resolve(path);
        if (f) void openFile(f.id);
        else setNote(`No file ${path} in the workspace`);
        return Boolean(f);
      },
      read: async (path) => {
        const f = resolve(path);
        return f ? read(f.id) : undefined;
      },
    }),
    [resolve, openFile, read, setNote],
  );

  const importFiles = async () => {
    const files = await pickFiles();
    if (files.length) await ws.importFiles(files, ws.open?.parent ?? null);
  };

  // Ctrl+S saves a version into the workspace; Ctrl+O imports; Ctrl+Shift+S downloads the open file (URS-WS-005).
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 's' && k !== 'o') return;
      e.preventDefault();
      if (k === 'o') void importFiles();
      else if (e.shiftKey) void (ws.open && ws.exportNode(ws.open.id));
      else void ws.save();
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });

  // Direct editing: an isolated experiment (D-009); see edit/index.ts to remove it.
  const edit = useEdit({
    text,
    setText: viewing ? () => {} : setText,
    value: ready && !viewing ? d.value : undefined,
    ir,
    reveal: (path, t) => setReveal(locate(t, { code: 'pick', path })),
    detailsShown: !layout.hidden.includes('details'),
    toggleDetails: () => setLayout((l) => toggle(l, 'details', auto)),
  });

  const pick = (kind: string, id: string) => {
    if (edit.pick(kind, id)) return; // Direct editing: a click used to connect two elements.
    const path = ir ? pointerOf(ir, kind, id) : undefined;
    if (path !== undefined) setReveal(locate(text, { code: 'pick', path }));
  };

  // The diagram follows the editor cursor (URS-WEB-020).
  const selected = useMemo(() => (ir && cursor !== undefined && cursor <= text.length ? elementAt(ir, pointerAt(text, cursor)) : undefined), [ir, cursor, text]);
  const relatedOf = useCallback((r: Ref) => (ir ? related(ir, r) : []), [ir]);
  const labelOf = useCallback((r: Ref) => (ir && d.value !== undefined ? labelTarget(ir, d.value, r)?.text : undefined), [ir, d.value]);
  const onLabel = (r: Ref, label: string) => {
    if (viewing) return;
    const t = ir && d.value !== undefined ? labelTarget(ir, d.value, r) : undefined;
    if (t) setText(setAt(text, t.path, label));
  };

  return (
    <div className="workspace">
      <Toolbar
        {...(path && { fileName: path })}
        dirty={ws.dirty}
        onImport={() => void importFiles()}
        onSave={() => void ws.save()}
        canSave={Boolean(ws.open || ws.scratch !== undefined)}
        layout={layout}
        onToggle={(p) => setLayout((l) => toggle(l, p, auto))}
        status={!diagram ? { state: 'ok', text: ws.open ? kindLabel[kind] : 'No file' } : pending ? { state: 'pending', text: 'Updating…' } : errors ? { state: 'error', text: `${errors} error${errors > 1 ? 's' : ''}` } : { state: 'ok', text: 'Valid' }}
        shared={shared}
        onShare={() => void share()}
        canExport={Boolean(diagram && ready)}
        onSvg={() => downloadSvg(d.svg!, d.title)}
        onPng={() => void downloadPng(d.svg!, d.title)}
        canPdf={Boolean(shownName) && (!diagram || Boolean(ready))}
        onPdf={() => void (async () => {
          const name = shownName!;
          const bytes = await filePdf(name, text, links.read);
          downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${name.replace(/\.[^.]+$/, '')}.pdf`);
        })()}
        formats={diagram && ready ? exportFormats(d.value, registry) : []}
        onExport={(format) => {
          const out = exportDiagram(d.value, format, registry);
          if (out.text !== undefined) downloadText(out.text, out.mediaType!, out.extension!, d.title);
        }}
      />
      <Panes
        layout={layout}
        onLayout={setLayout}
        auto={auto}
        panes={{
          files: {
            label: PANE_LABELS.files,
            body: <FilesPane ws={ws} onView={async (file, version) => setViewing({ file, version, text: await ws.versionText(version) })} viewing={viewing?.version} onCompare={setComparison} />,
          },
          ai: { label: PANE_LABELS.ai, body: <ChatPane text={ws.text} {...(!viewing && !pending && d.value !== undefined && { value: d.value })} onSource={setText} /> },
          source: {
            label: PANE_LABELS.source,
            body: (
              <SourcePane
                text={text}
                onText={viewing ? () => {} : setText}
                readOnly={Boolean(viewing)}
                {...(viewing && {
                  banner: (
                    <>
                      <span>
                        Version {viewing.version.n} of {viewing.file.name}, saved {new Date(viewing.version.at).toLocaleString()} (read-only)
                      </span>
                      <button type="button" className="btn push-right" data-size="small" onClick={() => void ws.restoreVersion(viewing.version).then(() => setViewing(undefined))}>
                        Restore this version
                      </button>
                      <button type="button" className="btn" data-variant="ghost" data-size="small" onClick={() => setViewing(undefined)}>
                        Close
                      </button>
                    </>
                  ),
                })}
                diagnostics={d.diagnostics}
                source={d.source}
                onReveal={setReveal}
                onCursor={setCursor}
                {...(reveal && { reveal })}
                {...(path && { title: viewing ? `${viewing.file.name} · version ${viewing.version.n}` : path })}
                language={diagram && (shownKind.format ?? 'json') === 'json' ? 'json' : 'plain'}
                tools={<ExamplePicker onPick={(i) => void ws.openScratch(`${examples[i]!.title}.json`, pretty(examples[i]!.source))} />}
              />
            ),
          },
          compare: {
            label: PANE_LABELS.compare,
            // A new pair of files starts fresh; swapping sides or picking versions keeps the view.
            body: comparison && <ComparePane key={[comparison.a.file, comparison.b.file].sort().join()} ws={ws} comparison={comparison} onChange={setComparison} onClose={() => setComparison(undefined)} links={links} />,
          },
          // Direct editing: the details of the selected element.
          details: { label: PANE_LABELS.details, body: edit.pane },
          preview: {
            label: PANE_LABELS.preview,
            body: !diagram ? (
              <div className="frame">
                <div className="pane__header cluster">
                  <span className="pane__title">Preview</span>
                </div>
                {kind === 'csv' && shownName ? <CsvTable text={text} name={shownName} /> : kind === 'markdown' ? <Markdown text={text} links={links} /> : <pre className="preview-text">{text}</pre>}
              </div>
            ) : (
              <div className="frame">
                <div className="pane__header cluster">
                  <span className="pane__title">Preview</span>
                  <span className="text-muted text-small push-right">Click to find in source · double-click a label to edit</span>
                </div>
                {/* Direct editing: the diagram toolbar. */}
                {!viewing && edit.bar}
                <Preview
                {...(d.svg !== undefined && { svg: d.svg })}
                current={d.current}
                onPick={pick}
                {...(selected && { selected })}
                relatedOf={relatedOf}
                labelOf={labelOf}
                  onLabel={onLabel}
                  // Direct editing: the connect mode's cursor.
                  {...(!viewing && { mode: edit.mode })}
                />
              </div>
            ),
          },
        }}
      />
    </div>
  );
}
