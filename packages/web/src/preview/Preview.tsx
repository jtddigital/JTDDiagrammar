import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Ref } from './interact.ts';
import { sanitizeSvg } from './sanitize.ts';

export interface PreviewProps {
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
  /** Marks on drawn elements by SVG id, set as `data-diff` (URS-WS-035). */
  marks?: Readonly<Record<string, string>>;
  /** Pan and zoom held outside, so two drawings move together (URS-WS-035). */
  view?: View | undefined;
  onView?(v: View | undefined): void;
  /** With a held view: this drawing's fit, for the holder to choose among (two drawings take the smaller). */
  onFit?(v: View): void;
  /** Accessible name of the drawing region. */
  label?: string;
  /** A mode the drawing is in, set as `data-mode`, e.g. while connecting two elements. */
  mode?: string | undefined;
  /**
   * Elements that can be dragged onto one another, by SVG id prefix (other drags pan). The dragged element follows
   * the pointer and goes back when let go; `onDrop` gets what it was dropped on, if anything, and how far it moved.
   */
  drag?: { kinds: readonly string[]; onDrop(from: Ref, to: Ref | undefined, by: Point, under: Ref[]): void } | undefined;
  /** Drawn over the diagram in its coordinates, moving and zooming with it. */
  overlay?: ReactNode;
  /**
   * A click on the drawing (not a drag), at that point of the diagram, with every element under it, topmost
   * first; true when it was used, so it picks nothing.
   */
  onClickAt?(at: Point, under: Ref[]): boolean;
  /** Data of this type dropped on the drawing (HTML drag and drop), at that point of the diagram. */
  dropType?: string | undefined;
  onDropData?(data: string, at: Point, under: Ref[]): void;
}

export interface Point {
  x: number;
  y: number;
}

/** An element being dragged: where it started, its own transform, and what it is over. */
interface Moving {
  ref: Ref;
  g: Element;
  base: [number, number];
  over?: { g: Element; ref: Ref };
}

export interface View {
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
export function Preview({ svg, current, onPick, selected, relatedOf, labelOf, onLabel, marks, view: held, onView, onFit, label = 'Diagram', mode, drag: dragging, overlay, onClickAt, dropType, onDropData }: PreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState<View | undefined>();
  const view = onView ? held : own;
  // The latest view and setter, for handlers set up once (the resize observer) and for moves in one frame.
  const latest = useRef({ view, onView, onFit });
  latest.current = { view, onView, onFit };
  const setView = (next: View | undefined | ((v: View | undefined) => View | undefined)) => {
    const v = typeof next === 'function' ? next(latest.current.view) : next;
    latest.current.view = v;
    if (latest.current.onView) latest.current.onView(v);
    else setOwn(v);
  };
  const [hover, setHover] = useState<Ref>();
  const [editing, setEditing] = useState<{ ref: Ref; text: string; left: number; top: number; width: number }>();
  const drag = useRef<{ x: number; y: number; moved: boolean; start: Point; moving?: Moving } | null>(null);
  /** Auto-fit until the user pans or zooms; Fit turns it back on. */
  const manual = useRef(false);

  const fit = () => {
    manual.current = false;
    const el = stage.current?.firstElementChild as SVGSVGElement | null;
    const box = host.current?.getBoundingClientRect();
    if (!el || !box) return;
    const [w, h] = [Number(el.getAttribute('width')), Number(el.getAttribute('height'))];
    const scale = Math.min(1, (box.width - 32) / w, (box.height - 32) / h);
    const v = { scale, x: (box.width - w * scale) / 2, y: 16 };
    if (latest.current.onFit) latest.current.onFit(v);
    else setView(v);
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
    root.querySelectorAll('[data-diff]').forEach((e) => e.removeAttribute('data-diff'));
    for (const [id, m] of Object.entries(marks ?? {})) root.querySelector(`[id="${CSS.escape(id)}"]`)?.setAttribute('data-diff', m);
    const rel = hover && relatedOf ? relatedOf(hover) : [];
    mark('is-related', rel);
    root.classList.toggle('is-hovering', rel.length > 0);
  }, [svg, selected, hover, relatedOf, marks]);

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

  /** A point of the window in diagram coordinates. */
  const toDiagram = (clientX: number, clientY: number): Point | undefined => {
    const v = latest.current.view;
    const box = host.current?.getBoundingClientRect();
    return v && box ? { x: (clientX - box.left - v.x) / v.scale, y: (clientY - box.top - v.y) / v.scale } : undefined;
  };

