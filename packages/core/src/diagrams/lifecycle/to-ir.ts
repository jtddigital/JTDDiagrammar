import { pointer } from '../../diagnostics.ts';
import type { Band, BandGroup, GraphIR, IREdge, IRNode } from '../../ir/types.ts';
import { edgeLabels } from '../edge-labels.ts';
import { over, ruled, styled } from '../section-styles.ts';
import { lifecycleLegend } from './legend.ts';
import { ACTIONS_BAND, badStages, pill, sharedFrom, showActions, stateOf, statesArePhases, stepsOf, transitions, type LcAction, type LcState, type LcWorkflow, type Lifecycle } from './model.ts';
import { stateStyle } from './state-style.ts';
import { DASHED, edgeStyleOf, stepEdges, stepNode } from './steps.ts';

/** Entry criteria, entry actions and security under the state header (URS-DM-020). */
const detail = (s: LcState) =>
  [
    s.entryCriteria?.length && `Entry criteria: ${s.entryCriteria.join('; ')}`,
    s.entryActions?.length && `Entry actions: ${s.entryActions.join('; ')}`,
    s.security && Object.keys(s.security).length && `Security: ${Object.entries(s.security).map(([r, a]) => `${r} ${a}`).join(' · ')}`,
  ]
    .filter(Boolean)
    .join('\n') || undefined;

/** Band for steps without an owner when workflows are split by role. */
export const SYSTEM_ROLE = 'System';

/** A workflow's roles in band order: listed ones, then owners in order of appearance, then System if a step has no owner (URS-TYP-010). */
export const rolesOf = (w: LcWorkflow): string[] => [
  ...new Set([...(w.roles ?? []), ...w.steps.flatMap((s) => (s.owner ? [s.owner] : [])), ...(w.steps.some((s) => !s.owner) ? [SYSTEM_ROLE] : [])]),
];
const roleBand = (w: string, role: string) => `${w}::${role}`;

/** A user action's label: its name, and for a scheduled job a timer icon and its timing. */
const actionLabels = (a: LcAction) => {
  const text = [a.label, a.by === 'job' && a.after ? `after ${a.after}` : undefined].filter(Boolean).join(' ');
  const own = edgeLabels(undefined, a.labels).labels ?? [];
  return text || a.by === 'job' ? { labels: [{ text: text || 'Scheduled', ...(a.by === 'job' && { icon: 'timer' as const }) }, ...own] } : own.length ? { labels: own } : {};
};

/**
 * States become one partition axis and workflows (plus the lifecycle actions band) the other.
 * `statesAs` picks columns or rows; `direction` still sets the flow, so the axis each maps to
 * follows from both (URS-TYP-008). With `roleLanes`, each workflow is a group over one band per
 * role (URS-TYP-010). `view: summary` keeps the states and the transitions between them (URS-TYP-009).
 */
