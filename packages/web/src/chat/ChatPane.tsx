import { useEffect, useRef, useState } from 'react';
import { pretty } from '../registry.ts';
import { Plus, Sparkle } from '../ui/icons.tsx';
import { aiAvailable, generateDiagram, refineDiagram, type Generated, type Progress } from './api.ts';
import { Composer, type Mode } from './Composer.tsx';
import { describe, loadChat, newId, saveChat, stepBack, update, type Message } from './history.ts';
import { MessageView } from './MessageView.tsx';
import { stageText } from './progress.ts';

const SUGGEST: Record<Mode, string[]> = {
  edit: ['Add an approval step after review', 'Split the workflows into role lanes', 'Give each owner its own colour'],
  new: ['Expense claims: the employee submits receipts, the manager approves, finance pays within five days.'],
};

interface Props {
  /** Editor text now. */
  text: string;
  /** The editor text parsed, when it parses; editing works on it. */
  value?: unknown;
  /** Replace the editor text. */
  onSource(text: string): void;
}

/** Chat with the AI about the diagram (URS-WEB-016): create from notes and documents, or ask for changes; every change can be stepped back (URS-WEB-017). */
export function ChatPane({ text, value, onSource }: Props) {
  const [available, setAvailable] = useState<boolean>();
  const [messages, setMessages] = useState<Message[]>(loadChat);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<Mode>('edit');
  const [type, setType] = useState('auto');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  // Read at the end of a job: the editor may have changed while the AI worked.
  const latest = useRef(text);
  latest.current = text;
  const canEdit = value !== undefined;

  useEffect(() => {
    void aiAvailable().then(setAvailable);
    return () => abort.current?.abort();
  }, []);
  useEffect(() => saveChat(messages), [messages]);
  useEffect(() => {
    // Braced: scrollIntoView returns a promise in some browsers, which must not become the cleanup.
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

  const send = async () => {
    const editing = mode === 'edit' && canEdit && !files.length;
    const user: Message = { id: newId(), role: 'user', text: draft.trim(), ...(files.length && { files: files.map((f) => f.name) }) };
    const reply = newId();
    setMessages((ms) => [...ms, user, { id: reply, role: 'assistant', tone: 'working', text: 'Starting…' }]);
    const [instruction, attached] = [draft.trim(), files];
    setDraft('');
    setFiles([]);
    setBusy(true);
    const ac = (abort.current = new AbortController());
    const progress = (p: Progress) => setMessages((ms) => update(ms, reply, { text: stageText(p) }));
    try {
      const g: Generated = editing ? await refineDiagram(value, instruction, ac.signal, progress) : await generateDiagram({ text: instruction, files: attached, type }, ac.signal, progress);
      const before = latest.current;
      if (g.source) onSource(pretty(g.source));
      setMessages((ms) => update(ms, reply, { ...describe(g, editing ? 'refine' : 'generate'), ...(g.source ? { before } : {}) }));
      if (!editing && g.source) setMode('edit');
    } catch (e) {
      setMessages((ms) => update(ms, reply, ac.signal.aborted ? { tone: 'done', text: 'Stopped.' } : { tone: 'error', text: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const back = (before: string) => {
    setMessages((ms) => [...ms, stepBack(before, latest.current)]);
    onSource(before);
  };

  if (available === false)
    return (
      <p className="notice" role="note">
        AI generation is not configured on this server. Set <code>ANTHROPIC_API_KEY</code> where the server runs to turn it on.
      </p>
    );

  const editing = mode === 'edit' && canEdit;
  return (
    <div className="chat frame">
      <div className="pane__header cluster">
        <span className="pane__title">Assistant</span>
        <button type="button" className="btn push-right" data-variant="ghost" disabled={busy || !messages.length} onClick={() => setMessages([])}>
          <Plus /> New chat
        </button>
      </div>
      <div className="chat__log frame__body" role="log" aria-label="Conversation" aria-live="polite">
        <div className="stack measure">
          {messages.length === 0 ? (
            <div className="chat__welcome stack">
              <span className="chat__mark">
                <Sparkle />
              </span>
              <h2>{editing ? 'What should change?' : 'What shall we diagram?'}</h2>
              <p className="text-muted">{editing ? 'Ask for any change to the diagram in the editor.' : 'Paste notes or a procedure, or attach documents.'}</p>
              <div className="chat__suggestions cluster">
                {SUGGEST[editing ? 'edit' : 'new'].map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => setDraft(s)}>
                    {s.length > 48 ? `${s.slice(0, 46)}…` : s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageView key={m.id} message={m} busy={busy} onStepBack={back} />)
          )}
          <div ref={end} />
        </div>
      </div>
      <Composer
        text={draft}
        onText={setDraft}
        files={files}
        onFiles={setFiles}
        mode={mode}
        canEdit={canEdit}
        onMode={setMode}
        type={type}
        onType={setType}
        busy={busy}
        disabled={!available}
        onSend={() => void send()}
        onStop={() => abort.current?.abort()}
      />
    </div>
  );
}
