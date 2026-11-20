import { error, pointer, type Diagnostic } from '../../diagnostics.ts';
import type { Band, IREdge, IRNode, LegendItem, Style } from '../../ir/types.ts';
import { ref, style } from '../../schema/fragments.ts';
import { noted, tagsSchema, type AnnotationOptions } from '../annotations.ts';
import { over } from '../section-styles.ts';
import { DASHED, DOTTED } from './draw.ts';
import type { Consumer, ProcessModel } from './model.ts';

/**
 * Signals, subscriptions, channels and rules, authored and drawn the same way in every type that has them
 * (URS-TYP-029, URS-PM-010, URS-PM-014). A type supplies where states are, which workflows exist and how to
 * place a node; the rest is here.
 */

/** How a rule is evaluated (URS-PM-010). */
export const VIA = ['workflow condition', 'classification', 'BAdI', 'BRF+', 'script', 'entry criteria', 'other'] as const;

/** A named decision, referenced by id from gates, steps and conditions. */
export interface EvRule {
  id: string;
  text: string;
  via?: (typeof VIA)[number];
}

/** Who a signal is delivered to: a workflow (an arrow to its start), or an operation, handler or external system. */
export interface EvSubscriber {
  workflow?: string;
  operation?: string;
  handler?: string;
  system?: string;
  /** How it is delivered, e.g. "event mesh"; the arrow's label. */
  channel?: string;
}

/** A published fact, named in the past tense, published when `on` is entered. */
export interface EvSignal {
  id: string;
  label?: string;
  /** The state (or status) whose entry publishes it; optional where workflows send it. */
  on?: string;
  to?: EvSubscriber[];
  annotation?: string;
  tags?: string[];
  quote?: string;
  style?: Style;
}

export interface Events extends AnnotationOptions {
  rules?: EvRule[];
  signals?: EvSignal[];
  edgeStyle?: Style;
}

export const SIGNALS_BAND = 'events:signals';
export const SUBSCRIBERS_BAND = 'events:subscribers';
const signalNode = (id: string) => `signal:${id}`;
const KINDS = ['workflow', 'operation', 'handler', 'system'] as const;
const kindOf = (s: EvSubscriber) => KINDS.filter((k) => s[k] !== undefined);
const NAME = { operation: 'Operation', handler: 'Handler', system: 'System' } as const;

const text = (description: string) => ({ type: 'string', description }) as const;
const obj = (required: string[], properties: Record<string, unknown>, description?: string) => ({ type: 'object', additionalProperties: false, required, properties, ...(description && { description }) }) as const;

/** Schema properties for a type's top level. */
export const eventsSchema = (on: string, onRequired = true) =>
  ({
    rules: {
      type: 'array',
      description: 'Named rules (decisions), e.g. "Amount > 50,000 EUR". Gates, steps and conditions refer to them by id in `rules`.',
      items: obj(['id', 'text'], { id: ref('Rule id.'), text: text('What the rule says.'), via: { type: 'string', enum: VIA, description: 'How it is evaluated.' } }),
    },
    signals: {
      type: 'array',
      description: 'Signals: facts published when a state is entered, delivered to subscribers. Drawn in a Signals row, with subscribers that are not workflows in a Subscribers row.',
      items: obj(onRequired ? ['id', 'on'] : ['id'], {
        id: ref('Signal id.'),
        label: text('Named in the past tense, e.g. "Order released"; defaults to the id.'),
        on: text(on),
        to: {
          type: 'array',
          description: 'Subscribers: each names exactly one of `workflow`, `operation`, `handler` or `system`.',
          items: obj([], {
            workflow: ref('Workflow it starts: a dashed arrow to its start.', 'workflows'),
            operation: text('Operation it calls.'),
            handler: text('Handler that receives it, e.g. a BAdI or a script.'),
            system: text('External system it is sent to.'),
            channel: text('How it is delivered, e.g. "event mesh", "IDoc"; the arrow’s label.'),
          }),
        },
        annotation: text('Annotation: a numbered marker on the shape, with the text in the notes beside the chart.'),
        tags: tagsSchema,
        quote: text('Supporting excerpt from the source material; shown as a tooltip.'),
        style,
      }),
    },
  }) as const;

