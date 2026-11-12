import type { Band, BandGroup, GraphIR, IREdge, IRNode } from '../../ir/types.ts';
import { merged, over, ruled, styled } from '../section-styles.ts';
import { ACTIONS_BAND, badStages, pill, showActions, stateOf, statesArePhases, stepsOf, type Lifecycle, type LcState, type StepKind } from './model.ts';
import { edgeLabels } from '../edge-labels.ts';
import { pointer } from '../../diagnostics.ts';

const SHAPE: Record<StepKind, string> = { start: 'terminator', end: 'terminator', task: 'process', decision: 'decision', notification: 'document', system: 'hexagon', stateChange: 'chevron' };

/** Entry criteria and actions under the state header (URS-DM-020). */
const detail = (s: LcState) =>
  [s.entryCriteria?.length && `Entry criteria: ${s.entryCriteria.join('; ')}`, s.entryActions?.length && `Entry actions: ${s.entryActions.join('; ')}`].filter(Boolean).join('\n') || undefined;

/**
 * States become one partition axis and workflows (plus the lifecycle actions band) the other.
 * `statesAs` picks columns or rows; `direction` still sets the flow, so the axis each maps to
 * follows from both (URS-TYP-008).
 */
export function lifecycleToIR(m: Lifecycle): GraphIR {
  const label = new Map(m.states.map((s) => [s.id, s.label ?? s.id]));
  // Unknown references are reported by the rules; here they fall back so the IR stays placeable.
  const known = (id: string | undefined) => (id !== undefined && label.has(id) ? id : m.states[0]?.id);

  const states: Band[] = m.states.map((s, i) => {
    const d = detail(s);
    return { id: s.id, label: label.get(s.id)!, ...(d && { detail: d }), ...styled(m.styles, 'states', s.style), src: pointer('states', i) };
  });
  const actions = showActions(m);
  // Derived elements point at the states they come from: the first with user actions, and the initial state.
  const firstAction = Math.max(0, m.states.findIndex((s) => s.to?.length));
  const workflows: Band[] = [
    ...(actions ? [{ id: ACTIONS_BAND, label: 'Lifecycle actions', src: pointer('states', firstAction) }] : []),
    ...(m.workflows ?? []).map((w, i) => ({ id: w.id, label: w.label, ...styled(m.styles, 'workflows', w.style), src: pointer('workflows', i) })),
  ];
  const bad = badStages(m);
  const stages: BandGroup[] = (m.stages ?? []).flatMap((g, i) =>
    bad.has(g.id) ? [] : [{ id: g.id, label: g.label, members: g.states, ...styled(m.styles, 'stages', g.style), src: pointer('stages', i) }],
  );

  const phases = statesArePhases(m);
  const place = (state: string | undefined, band: string) => (phases ? { phase: known(state), lane: band } : { lane: known(state), phase: band });

  const nodes: IRNode[] = [];
  const edges: IREdge[] = [];
  if (actions) {
    const i = m.states.findIndex((s) => s.stateType === 'initial');
    if (i >= 0) {
      const src = pointer('states', i, 'stateType');
      nodes.push({ id: 'state:start', shape: 'initial', label: '', ...place(m.states[i]!.id, ACTIONS_BAND), src } as IRNode);
      edges.push({ id: 'state:start:link', from: 'state:start', to: pill(m.states[i]!.id), src });
    }
    m.states.forEach((s, i) => {
      nodes.push({ id: pill(s.id), shape: 'state', label: label.get(s.id)!, ...place(s.id, ACTIONS_BAND), ...styled(m.styles, 'states', s.style), src: pointer('states', i) } as IRNode);
      // Actions to unknown states are reported by the rules and left out here.
      (s.to ?? []).forEach((a, j) =>
        label.has(a.state) &&
        edges.push({
          id: a.id ?? `action:${s.id}:${j}`,
          from: pill(s.id),
          to: pill(a.state),
          ...edgeLabels(a.label, a.labels),
          ...over(m.edgeStyle, a.style),
          ...(a.quote && { quote: a.quote }),
          src: pointer('states', i, 'to', j),
        }),
      );
    });
  }

  for (const { step: s, workflow: w, src } of stepsOf(m)) {
    const kind = s.kind ?? 'task';
    const name = s.label ?? (kind === 'stateChange' ? (label.get(s.target ?? '') ?? s.target ?? '') : kind === 'start' ? 'Start' : kind === 'end' ? 'End' : s.id);
    const rules = ruled(m.styleBy, { kind, owner: s.owner });
    nodes.push({
      id: s.id,
      shape: SHAPE[kind],
      label: name,
      ...(s.owner && { sub: s.owner }),
      ...place(stateOf(s), w.id),
      ...(s.order !== undefined && { order: s.order }),
      ...over(merged(m.styles?.steps, rules), s.style),
      ...(s.quote && { quote: s.quote }),
      src,
    } as IRNode);
    (s.to ?? []).forEach((l, j) => {
      const ports = { ...(l.exitSide && { from: l.exitSide }), ...(l.entrySide && { to: l.entrySide }) };
      edges.push({
        id: l.id ?? `edge:${s.id}:${j}`,
        from: s.id,
        to: l.step,
        ...edgeLabels(l.label, l.labels),
        ...(Object.keys(ports).length && { ports }),
        ...over(m.edgeStyle, l.style),
        ...(l.quote && { quote: l.quote }),
        src: `${src}/to/${j}`,
      });
    });
  }

  const title = m.title ?? m.object;
  return {
    ...(title !== undefined && { title }),
    ...(m.theme && { theme: m.theme }),
    direction: m.direction ?? 'LR',
    nodes,
    edges,
    containers: [],
    partitions: phases
      ? { lanes: workflows, phases: states, ...(stages.length && { phaseGroups: stages }) }
      : { lanes: states, phases: workflows, ...(stages.length && { laneGroups: stages }) },
  };
}
