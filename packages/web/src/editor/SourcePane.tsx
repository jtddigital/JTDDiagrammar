import type { Diagnostic } from '@jtd/core';
import { Editor } from './Editor.tsx';
import { locate, type Range } from './locate.ts';

interface Props {
  text: string;
  onText(t: string): void;
  diagnostics: readonly Diagnostic[];
  source: string;
  reveal?: Range;
  onReveal(r: Range): void;
  onCursor(offset: number): void;
  /** A line about the last file operation, e.g. a conversion. */
  note?: string;
}

/** JSON editor and its problems; clicking a problem jumps to it (URS-WEB-018). */
export function SourcePane({ text, onText, diagnostics, source, reveal, onReveal, onCursor, note }: Props) {
  return (
    <div className="frame">
      <div className="pane__header cluster">
        <span className="pane__title">Source</span>
        {note && <span className="text-muted text-small push-right">{note}</span>}
      </div>
      <Editor value={text} onChange={onText} diagnostics={diagnostics} source={source} onCursor={onCursor} {...(reveal && { reveal })} />
      <ul className="diagnostics" aria-label="Diagnostics">
        {diagnostics.map((x, i) => (
          <li key={i}>
            <button type="button" className="diagnostic" data-severity={x.severity} title="Go to this problem" onClick={() => onReveal(locate(source, x))}>
              <span>
                <code>{x.path || '/'}</code> {x.message}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
