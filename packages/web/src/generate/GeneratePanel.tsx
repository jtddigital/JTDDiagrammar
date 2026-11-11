import { useEffect, useRef, useState } from 'react';
import { registry } from '../registry.ts';
import { aiAvailable, generateDiagram, type Generated } from './api.ts';

const ACCEPT = '.pdf,.docx,.html,.htm,.txt,.md,.markdown';

const summary = (g: Generated) =>
  g.valid
    ? `Generated a ${g.type} in ${g.attempts} attempt${g.attempts > 1 ? 's' : ''}.${g.reason ? ` ${g.reason}.` : ''}`
    : `Generated a ${g.type} with ${g.diagnostics.length} problem${g.diagnostics.length > 1 ? 's' : ''} left after ${g.attempts} attempts. Fix them in the editor.`;

/** Text and documents in, diagram source out, loaded into the editor (URS-WEB-011, URS-WEB-012). */
export function GeneratePanel({ onSource }: { onSource(source: unknown): void }) {
  const [available, setAvailable] = useState<boolean>();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [type, setType] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string }>();
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void aiAvailable().then(setAvailable);
    return () => abort.current?.abort();
  }, []);

  async function run() {
    const ac = (abort.current = new AbortController());
    setBusy(true);
    setMessage({ kind: 'info', text: 'Generating… this can take a minute.' });
    try {
      const g = await generateDiagram({ text, files, type }, ac.signal);
      if (g.source) onSource(g.source);
      setMessage({ kind: g.valid ? 'info' : 'error', text: summary(g) });
    } catch (e) {
      setMessage(ac.signal.aborted ? { kind: 'info', text: 'Cancelled.' } : { kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (available === false) return <section className="generate"><p className="note">AI generation is not configured on this server.</p></section>;

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
        {busy ? (
          <button type="button" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        ) : (
          <button type="button" disabled={!available || (!text.trim() && !files.length)} onClick={() => void run()}>
            Generate
          </button>
        )}
      </div>
      {message && (
        <p className={`note ${message.kind}`} aria-live="polite">
          {message.text}
        </p>
      )}
    </section>
  );
}
