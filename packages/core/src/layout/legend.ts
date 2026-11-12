import type { Box, Geometry, PlacedLegend } from '../geometry.ts';
import type { LegendItem } from '../ir/types.ts';
import { lineHeight, textBlock } from '../measure/text.ts';
import { shape } from '../shapes/library.ts';
import { ICON, LEGEND_FONT, LEGEND_GAP, LEGEND_SAMPLE } from '../style.ts';

const PAD = 10;
const ITEM_GAP = 18;
const ROW_GAP = 8;
const LINE_W = 30;
export const LEGEND_TITLE = 'Legend';

/** Sample size: shapes at a small standard size (symbols at their own, capped), icons and line samples smaller. */
function sampleSize(it: LegendItem): { w: number; h: number } {
  if (it.icon) return { w: ICON, h: ICON };
  if (!it.shape) return { w: LINE_W, h: ICON };
  const s = shape(it.shape);
  if (!s.unlabelled) return LEGEND_SAMPLE;
  const own = s.size(0, 0);
  return { w: Math.min(own.w, LEGEND_SAMPLE.w), h: Math.min(own.h, LEGEND_SAMPLE.h) };
}

/**
 * The legend (URS-DM-026), independent of the layout engine: entries flow left to right in rows as wide
 * as the diagram (at least 360 px), in a box under it. The geometry grows to hold it.
 */
export function withLegend(g: Geometry, items: readonly LegendItem[] | undefined): Geometry {
  if (!items?.length) return g;
  const width = Math.max(g.width, 360);
  const head = lineHeight({ ...LEGEND_FONT, bold: true });
  const sized = items.map((it) => ({ it, sample: sampleSize(it), text: textBlock(it.label, 180, LEGEND_FONT) }));
  const rows: (typeof sized)[] = [[]];
  let x = PAD;
  for (const s of sized) {
    const w = s.sample.w + 6 + s.text.width;
    if (x > PAD && x + w > width - PAD) {
      rows.push([]);
      x = PAD;
    }
    rows.at(-1)!.push(s);
    x += w + ITEM_GAP;
  }
  const top = g.height + LEGEND_GAP;
  let y = top + PAD + head + ROW_GAP;
  let right = 0;
  const placed: PlacedLegend['items'] = [];
  for (const row of rows) {
    const h = Math.max(...row.map((s) => Math.max(s.sample.h, s.text.height)));
    let at = PAD;
    for (const { it, sample, text } of row) {
      const box: Box = { x: at, y: y + (h - sample.h) / 2, w: sample.w, h: sample.h };
      placed.push({ ...it, sample: box, text: { x: at + sample.w + 6, y: y + (h - text.height) / 2, w: text.width, h: text.height, lines: text.lines } });
      at += sample.w + 6 + text.width + ITEM_GAP;
      right = Math.max(right, at - ITEM_GAP);
    }
    y += h + ROW_GAP;
  }
  const legend: PlacedLegend = { x: 0, y: top, w: Math.max(right + PAD, 2 * PAD + 60), h: y - ROW_GAP + PAD - top, items: placed };
  return { ...g, width: Math.max(g.width, legend.w), height: legend.y + legend.h, legend };
}
