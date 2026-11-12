import type { Box, PlacedBand } from '../../geometry.ts';
import type { BandGroup, Partitions } from '../../ir/types.ts';
import type { Flow } from '../flow.ts';
import type { Span } from './graph.ts';
import type { HeaderBlock } from './headers.ts';

/** Rectangle in flow coordinates → xy box. */
const rect = (flow: Flow, m0: number, m1: number, c0: number, c1: number): Box => {
  const a = flow.toXY(m0, c0);
  const b = flow.toXY(m1, c1);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
};

export interface BandInput {
  flow: Flow;
  partitions: Partitions;
  laneLabels: readonly HeaderBlock[];
  phaseLabels: readonly HeaderBlock[];
  laneGroupLabels: readonly HeaderBlock[];
  phaseGroupLabels: readonly HeaderBlock[];
  lanes: readonly Span[];
  phases: readonly Span[];
  /** Header thickness: lanes (and lane groups) along the flow, phases (and phase groups) across it. */
  laneHeader: number;
  phaseHeader: number;
  laneGroupHeader: number;
  phaseGroupHeader: number;
  length: number;
}

const lines = (h: HeaderBlock) => ({ lines: h.lines, ...(h.detail && { detail: h.detail }) });

/**
 * Group header cells over member spans, plus empty fillers over ungrouped members (URS-DM-019).
 * `cell(start, end)` maps a span along the members' axis to the group strip's box.
 */
function groupCells(groups: readonly BandGroup[] | undefined, labels: readonly HeaderBlock[], ids: readonly string[], spans: readonly Span[], kind: PlacedBand['kind'], cell: (s: number, e: number) => Box) {
  const cells: PlacedBand[] = [];
  const covered = new Set<number>();
  (groups ?? []).forEach((g, i) => {
    const idx = g.members.map((m) => ids.indexOf(m)).filter((x) => x >= 0);
    if (!idx.length) return;
    idx.forEach((x) => covered.add(x));
    const box = cell(spans[Math.min(...idx)]!.start, spans[Math.max(...idx)]!.end);
    cells.push({ id: g.id, kind, ...lines(labels[i]!), ...box, header: box });
  });
  const fillers = groups?.length ? spans.flatMap((s, i) => (covered.has(i) ? [] : [cell(s.start, s.end)])) : [];
  return { cells, fillers };
}

/**
 * Lane and phase bands (URS-DM-001/002, URS-LY-003). Lane headers sit at the flow start,
 * phase headers at the cross start; lanes span all phases and phases span all lanes. Group
 * headers sit just outside the band headers they span (URS-DM-019).
 */
export function bands(b: BandInput): { bands: PlacedBand[]; corner?: Box; fillers?: Box[] } {
  const { flow, partitions: p } = b;
  const crossEnd = b.lanes.at(-1)?.end ?? 0;
  const lanes = p.lanes.map(
    (l, i): PlacedBand => ({
      id: l.id,
      kind: 'lane',
      ...lines(b.laneLabels[i]!),
      ...rect(flow, -b.laneHeader, b.length, b.lanes[i]!.start, b.lanes[i]!.end),
      header: rect(flow, -b.laneHeader, 0, b.lanes[i]!.start, b.lanes[i]!.end),
    }),
  );
  const phases = (p.phases ?? []).map(
    (ph, i): PlacedBand => ({
      id: ph.id,
      kind: 'phase',
      ...lines(b.phaseLabels[i]!),
      ...rect(flow, b.phases[i]!.start, b.phases[i]!.end, -b.phaseHeader, crossEnd),
      header: rect(flow, b.phases[i]!.start, b.phases[i]!.end, -b.phaseHeader, 0),
    }),
  );
  const [lh, ph, lgh, pgh] = [b.laneHeader, b.phaseHeader, b.laneGroupHeader, b.phaseGroupHeader];
  const laneGroups = groupCells(p.laneGroups, b.laneGroupLabels, p.lanes.map((l) => l.id), b.lanes, 'laneGroup', (s, e) => rect(flow, -lh - lgh, -lh, s, e));
  const phaseGroups = groupCells(p.phaseGroups, b.phaseGroupLabels, (p.phases ?? []).map((x) => x.id), b.phases, 'phaseGroup', (s, e) => rect(flow, s, e, -ph - pgh, -ph));
  const fillers = [...laneGroups.fillers, ...phaseGroups.fillers];
  // The corner covers every header strip that meets it.
  const corner = phases.length ? rect(flow, -lh - lgh, 0, -ph - pgh, 0) : undefined;
  return {
    bands: [...lanes, ...phases, ...laneGroups.cells, ...phaseGroups.cells],
    ...(corner && { corner }),
    ...(fillers.length && { fillers }),
  };
}
