import { Fragment, useRef, type ReactNode } from 'react';
import { resize, shares, visible, type Layout, type PaneId } from './layout.ts';

/** Smallest pane, in pixels. */
const MIN_PX = 240;
const STEP = 0.02;

interface Props {
  layout: Layout;
  onLayout(l: Layout): void;
  panes: Record<PaneId, { label: string; body: ReactNode }>;
}

/**
 * Visible panes side by side with draggable gutters (URS-WEB-015). Gutters are ARIA window
 * splitters: arrow keys move them too.
 */
export function Panes({ layout, onLayout, panes }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ids = visible(layout);
  const s = shares(layout);
  const min = () => Math.min(0.45, MIN_PX / (host.current?.clientWidth || 1200));

  const drag = (a: PaneId, b: PaneId) => (e: React.PointerEvent<HTMLDivElement>) => {
    const width = host.current!.clientWidth;
    const start = { x: e.clientX, layout };
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => onLayout(resize(start.layout, a, b, (m.clientX - start.x) / width, min()));
    const up = () => {
      e.currentTarget.removeEventListener('pointermove', move);
      e.currentTarget.removeEventListener('pointerup', up);
    };
    e.currentTarget.addEventListener('pointermove', move);
    e.currentTarget.addEventListener('pointerup', up);
  };

  return (
    <div className="panes" ref={host}>
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && (
            <div
              key="gutter"
              className="gutter"
              role="separator"
              aria-orientation="vertical"
              aria-label={`Resize ${panes[ids[i - 1]!].label} and ${panes[id].label}`}
              aria-controls={`pane-${ids[i - 1]}`}
              aria-valuenow={Math.round(s[ids[i - 1]!]! * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              onPointerDown={drag(ids[i - 1]!, id)}
              onKeyDown={(e) => {
                const d = e.key === 'ArrowLeft' ? -STEP : e.key === 'ArrowRight' ? STEP : 0;
                if (!d) return;
                e.preventDefault();
                onLayout(resize(layout, ids[i - 1]!, id, d, min()));
              }}
            />
          )}
          <section key="pane" id={`pane-${id}`} className={`pane pane--${id}`} aria-label={panes[id].label} style={{ flexGrow: s[id], flexBasis: 0 }}>
            {panes[id].body}
          </section>
        </Fragment>
      ))}
    </div>
  );
}
