import type { GraphIR } from '@jtd/core';
import { useEffect, useState, type ReactNode } from 'react';
import { pointerOf } from '../pick.ts';
import type { Ref } from '../preview/interact.ts';
import { registry } from '../registry.ts';
import { DetailsPane } from './DetailsPane.tsx';
import { EditBar } from './EditBar.tsx';
import { apply, freshId, setAt } from './source.ts';

interface Options {
  text: string;
  setText(t: string): void;
  /** The source, parsed, when it is a diagram that parses. */
  value: unknown;
  ir: GraphIR | undefined;
  /** Select a place in the source, in the text given (it may be newer than the editor's). */
  reveal(pointer: string, text: string): void;
  detailsShown: boolean;
  toggleDetails(show?: boolean): void;
}

export interface Edit {
  /** The element last clicked in the diagram. */
  picked: Ref | undefined;
  /** A click in the diagram; true when it was used here (connecting), so nothing else should happen. */
  pick(kind: string, id: string): boolean;
  /** `connect` while choosing the two ends of a connection, for the drawing's cursor. */
  mode: 'connect' | undefined;
  bar: ReactNode;
  pane: ReactNode;
}

/**
 * Direct editing (URS-WEB-025, WEB-026): the one wiring point of the experiment (D-009). The app passes the
 * source and diagram in, and places `bar` over the drawing and `pane` in the Details pane.
 */
export function useEdit({ text, setText, value, ir, reveal, detailsShown, toggleDetails }: Options): Edit {
  const [picked, setPicked] = useState<Ref>();
  const [from, setFrom] = useState<{ id: string; src?: string }>();
  // What was just added, by its place in the source: selected once the diagram draws it.
  const [pending, setPending] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<string>();
  const type = typeof (value as { type?: unknown } | undefined)?.type === 'string' ? registry.type((value as { type: string }).type) : undefined;
  const edit = type?.edit;
  const addable = edit && value !== undefined ? edit.add.filter((a) => !a.available || a.available(value as never)) : [];

  useEffect(() => {
    if (pending === undefined || !ir) return;
    const n = ir.nodes.find((x) => x.src === pending);
    if (n) {
      setPicked({ kind: 'n', id: n.id });
      setPending(undefined);
    }
  }, [ir, pending]);

  // Escape leaves connect mode.
  useEffect(() => {
    if (!connecting) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setConnecting(false);
      setFrom(undefined);
      setStatus(undefined);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [connecting]);

  const pick = (kind: string, id: string): boolean => {
    setPicked({ kind, id });
    if (!connecting) return false;
    if (kind !== 'n') {
      setStatus('Connections join nodes: click a node');
      return true;
    }
    const src = ir ? pointerOf(ir, kind, id) : undefined;
    const end = { id, ...(src !== undefined && { src }) };
    if (!from) {
      setFrom(end);
      setStatus('Now click the node to connect to');
      return true;
    }
    const e = edit?.connect?.(value as never, from, end);
    setConnecting(false);
    setFrom(undefined);
    if (!e) {
      setStatus('Those two cannot be connected');
      return true;
    }
    const out = apply(text, value, e);
    setText(out.text);
    reveal(out.at, out.text);
    setStatus(undefined);
    return true;
  };

  const add = (i: number) => {
    const a = addable[i];
    if (!a) return;
    const id = freshId(value, a.label);
    const out = apply(text, value, a.make(id, value as never));
    setText(out.text);
    setPicked(undefined);
    setPending(out.at);
    reveal(out.at, out.text);
  };

  const remove = () => {
    const at = picked && ir ? pointerOf(ir, picked.kind, picked.id) : undefined;
    if (at === undefined || at === '') return;
    setText(setAt(text, at, undefined));
    setPicked(undefined);
  };

  const canDelete = Boolean(picked && ir && pointerOf(ir, picked.kind, picked.id));
  return {
    picked,
    pick,
    mode: connecting ? 'connect' : undefined,
    bar: (
      <EditBar
        addable={addable.map((a) => a.label)}
        onAdd={add}
        canConnect={Boolean(edit?.connect && value !== undefined)}
        connecting={connecting}
        onConnect={() => {
          setConnecting((c) => !c);
          setFrom(undefined);
          setStatus(connecting ? undefined : 'Click the node to connect from');
        }}
        canDelete={canDelete}
        onDelete={remove}
        detailsShown={detailsShown}
        onDetails={() => toggleDetails()}
        {...(status && { status })}
      />
    ),
    pane: <DetailsPane ir={ir} value={value} text={text} picked={picked} onText={setText} />,
  };
}
