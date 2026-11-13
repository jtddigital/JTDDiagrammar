import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { registry } from '../registry.ts';
import { ArrowUp, Close, Paperclip, Stop } from '../ui/icons.tsx';

const ACCEPT =
  '.pdf,.docx,.html,.htm,.txt,.md,.markdown,.png,.jpg,.jpeg,.gif,.webp';

export type Mode = 'edit' | 'new';

interface Props {
  text: string;
  onText(t: string): void;
  files: File[];
  onFiles(f: File[]): void;
  mode: Mode;
  /** Edit needs a diagram that parses. */
  canEdit: boolean;
  onMode(m: Mode): void;
  type: string;
  onType(t: string): void;
  busy: boolean;
  disabled: boolean;
  onSend(): void;
  onStop(): void;
  /** Extra controls in the bar, e.g. the AI provider. */
  extra?: ReactNode;
}

/** Message box with attachments, mode and type (URS-WEB-016). Enter sends; Shift+Enter starts a new line. */
export function Composer(p: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const editing = p.mode === 'edit' && p.canEdit && !p.files.length;
  const ready =
    !p.disabled && !p.busy && (p.text.trim() !== '' || p.files.length > 0);

  // Grow with the text, up to the CSS max-height.
  useLayoutEffect(() => {
    const el = input.current!;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [p.text]);

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) p.onSend();
      }}
    >
      <div className="composer__box stack measure">
        {p.files.length > 0 && (
          <div className="composer__files cluster" aria-label="Attachments">
            {p.files.map((f, i) => (
              <span key={i} className="chip">
                {f.name}
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 20, height: 20 }}
                  aria-label={`Remove ${f.name}`}
                  onClick={() => p.onFiles(p.files.filter((_, j) => j !== i))}
                >
                  <Close />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={input}
          className="composer__input"
          aria-label="Message"
          rows={2}
          placeholder={
            editing
              ? 'Ask for a change, e.g. “split the workflows into role lanes”'
              : 'Paste notes or a procedure, or attach documents, to create a diagram'
          }
          value={p.text}
          disabled={p.disabled}
          onChange={(e) => p.onText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (ready) p.onSend();
            }
          }}
        />
        <div className="composer__bar">
          <div className="composer__tools cluster">
            <input
              ref={picker}
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              aria-label="Documents"
              onChange={(e) => (
                p.onFiles([...p.files, ...(e.target.files ?? [])]),
                (e.target.value = '')
              )}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Attach documents"
              title="Attach documents"
              disabled={p.disabled}
              onClick={() => picker.current?.click()}
            >
              <Paperclip />
            </button>
            <div className="segmented" role="group" aria-label="Mode">
              <button
                type="button"
                className="btn"
                aria-pressed={editing}
                disabled={!p.canEdit || p.files.length > 0}
                onClick={() => p.onMode('edit')}
              >
                Edit diagram
              </button>
              <button
                type="button"
                className="btn"
                aria-pressed={!editing}
                onClick={() => p.onMode('new')}
              >
                New diagram
              </button>
            </div>
            {!editing && (
              <select
                className="select"
                aria-label="Diagram type"
                value={p.type}
                onChange={(e) => p.onType(e.target.value)}
              >
                <option value="auto">Any type</option>
                {registry.types().map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="composer__actions cluster">
            {p.extra}
            {p.busy ? (
              <button
                type="button"
                className="icon-btn send"
                aria-label="Stop"
                title="Stop"
                onClick={p.onStop}
              >
                <Stop />
              </button>
            ) : (
              <button
                type="submit"
                className="icon-btn send"
                aria-label="Send"
                title="Send (Enter)"
                disabled={!ready}
              >
                <ArrowUp />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="composer__note measure">
        AI can make mistakes. Every change can be stepped back.
      </p>
    </form>
  );
}
