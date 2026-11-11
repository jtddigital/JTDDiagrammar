import { json, jsonLanguage } from '@codemirror/lang-json';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import type { Diagnostic } from '@jtd/core';
import { basicSetup, EditorView } from 'codemirror';
import { useEffect, useRef } from 'react';
import { registry } from '../registry.ts';
import { schemaCompletion } from './complete.ts';
import { locate, type Range } from './locate.ts';

interface Props {
  value: string;
  onChange(text: string): void;
  diagnostics: readonly Diagnostic[];
  /** Text the diagnostics were computed for; stale diagnostics are not shown. */
  source: string;
  /** Select and scroll to this range; a new object re-reveals the same range (URS-WEB-009). */
  reveal?: Range;
}

/** CodeMirror JSON editor with inline diagnostics (URS-WEB-001, URS-WEB-004) and schema completion (URS-WEB-005). */
export function Editor({ value, onChange, diagnostics, source, reveal }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [basicSetup, json(), jsonLanguage.data.of({ autocomplete: schemaCompletion(registry) }), lintGutter(), EditorView.updateListener.of((u) => u.docChanged && change.current(u.state.doc.toString()))],
    });
    view.current = v;
    return () => v.destroy();
    // Created once; later `value` changes go through the effect below.
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() !== source) return;
    v.dispatch(setDiagnostics(v.state, diagnostics.map((d) => ({ ...locate(source, d), severity: d.severity, message: `${d.message} [${d.code}]` }))));
  }, [diagnostics, source]);

  useEffect(() => {
    const v = view.current;
    if (!v || !reveal) return;
    v.dispatch({ selection: { anchor: reveal.from, head: reveal.to }, scrollIntoView: true });
    v.focus();
  }, [reveal]);

  return <div className="editor" ref={host} />;
}
