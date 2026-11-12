import { useEffect, useRef, useState } from 'react';
import { sanitizeSvg } from './sanitize.ts';

interface Props {
  svg?: string;
  current: boolean;
  /** Called with the kind prefix (n, c, e, l, p, lg, pg) and model id of a clicked element (URS-WEB-009). */
  onPick?(kind: string, id: string): void;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

/** Sanitised inline SVG with pan and zoom (URS-WEB-006); hovering shows provenance tooltips (URS-WEB-014). Fits the pane until the user pans or zooms. */
export function Preview({ svg, current, onPick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | undefined>();
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
        if (moved) return;
        const g = (e.target as Element).closest('g[id]');
        const dash = g?.id.indexOf('-') ?? -1;
        if (g && dash > 0) onPick?.(g.id.slice(0, dash), g.id.slice(dash + 1));
      }}
    >
      {!current && svg && <p className="stale">Showing the last valid diagram</p>}
      {!svg && <p className="empty">Nothing to show yet.</p>}
      <div className="zoom" role="toolbar" aria-label="Zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)}>−</button>
        <button type="button" onClick={fit}>Fit</button>
        <button type="button" onClick={() => ((manual.current = true), setView((v) => v && { ...v, scale: 1 }))}>1:1</button>
      </div>
      <div
        className="stage"
        data-testid="preview"
        ref={stage}
        style={view ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` } : undefined}
      />
    </section>
  );
}