/** A rule's display text: what it says, and how it is evaluated. */
export const ruleText = (m: Events, id: string) => {
  const r = m.rules?.find((x) => x.id === id);
  return r ? (r.via ? `${r.text} (${r.via})` : r.text) : undefined;
};
/** The display texts of rules referenced by id; unknown ones are reported by `eventDiagnostics`. */
export const ruleTexts = (m: Events, ids: string[] | undefined) => (ids ?? []).flatMap((id) => ruleText(m, id) ?? []);

interface Known {
  /** States (or statuses) a signal can be published on. */
  states: ReadonlySet<string>;
  workflows: ReadonlySet<string>;
  /** Every `rules` reference in the source, with its JSON Pointer. */
  ruleRefs: { id: string; at: string }[];
}

/** Unique ids, known states, workflows and rules, and one target per subscriber. */
export function eventDiagnostics(m: Events, k: Known): Diagnostic[] {
  const out: Diagnostic[] = [];
  const unique = (list: { id: string }[] | undefined, key: string, what: string) => {
    const seen = new Set<string>();
    list?.forEach((x, i) => (seen.has(x.id) ? out.push(error(`events.${what}`, `${what} id '${x.id}' is used twice`, pointer(key, i, 'id'))) : seen.add(x.id)));
    return seen;
  };
  const rules = unique(m.rules, 'rules', 'rule');
  unique(m.signals, 'signals', 'signal');
  m.signals?.forEach((s, i) => {
    if (s.on !== undefined && !k.states.has(s.on)) out.push(error('ref.state', `signal '${s.id}' is published on unknown state '${s.on}'`, pointer('signals', i, 'on')));
    s.to?.forEach((t, j) => {
      const at = pointer('signals', i, 'to', j);
      if (kindOf(t).length !== 1) out.push(error('events.subscriber', `a subscriber of signal '${s.id}' must name exactly one of workflow, operation, handler or system`, at));
      else if (t.workflow !== undefined && !k.workflows.has(t.workflow)) out.push(error('ref.workflow', `signal '${s.id}' starts unknown workflow '${t.workflow}'`, `${at}/workflow`));
    });
  });
  for (const r of k.ruleRefs) if (!rules.has(r.id)) out.push(error('ref.rule', `unknown rule '${r.id}'`, r.at));
  return out;
}

/** Collect `rules` references under a list of items, as pointers. */
export const ruleRefs = (items: { rules?: string[] }[] | undefined, at: (i: number) => string) =>
  (items ?? []).flatMap((x, i) => (x.rules ?? []).map((id, j) => ({ id, at: `${at(i)}/rules/${j}` })));

interface Place {
  /** The node of a state (or status) a signal is published on. */
  pill: (on: string) => string | undefined;
  /** The start node of a workflow. */
  start: (workflow: string) => string | undefined;
  /** Where a node goes: the state's column (or row) in a band. */
  at: (on: string | undefined, band: string) => { lane: string; phase?: string };
  /** Other nodes that publish a signal, e.g. a workflow's send nodes. */
  publishers?: (signal: string) => string[];
}

/**
 * The Signals row: each signal in the column of the state that publishes it, a dotted arrow from that state,
 * and a dashed arrow to each subscriber, labelled with its channel. Workflows are reached at their start;
 * other subscribers go in a Subscribers row, one node per name.
 */
