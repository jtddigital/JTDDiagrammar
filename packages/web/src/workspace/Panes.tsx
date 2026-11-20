import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { dock, nudge, resize, shown, type Layout, type PaneId, type Side } from './layout.ts';

/** Smallest column and pane, in pixels. */
const MIN_W = 240;
const MIN_H = 120;
const STEP = 0.02;
/** How far the pointer moves before a press on a header becomes a drag. */
const DRAG_PX = 6;
const ARROWS: Record<string, Side> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' };
/** The keys that move a pane, as aria-keyshortcuts lists them. */
const MOVE_KEYS = Object.keys(ARROWS)
  .map((k) => `Alt+Shift+${k}`)
  .join(' ');

interface Props {
  layout: Layout;
  onLayout(l: Layout): void;
  panes: Record<PaneId, { label: string; body: ReactNode }>;
  /** Panes hidden for now by what is open (URS-WS-011). */
  auto?: readonly PaneId[];
}

interface Drag {
  pane: PaneId;
  target?: PaneId;
  side?: Side;
}

/** Where the pointer would dock: the target pane under it and its nearest edge. */
function dropAt(x: number, y: number, pane: PaneId): Pick<Drag, 'target' | 'side'> {
  const el = document.elementsFromPoint(x, y).find((e) => e instanceof HTMLElement && e.dataset.pane) as HTMLElement | undefined;
  const target = el?.dataset.pane as PaneId | undefined;
  if (!el || !target || target === pane) return {};
  const r = el.getBoundingClientRect();
  const [dx, dy] = [(x - r.left) / r.width, (y - r.top) / r.height];
  const edges: [Side, number][] = [
    ['left', dx],
    ['right', 1 - dx],
    ['top', dy],
    ['bottom', 1 - dy],
  ];
  return { target, side: edges.reduce((m, e) => (e[1] < m[1] ? e : m))[0] };
}

/**
 * Panes in columns, stacked within a column, like an IDE (URS-WEB-015, WEB-024). Gutters between columns and
 * between stacked panes are ARIA window splitters: drag them or use the arrow keys. Drag a pane by its header
 * onto another pane's edge to dock it there (the half it will take is shown), or press Alt+Shift+arrow in a pane.
 * Every pane is placed absolutely in one container, so docking moves it without remounting what it holds.
 */
