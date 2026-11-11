import type { Box, Geometry } from '../geometry.ts';

/** Regions edges and labels must stay clear of: nodes, container label strips, band headers. */
export const obstacles = (g: Pick<Geometry, 'nodes' | 'containers' | 'bands'>): (Box & { id: string })[] => [
  ...g.nodes,
  ...g.containers.map((c) => ({ id: `${c.id}#head`, x: c.x, y: c.y, w: c.w, h: c.head })),
  ...g.bands.map((b) => ({ id: `${b.id}#head`, ...b.header })),
];