  /** Every element under a point of the window, topmost first, but the one being dragged. */
  const underAt = (x: number, y: number, skip?: Element): Ref[] => {
    const out: Ref[] = [];
    for (const el of document.elementsFromPoint(x, y)) {
      const hit = refOf(el);
      if (hit && (!skip || (hit.g !== skip && !skip.contains(hit.g))) && !out.some((r) => r.kind === hit.ref.kind && r.id === hit.ref.id)) out.push(hit.ref);
    }
    return out;
  };

  /** The element under the pointer that a dragged one could be dropped on. */
  const targetAt = (x: number, y: number, m: Moving) => {
    for (const el of document.elementsFromPoint(x, y)) {
      const hit = refOf(el);
      if (hit && hit.g !== m.g && !m.g.contains(hit.g) && dragging?.kinds.includes(hit.ref.kind)) return hit;
    }
    return undefined;
  };

  const commit = (text: string) => {
    if (editing && text !== editing.text) onLabel?.(editing.ref, text);
    setEditing(undefined);
  };

  return (
    <section
      className="preview"
      aria-label={label}
      {...(mode && { 'data-mode': mode })}
      ref={host}
      onWheel={(e) => {
        const box = host.current!.getBoundingClientRect();
        zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - box.left, e.clientY - box.top);
      }}
      onPointerDown={(e) => {
        const hit = refOf(e.target);
        const t = hit?.g.getAttribute('transform') ?? '';
        const base = /^translate\(([-\d.]+) ([-\d.]+)\)$/.exec(t);
        const moving = hit && dragging?.kinds.includes(hit.ref.kind) && (base || !t) ? { ref: hit.ref, g: hit.g, base: [Number(base?.[1] ?? 0), Number(base?.[2] ?? 0)] as [number, number] } : undefined;
        drag.current = { x: e.clientX, y: e.clientY, moved: false, start: { x: e.clientX, y: e.clientY }, ...(moving && { moving }) };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !(e.buttons & 1)) return;
        const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
        if (Math.abs(e.clientX - d.start.x) + Math.abs(e.clientY - d.start.y) > 3) d.moved = true;
        d.x = e.clientX;
        d.y = e.clientY;
        const m = d.moving;
        if (!m) {
          if (d.moved) manual.current = true;
          setView((v) => v && { ...v, x: v.x + dx, y: v.y + dy });
          return;
        }
        if (!d.moved) return;
        // The element follows the pointer; what it would be dropped on is marked.
        const s = latest.current.view?.scale ?? 1;
        m.g.setAttribute('transform', `translate(${m.base[0] + (e.clientX - d.start.x) / s} ${m.base[1] + (e.clientY - d.start.y) / s})`);
        m.g.classList.add('is-dragging');
        const over = targetAt(e.clientX, e.clientY, m);
        if (over?.g !== m.over?.g) {
          m.over?.g.classList.remove('is-drop-target');
          over?.g.classList.add('is-drop-target');
        }
        m.over = over;
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        const m = d?.moving;
        if (m && d.moved) {
          m.g.setAttribute('transform', `translate(${m.base[0]} ${m.base[1]})`);
          m.g.classList.remove('is-dragging');
          m.over?.g.classList.remove('is-drop-target');
          const s = latest.current.view?.scale ?? 1;
          dragging?.onDrop(m.ref, m.over?.ref, { x: (e.clientX - d.start.x) / s, y: (e.clientY - d.start.y) / s }, underAt(e.clientX, e.clientY, m.g));
          return;
        }
        if (d?.moved) return;
        const at = onClickAt && toDiagram(e.clientX, e.clientY);
        if (at && onClickAt!(at, underAt(e.clientX, e.clientY))) return;
        const hit = refOf(e.target);
        if (hit) onPick?.(hit.ref.kind, hit.ref.id);
      }}
      {...(dropType &&
        onDropData && {
          onDragOver: (e: React.DragEvent) => {
            if (e.dataTransfer.types.includes(dropType)) e.preventDefault();
          },
          onDrop: (e: React.DragEvent) => {
            const data = e.dataTransfer.getData(dropType);
            const at = toDiagram(e.clientX, e.clientY);
            if (!data || !at) return;
            e.preventDefault();
            onDropData(data, at, underAt(e.clientX, e.clientY));
          },
        })}
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
      {overlay && (
        <div className="stage stage--overlay" style={view ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` } : undefined}>
          {overlay}
        </div>
      )}
    </section>
  );
}
