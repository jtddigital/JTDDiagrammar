import { pointer } from '../../../diagnostics.ts';
import type { Band, EdgeLabel, GraphIR, IREdge, IRNode, LegendItem } from '../../../ir/types.ts';
import { noted } from '../../annotations.ts';
import { over, styled } from '../../section-styles.ts';
import { eventLegend, eventParts, ruleText } from '../events.ts';
import type { NodeKind } from '../model.ts';
import { nameOf, triggerKinds, type PrNode, type PrTransition, type ProcessDoc } from './model.ts';
import { transitionId } from './to-model.ts';

/** Workflow node shapes: BPMN-style events and gateways (D-003). */
const SHAPE: Record<NodeKind, string> = { initial: 'start', final: 'end', task: 'process', decision: 'decision', merge: 'choice', fork: 'bar', join: 'bar', send: 'signal' };
const KIND: Record<NodeKind, string> = { initial: 'Workflow start', final: 'Workflow end', task: 'Task', decision: 'Decision', merge: 'Merge', fork: 'Parallel split / join', join: 'Parallel split / join', send: 'Sends a signal' };
const state = (id: string) => `st:${id}`;
const wnode = (w: string, n: string) => `wf:${w}:${n}`;
const stereo = (s: string | undefined) => (s ? `«${s}»` : undefined);
const lines = (...l: (string | false | undefined)[]) => l.filter(Boolean).join('\n') || undefined;

/**
 * The generic process chart (URS-PM-020): one row per region with its states and transitions (labelled with
 * their trigger and guard), the Signals and Subscribers rows (URS-TYP-029), and one row per workflow.
 */
export function processToIR(m: ProcessDoc): GraphIR {
  const ops = new Map((m.operations ?? []).map((o) => [o.id, nameOf(o)]));
  const sigs = new Map((m.signals ?? []).map((s) => [s.id, s.label ?? s.id]));
  const known = new Set(m.regions.flatMap((r) => r.states.map((s) => s.id)));
  const rule = (id: string) => ruleText(m, id) ?? id;
  const lanes: Band[] = [];
  const nodes: IRNode[] = [];
  const edges: IREdge[] = [];
  const line = over(m.edgeStyle, undefined);

  // What each state allows, by outcome, and what it calls on entry.
  const allows = (id: string) => {
    const by = new Map<string, string[]>();
    for (const p of m.permissions ?? []) if (p.state === id) by.set(p.outcome, [...(by.get(p.outcome) ?? []), `${ops.get(p.operation) ?? p.operation}${p.role ? ` (${p.role})` : ''}`]);
    return [...by].map(([o, list]) => `${o[0]!.toUpperCase()}${o.slice(1)}: ${list.join(', ')}`);
  };
  // Duplicate regions and states are reported by the rules and drawn once.
  const drawn = new Set<string>();
  m.regions.forEach((r, ri) => {
    const lane = `region:${r.id}`;
    if (lanes.some((l) => l.id === lane)) return;
    lanes.push({ id: lane, label: nameOf(r), src: pointer('regions', ri) });
    r.states.forEach((s, si) => {
      if (drawn.has(s.id)) return;
      drawn.add(s.id);
      const src = pointer('regions', ri, 'states', si);
      const sub = lines(stereo(s.stereotype), ...allows(s.id), !!s.entry?.length && `Entry: ${s.entry.map((o) => ops.get(o) ?? o).join(', ')}`);
      nodes.push({ id: state(s.id), shape: 'state', label: nameOf(s), ...(sub && { sub }), ...noted(m, s.annotation, { id: s.id, label: nameOf(s), type: 'State', ...(s.tags && { tags: s.tags }) }), lane, ...styled(m.styles, 'states', s.style), ...(s.quote && { quote: s.quote }), src });
      if (s.initial) {
        nodes.push({ id: `init:${s.id}`, shape: 'initial', label: '', lane, src: `${src}/initial` });
        edges.push({ id: `init:${s.id}>`, from: `init:${s.id}`, to: state(s.id), ...line, src: `${src}/initial` });
      }
      if (s.final) {
        nodes.push({ id: `final:${s.id}`, shape: 'final', label: '', lane, src: `${src}/final` });
        edges.push({ id: `final:${s.id}>`, from: state(s.id), to: `final:${s.id}`, ...line, src: `${src}/final` });
      }
    });
  });

  // Transitions, labelled with their trigger (a timer for time) and guard; unknown states are reported and left out.
  const triggerLabel = (t: PrTransition): EdgeLabel[] => {
    const tr = t.trigger;
    const [k] = tr ? triggerKinds(tr) : [];
    const text =
      t.label ??
      (k === 'call' ? ops.get(tr!.call!) ?? tr!.call! : k === 'signal' ? `On ${sigs.get(tr!.signal!) ?? tr!.signal!}` : k === 'after' ? `After ${tr!.after}` : k === 'at' ? `At ${tr!.at}` : k === 'when' ? `When ${rule(tr!.when!)}` : undefined);
    // One label, so the guard stays with its trigger: "Resolve [notes filled in]".
    const all = [text, t.guard && `[${rule(t.guard)}]`].filter(Boolean).join(' ');
    return all ? [{ text: all, ...((k === 'after' || k === 'at') && { icon: 'timer' as const }) }] : [];
  };
  (m.transitions ?? []).forEach((t, i) => {
    if (!known.has(t.from) || !known.has(t.to)) return;
    const labels = triggerLabel(t);
    edges.push({ id: `tr:${transitionId(t, i)}`, from: state(t.from), to: state(t.to), ...(labels.length && { labels }), ...over(m.edgeStyle, t.style), ...(t.quote && { quote: t.quote }), src: pointer('transitions', i) });
  });

  // Workflows: one row each, in BPMN-style notation.
  const wfLanes: Band[] = [];
  (m.workflows ?? []).forEach((w, wi) => {
    const lane = `wf:${w.id}`;
    if (wfLanes.some((l) => l.id === lane)) return;
    wfLanes.push({ id: lane, label: w.label, src: pointer('workflows', wi) });
    const ids = new Set<string>();
    w.nodes.forEach((n, ni) => !ids.has(n.id) && ids.add(n.id) && nodes.push(workflowNode(m, w.id, n, lane, pointer('workflows', wi, 'nodes', ni), ops, sigs)));
    w.flows.forEach((f, fi) => {
      if (!ids.has(f.from) || !ids.has(f.to)) return;
      edges.push({ id: `${wnode(w.id, f.from)}>${f.to}:${fi}`, from: wnode(w.id, f.from), to: wnode(w.id, f.to), ...(f.guard && { labels: [{ text: rule(f.guard) }] }), ...line, src: pointer('workflows', wi, 'flows', fi) });
    });
  });

  // Signals: from the state that publishes them or the workflow nodes that send them, to subscribers (URS-TYP-029).
  const ev = eventParts(m, {
    pill: (s) => (known.has(s) ? state(s) : undefined),
    start: (id) => {
      const w = m.workflows?.find((x) => x.id === id);
      const first = w?.nodes.find((n) => n.kind === 'initial');
      return first && wnode(id, first.id);
    },
    at: (_on, band) => ({ lane: band }),
    publishers: (sig) => (m.workflows ?? []).flatMap((w) => w.nodes.filter((n) => n.kind === 'send' && n.signal === sig).map((n) => wnode(w.id, n.id))),
  });
  nodes.push(...ev.nodes);
  edges.push(...ev.edges);

  const title = m.title ?? m.object?.label;
  const meta: [string, string][] = [
    ...(m.title && m.object ? [['Object', m.object.label] as [string, string]] : []),
    ...(m.profile ? [['Profile', m.profile] as [string, string]] : []),
    ...Object.entries(m.info ?? {}),
  ];
  const legend = m.legend === false ? [] : processLegend(m, nodes, edges);
  return {
    ...(title !== undefined && { title }),
    ...(m.theme && { theme: m.theme }),
    direction: 'LR',
    nodes,
    edges,
    containers: [],
    partitions: { lanes: [...lanes, ...ev.bands, ...wfLanes] },
    ...(legend.length && { legend }),
    ...(meta.length && { meta }),
  };
}

