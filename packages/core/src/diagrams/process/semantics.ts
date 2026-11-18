import type { Effect, Operation, ProcessModel, StateMachine, Transition, Trigger } from './model.ts';
import { coreCombine, PROCESS, type Profile } from './profiles.ts';

/** One object's current states: the active state of each region. */
export type Instance = Map<string, string>;

/** Every region at its initial state. */
export const initialInstance = (machine: StateMachine): Instance => new Map(machine.regions.flatMap((r) => (r.initial ? [[r.id, r.initial] as const] : [])));

/**
 * The outcome of calling `operation` with these states active (URS-PM-009): the active states' entries for it
 * (only those for `role`, or for no role, when a role is given), combined by the profile's rule, else the
 * core rule; with no entry at all, the profile's outcome for that.
 */
export function permission(m: ProcessModel, p: Profile, active: Iterable<string>, operation: string, role?: string): string {
  const states = new Set(active);
  const outcomes = m.permissions.filter((e) => states.has(e.state) && e.operation === operation && (e.role === undefined || e.role === role)).map((e) => e.outcome);
  if (!outcomes.length) return p.noEntry ?? PROCESS.noEntry!;
  return (p.combine ?? coreCombine)(outcomes) ?? p.noEntry ?? PROCESS.noEntry!;
}

/** What happened: the outcome, the transitions fired, the signals published and the operations called by effects. */
export interface Step {
  outcome: string;
  fired: Transition[];
  signals: string[];
  calls: Extract<Effect, { kind: 'call' }>[];
}

const matches = (t: Trigger | undefined, by: Trigger) =>
  !!t &&
  t.kind === by.kind &&
  ((t.kind === 'call' && by.kind === 'call' && t.operation === by.operation) ||
    (t.kind === 'signal' && by.kind === 'signal' && t.signal === by.signal) ||
    (t.kind === 'change' && by.kind === 'change' && t.rule === by.rule) ||
    t.kind === 'time');

/** Fire, all at once, every enabled transition the trigger matches, at most one per region, then run effects. */
function fire(machine: StateMachine, inst: Instance, by: Trigger, holds: (rule: string) => boolean): Omit<Step, 'outcome'> {
  const fired: Transition[] = [];
  for (const r of machine.regions) {
    const t = machine.transitions.find((x) => x.region === r.id && x.from === inst.get(r.id) && matches(x.trigger, by) && (!x.guard || holds(x.guard)));
    if (t) fired.push(t);
  }
  const effects: Effect[] = [];
  for (const t of fired) {
    inst.set(t.region, t.to);
    effects.push(...(t.effects ?? []), ...(machine.regions.find((r) => r.id === t.region)!.states.find((s) => s.id === t.to)?.entry ?? []));
  }
  return {
    fired,
    signals: effects.flatMap((e) => (e.kind === 'signal' ? [e.signal] : [])),
    calls: effects.flatMap((e) => (e.kind === 'call' ? [e] : [])),
  };
}

/**
 * Call an operation on an object (URS-PM-007): check permission against every active state; if refused,
 * nothing changes; otherwise fire every transition waiting for the call, in every region at once, and run
 * their effects. `warning` and other non-forbidden outcomes still run.
 */
export function call(m: ProcessModel, p: Profile, machine: StateMachine, inst: Instance, op: Operation | string, role?: string, holds: (rule: string) => boolean = () => true): Step {
  const operation = typeof op === 'string' ? op : op.id;
  const outcome = permission(m, p, inst.values(), operation, role);
  if (outcome === 'forbidden') return { outcome, fired: [], signals: [], calls: [] };
  return { outcome, ...fire(machine, inst, { kind: 'call', operation }, holds) };
}

/** A direct trigger (signal, time, change): fires transitions without a permission check (URS-PM-008). */
export function trigger(machine: StateMachine, inst: Instance, by: Exclude<Trigger, { kind: 'call' }>, holds: (rule: string) => boolean = () => true): Step {
  return { outcome: 'allowed', ...fire(machine, inst, by, holds) };
}

/** Who receives a signal: its subscriptions (URS-PM-014). */
export const deliver = (m: ProcessModel, signal: string) => m.subscriptions.filter((s) => s.signal === signal);
