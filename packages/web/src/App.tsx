import { useEffect, useState } from 'react';
import { downloadPng, downloadSvg } from './download.ts';
import { Editor } from './editor/Editor.tsx';
import { locate, type Range } from './editor/locate.ts';
import { GeneratePanel } from './generate/GeneratePanel.tsx';
import { restore, save, shareUrl } from './persist.ts';
import { pointerOf } from './pick.ts';
import { Preview } from './preview/Preview.tsx';
import { examples, pretty } from './registry.ts';
import { useDiagram } from './useDiagram.ts';

export function App() {
  const [text, setText] = useState(() => pretty(examples[0]!.source));
  const [generating, setGenerating] = useState(false);
  const [reveal, setReveal] = useState<Range>();
  const [shared, setShared] = useState(false);
  const d = useDiagram(text);
  const errors = d.diagnostics.filter((x) => x.severity === 'error').length;
  // The render lags the editor by the debounce; never show or export a stale result as current.
  const pending = d.source !== text;
  const ready = !pending && d.current;

  useEffect(() => void restore().then((t) => t !== undefined && setText(t)), []);
  useEffect(() => save(text), [text]);

  const share = async () => {
    const url = await shareUrl(text);
    history.replaceState(null, '', url);
    await navigator.clipboard?.writeText(url).catch(() => {});
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const pick = (kind: string, id: string) => {
    const path = ready && d.ir ? pointerOf(d.ir, kind, id) : undefined;
    if (path !== undefined) setReveal(locate(text, { code: 'pick', path }));
  };

  return (
    <div className="app">
      <header>
        <h1>JTDDiagrammar</h1>
        <select aria-label="Example" defaultValue="" onChange={(e) => setText(pretty(examples[Number(e.target.value)]!.source))}>
          <option value="" disabled>
            Load example…
          </option>
          {examples.map((ex, i) => (
            <option key={i} value={i}>
              {ex.type}: {ex.title}
            </option>
          ))}
        </select>
        <button type="button" aria-expanded={generating} onClick={() => setGenerating(!generating)}>
          Generate with AI
        </button>
        <span className={errors && !pending ? 'status error' : 'status'} role="status">
          {pending ? 'Updating…' : errors ? `${errors} error${errors > 1 ? 's' : ''}` : 'Valid'}
        </span>
        <button type="button" onClick={() => void share()}>
          {shared ? 'Link copied' : 'Share link'}
        </button>
        <button type="button" disabled={!ready} onClick={() => downloadSvg(d.svg!, d.title)}>
          Export SVG
        </button>
        <button type="button" disabled={!ready} onClick={() => void downloadPng(d.svg!, d.title)}>
          Export PNG
        </button>
      </header>
      {generating && <GeneratePanel {...(!pending && d.value !== undefined && { current: d.value })} onSource={(source) => setText(pretty(source))} />}
      <main>
        <section className="source">
          <Editor value={text} onChange={setText} diagnostics={d.diagnostics} source={d.source} {...(reveal && { reveal })} />
          <ul className="diagnostics" aria-label="Diagnostics">
            {d.diagnostics.map((x, i) => (
              <li key={i} className={x.severity}>
                <code>{x.path || '/'}</code> {x.message}
              </li>
            ))}
          </ul>
        </section>
        <Preview {...(d.svg !== undefined && { svg: d.svg })} current={d.current} onPick={pick} />
      </main>
    </div>
  );
}