export function lifecycleToIR(m: Lifecycle): GraphIR {
  const label = new Map(m.states.map((s) => [s.id, s.label ?? s.id]));
  const stateLabel = (id: string | undefined) => label.get(id ?? '') ?? id ?? '';
  // Unknown references are reported by the rules; here they fall back so the IR stays placeable.
  const known = (id: string | undefined) => (id !== undefined && label.has(id) ? id : m.states[0]?.id);
  const summary = m.view === 'summary';
  const workflows = summary ? [] : (m.workflows ?? []);

  const states: Band[] = m.states.map((s, i) => {
    const d = detail(s);
    const st = stateStyle(m, s);
    return { id: s.id, label: label.get(s.id)!, ...(d && { detail: d }), ...(st && { style: st }), src: pointer('states', i) };
  });
  const actions = showActions(m);
  const firstAction = Math.max(0, m.states.findIndex((s) => s.to?.length));
  const byRole = !!m.roleLanes;
  const flowBands: Band[] = [
    ...(actions ? [{ id: ACTIONS_BAND, label: 'Lifecycle actions', src: pointer('states', firstAction) }] : []),
    ...workflows.flatMap((w) => {
      const i = m.workflows!.indexOf(w);
      if (!byRole) return [{ id: w.id, label: w.label, ...styled(m.styles, 'workflows', w.style), src: pointer('workflows', i) }];
      return rolesOf(w).map((r) => {
        const fill = ruled(m.styleBy, { owner: r })?.fill;
        return { id: roleBand(w.id, r), label: r, ...over(m.styles?.workflows, fill ? { fill } : undefined), src: pointer('workflows', i) };
      });
    }),
  ];
  const roleGroups: BandGroup[] = byRole
    ? workflows.map((w) => ({ id: w.id, label: w.label, members: rolesOf(w).map((r) => roleBand(w.id, r)), ...styled(m.styles, 'workflows', w.style), src: pointer('workflows', m.workflows!.indexOf(w)) }))
    : [];
  const bad = badStages(m);
  const stages: BandGroup[] = (m.stages ?? []).flatMap((g, i) => (bad.has(g.id) ? [] : [{ id: g.id, label: g.label, members: g.states, ...styled(m.styles, 'stages', g.style), src: pointer('stages', i) }]));

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
      const st = stateStyle(m, s);
      nodes.push({ id: pill(s.id), shape: 'state', label: label.get(s.id)!, ...place(s.id, ACTIONS_BAND), ...(st && { style: st }), src: pointer('states', i) } as IRNode);
      // Actions to unknown states are reported by the rules and left out here.
      (s.to ?? []).forEach((a, j) =>
        label.has(a.state) &&
        edges.push({
          id: a.id ?? `action:${s.id}:${j}`,
          from: pill(s.id),
          to: pill(a.state),
          ...actionLabels(a),
          ...edgeStyleOf(m, a.main, a.style),
          ...(a.quote && { quote: a.quote }),
          src: pointer('states', i, 'to', j),
        }),
      );
    });
    // A shared action is drawn once: from a dashed pill naming its source states, in its target's column (URS-TYP-009).
    (m.sharedActions ?? []).forEach((a, i) => {
      if (!label.has(a.state)) return;
      const id = a.id ?? `shared:${i}`;
      const from = a.from ? sharedFrom(m, a).map(stateLabel).join(', ') : `Any active state${a.except?.length ? ` except ${a.except.map(stateLabel).join(', ')}` : ''}`;
      const src = pointer('sharedActions', i);
      nodes.push({ id: `${id}:from`, shape: 'state', label: from, ...place(a.state, ACTIONS_BAND), style: { dash: 'dashed' }, src } as IRNode);
      edges.push({ id, from: `${id}:from`, to: pill(a.state), ...actionLabels(a), ...edgeStyleOf(m, a.main, a.style), ...(a.quote && { quote: a.quote }), src });
    });
    if (summary) {
      // Workflow state changes collapse into dashed arrows between the states, one per workflow and pair.
      const seen = new Set<string>();
      for (const t of transitions(m)) {
        const key = `${t.workflow?.id}|${t.from}|${t.to}`;
        if (!t.workflow || seen.has(key) || !label.has(t.from) || !label.has(t.to)) continue;
        seen.add(key);
        const wi = m.workflows!.indexOf(t.workflow);
        edges.push({ id: `flow:${t.workflow.id}:${t.from}:${t.to}`, from: pill(t.from), to: pill(t.to), labels: [{ text: t.workflow.label }], ...over(m.edgeStyle, DASHED), src: pointer('workflows', wi) });
      }
    }
  }

  for (const { step: s, workflow: w, src } of summary ? [] : stepsOf(m)) {
    const band = byRole ? roleBand(w.id, s.owner ?? SYSTEM_ROLE) : w.id;
    nodes.push(stepNode(m, s, src, stateLabel, place(stateOf(s), band)));
    edges.push(...stepEdges(m, s, src));
  }
  // What starts each workflow: a dashed arrow from its state's pill to its start step (URS-TYP-009).
  if (actions)
    workflows.forEach((w) => {
      const first = w.steps.find((s) => s.kind === 'start') ?? w.steps[0];
      if (!w.start || !first || !label.has(w.start.state)) return;
      const by = w.start.by ?? 'user';
      const text = w.start.action ?? (by === 'entry' ? 'On entry' : by === 'job' ? 'Scheduled' : 'Start');
      edges.push({
        id: `start:${w.id}`,
        from: pill(w.start.state),
        to: first.id,
        labels: [{ text, ...(by === 'job' && { icon: 'timer' as const }) }],
        ...over(m.edgeStyle, DASHED),
        src: `${pointer('workflows', m.workflows!.indexOf(w))}/start`,
      });
    });

  const title = m.title ?? m.object;
  const meta: [string, string][] = [...(m.title && m.object ? [['Object', m.object] as [string, string]] : []), ...Object.entries(m.info ?? {})];
  const legend = m.legend === false ? [] : lifecycleLegend(m, nodes, edges);
  return {
    ...(title !== undefined && { title }),
    ...(m.theme && { theme: m.theme }),
    direction: m.direction ?? 'LR',
    nodes,
    edges,
    containers: [],
    partitions: phases
      ? { lanes: flowBands, phases: states, ...(stages.length && { phaseGroups: stages }), ...(roleGroups.length && { laneGroups: roleGroups }) }
      : { lanes: states, phases: flowBands, ...(stages.length && { laneGroups: stages }), ...(roleGroups.length && { phaseGroups: roleGroups }) },
    ...(legend.length && { legend }),
    ...(meta.length && { meta }),
  };
}
