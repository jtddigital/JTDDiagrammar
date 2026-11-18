import type { Metaclass, ProcessModel, StateMachine, Workflow, WNode } from './model.ts';
import { permission } from './semantics.ts';
import { type Profile, type Profiles } from './profiles.ts';

/** A finding in the model's own terms; the type turns it into a diagnostic at `src`. */
export interface Finding {
  code: 'deadJoin' | 'unreachable' | 'noCompletion' | 'noTrigger' | 'silentTrigger' | 'neverPermitted' | 'orphanSubscription' | 'profile';
  message: string;
  src?: string;
}

/** Tokens per flow are capped, so loops that fork keep the state space finite. */
const CAP = 2;
/** Workflows bigger than this are explored only this far. */
const MAX_MARKINGS = 20000;

/**
 * Token-flow analysis of a workflow (URS-PM-017, BPMN 2.0 execution semantics): a fork puts a token on every
 * outgoing flow; any other node with several outgoing flows takes one of them; a join waits for a token on
 * every incoming flow; a final node, or a node without outgoing flows, consumes the token. Every reachable
 * marking is explored.
 */
export function tokenFlow(w: Workflow) {
  const out = new Map<string, number[]>();
  const inc = new Map<string, number[]>();
  w.flows.forEach((f, i) => {
    out.set(f.from, [...(out.get(f.from) ?? []), i]);
    inc.set(f.to, [...(inc.get(f.to) ?? []), i]);
  });
  const byId = new Map(w.nodes.map((n) => [n.id, n]));
  const fired = new Set<string>();
  const marked = new Set<number>();
  let completes = false;
  const key = (m: number[]) => m.join(',');
  const start = w.flows.map(() => 0);
  for (const n of w.nodes.filter((x) => x.kind === 'initial')) {
    fired.add(n.id);
    for (const i of out.get(n.id) ?? []) start[i] = Math.min(CAP, start[i]! + 1);
  }
  const seen = new Set([key(start)]);
  const queue = [start];
  while (queue.length && seen.size < MAX_MARKINGS) {
    const m = queue.pop()!;
    m.forEach((c, i) => c && marked.add(i));
    if (m.every((c) => !c)) completes = true;
    const next: number[][] = [];
    for (const n of w.nodes) {
      const ins = inc.get(n.id) ?? [];
      const outs = out.get(n.id) ?? [];
      // Which incoming tokens it consumes: all for a join, any one for anything else.
      const takes = n.kind === 'join' ? (ins.length && ins.every((i) => m[i]) ? [ins] : []) : ins.filter((i) => m[i]).map((i) => [i]);
      for (const take of takes) {
        fired.add(n.id);
        const base = m.slice();
        for (const i of take) base[i]!--;
        const produce = n.kind === 'final' || !outs.length ? [[]] : n.kind === 'fork' ? [outs] : outs.map((o) => [o]);
        for (const p of produce) {
          const nm = base.slice();
          for (const o of p) nm[o] = Math.min(CAP, nm[o]! + 1);
          next.push(nm);
        }
      }
    }
    for (const nm of next) {
      const k = key(nm);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(nm);
      }
    }
  }
  const unreachable = w.nodes.filter((n) => !fired.has(n.id));
  // A join that never fires although a token reaches one of its incoming flows.
  const deadJoins = unreachable.filter((n) => n.kind === 'join' && (inc.get(n.id) ?? []).some((i) => marked.has(i)));
  return { unreachable, deadJoins, completes, byId };
}

const label = (n: WNode) => n.name || n.kind;

/** Reachable states of each region, from its initial state over any trigger. */
export function reachableStates(machine: StateMachine): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of machine.regions) {
    const seen = new Set(r.initial ? [r.initial] : []);
    const queue = [...seen];
    while (queue.length) {
      const at = queue.shift()!;
      for (const t of machine.transitions)
        if (t.region === r.id && t.from === at && !seen.has(t.to)) {
          seen.add(t.to);
          queue.push(t.to);
        }
    }
    out.set(r.id, seen);
  }
  return out;
}

/** Every combination of one reachable state per region, up to `limit` combinations. */
function combinations(states: Map<string, Set<string>>, limit = 4096): string[][] {
  let acc: string[][] = [[]];
  for (const s of states.values()) {
    if (!s.size) continue;
    acc = acc.flatMap((c) => [...s].map((x) => [...c, x]));
    if (acc.length > limit) return acc.slice(0, limit);
  }
  return acc;
}

/** Metaclass of a node, for profile conformance. */
const nodeClass = (n: WNode): Metaclass =>
  ({ initial: 'InitialNode', final: 'ActivityFinalNode', task: n.calls?.length ? 'CallOperationAction' : 'OpaqueAction', decision: 'DecisionNode', merge: 'MergeNode', fork: 'ForkNode', join: 'JoinNode', send: 'SendSignalAction' })[n.kind] as Metaclass;

