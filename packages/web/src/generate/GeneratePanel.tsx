import { useEffect, useRef, useState } from 'react';
import { registry } from '../registry.ts';
import { aiAvailable, generateDiagram, refineDiagram, type Generated, type Progress } from './api.ts';
import { stageText } from './progress.ts';

const ACCEPT = '.pdf,.docx,.html,.htm,.txt,.md,.markdown,.png,.jpg,.jpeg,.gif,.webp';

const summary = (g: Generated, verb: string) =>
  g.valid
    ? `${verb} a ${g.type} in ${g.attempts} attempt${g.attempts > 1 ? 's' : ''}.${g.reason ? ` ${g.reason}.` : ''}`
    : `${verb} a ${g.type} with ${g.diagnostics.length} problem${g.diagnostics.length > 1 ? 's' : ''} left after ${g.attempts} attempts. Fix them in the editor.`;

interface Props {
  /** The editor's parsed source, when it parses; refine works on it. */
  current?: unknown;
  onSource(source: unknown): void;
}

/** Text and documents in, diagram source out (URS-WEB-011); staged progress and cancel (URS-WEB-012); refine (URS-WEB-013). */
export function GeneratePanel({ current, onSource }: Props) {
  const [available, setAvailable] = useState<boolean>();
  const [text, setText] = useState('');
  const [instruction, setInstruction] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [type, setType] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string }>();
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void aiAvailable().then(setAvailable);
    return () => abort.current?.abort();
  }, []);

  async function run(verb: string, job: (signal: AbortSignal, onProgress: (p: Progress) => void) => Promise<Generated>) {
    const ac = (abort.current = new AbortController());
    setBusy(true);
    setMessage({ kind: 'info', text: 'Starting… this can take a minute.' });
    try {
      const g = await job(ac.signal, (p) => setMessage({ kind: 'info', text: stageText(p) }));
      if (g.source) onSource(g.source);
      setMessage({ kind: g.valid ? 'info' : 'error', text: summary(g, verb) });
    } catch (e) {
      setMessage(ac.signal.aborted ? { kind: 'info', text: 'Cancelled.' } : { kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (available === false) return <section className="generate"><p className="note">AI generation is not configured on this server.</p></section>;

  const cancel = (
    <button type="button" onClick={() => abort.current?.abort()}>
      Cancel
    </button>
  );
  return (
    <section className="generate" aria-label="Generate with AI">
      <textarea aria-label="Material" placeholder="Paste a process description, meeting notes, a procedure…" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      <div className="row">
        <input aria-label="Documents" type="file" multiple accept={ACCEPT} onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        <select aria-label="Diagram type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="auto">Auto-detect type</option>
          {registry.types().map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        {busy ? cancel : (
          <button type="button" disabled={!available || (!text.trim() && !files.length)} onClick={() => void run('Generated', (s, p) => generateDiagram({ text, files, type }, s, p))}>
            Generate
          </button>
        )}
      </div>
      <div className="row">
        <input aria-label="Instruction" placeholder="Refine the current diagram, e.g. “add an approval step after review”" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
        <button type="button" disabled={busy || !available || !instruction.trim() || current === undefined} onClick={() => void run('Refined', (s, p) => refineDiagram(current, instruction, s, p))}>
          Refine
        </button>
      </div>
      {message && (
        <p className={`note ${message.kind}`} aria-live="polite">
          {message.text}
        </p>
      )}
    </section>
  );
}
