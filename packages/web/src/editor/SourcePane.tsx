import type { ReactNode } from 'react';
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
  /** The open file's path, as the pane's title. */
  title?: string;
  language?: 'json' | 'plain';
  readOnly?: boolean;
  /** A line above the editor, e.g. which version is shown and how to get back. */
  banner?: ReactNode;
}

/** JSON editor and its problems; clicking a problem jumps to it (URS-WEB-018). */
export function SourcePane({ text, onText, diagnostics, source, reveal, onReveal, onCursor, note, title, language, readOnly, banner }: Props) {
  return (
    <div className="frame">
      <div className="pane__header cluster">
        <span className="pane__title">Source</span>
        {title && <span className="text-muted text-small" title={title}>{title}</span>}
        {note && <span className="text-muted text-small push-right">{note}</span>}
      </div>
      {banner && <div className="source__banner cluster text-small">{banner}</div>}
      <Editor readOnly={readOnly ?? false} value={text} onChange={onText} diagnostics={diagnostics} source={source} onCursor={onCursor} {...(reveal && { reveal })} {...(language && { language })} />
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
