import type { EditAssets } from '@jtd/core';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { look, type Doc, type Draft } from './drafts.ts';
import { box, ghost } from './ghost.ts';

interface Props {
  edit: EditAssets<never>;
  doc: Doc;
  drafts: readonly Draft[];
  selected: string | undefined;
  onApply(key: string): void;
  onDiscard(key: string): void;
}

/** Keeps a press on a draft's buttons from panning the drawing or selecting the draft. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Drafts drawn over the diagram where they were put (URS-WEB-031), dashed until they are in the source. Drag one
 * to move it, or onto a shape to connect them; Apply puts it in the source, where the layout places it.
 */
export function Drafts({ edit, doc, drafts, selected, onApply, onDiscard }: Props) {
  return (
    <>
      {drafts.map((d) => (
        <DraftView key={d.key} edit={edit} doc={doc} d={d} selected={selected === d.key} onApply={onApply} onDiscard={onDiscard} />
      ))}
    </>
  );
}

function DraftView({ edit, doc, d, selected, onApply, onDiscard }: { edit: EditAssets<never>; doc: Doc; d: Draft; selected: boolean; onApply(key: string): void; onDiscard(key: string): void }) {
  const shape = useMemo(() => look(edit, doc, d), [edit, doc.text, d.label, d.id]);
  const host = useRef<HTMLDivElement>(null);
  const [w, h] = shape ? [shape.w, shape.h] : [120, 48];
  useLayoutEffect(() => {
    host.current?.replaceChildren((shape && ghost(shape.svg, shape.id, d.key, w, h)) || box(d.key, d.label, w, h));
  }, [shape, d.key, d.label, w, h]);
  return (
    <div className="draft" role="group" aria-label={`${d.label} (not yet in the source)`} data-selected={selected || undefined} style={{ left: d.x - w / 2, top: d.y - h / 2, width: w }}>
      <div ref={host} className="draft__shape" style={{ height: h }} />
      <div className="draft__tools cluster" onPointerDown={stop} onPointerUp={stop} onDoubleClick={stop}>
        <button type="button" className="btn" data-size="small" title="Put it in the source; the layout places it" onClick={() => onApply(d.key)}>
          Apply
        </button>
        <button type="button" className="btn" data-variant="ghost" data-size="small" aria-label={`Discard ${d.label}`} title="Discard" onClick={() => onDiscard(d.key)}>
          ✕
        </button>
      </div>
    </div>
  );
}
