import { exportDiagram, exportFormats } from '@jtd/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatPane } from './chat/ChatPane.tsx';
import { downloadPng, downloadSvg, downloadText } from './download.ts';
import { SourcePane } from './editor/SourcePane.tsx';
import { locate, type Range } from './editor/locate.ts';
import { pickFiles } from './files.ts';
import { shareUrl } from './persist.ts';
import { pointerOf } from './pick.ts';
import { elementAt, labelTarget, pointerAt, related, setAt, type Ref } from './preview/interact.ts';
import { Preview } from './preview/Preview.tsx';
import { examples, pretty, registry } from './registry.ts';
import { useDiagram } from './useDiagram.ts';
import { CsvTable } from './viewers/CsvTable.tsx';
import { Markdown, type MarkdownLinks } from './viewers/Markdown.tsx';
import { FilesPane } from './workspace/FilesPane.tsx';
import { loadLayout, saveLayout, toggle, type Layout, type PaneId } from './workspace/layout.ts';
import { Panes } from './workspace/Panes.tsx';
import { PANE_LABELS, Toolbar } from './workspace/Toolbar.tsx';
import { useWorkspace } from './workspace/useWorkspace.ts';

const kindLabel = { diagram: 'Diagram', markdown: 'Markdown', csv: 'CSV', text: 'Text' } as const;

export function App() {
  const ws = useWorkspace();
  const { text, setText } = ws;
  const kind = ws.kind.kind;
  const diagram = kind === 'diagram';
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [reveal, setReveal] = useState<Range>();
  const [cursor, setCursor] = useState<number>();
  const [shared, setShared] = useState(false);
  const d = useDiagram(text, diagram ? (ws.kind.format ?? 'json') : 'none');
  const errors = d.diagnostics.filter((x) => x.severity === 'error').length;
  // The render lags the editor by the debounce; never show or export a stale result as current.
  const pending = d.source !== text;
  const ready = !pending && d.current;
  const ir = ready ? d.ir : undefined;

  useEffect(() => saveLayout(layout), [layout]);
  // A text file has nothing to preview: the pane steps aside while it is open (URS-WS-011).
  const auto: PaneId[] = ws.open && kind === 'text' ? ['preview'] : [];

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

  const pick = (kind: string, id: string) => {
    const path = ir ? pointerOf(ir, kind, id) : undefined;
    if (path !== undefined) setReveal(locate(text, { code: 'pick', path }));
  };

  // The diagram follows the editor cursor (URS-WEB-020).
  const selected = useMemo(() => (ir && cursor !== undefined && cursor <= text.length ? elementAt(ir, pointerAt(text, cursor)) : undefined), [ir, cursor, text]);
  const relatedOf = useCallback((r: Ref) => (ir ? related(ir, r) : []), [ir]);
  const labelOf = useCallback((r: Ref) => (ir && d.value !== undefined ? labelTarget(ir, d.value, r)?.text : undefined), [ir, d.value]);
  const onLabel = (r: Ref, label: string) => {
    const t = ir && d.value !== undefined ? labelTarget(ir, d.value, r) : undefined;
    if (t) setText(setAt(text, t.path, label));
  };

  return (
    <div className="workspace">
      <Toolbar
        {...(ws.path && { fileName: ws.path })}
        dirty={ws.dirty}
        onImport={() => void importFiles()}
        onSave={() => void ws.save()}
        canSave={Boolean(ws.open)}
        onExample={(i) => void ws.create(ws.open?.parent ?? null, 'file', `${examples[i]!.title}.json`, pretty(examples[i]!.source))}
        layout={layout}
        onToggle={(p) => setLayout((l) => toggle(l, p))}
        status={!diagram ? { state: 'ok', text: ws.open ? kindLabel[kind] : 'No file' } : pending ? { state: 'pending', text: 'Updating…' } : errors ? { state: 'error', text: `${errors} error${errors > 1 ? 's' : ''}` } : { state: 'ok', text: 'Valid' }}
        shared={shared}
        onShare={() => void share()}
        canExport={Boolean(diagram && ready)}
        onSvg={() => downloadSvg(d.svg!, d.title)}
        onPng={() => void downloadPng(d.svg!, d.title)}
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
          files: { label: PANE_LABELS.files, body: <FilesPane ws={ws} /> },
          ai: { label: PANE_LABELS.ai, body: <ChatPane text={text} {...(!pending && d.value !== undefined && { value: d.value })} onSource={setText} /> },
          source: {
            label: PANE_LABELS.source,
            body: (
              <SourcePane
                text={text}
                onText={setText}
                diagnostics={d.diagnostics}
                source={d.source}
                onReveal={setReveal}
                onCursor={setCursor}
                {...(reveal && { reveal })}
                {...(ws.path && { title: ws.path })}
                language={diagram && (ws.kind.format ?? 'json') === 'json' ? 'json' : 'plain'}
              />
            ),
          },
          preview: {
            label: PANE_LABELS.preview,
            body: !diagram ? (
              <div className="frame">
                <div className="pane__header cluster">
                  <span className="pane__title">Preview</span>
                </div>
                {kind === 'csv' && ws.open ? <CsvTable text={text} name={ws.open.name} /> : kind === 'markdown' ? <Markdown text={text} links={links} /> : <pre className="preview-text">{text}</pre>}
              </div>
            ) : (
              <div className="frame">
                <div className="pane__header cluster">
                  <span className="pane__title">Preview</span>
                  <span className="text-muted text-small push-right">Click to find in source · double-click a label to edit</span>
                </div>
                <Preview
                {...(d.svg !== undefined && { svg: d.svg })}
                current={d.current}
                onPick={pick}
                {...(selected && { selected })}
                relatedOf={relatedOf}
                labelOf={labelOf}
                  onLabel={onLabel}
                />
              </div>
            ),
          },
        }}
      />
    </div>
  );
}
