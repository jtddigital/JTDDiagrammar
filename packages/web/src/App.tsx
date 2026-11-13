import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatPane } from './chat/ChatPane.tsx';
import { downloadPng, downloadSvg } from './download.ts';
import { SourcePane } from './editor/SourcePane.tsx';
import { locate, type Range } from './editor/locate.ts';
import { openFile, saveFile, toEditorText, type DiagramFile } from './files.ts';
import { restore, save, shareUrl } from './persist.ts';
import { pointerOf } from './pick.ts';
import { elementAt, labelTarget, pointerAt, related, setAt, type Ref } from './preview/interact.ts';
import { Preview } from './preview/Preview.tsx';
import { examples, pretty, registry } from './registry.ts';
import { useDiagram } from './useDiagram.ts';
import { loadLayout, saveLayout, toggle, type Layout } from './workspace/layout.ts';
import { Panes } from './workspace/Panes.tsx';
import { PANE_LABELS, Toolbar } from './workspace/Toolbar.tsx';

export function App() {
  const [text, setText] = useState(() => pretty(examples[0]!.source));
  const [file, setFile] = useState<DiagramFile>();
  const [saved, setSaved] = useState<string>();
  const [note, setNote] = useState<string>();
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [reveal, setReveal] = useState<Range>();
  const [cursor, setCursor] = useState<number>();
  const [shared, setShared] = useState(false);
  const d = useDiagram(text);
  const errors = d.diagnostics.filter((x) => x.severity === 'error').length;
  // The render lags the editor by the debounce; never show or export a stale result as current.
  const pending = d.source !== text;
  const ready = !pending && d.current;
  const ir = ready ? d.ir : undefined;

  useEffect(() => void restore().then((t) => t !== undefined && setText(t)), []);
  useEffect(() => save(text), [text]);
  useEffect(() => saveLayout(layout), [layout]);

  const share = async () => {
    const url = await shareUrl(text);
    history.replaceState(null, '', url);
    await navigator.clipboard?.writeText(url).catch(() => {});
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const open = async () => {
    const r = await openFile().catch((e: unknown) => (setNote(e instanceof Error ? e.message : String(e)), undefined));
    if (!r) return;
    const t = toEditorText(r.file.name, r.content, registry);
    if (t.text === undefined) return setNote(`Could not read ${r.file.name}: ${t.diagnostics[0]?.message ?? 'not a diagram'}`);
    setText(t.text);
    setFile(r.file);
    setSaved(t.converted ? undefined : t.text);
    setNote(t.converted ? `Converted ${r.file.name} to JSON` : undefined);
  };

  const saveTo = async (saveAs: boolean) => {
    const f = await saveFile(text, file, saveAs).catch((e: unknown) => (setNote(e instanceof Error ? e.message : String(e)), undefined));
    if (!f) return;
    setFile(f);
    setSaved(text);
    setNote(`Saved ${f.name}`);
  };

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 's' && k !== 'o') return;
      e.preventDefault();
      void (k === 's' ? saveTo(e.shiftKey) : open());
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
        {...(file && { fileName: file.name })}
        dirty={saved !== undefined ? saved !== text : file !== undefined}
        onOpen={() => void open()}
        onSave={(as) => void saveTo(as)}
        onExample={(i) => (setText(pretty(examples[i]!.source)), setFile(undefined), setSaved(undefined), setNote(undefined))}
        layout={layout}
        onToggle={(p) => setLayout((l) => toggle(l, p))}
        status={pending ? { state: 'pending', text: 'Updating…' } : errors ? { state: 'error', text: `${errors} error${errors > 1 ? 's' : ''}` } : { state: 'ok', text: 'Valid' }}
        shared={shared}
        onShare={() => void share()}
        canExport={Boolean(ready)}
        onSvg={() => downloadSvg(d.svg!, d.title)}
        onPng={() => void downloadPng(d.svg!, d.title)}
      />
      <Panes
        layout={layout}
        onLayout={setLayout}
        panes={{
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
                {...(note && { note })}
              />
            ),
          },
          diagram: {
            label: PANE_LABELS.diagram,
            body: (
              <div className="frame">
                <div className="pane__header cluster">
                  <span className="pane__title">Diagram</span>
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
