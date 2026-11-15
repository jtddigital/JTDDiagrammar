import type { Box, PlacedCell, PlacedNode, PlacedRule, Point, RoutedEdge } from '../../geometry.ts';
import type { GraphIR, Side } from '../../ir/types.ts';
import { textWidth } from '../../measure/text.ts';
import type { LayoutEngine } from '../../registry/layout-engine.ts';
import { CELL_PAD } from '../../render/svg/grid.ts';
import { arrowSize, ENTRY_LINE, EXIT_STUB, TABLE_FONT } from '../../style.ts';
import { shape } from '../../shapes/library.ts';
import { route } from './route.ts';
import { scale } from './scale.ts';

const ROW = 30;
const TIER = 22;
const INDENT = 14;
const MAX_COLUMN = 280;
const bold = { ...TABLE_FONT, bold: true };

/** `text` cut with an ellipsis to fit `w`. */
function fit(text: string, w: number, font = TABLE_FONT): string {
  if (textWidth(text, font) <= w) return text;
  let s = text;
  while (s.length > 1 && textWidth(`${s}…`, font) > w) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/**
 * Timeline engine (URS-LY-015): one row per node, in order. A table of the IR's columns on the left, a
 * two-row time axis over the chart, shaded days, each node drawn across its days (a moment centred on
 * its day), and links routed between the bars' ends. Knows nothing of any diagram type.
 */
export const timeline: LayoutEngine = {
  id: 'timeline',
  layout(ir: GraphIR) {
    const t = ir.timeline ?? { columns: [] };
    const spans = ir.nodes.flatMap((n) => (n.span ? [n.span] : []));
    const days = [...spans.flat(), ...(t.markers ?? []).map((m) => m.day)];
    const s = days.length ? scale(Math.min(...days), Math.max(...days) + 1) : scale(0, 1);
    const head = 2 * TIER;
    const rowTop = (i: number) => head + i * ROW;

    // The table: each column as wide as its widest cell, up to a limit.
    const widths = t.columns.map((c) => {
      const cells = ir.nodes.map((n) => textWidth(n.cells?.[c.id] ?? '', n.strong ? bold : TABLE_FONT) + ((c.align ?? 'left') === 'left' ? (n.depth ?? 0) * INDENT : 0));
      return Math.min(MAX_COLUMN, Math.max(textWidth(c.label, bold), ...cells) + 2 * CELL_PAD + 2);
    });
    const tableW = widths.reduce((a, b) => a + b, 0);
    const X = (day: number) => tableW + (day - s.from) * s.pxPerDay;
    const right = X(s.to);
    const bottom = rowTop(ir.nodes.length);
    const cells: PlacedCell[] = [];
    let x = 0;
    t.columns.forEach((c, k) => {
      const w = widths[k]!;
      cells.push({ x, y: 0, w, h: head, text: fit(c.label, w - 2 * CELL_PAD, bold), align: 'center', bold: true, fill: 'header', border: true });
      ir.nodes.forEach((n, i) => {
        const indent = (c.align ?? 'left') === 'left' ? (n.depth ?? 0) * INDENT : 0;
        const text = n.cells?.[c.id];
        if (text) cells.push({ x, y: rowTop(i), w, h: ROW, text: fit(text, w - 2 * CELL_PAD - indent, n.strong ? bold : TABLE_FONT), align: c.align ?? 'left', ...(indent && { indent }), ...(n.strong && { bold: true }) });
      });
      x += w;
    });
    // The time axis: two rows of headers; a label is left out where it does not fit.
    for (const [tier, y] of [
      [s.top, 0],
      [s.bottom, TIER],
    ] as const)
      for (const tick of tier) {
        const [x0, w] = [X(tick.from), (tick.to - tick.from) * s.pxPerDay];
        cells.push({ x: x0, y, w, h: TIER, ...(textWidth(tick.label, TABLE_FONT) + 4 <= w && { text: tick.label }), align: 'center', fill: 'header', border: true });
      }
    // Shaded days, merged into runs; only where a day is wide enough to see.
    const shade = [...new Set(s.pxPerDay >= 3 ? (t.shade ?? []) : [])].filter((d) => d >= s.from && d < s.to).sort((a, b) => a - b);
    for (let i = 0; i < shade.length; ) {
      let j = i;
      while (j + 1 < shade.length && shade[j + 1] === shade[j]! + 1) j++;
      cells.push({ x: X(shade[i]!), y: head, w: (shade[j]! + 1 - shade[i]!) * s.pxPerDay, h: bottom - head, fill: 'shade' });
      i = j + 1;
    }
    const rules: PlacedRule[] = [
      ...ir.nodes.map((_, i): PlacedRule => ({ from: { x: 0, y: rowTop(i + 1) }, to: { x: right, y: rowTop(i + 1) }, kind: 'grid' })),
      ...widths.map((_, k): PlacedRule => {
        const cx = widths.slice(0, k + 1).reduce((a, b) => a + b, 0);
        return { from: { x: cx, y: head }, to: { x: cx, y: bottom }, kind: 'grid' };
      }),
      // Grid down the chart at each top-tier boundary (months or years).
      ...s.top.slice(1).map((tick): PlacedRule => ({ from: { x: X(tick.from), y: head }, to: { x: X(tick.from), y: bottom }, kind: 'grid' })),
      ...(t.markers ?? []).map((m): PlacedRule => ({ from: { x: X(m.day), y: head }, to: { x: X(m.day), y: bottom + 16 }, kind: 'marker', label: m.label, ...(m.style && { style: m.style }) })),
    ];

    // Items: bars across their days; moments centred on theirs.
    const boxes: (Box | undefined)[] = ir.nodes.map((n, i) => {
      if (!n.span) return undefined;
      const size = shape(n.shape).size(0, 0);
      const [x0, x1] = [X(n.span[0]), X(n.span[1])];
      const w = x1 > x0 ? Math.max(x1 - x0, 2) : size.w;
      return { x: x1 > x0 ? x0 : x0 - w / 2, y: rowTop(i) + (ROW - size.h) / 2, w, h: size.h };
    });
    const nodes: PlacedNode[] = ir.nodes.flatMap((n, i) => (boxes[i] ? [{ id: n.id, shape: n.shape, lines: [n.label ?? n.id], ...boxes[i] }] : []));
    const row = new Map(ir.nodes.map((n, i) => [n.id, i]));
    const port = (i: number, side: Side): Point => {
      const b = boxes[i]!;
      const p = shape(ir.nodes[i]!.shape).port(side, b.w, b.h, 0);
      return { x: b.x + p.x, y: b.y + p.y };
    };
    const edges: RoutedEdge[] = ir.edges.flatMap((e) => {
      const [a, b] = [row.get(e.from), row.get(e.to)];
      if (a === undefined || b === undefined || !boxes[a] || !boxes[b] || a === b) return [];
      // Straight out of the bar, and into the next with the line showing past its arrowhead.
      const entry = e.marker === 'none' ? EXIT_STUB : arrowSize(e.style?.lineWidth) + ENTRY_LINE;
      const points = route({ boxes, top: rowTop, bottom: (r) => rowTop(r + 1) }, a, e.ports?.from ?? 'E', b, e.ports?.to ?? 'W', port, { exit: EXIT_STUB, entry });
      return [{ id: e.id, from: e.from, to: e.to, points, ...(e.marker && { marker: e.marker }) }];
    });
    return { geometry: { bands: [], containers: [], nodes, edges, cells, rules, width: right, height: bottom + ((t.markers ?? []).length ? 16 : 0) }, diagnostics: [] };
  },
};