/** Stereotypes come from the model's profile or Process, exist there, and fit the element (URS-PM-015). */
function conformance(m: ProcessModel, reg: Profiles): Finding[] {
  const out: Finding[] = [];
  const el: { e: { name: string; stereotype?: { profile: string; name: string }; src?: string }; mc: Metaclass }[] = [
    ...m.objects.map((e) => ({ e, mc: 'Class' as Metaclass })),
    ...m.machines.flatMap((x) => [...x.regions.map((e) => ({ e, mc: 'Region' as Metaclass })), ...x.regions.flatMap((r) => r.states.map((e) => ({ e, mc: 'State' as Metaclass }))), ...x.transitions.map((e) => ({ e, mc: 'Transition' as Metaclass }))]),
    ...m.operations.map((e) => ({ e, mc: 'Operation' as Metaclass })),
    ...m.workflows.flatMap((w) => [{ e: w, mc: 'Activity' as Metaclass }, ...w.nodes.map((e) => ({ e, mc: nodeClass(e) }))]),
  ];
  for (const { e, mc } of el) {
    const s = e.stereotype;
    if (!s) continue;
    if (s.profile !== m.profile && s.profile !== 'process') out.push({ code: 'profile', message: `'${e.name}' uses «${s.name}» from profile '${s.profile}', which conflicts with the chart's profile '${m.profile}'`, src: e.src });
    else {
      const def = reg.stereotype(s.profile, s.name);
      if (!def) out.push({ code: 'profile', message: `'${e.name}' uses «${s.name}», which profile '${s.profile}' does not define`, src: e.src });
      else if (!def.extends.includes(mc)) out.push({ code: 'profile', message: `«${s.name}» does not apply to a ${mc} ('${e.name}')`, src: e.src });
    }
  }
  return out;
}

/**
 * Model checks (URS-PM-017, URS-PM-006, URS-PM-014, URS-PM-015): token-flow checks of every workflow,
 * transitions without a trigger or whose trigger is never raised, operations permitted in no reachable
 * combination of states, subscriptions to signals nobody publishes, and profile conformance.
 */
export function checkModel(m: ProcessModel, p: Profile, reg: Profiles): Finding[] {
  const out: Finding[] = [];
  for (const w of m.workflows) {
    const t = tokenFlow(w);
    for (const n of t.deadJoins) out.push({ code: 'deadJoin', message: `in '${w.name}', '${label(n)}' waits for branches that can never all arrive`, src: n.src });
    for (const n of t.unreachable) if (n.kind !== 'join' || !t.deadJoins.includes(n)) out.push({ code: 'unreachable', message: `in '${w.name}', '${label(n)}' can never be reached`, src: n.src });
    // A dead join already explains why it cannot complete.
    if (!t.completes && !t.deadJoins.length) out.push({ code: 'noCompletion', message: `'${w.name}' can never complete`, src: w.src });
  }

  // Who can raise each trigger.
  const called = new Set([
    ...m.operations.filter((o) => o.callers?.length).map((o) => o.id),
    ...m.workflows.flatMap((w) => w.nodes.flatMap((n) => (n.calls ?? []).map((c) => c.operation))),
    ...m.subscriptions.flatMap((s) => (s.consumer.kind === 'operation' ? [s.consumer.operation] : [])),
    ...m.machines.flatMap((x) => [...x.transitions.flatMap((t) => t.effects ?? []), ...x.regions.flatMap((r) => r.states.flatMap((s) => s.entry ?? []))]).flatMap((e) => (e.kind === 'call' ? [e.operation] : [])),
  ]);
  const published = new Set([
    ...m.machines.flatMap((x) => [...x.transitions.flatMap((t) => t.effects ?? []), ...x.regions.flatMap((r) => r.states.flatMap((s) => s.entry ?? []))]).flatMap((e) => (e.kind === 'signal' ? [e.signal] : [])),
    ...m.workflows.flatMap((w) => w.nodes.flatMap((n) => (n.signal ? [n.signal] : []))),
  ]);
  for (const x of m.machines)
    for (const t of x.transitions) {
      if (!t.trigger) out.push({ code: 'noTrigger', message: `'${t.name}' has nothing that fires it`, src: t.src });
      else if (t.trigger.kind === 'call' && !called.has(t.trigger.operation)) out.push({ code: 'silentTrigger', message: `'${t.name}' waits for '${m.operations.find((o) => t.trigger?.kind === 'call' && o.id === t.trigger.operation)?.name ?? t.trigger.operation}', which nothing calls`, src: t.src });
      else if (t.trigger.kind === 'signal' && !published.has(t.trigger.signal)) out.push({ code: 'silentTrigger', message: `'${t.name}' waits for '${t.trigger.signal}', which nothing publishes`, src: t.src });
    }

  // Operations whose permission refuses them in every reachable combination of states.
  for (const x of m.machines) {
    const combos = combinations(reachableStates(x));
    const ops = new Set(m.permissions.map((e) => e.operation));
    for (const o of m.operations)
      if (o.object === x.object && ops.has(o.id) && combos.every((c) => permission(m, p, c, o.id) === 'forbidden'))
        out.push({ code: 'neverPermitted', message: `'${o.name}' is forbidden in every reachable combination of states`, src: o.src });
  }

  for (const s of m.subscriptions) if (!published.has(s.signal)) out.push({ code: 'orphanSubscription', message: `'${s.name}' listens for '${s.signal}', which nothing publishes`, src: s.src });
  return [...out, ...conformance(m, reg)];
}