export function Panes({ layout, onLayout, panes, auto = [] }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>();
  const cols = shown(layout, auto);
  const latest = useRef({ layout, onLayout, auto });
  latest.current = { layout, onLayout, auto };
  const minW = () => Math.min(0.45, MIN_W / (host.current?.clientWidth || 1200));
  const minH = () => Math.min(0.45, MIN_H / (host.current?.clientHeight || 800));

  // Escape cancels a drag.
  useEffect(() => {
    if (!drag) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrag(undefined);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [drag]);

  const resizer = (a: PaneId, b: PaneId, kind: 'columns' | 'rows') => (e: React.PointerEvent<HTMLDivElement>) => {
    const size = kind === 'columns' ? host.current!.clientWidth : host.current!.clientHeight;
    const start = { at: kind === 'columns' ? e.clientX : e.clientY, layout };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => onLayout(resize(start.layout, a, b, ((kind === 'columns' ? m.clientX : m.clientY) - start.at) / size, kind === 'columns' ? minW() : minH(), auto, kind));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  // A press on a pane's header (not on its controls) starts a drag once the pointer moves.
  const grab = (pane: PaneId) => (e: React.PointerEvent) => {
    const t = e.target as Element;
    if (e.button !== 0 || !t.closest('.pane__header') || t.closest('button, select, input, textarea, a, [contenteditable="true"], [role="separator"]')) return;
    // No text selection while dragging a header.
    e.preventDefault();
    const from = { x: e.clientX, y: e.clientY };
    let started = false;
    let over: Pick<Drag, 'target' | 'side'> = {};
    const move = (m: PointerEvent) => {
      if (!started && Math.hypot(m.clientX - from.x, m.clientY - from.y) < DRAG_PX) return;
      started = true;
      m.preventDefault();
      over = dropAt(m.clientX, m.clientY, pane);
      setDrag({ pane, ...over });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag((d) => {
        if (d && over.target && over.side) {
          const { layout: l, onLayout: set } = latest.current;
          set(dock(l, pane, over.target, over.side));
        }
        return undefined;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const keys = (pane: PaneId) => (e: React.KeyboardEvent) => {
    const side = ARROWS[e.key];
    if (!side || !e.altKey || !e.shiftKey) return;
    e.preventDefault();
    onLayout(nudge(layout, pane, side, auto));
  };

  // Rectangles in percent of the host, columns left to right, panes top to bottom.
  const boxes: { id: PaneId; left: number; top: number; width: number; height: number }[] = [];
  let x = 0;
  for (const c of cols) {
    let y = 0;
    c.panes.forEach((id, i) => {
      boxes.push({ id, left: x, top: y, width: c.width, height: c.heights[i]! });
      y += c.heights[i]!;
    });
    x += c.width;
  }
  const pct = (v: number) => `${v * 100}%`;
  const hint = drag?.target && boxes.find((b) => b.id === drag.target);
  const half = hint && {
    left: pct(hint.left + (drag.side === 'right' ? hint.width / 2 : 0)),
    top: pct(hint.top + (drag.side === 'bottom' ? hint.height / 2 : 0)),
    width: pct(drag.side === 'left' || drag.side === 'right' ? hint.width / 2 : hint.width),
    height: pct(drag.side === 'top' || drag.side === 'bottom' ? hint.height / 2 : hint.height),
  };

  return (
    <div className="panes" ref={host} data-dragging={drag ? true : undefined}>
      {boxes.map((b) => (
        <section
          key={b.id}
          id={`pane-${b.id}`}
          className={`pane pane--${b.id}`}
          aria-label={panes[b.id].label}
          aria-keyshortcuts={MOVE_KEYS}
          data-pane={b.id}
          data-moving={drag?.pane === b.id || undefined}
          style={{ left: pct(b.left), top: pct(b.top), width: pct(b.width), height: pct(b.height) }}
          onPointerDown={grab(b.id)}
          onKeyDown={keys(b.id)}
        >
          {panes[b.id].body}
        </section>
      ))}
      {cols.map((c, i) => {
        const left = cols.slice(0, i).reduce((s, x) => s + x.width, 0);
        let top = 0;
        return (
          <Fragment key={c.panes.join()}>
            {i > 0 && <Gutter kind="columns" a={cols[i - 1]!.panes[0]!} b={c.panes[0]!} at={left} labels={[panes[cols[i - 1]!.panes[0]!].label, panes[c.panes[0]!].label]} value={cols[i - 1]!.width} layout={layout} onLayout={onLayout} auto={auto} min={minW} start={resizer(cols[i - 1]!.panes[0]!, c.panes[0]!, 'columns')} />}
            {c.panes.map((id, k) => {
              const h = top;
              top += c.heights[k]!;
              if (k === 0) return null;
              const prev = c.panes[k - 1]!;
              return <Gutter key={id} kind="rows" a={prev} b={id} at={h} span={{ left, width: c.width }} labels={[panes[prev].label, panes[id].label]} value={c.heights[k - 1]!} layout={layout} onLayout={onLayout} auto={auto} min={minH} start={resizer(prev, id, 'rows')} />;
            })}
          </Fragment>
        );
      })}
      {half && <div className="dock-hint" aria-hidden="true" style={half} />}
      <p className="visually-hidden" aria-live="polite">
        {drag?.target ? `Drop to dock ${panes[drag.pane].label} ${drag.side === 'left' || drag.side === 'right' ? `${drag.side} of` : drag.side === 'top' ? 'above' : 'below'} ${panes[drag.target].label}` : ''}
      </p>
    </div>
  );
}

/** A splitter between two columns, or two panes in a column. */
function Gutter(p: {
  kind: 'columns' | 'rows';
  a: PaneId;
  b: PaneId;
  at: number;
  span?: { left: number; width: number };
  labels: [string, string];
  value: number;
  layout: Layout;
  onLayout(l: Layout): void;
  auto: readonly PaneId[];
  min(): number;
  start(e: React.PointerEvent<HTMLDivElement>): void;
}) {
  const pct = (v: number) => `${v * 100}%`;
  const style = p.kind === 'columns' ? { left: pct(p.at) } : { top: pct(p.at), left: pct(p.span!.left), width: pct(p.span!.width) };
  const [back, forth] = p.kind === 'columns' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  return (
    <div
      className="gutter"
      data-kind={p.kind}
      role="separator"
      aria-orientation={p.kind === 'columns' ? 'vertical' : 'horizontal'}
      aria-label={`Resize ${p.labels[0]} and ${p.labels[1]}`}
      aria-controls={`pane-${p.a}`}
      aria-valuenow={Math.round(p.value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      style={style}
      onPointerDown={p.start}
      onKeyDown={(e) => {
        const d = e.key === back ? -STEP : e.key === forth ? STEP : 0;
        if (!d) return;
        e.preventDefault();
        p.onLayout(resize(p.layout, p.a, p.b, d, p.min(), p.auto, p.kind));
      }}
    />
  );
}
