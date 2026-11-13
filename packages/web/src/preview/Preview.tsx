import { useEffect, useRef, useState } from 'react';
import type { Ref } from './interact.ts';
import { sanitizeSvg } from './sanitize.ts';

interface Props {
  svg?: string;
  current: boolean;
  /** Called with the kind prefix (n, c, e, l, p, lg, pg) and model id of a clicked element (URS-WEB-009). */
  onPick?(kind: string, id: string): void;
  /** Element to outline: the one the editor cursor is in (URS-WEB-020). */
  selected?: Ref;
  /** SVG ids to highlight while hovering an element, e.g. a node's edges. */
  relatedOf?(r: Ref): string[];
  /** The editable label of an element, if it has one. */
  labelOf?(r: Ref): string | undefined;
  onLabel?(r: Ref, text: string): void;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const refOf = (el: EventTarget | null): { g: Element; ref: Ref } | undefined => {
  const g = (el as Element | null)?.closest?.('g[id]');
  const dash = g?.id.indexOf('-') ?? -1;
  return g && dash > 0 ? { g, ref: { kind: g.id.slice(0, dash), id: g.id.slice(dash + 1) } } : undefined;
};

/**
 * Sanitised inline SVG with pan and zoom (URS-WEB-006); hovering shows provenance tooltips (URS-WEB-014).
 * Interactive (URS-WEB-020): click selects an element's source, hover highlights its connections, and
 * double-click edits its label in place. Fits the pane until the user pans or zooms.
 */
export function Preview({ svg, current, onPick, selected, relatedOf, labelOf, onLabel }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | undefined>();
  const [hover, setHover] = useState<Ref>();
  const [editing, setEditing] = useState<{ ref: Ref; text: string; left: number; top: number; width: number }>();
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  /** Auto-fit until the user pans or zooms; Fit turns it back on. */
  const manual = useRef(false);

  const fit = () => {
    manual.current = false;
    const el = stage.current?.firstElementChild as SVGSVGElement | null;
    const box = host.current?.getBoundingClientRect();
    if (!el || !box) return;
    const [w, h] = [Number(el.getAttribute('width')), Number(el.getAttribute('height'))];
    const scale = Math.min(1, (box.width - 32) / w, (box.height - 32) / h);
    setView({ scale, x: (box.width - w * scale) / 2, y: 16 });
  };

  useEffect(() => {
    const el = svg ? sanitizeSvg(svg) : undefined;
    stage.current?.replaceChildren(...(el ? [el] : []));
    if (el && !manual.current) fit();
  }, [svg]);

  useEffect(() => {
    const ro = new ResizeObserver(() => manual.current || fit());
    ro.observe(host.current!);
    return () => ro.disconnect();
  }, []);

  // Selection and hover highlights live on the SVG elements themselves.
  useEffect(() => {
    const root = stage.current!;
    const mark = (cls: string, ids: string[]) => {
      root.querySelectorAll(`.${cls}`).forEach((e) => e.classList.remove(cls));
      for (const id of ids) root.querySelector(`[id="${CSS.escape(id)}"]`)?.classList.add(cls);
    };
    mark('is-selected', selected ? [`${selected.kind}-${selected.id}`] : []);
    const rel = hover && relatedOf ? relatedOf(hover) : [];
    mark('is-related', rel);
    root.classList.toggle('is-hovering', rel.length > 0);
  }, [svg, selected, hover, relatedOf]);

  const zoom = (factor: number, cx?: number, cy?: number) => {
    manual.current = true;
    setView((v) => {
      if (!v) return v;
      const box = host.current!.getBoundingClientRect();
      const [px, py] = [cx ?? box.width / 2, cy ?? box.height / 2];
      const scale = Math.min(8, Math.max(0.1, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };

  const commit = (text: string) => {
    if (editing && text !== editing.text) onLabel?.(editing.ref, text);
    setEditing(undefined);
  };

  return (
    <section
      className="preview"
      aria-label="Preview"
      ref={host}
      onWheel={(e) => {
        const box = host.current!.getBoundingClientRect();
        zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - box.left, e.clientY - box.top);
      }}
      onPointerDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, moved: false })}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !(e.buttons & 1)) return;
        const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
        if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = manual.current = true;
        drag.current = { x: e.clientX, y: e.clientY, moved: d.moved };
        setView((v) => v && { ...v, x: v.x + dx, y: v.y + dy });
      }}
      onPointerUp={(e) => {
        const moved = drag.current?.moved;
        drag.current = null;
        const hit = !moved && refOf(e.target);
        if (hit) onPick?.(hit.ref.kind, hit.ref.id);
      }}
      onPointerOver={(e) => {
        const r = refOf(e.target)?.ref;
        setHover((h) => (h?.kind === r?.kind && h?.id === r?.id ? h : r));
      }}
      onPointerLeave={() => setHover(undefined)}
      onDoubleClick={(e) => {
        const hit = refOf(e.target);
        const text = hit && labelOf?.(hit.ref);
        if (!hit || text === undefined) return;
        const [b, g] = [host.current!.getBoundingClientRect(), hit.g.getBoundingClientRect()];
        setEditing({ ref: hit.ref, text, left: g.left - b.left, top: g.top - b.top + g.height / 2 - 18, width: Math.max(160, g.width) });
      }}
    >
      {!current && svg && <p className="preview__note">Showing the last valid diagram</p>}
      {!svg && <p className="empty">Nothing to show yet.</p>}
      {editing && (
        <input
          className="label-edit"
          aria-label="Label"
          autoFocus
          defaultValue={editing.text}
          style={{ left: editing.left, top: editing.top, width: editing.width }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
            if (e.key === 'Escape') setEditing(undefined);
          }}
          onBlur={(e) => commit(e.currentTarget.value)}
        />
      )}
      <div className="preview__tools" role="toolbar" aria-label="Zoom">
        <button type="button" className="btn" data-variant="ghost" aria-label="Zoom in" onClick={() => zoom(1.25)}>
          +
        </button>
        <button type="button" className="btn" data-variant="ghost" aria-label="Zoom out" onClick={() => zoom(0.8)}>
          −
        </button>
        <button type="button" className="btn" data-variant="ghost" onClick={fit}>
          Fit
        </button>
        <button type="button" className="btn" data-variant="ghost" onClick={() => ((manual.current = true), setView((v) => v && { ...v, scale: 1 }))}>
          1:1
        </button>
      </div>
      <div className="stage" data-testid="preview" ref={stage} style={view ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` } : undefined} />
    </section>
  );
}
