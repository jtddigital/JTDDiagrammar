import type { AiAssets } from '../../../registry/diagram-type.ts';
import { VIA } from '../events.ts';
import { NODE_KINDS, type NodeKind } from '../model.ts';
import type { PrTrigger, ProcessDoc } from './model.ts';

const str = { type: 'string' } as const;
const strs = { type: 'array', items: str } as const;
const bool = { type: 'boolean' } as const;
const desc = (description: string) => ({ type: 'string', description }) as const;
const quote = desc('Short verbatim excerpt from the material supporting this item; empty if none.');
/** Every property required; "", [] or false mean "not set" (URS-AI-004). */
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties }) as const;
const list = (description: string, item: Record<string, unknown>) => ({ type: 'array', description, items: obj(item) }) as const;
const TRIGGERS = ['call', 'signal', 'after', 'at', 'when', 'none'] as const;

/** Flat for generation: states, nodes and flows name their region or workflow. */
const schema = obj({
  title: str,
  object: desc('The object, e.g. "Work order".'),
  states: list('States; each names its region (an independent status dimension, e.g. "status", "hold").', { region: str, id: str, label: str, initial: bool, final: bool, quote }),
  operations: list('Operations that can be invoked on the object (user actions, API calls).', { id: str, label: str, byUser: bool, quote }),
  transitions: list('Moves between two states of one region.', {
    from: str,
    to: str,
    trigger: { type: 'string', enum: TRIGGERS, description: '"call" an operation, a "signal", "after" a duration, "at" a time, "when" a rule becomes true, or "none".' },
    ref: desc('Operation id, signal id, duration, time or rule id, per the trigger; empty for "none".'),
    guard: desc('Rule id that must hold; empty if none.'),
    quote,
  }),
  permissions: list('What a state allows or forbids.', { state: str, operation: str, role: desc('Empty for anyone.'), outcome: { type: 'string', enum: ['allowed', 'forbidden'] } }),
  rules: list('Named rules (decisions).', { id: str, text: str, via: { type: 'string', enum: [...VIA] } }),
  signals: list('Facts published when a state is entered (or sent by a workflow).', { id: str, label: desc('Past tense, e.g. "Order approved".'), on: desc('State id whose entry publishes it; empty if only a workflow sends it.') }),
  subscribers: list('Who receives each signal.', { signal: str, kind: { type: 'string', enum: ['workflow', 'operation', 'handler', 'system'] }, target: desc('Workflow id, operation id, or handler or system name.'), channel: desc('How it is delivered; empty if not stated.') }),
  workflows: list('Workflows.', { id: str, label: str }),
  nodes: list('Workflow nodes in order.', { workflow: str, id: str, kind: { type: 'string', enum: NODE_KINDS }, label: str, role: desc('Who performs it; empty if none.'), calls: { ...strs, description: 'Operation ids it calls.' }, signal: desc('For "send": the signal id; else empty.'), quote }),
  flows: list('Control flows between nodes of a workflow.', { workflow: str, from: str, to: str, guard: desc('Outcome or rule id; empty if none.') }),
});

interface G {
  title: string;
  object: string;
  states: { region: string; id: string; label: string; initial: boolean; final: boolean; quote: string }[];
  operations: { id: string; label: string; byUser: boolean; quote: string }[];
  transitions: { from: string; to: string; trigger: (typeof TRIGGERS)[number]; ref: string; guard: string; quote: string }[];
  permissions: { state: string; operation: string; role: string; outcome: string }[];
  rules: { id: string; text: string; via: (typeof VIA)[number] }[];
  signals: { id: string; label: string; on: string }[];
  subscribers: { signal: string; kind: 'workflow' | 'operation' | 'handler' | 'system'; target: string; channel: string }[];
  workflows: { id: string; label: string }[];
  nodes: { workflow: string; id: string; kind: NodeKind; label: string; role: string; calls: string[]; signal: string; quote: string }[];
  flows: { workflow: string; from: string; to: string; guard: string }[];
}

const text = <K extends string>(k: K, v: string | undefined) => (v ? ({ [k]: v } as Record<K, string>) : {});
const many = <K extends string, T>(k: K, v: T[] | undefined) => (v?.length ? ({ [k]: v } as Record<K, T[]>) : {});

const guide = `Diagram type: process (a generic process for a platform without its own type, e.g. IBM Maximo or PTC Windchill).
- "states" are the object's states, each in a region: a region is one independent dimension of its status (most objects have one, e.g. "status"; a hold flag is a second). One state per region is "initial"; end states are "final".
- "operations" are what can be invoked on the object; "byUser" when users run them directly. "transitions" move between two states of the same region, fired by a "call" of an operation, a "signal", "after" a duration, "at" a time, or "when" a rule becomes true; "guard" names a rule that must hold.
- "permissions" say what a state allows or forbids. "rules" are named decisions; "signals" are facts published when a state is entered, delivered to "subscribers" (a workflow they start, an operation, a handler or an external system).
- "workflows" are activities: "nodes" in order (initial, task, decision, merge, fork, join, send, final) and "flows" between them; a task's "calls" are the operations it invokes.
- Where the material supports an item directly, set "quote" to a short verbatim excerpt (at most 20 words). Use "", [] or false for anything not stated.`;

