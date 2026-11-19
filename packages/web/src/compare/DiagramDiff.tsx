import { diffIR, parseJson, parseSource, render, type ChangeType, type IrChange, type SourceFormat } from '@jtd/core';
import { useMemo, useRef, useState } from 'react';
import { locate } from '../editor/locate.ts';
import { Preview, type View } from '../preview/Preview.tsx';
import { registry } from '../registry.ts';

function draw(text: string, format: SourceFormat) {
  const parsed = format === 'json' ? parseJson(text) : parseSource(text, format, registry);
  return parsed.value === undefined ? { diagnostics: parsed.diagnostics } : render(parsed.value, registry);
}

/** Line of the element a source pointer names, for JSON sources. */
const lineOf = (text: string, path: string | undefined, format: SourceFormat) =>
  path === undefined || format !== 'json' ? undefined : text.slice(0, locate(text, { code: 'pick', path }).from).split('\n').length;

const LABELS: Record<ChangeType, string> = { added: 'added', removed: 'removed', changed: 'changed' };

/**
 * Two versions of a diagram (URS-WS-035, D-008): each drawn as it really lays out, side by side, with removed
 * elements red in the earlier, added green in the later and changed amber in both; pan and zoom move together.
 * The changes are listed in words; choosing one outlines it in both drawings.
 */
export function DiagramDiff({ a, b, formatA, formatB }: { a: string; b: string; formatA: SourceFormat; formatB: SourceFormat }) {
  const ra = useMemo(() => draw(a, formatA), [a, formatA]);
  const rb = useMemo(() => draw(b, formatB), [b, formatB]);
  const d = useMemo(() => (ra.ir && rb.ir ? diffIR(ra.ir, rb.ir) : undefined), [ra, rb]);
  const [view, setView] = useState<View>();
  // Each drawing's fit; both show at the smaller scale, so neither is cut off.
  const fits = useRef<{ a?: View; b?: View }>({});
  const fitted = (side: 'a' | 'b') => (v: View) => {
    fits.current[side] = v;
    const all = [fits.current.a, fits.current.b].filter((x) => x !== undefined);
    setView(all.reduce((m, x) => (x.scale < m.scale ? x : m)));
  };
  const [chosen, setChosen] = useState<IrChange>();
  const pick = d?.changes.includes(chosen!) ? chosen : undefined;

  if (!d || ra.svg === undefined || rb.svg === undefined) {
    const side = !ra.ir ? 'Before' : 'After';
    const errors = (!ra.ir ? ra : rb).diagnostics.filter((x) => x.severity === 'error').length;
    return (
      <p className="diff__note text-small">
        {side} does not draw ({errors} error{errors === 1 ? '' : 's'}). The Text view still compares it.
      </p>
    );
  }
  const count = (t: ChangeType) => d.changes.filter((c) => c.type === t).length;
  return (
    <div className="diff">
      <div className="diff__bar cluster text-small">
        <span className="diff__count" data-kind="ins">{count('added')} added</span>
        <span className="diff__count" data-kind="del">{count('removed')} removed</span>
        <span className="diff__count" data-kind="change">{count('changed')} changed</span>
        <span className="text-muted push-right">Pan and zoom move both drawings</span>
      </div>
      <div className="diff__drawings">
        <Preview label="Before" svg={ra.svg} current marks={d.marksA} view={view} onView={setView} onFit={fitted('a')} {...(pick?.a !== undefined && { selected: { kind: pick.kind, id: pick.a } })} />
        <Preview label="After" svg={rb.svg} current marks={d.marksB} view={view} onView={setView} onFit={fitted('b')} {...(pick?.b !== undefined && { selected: { kind: pick.kind, id: pick.b } })} />
      </div>
      {d.changes.length === 0 ? (
        <p className="diff__note text-muted text-small">No differences in the drawing.</p>
      ) : (
        <ol className="diff__changes" aria-label="Changes">
          {d.changes.map((c, i) => {
            const line = lineOf(c.type === 'removed' ? a : b, c.type === 'removed' ? c.srcA : c.srcB, c.type === 'removed' ? formatA : formatB);
            return (
              <li key={i}>
                <button type="button" className="diff__change" data-type={c.type} aria-pressed={c === pick} onClick={() => setChosen(c === pick ? undefined : c)}>
                  <span className="diff__badge">{LABELS[c.type]}</span>
                  <span>{c.text}</span>
                  {line !== undefined && (
                    <span className="text-muted push-right">
                      {c.type === 'removed' ? 'was ' : ''}line {line}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
