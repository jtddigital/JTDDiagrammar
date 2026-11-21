import type { EditAssets, GraphIR } from '@jtd/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { pointerOf } from '../pick.ts';
import type { Ref } from '../preview/interact.ts';
import type { Point, PreviewProps } from '../preview/Preview.tsx';
import { registry } from '../registry.ts';
import { DetailsPane } from './DetailsPane.tsx';
import { draft, join, place, type Draft, type End } from './drafts.ts';
import { Drafts } from './Drafts.tsx';
import { ADD_TYPE, EditBar } from './EditBar.tsx';
import { setAt } from './source.ts';

interface Options {
  text: string;
  setText(t: string): void;
  /** The source, parsed, when it is a diagram that parses. */
  value: unknown;
  ir: GraphIR | undefined;
  /** The source changed and is not drawn yet: the last diagram stands in, so fields keep their focus. */
  updating?: boolean;
  /** Select a place in the source, in the text given (it may be newer than the editor's). */
  reveal(pointer: string, text: string): void;
  detailsShown: boolean;
  toggleDetails(show?: boolean): void;
}

/** What the drawing needs for editing on it; spread onto `Preview`. */
export type PreviewEditing = Pick<PreviewProps, 'mode' | 'drag' | 'overlay' | 'onClickAt' | 'dropType' | 'onDropData'>;

export interface Edit {
  /** The element last clicked in the diagram. */
  picked: Ref | undefined;
  /** A click in the diagram; true when it was used here (connecting, or a draft), so nothing else should happen. */
  pick(kind: string, id: string): boolean;
  /** Props for the drawing: dragging, drafts, placing. */
  preview: PreviewEditing;
  bar: ReactNode;
  pane: ReactNode;
}

/** Drawn kinds that can be dragged and connected: nodes and drafts. */
const KINDS = ['n', 'draft'] as const;
/** Drawn kinds a draft can be dropped in, taking them as its placement (URS-WEB-031). */
const BANDS = ['l', 'p', 'lg', 'pg'];

/**
 * Direct editing (URS-WEB-025, WEB-026, WEB-030, WEB-031): the one wiring point of the experiment (D-009). The
 * app passes the source and diagram in, places `bar` over the drawing, spreads `preview` onto it and puts `pane`
 * in the Details pane.
 */
