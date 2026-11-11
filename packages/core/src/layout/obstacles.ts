import type { Box, Geometry } from '../geometry.ts';
import { lineHeight } from '../measure/text.ts';
import { CONTAINER_FONT, CONTAINER_HEAD_PAD } from '../style.ts';

/** Regions edges and labels must stay clear of: nodes, container label strips, band headers. */
export const obstacles = (g: Pick<Geometry, 'nodes' | 'containers' | 'bands'>): (Box & { id: string })[] => [
  ...g.nodes,
  ...g.containers.map((c) => ({ id: `${c.id}#head`, x: c.x, y: c.y, w: c.w, h: c.lines.length * lineHeight(CONTAINER_FONT) + 2 * CONTAINER_HEAD_PAD })),
  ...g.bands.map((b) => ({ id: `${b.id}#head`, ...b.header })),
];
