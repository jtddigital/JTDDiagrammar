import { useState } from 'react';
import { downloadSvg } from './download.ts';
import { Editor } from './editor/Editor.tsx';
import { Preview } from './preview/Preview.tsx';
import { examples, pretty } from './registry.ts';
import { useDiagram } from './useDiagram.ts';

export function App() {
  const [text, setText] = useState(() => pretty(examples[0]!.source));
  const d = useDiagram(text);
  const errors = d.diagnostics.filter((x) => x.severity === 'error').length;
  // The render lags the editor by the debounce; never show or export a stale result as current.
  const pending = d.source !== text;

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
        <span className={errors && !pending ? 'status error' : 'status'} role="status">
          {pending ? 'Updating…' : errors ? `${errors} error${errors > 1 ? 's' : ''}` : 'Valid'}
        </span>
        <button type="button" disabled={pending || !d.current} onClick={() => downloadSvg(d.svg!, d.title)}>
          Export SVG
        </button>
      </header>
      <main>
        <section className="source">
          <Editor value={text} onChange={setText} diagnostics={d.diagnostics} source={d.source} />
          <ul className="diagnostics" aria-label="Diagnostics">
            {d.diagnostics.map((x, i) => (
              <li key={i} className={x.severity}>
                <code>{x.path || '/'}</code> {x.message}
              </li>
            ))}
          </ul>
        </section>
        <Preview {...(d.svg !== undefined && { svg: d.svg })} current={d.current} />
      </main>
    </div>
  );
}
