import { json } from '@codemirror/lang-json';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import type { Diagnostic } from '@jtd/core';
import { basicSetup, EditorView } from 'codemirror';
import { useEffect, useRef } from 'react';
import { locate } from './locate.ts';

interface Props {
  value: string;
  onChange(text: string): void;
  diagnostics: readonly Diagnostic[];
  /** Text the diagnostics were computed for; stale diagnostics are not shown. */
  source: string;
}

/** CodeMirror JSON editor with inline diagnostics (URS-WEB-001, URS-WEB-004). */
export function Editor({ value, onChange, diagnostics, source }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [basicSetup, json(), lintGutter(), EditorView.updateListener.of((u) => u.docChanged && change.current(u.state.doc.toString()))],
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

  return <div className="editor" ref={host} />;
}