function workflowNode(m: ProcessDoc, w: string, n: PrNode, lane: string, src: string, ops: Map<string, string>, sigs: Map<string, string>): IRNode {
  const label = n.label ?? (n.kind === 'initial' ? 'Start' : n.kind === 'final' ? 'End' : n.kind === 'send' ? (sigs.get(n.signal ?? '') ?? n.id) : ['merge', 'fork', 'join'].includes(n.kind) ? '' : n.id);
  const sub = lines(stereo(n.stereotype), n.role, !!n.calls?.length && `Calls: ${n.calls.map((o) => ops.get(o) ?? o).join(', ')}`);
  return {
    id: wnode(w, n.id),
    shape: SHAPE[n.kind],
    label,
    ...(sub && { sub }),
    ...noted(m, n.annotation, { id: n.id, label: label || n.id, type: KIND[n.kind], ...(n.role && { owner: n.role }), ...(n.tags && { tags: n.tags }) }),
    lane,
    ...(n.kind === 'task' ? styled(m.styles, 'tasks', n.style) : n.style ? { style: n.style } : {}),
    ...(n.quote && { quote: n.quote }),
    src,
  };
}

/** Only what the chart uses (URS-DM-026). */
function processLegend(m: ProcessDoc, nodes: readonly IRNode[], edges: readonly IREdge[]): LegendItem[] {
  const out: LegendItem[] = [];
  const add = (on: boolean, it: LegendItem) => on && !out.some((o) => o.label === it.label) && out.push(it);
  const has = (shape: string) => nodes.some((n) => n.shape === shape);
  add(has('initial'), { label: 'Initial state', shape: 'initial' });
  add(has('final'), { label: 'Final state', shape: 'final' });
  add(edges.some((e) => e.labels?.some((l) => l.icon === 'timer')), { label: 'Time trigger', icon: 'timer' });
  for (const kind of ['initial', 'task', 'decision', 'merge', 'fork', 'send', 'final'] as const)
    add(nodes.some((n) => n.id.startsWith('wf:') && n.shape === SHAPE[kind]), { label: KIND[kind], shape: SHAPE[kind], ...(kind === 'task' && m.styles?.tasks && { style: m.styles.tasks }) });
  for (const it of eventLegend(nodes, edges)) add(true, it);
  return out;
}