export function eventParts(m: Events, c: Place): { bands: Band[]; nodes: IRNode[]; edges: IREdge[] } {
  const from = (s: EvSignal) => [...(s.on !== undefined && c.pill(s.on) ? [c.pill(s.on)!] : []), ...(c.publishers?.(s.id) ?? [])];
  const signals = (m.signals ?? []).filter((s) => from(s).length);
  if (!signals.length) return { bands: [], nodes: [], edges: [] };
  const nodes: IRNode[] = [];
  const edges: IREdge[] = [];
  const subs = new Map<string, IRNode>();
  for (const s of signals) {
    const i = m.signals!.indexOf(s);
    const id = signalNode(s.id);
    const label = s.label ?? s.id;
    nodes.push({
      id,
      shape: 'signal',
      label,
      ...noted(m, s.annotation, { id: s.id, label, type: 'Signal', ...(s.tags && { tags: s.tags }) }),
      ...c.at(s.on, SIGNALS_BAND),
      ...(s.style && { style: s.style }),
      ...(s.quote && { quote: s.quote }),
      src: pointer('signals', i),
    });
    from(s).forEach((f, k) => edges.push({ id: k ? `${id}:on:${f}` : `${id}:on`, from: f, to: id, ...over(m.edgeStyle, DOTTED), src: pointer('signals', i, ...(s.on !== undefined && !k ? ['on'] : [])) }));
    s.to?.forEach((t, j) => {
      const [kind] = kindOf(t);
      if (!kind || kindOf(t).length > 1) return;
      let to: string | undefined;
      if (kind === 'workflow') to = c.start(t.workflow!);
      else {
        to = `sub:${kind}:${t[kind]}`;
        if (!subs.has(to)) subs.set(to, { id: to, shape: 'subprocess', label: t[kind]!, sub: NAME[kind], ...c.at(s.on, SUBSCRIBERS_BAND), src: pointer('signals', i, 'to', j) });
      }
      if (to) edges.push({ id: `${id}>${to}`, from: id, to, ...(t.channel && { labels: [{ text: t.channel }] }), ...over(m.edgeStyle, DASHED), src: pointer('signals', i, 'to', j) });
    });
  }
  nodes.push(...subs.values());
  const first = m.signals!.indexOf(signals[0]!);
  return {
    bands: [{ id: SIGNALS_BAND, label: 'Signals', src: pointer('signals', first) }, ...(subs.size ? [{ id: SUBSCRIBERS_BAND, label: 'Subscribers', src: pointer('signals', first, 'to') }] : [])],
    nodes,
    edges,
  };
}

/** Legend entries for what `eventParts` drew. */
export function eventLegend(nodes: readonly IRNode[], edges: readonly IREdge[]): LegendItem[] {
  const has = (p: (e: IREdge) => boolean) => edges.some(p);
  return [
    ...(nodes.some((n) => n.shape === 'signal') ? [{ label: 'Signal', shape: 'signal' }] : []),
    ...(nodes.some((n) => n.id.startsWith('sub:')) ? [{ label: 'Subscriber', shape: 'subprocess' }] : []),
    ...(has((e) => e.to.startsWith('signal:')) ? [{ label: 'Publishes a signal', line: DOTTED }] : []),
    ...(has((e) => e.from.startsWith('signal:')) ? [{ label: 'Delivers a signal', line: DASHED }] : []),
  ];
}

/**
 * Add authored rules, signals and subscriptions to a process model. `states` gives the model's states a
 * signal's `on` names; their entry publishes it.
 */
export function eventsToProcess(p: ProcessModel, m: Events, states: (on: string) => string[]) {
  m.rules?.forEach((r, i) => p.rules.push({ id: r.id, name: r.id, text: r.text, ...(r.via && { via: r.via }), src: pointer('rules', i) }));
  const byId = new Map(p.machines.flatMap((mc) => mc.regions.flatMap((r) => r.states.map((s) => [s.id, s] as const))));
  m.signals?.forEach((s, i) => {
    p.signals.push({ id: s.id, name: s.label ?? s.id, src: pointer('signals', i) });
    for (const id of s.on === undefined ? [] : states(s.on)) {
      const st = byId.get(id);
      if (st) st.entry = [...(st.entry ?? []), { kind: 'signal', signal: s.id }];
    }
    s.to?.forEach((t, j) => {
      const consumer: Consumer | undefined =
        t.workflow !== undefined ? { kind: 'workflow', workflow: t.workflow } : t.operation !== undefined ? { kind: 'operation', operation: t.operation } : t.handler !== undefined ? { kind: 'handler', name: t.handler } : t.system !== undefined ? { kind: 'system', name: t.system } : undefined;
      if (consumer) p.subscriptions.push({ id: `${s.id}>${j}`, name: `${s.label ?? s.id} to ${Object.values(consumer)[1]}`, signal: s.id, consumer, ...(t.channel && { channel: t.channel }), src: pointer('signals', i, 'to', j) });
    });
  });
}