export function useEdit({ text, setText, value: now, ir: drawn, updating, reveal, detailsShown, toggleDetails }: Options): Edit {
  const last = useRef({ value: now, ir: drawn });
  if (now !== undefined) last.current = { value: now, ir: drawn };
  const { value, ir } = now === undefined && updating ? last.current : { value: now, ir: drawn };
  const [picked, setPicked] = useState<Ref>();
  const [from, setFrom] = useState<End>();
  // What was just written, by its place in the source: selected once the diagram draws it.
  const [pending, setPending] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [placing, setPlacing] = useState<string>();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [chosen, setChosen] = useState<string>();
  const [status, setStatus] = useState<string>();
  const type = typeof (value as { type?: unknown } | undefined)?.type === 'string' ? registry.type((value as { type: string }).type) : undefined;
  const edit = type?.edit as EditAssets<never> | undefined;
  const addable = edit && value !== undefined ? edit.add.filter((a) => !a.available || a.available(value as never)) : [];
  const doc = { text, value };

  useEffect(() => {
    if (pending === undefined || !ir) return;
    const n = ir.nodes.find((x) => x.src === pending) ?? ir.nodes.find((x) => x.src?.startsWith(`${pending}/`));
    if (n) {
      setPicked({ kind: 'n', id: n.id });
      setPending(undefined);
    }
  }, [ir, pending]);

  // Drafts belong to the diagram they were made on.
  useEffect(() => {
    setDrafts([]);
    setChosen(undefined);
    setPlacing(undefined);
  }, [type?.id]);

  const reset = () => {
    setConnecting(false);
    setFrom(undefined);
    setPlacing(undefined);
    setStatus(undefined);
  };

  const pointer = (e: End) => (ir ? pointerOf(ir, e.kind, e.id) : undefined);
  const drop = (keys: readonly string[]) => {
    setDrafts((ds) => ds.filter((d) => !keys.includes(d.key)));
    setChosen((c) => (c && keys.includes(c) ? undefined : c));
  };

  /** Connect two ends, writing drafts among them first (URS-WEB-030). */
  const connect = (a: End, b: End) => {
    if (!edit || value === undefined) return;
    const out = join(edit, doc, drafts, pointer, a, b);
    if ('refused' in out) return setStatus(out.refused);
    setText(out.text);
    drop(out.used);
    if (out.placed !== undefined) setPending(out.placed);
    reveal(out.at, out.text);
    setStatus(undefined);
  };

  /** Put a draft in the source, where the layout places it (URS-WEB-031). */
  const applyDraft = (key: string) => {
    const d = drafts.find((x) => x.key === key);
    const out = d && edit ? place(edit, doc, d) : undefined;
    if (!out) return setStatus(`${d?.label ?? 'That shape'} can no longer be added`);
    setText(out.doc.text);
    drop([key]);
    setPicked(undefined);
    setPending(out.at);
    reveal(out.at, out.doc.text);
    setStatus(undefined);
  };

  /** Source pointers of the bands (lanes, phases, columns) among the elements under a point. */
  const bandsIn = (under: readonly Ref[]) => (ir ? under.filter((r) => BANDS.includes(r.kind)).flatMap((r) => pointerOf(ir, r.kind, r.id) ?? []) : []);

  const newDraft = (label: string, at: Point, under: readonly Ref[]) => {
    const d = draft(doc, drafts, label, at, bandsIn(under));
    setDrafts((ds) => [...ds, d]);
    setChosen(d.key);
    setPlacing(undefined);
    setStatus('Drag it onto a shape to connect them, or Apply it; Delete discards it');
  };

  // Escape leaves connect and place modes; Enter applies the chosen draft, Delete discards it.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const t = e.target as Element | null;
      const typing = t?.closest?.('input, textarea, select, [contenteditable="true"], .cm-editor');
      if (e.key === 'Escape' && (connecting || placing)) return reset();
      if (typing || !chosen) return;
      if (e.key === 'Enter') applyDraft(chosen);
      else if (e.key === 'Delete' || e.key === 'Backspace') drop([chosen]);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });

  const pick = (kind: string, id: string): boolean => {
    if (kind === 'draft') {
      setChosen(id);
      setPicked(undefined);
    } else {
      setChosen(undefined);
      setPicked({ kind, id });
    }
    if (!connecting) return kind === 'draft';
    if (kind !== 'n' && kind !== 'draft') {
      setStatus('Connections join shapes: click a shape');
      return true;
    }
    if (!from) {
      setFrom({ kind, id });
      setStatus('Now click the shape to connect to');
      return true;
    }
    reset();
    connect(from, { kind, id });
    return true;
  };

  const remove = () => {
    if (chosen) return drop([chosen]);
    const at = picked && ir ? pointerOf(ir, picked.kind, picked.id) : undefined;
    if (at === undefined || at === '') return;
    setText(setAt(text, at, undefined));
    setPicked(undefined);
  };

  const canConnect = Boolean(edit?.connect && value !== undefined);
  const canDelete = Boolean(chosen || (picked && ir && pointerOf(ir, picked.kind, picked.id)));
  return {
    picked,
    pick,
    preview: {
      mode: connecting ? 'connect' : placing ? 'place' : undefined,
      drag: canConnect || drafts.length
        ? {
            kinds: KINDS,
            onDrop: (a, b, by, under) => {
              if (b) return connect(a, b);
              if (a.kind === 'draft') return setDrafts((ds) => ds.map((d) => (d.key === a.id ? { ...d, x: d.x + by.x, y: d.y + by.y, bands: bandsIn(under) } : d)));
              setStatus('Drop it on another shape to connect them; the layout places shapes');
            },
          }
        : undefined,
      overlay: edit && drafts.length > 0 && <Drafts edit={edit} doc={doc} drafts={drafts} selected={chosen} onApply={applyDraft} onDiscard={(k) => drop([k])} />,
      onClickAt: (at, under) => {
        if (placing) {
          newDraft(placing, at, under);
          return true;
        }
        if (!under.some((r) => r.kind === 'draft')) setChosen(undefined);
        return false;
      },
      dropType: ADD_TYPE,
      onDropData: (label, at, under) => addable.some((a) => a.label === label) && newDraft(label, at, under),
    },
    bar: (
      <EditBar
        addable={addable.map((a) => a.label)}
        placing={placing}
        onAdd={(label, now) => {
          if (!now) {
            setConnecting(false);
            setFrom(undefined);
            setPlacing((p) => (p === label ? undefined : label));
            setStatus(placing === label ? undefined : `Click where the ${label} goes (Escape cancels)`);
            return;
          }
          // From the keyboard: straight into the source.
          const d = draft(doc, drafts, label, { x: 0, y: 0 });
          const out = edit && place(edit, doc, d);
          if (!out) return;
          setText(out.doc.text);
          setPicked(undefined);
          setPending(out.at);
          reveal(out.at, out.doc.text);
        }}
        canConnect={canConnect}
        connecting={connecting}
        onConnect={() => {
          const on = !connecting;
          reset();
          setConnecting(on);
          if (on) setStatus('Click the shape to connect from');
        }}
        canDelete={canDelete}
        onDelete={remove}
        detailsShown={detailsShown}
        onDetails={() => toggleDetails()}
        {...(status && { status })}
      />
    ),
    pane: <DetailsPane ir={ir} value={value} text={text} picked={chosen ? undefined : picked} {...(chosen && { draft: drafts.find((d) => d.key === chosen)?.label })} onText={setText} />,
  };
}
