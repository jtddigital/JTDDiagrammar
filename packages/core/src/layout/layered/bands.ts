import type { Box, PlacedBand } from '../../geometry.ts';
import type { Partitions } from '../../ir/types.ts';
import type { TextBlock } from '../../measure/text.ts';
import type { Flow } from '../flow.ts';
import type { Span } from './graph.ts';

/** Rectangle in flow coordinates → xy box. */
const rect = (flow: Flow, m0: number, m1: number, c0: number, c1: number): Box => {
  const a = flow.toXY(m0, c0);
  const b = flow.toXY(m1, c1);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
};

export interface BandInput {
  flow: Flow;
  partitions: Partitions;
  laneLabels: readonly TextBlock[];
  phaseLabels: readonly TextBlock[];
  lanes: readonly Span[];
  phases: readonly Span[];
  /** Header thickness: lanes along the flow, phases across it. */
  laneHeader: number;
  phaseHeader: number;
  length: number;
}

/**
 * Lane and phase bands (URS-DM-001/002, URS-LY-003). Lane headers sit at the flow start,
 * phase headers at the cross start; lanes span all phases and phases span all lanes.
 */
export function bands(b: BandInput): { bands: PlacedBand[]; corner?: Box } {
  const { flow, partitions: p } = b;
  const crossEnd = b.lanes.at(-1)?.end ?? 0;
  const lanes = p.lanes.map(
    (l, i): PlacedBand => ({
      id: l.id,
      kind: 'lane',
      lines: b.laneLabels[i]!.lines,
      ...rect(flow, -b.laneHeader, b.length, b.lanes[i]!.start, b.lanes[i]!.end),
      header: rect(flow, -b.laneHeader, 0, b.lanes[i]!.start, b.lanes[i]!.end),
    }),
  );
  const phases = (p.phases ?? []).map(
    (ph, i): PlacedBand => ({
      id: ph.id,
      kind: 'phase',
      lines: b.phaseLabels[i]!.lines,
      ...rect(flow, b.phases[i]!.start, b.phases[i]!.end, -b.phaseHeader, crossEnd),
      header: rect(flow, b.phases[i]!.start, b.phases[i]!.end, -b.phaseHeader, 0),
    }),
  );
  return { bands: [...lanes, ...phases], ...(phases.length && { corner: rect(flow, -b.laneHeader, 0, -b.phaseHeader, 0) }) };
}
