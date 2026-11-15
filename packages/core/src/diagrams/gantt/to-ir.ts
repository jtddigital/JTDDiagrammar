import type { GraphIR, IREdge, IRNode } from '../../ir/types.ts';
import { over } from '../section-styles.ts';
import { COLUMNS, type Column, type Gantt } from './model.ts';
import { scheduleOf } from './schedule.ts';
import { itemStyle, legendOf, SHAPE, kindOf } from './style.ts';

const HEADER: Record<Column, { label: string; align: 'left' | 'center' | 'right' }> = {
  wbs: { label: 'WBS', align: 'left' },
  name: { label: 'Task', align: 'left' },
  owner: { label: 'Owner', align: 'left' },
  start: { label: 'Start', align: 'center' },
  end: { label: 'End', align: 'center' },
  duration: { label: 'Days', align: 'right' },
};
/** Days around the work worth shading, so a padded axis is shaded to its edges. */
const SHADE_MARGIN = 100;

/** One row per item in table order, a link per dependency, on the timeline engine (URS-TYP-015, URS-LY-015). */
export function toIR(m: Gantt): GraphIR {
  const s = scheduleOf(m);
  const nodes: IRNode[] = s.rows.map((r) => ({
    id: r.item.id,
    shape: SHAPE[kindOf(r)],
    label: r.item.name,
    span: [r.from, r.to],
    depth: r.depth,
    ...(r.summary && { strong: true }),
    cells: { wbs: r.wbs, name: r.item.name, owner: r.item.owner ?? '', start: r.first, end: r.last, duration: `${r.days}` },
    ...over(undefined, itemStyle(m, r)),
    ...(r.item.quote !== undefined && { quote: r.item.quote }),
    src: r.path,
  }));
  // A link leaves the predecessor's start (S…) or finish (F…) and enters the successor's start (…S) or finish (…F).
  const edges: IREdge[] = s.rows.flatMap((r) =>
    r.links.map(({ link, from, path }) => ({
      id: `link:${path}`,
      from: from.item.id,
      to: r.item.id,
      ports: { from: link.type[0] === 'S' ? ('W' as const) : ('E' as const), to: link.type[1] === 'S' ? ('W' as const) : ('E' as const) },
      ...over(m.styles?.links, undefined),
      src: path,
    })),
  );
  const lo = Math.min(s.start, ...s.rows.map((r) => r.from)) - SHADE_MARGIN;
  const hi = Math.max(s.finish, ...s.rows.map((r) => r.to)) + SHADE_MARGIN;
  const legend = legendOf(m, s.rows);
  return {
    ...(m.title !== undefined && { title: m.title }),
    ...(m.theme && { theme: m.theme }),
    direction: 'LR',
    nodes,
    edges,
    containers: [],
    timeline: {
      columns: (m.columns ?? COLUMNS).map((id) => ({ id, ...HEADER[id] })),
      shade: s.offDays(lo, hi),
      ...(s.deadline !== undefined && { markers: [{ day: s.deadline + 1, label: 'Deadline' }] }),
    },
    ...(legend.length && { legend }),
  };
}
