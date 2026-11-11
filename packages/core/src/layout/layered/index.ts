import { max } from '../../math.ts';
import { warning } from '../../diagnostics.ts';
import type { Band as IRBand, GraphIR } from '../../ir/types.ts';
import { textBlock } from '../../measure/text.ts';
import type { LayoutEngine } from '../../registry/layout-engine.ts';
import { BAND_FONT, BAND_TEXT_MAX } from '../../style.ts';
import { flowOf } from '../flow.ts';
import { normalize } from '../normalize.ts';
import { bands } from './bands.ts';
import { build, sized } from './build.ts';
import { compound } from './compound.ts';
import { HEADER_PAD } from './constants.ts';
import type { Link } from './graph.ts';
import { layering } from './layering.ts';
import { order } from './order.ts';
import { place } from './place.ts';
import { route, type SizedNode } from './route.ts';

const headerLabels = (bs: readonly IRBand[] | undefined) => (bs ?? []).map((b) => textBlock(b.label, BAND_TEXT_MAX, BAND_FONT));

/** Layered (Sugiyama-style) engine with lane/phase constraints (URS-LY-001..005, URS-DM-001/002) and compound containers (URS-LY-012). */
export const layered: LayoutEngine = {
  id: 'layered',
  layout(ir: GraphIR) {
    const flow = flowOf(ir.direction);
    const part = ir.partitions;
    if (ir.containers.length && !part) return compound(ir, flow);
    const nodes: SizedNode[] = ir.nodes.map(sized);
    const indexOf = (bs: readonly IRBand[] | undefined) => new Map((bs ?? []).map((b, i) => [b.id, i]));
    const [laneIdx, phaseIdx] = [indexOf(part?.lanes), indexOf(part?.phases)];
    const laneOf = ir.nodes.map((n) => laneIdx.get(n.lane ?? '') ?? 0);
    const phaseOf = ir.nodes.map((n) => phaseIdx.get(n.phase ?? '') ?? 0);

    const index = new Map(ir.nodes.map((n, i) => [n.id, i]));
    const links: Link[] = [];
    const loops: { edge: number; node: number }[] = [];
    ir.edges.forEach((e, edge) => {
      const [u, v] = [index.get(e.from), index.get(e.to)];
      if (u === undefined || v === undefined) return; // container endpoints: P5
      if (u === v) loops.push({ edge, node: u });
      else links.push({ edge, u, v });
    });

    // Header labels set minimum band sizes and header thickness.
    const pad = (n: number) => n + 2 * HEADER_PAD;
    const laneLabels = headerLabels(part?.lanes);
    const phaseLabels = headerLabels(part?.phases);
    const laneMin = part && laneLabels.map((b) => pad(flow.cross(b.width, b.height)));
    const phaseMin = phaseLabels.map((b) => pad(flow.main(b.width, b.height)));

    const lay = layering(nodes.length, links, phaseOf, part?.phases?.length ?? 1);
    const layerCount = lay.phases.at(-1)!.last + 1;
    const { verts, chains, layers } = nodes.length ? build(nodes, laneOf, lay.ranks, layerCount, lay.dag, lay.back, flow) : { verts: [], chains: [], layers: part ? [[]] : [] };
    order(layers, verts, chains);
    const laneSpans = place(layers, verts, chains, laneMin);
    const phases = part && lay.phases.map((p, i) => ({ ...p, min: phaseMin[i] ?? 0 }));
    const routed = route({ flow, nodes, verts, layers, chains, edges: ir.edges, loops, ...(phases && { phases }) });

    const banded = part
      ? bands({
          flow,
          partitions: part,
          laneLabels,
          phaseLabels,
          lanes: laneSpans,
          phases: routed.axis.spans,
          laneHeader: pad(max(laneLabels.map((b) => flow.main(b.width, b.height)))),
          phaseHeader: phaseLabels.length ? pad(max(phaseLabels.map((b) => flow.cross(b.width, b.height)))) : 0,
          length: routed.axis.length,
        })
      : { bands: [] };
    return {
      geometry: normalize({ ...banded, containers: [], nodes: routed.nodes, edges: routed.edges }),
      diagnostics: ir.containers.length ? [warning('layout.containers', 'containers cannot be combined with lanes or phases yet; they are not drawn')] : [],
    };
  },
};
