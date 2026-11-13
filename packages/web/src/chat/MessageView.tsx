import { Sparkle, Undo } from '../ui/icons.tsx';
import type { Message } from './history.ts';

interface Props {
  message: Message;
  /** Restore the source from before this message's change (URS-WEB-017). */
  onStepBack(before: string): void;
  busy: boolean;
}

/** One chat message: the user's on the right, the assistant's as text beside its mark. */
export function MessageView({ message: m, onStepBack, busy }: Props) {
  if (m.role === 'user')
    return (
      <div className="msg msg--user">
        {m.text}
        {m.files?.length ? (
          <div className="msg__files cluster">
            {m.files.map((f, i) => (
              <span key={i} className="msg__file">
                {f}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  return (
    <div className="msg msg--assistant" data-tone={m.tone}>
      <span className="msg__avatar">
        <Sparkle />
      </span>
      <div>
        <p className="msg__text">{m.text}</p>
        {m.notes?.length ? (
          <ul className="msg__notes">
            {m.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}
        {m.before !== undefined && (
          <div className="msg__meta cluster">
            <button type="button" className="btn" data-variant="ghost" disabled={busy} onClick={() => onStepBack(m.before!)}>
              <Undo /> Step back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