const examples = [
  {
    input: 'A work order waits on approval, then is approved; users can cancel it before approval. The approval workflow has a manager approve it, which approves the work order.',
    output: {
      title: 'Work order',
      object: 'Work order',
      states: [
        { region: 'status', id: 'WAPPR', label: 'Waiting on approval', initial: true, final: false, quote: '' },
        { region: 'status', id: 'APPR', label: 'Approved', initial: false, final: false, quote: '' },
        { region: 'status', id: 'CAN', label: 'Cancelled', initial: false, final: true, quote: 'users can cancel it before approval' },
      ],
      operations: [
        { id: 'approve', label: 'Approve', byUser: false, quote: '' },
        { id: 'cancel', label: 'Cancel', byUser: true, quote: '' },
      ],
      transitions: [
        { from: 'WAPPR', to: 'APPR', trigger: 'call', ref: 'approve', guard: '', quote: '' },
        { from: 'WAPPR', to: 'CAN', trigger: 'call', ref: 'cancel', guard: '', quote: '' },
      ],
      permissions: [],
      rules: [],
      signals: [{ id: 'created', label: 'Work order created', on: 'WAPPR' }],
      subscribers: [{ signal: 'created', kind: 'workflow', target: 'approval', channel: '' }],
      workflows: [{ id: 'approval', label: 'Approval' }],
      nodes: [
        { workflow: 'approval', id: 'start', kind: 'initial', label: '', role: '', calls: [], signal: '', quote: '' },
        { workflow: 'approval', id: 'manager', kind: 'task', label: 'Approve', role: 'Manager', calls: ['approve'], signal: '', quote: 'has a manager approve it' },
        { workflow: 'approval', id: 'end', kind: 'final', label: '', role: '', calls: [], signal: '', quote: '' },
      ],
      flows: [
        { workflow: 'approval', from: 'start', to: 'manager', guard: '' },
        { workflow: 'approval', from: 'manager', to: 'end', guard: '' },
      ],
    },
  },
];

const trigger = (t: G['transitions'][number]): PrTrigger | undefined => {
  if (t.trigger === 'none' || !t.ref) return undefined;
  const key = t.trigger;
  return { [key]: t.ref } as PrTrigger;
};

export const processAi: AiAssets<ProcessDoc> = {
  schema,
  guide,
  examples,
  // States group into regions in order of appearance; nodes and flows into their workflows.
  fromGenerated: (generated) => {
    const g = generated as G;
    const regions = [...new Set(g.states.map((s) => s.region || 'status'))].map((r) => ({
      id: r,
      states: g.states
        .filter((s) => (s.region || 'status') === r)
        .map((s) => ({ id: s.id, ...text('label', s.label), ...(s.initial && { initial: true }), ...(s.final && { final: true }), ...text('quote', s.quote) })),
    }));
    return {
      version: '1',
      type: 'process',
      title: g.title,
      ...(g.object && { object: { label: g.object } }),
      ...many('rules', g.rules.map((r) => ({ id: r.id, text: r.text, via: r.via }))),
      regions,
      ...many('operations', g.operations.map((o) => ({ id: o.id, ...text('label', o.label), ...(o.byUser && { callers: ['user' as const] }), ...text('quote', o.quote) }))),
      ...many('transitions', g.transitions.map((t) => ({ from: t.from, to: t.to, ...(trigger(t) && { trigger: trigger(t)! }), ...text('guard', t.guard), ...text('quote', t.quote) }))),
      ...many('permissions', g.permissions.map((p) => ({ state: p.state, operation: p.operation, ...text('role', p.role), outcome: p.outcome }))),
      ...many(
        'signals',
        g.signals.map((s) => ({
          id: s.id,
          ...text('label', s.label),
          ...text('on', s.on),
          ...many('to', g.subscribers.filter((x) => x.signal === s.id).map((x) => ({ [x.kind]: x.target, ...text('channel', x.channel) }))),
        })),
      ),
      ...many(
        'workflows',
        // A workflow without nodes is not a workflow.
        g.workflows.filter((w) => g.nodes.some((n) => n.workflow === w.id)).map((w) => ({
          id: w.id,
          label: w.label,
          nodes: g.nodes.filter((n) => n.workflow === w.id).map((n) => ({ id: n.id, kind: n.kind, ...text('label', n.label), ...text('role', n.role), ...many('calls', n.calls), ...text('signal', n.signal), ...text('quote', n.quote) })),
          flows: g.flows.filter((f) => f.workflow === w.id).map((f) => ({ from: f.from, to: f.to, ...text('guard', f.guard) })),
        })),
      ),
    };
  },
};
