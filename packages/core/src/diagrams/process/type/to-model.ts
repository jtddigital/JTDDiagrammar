import { pointer } from '../../../diagnostics.ts';
import { eventsToProcess } from '../events.ts';
import { emptyModel, type ProcessModel, type Stereotype, type Trigger } from '../model.ts';
import { nameOf, triggerKinds, type PrTrigger, type ProcessDoc } from './model.ts';

export const OBJECT = 'object';
/** A transition's id: its own, else by position. */
export const transitionId = (t: { id?: string }, i: number) => t.id ?? `t${i}`;

const trigger = (t: PrTrigger): Trigger | undefined => {
  const [k] = triggerKinds(t);
  if (k === 'call') return { kind: 'call', operation: t.call! };
  if (k === 'signal') return { kind: 'signal', signal: t.signal! };
  if (k === 'after' || k === 'at') return { kind: 'time', ...(t.after !== undefined && { after: t.after }), ...(t.at !== undefined && { at: t.at }) };
  if (k === 'when') return { kind: 'change', rule: t.when! };
  return undefined;
};

/** The source written in canonical terms, as the canonical model (URS-PM-020); its stereotypes in its profile, or Process. */
export function processToModel(m: ProcessDoc): ProcessModel {
  const profile = m.profile ?? 'process';
  const p = emptyModel(profile);
  const st = (e: { stereotype?: string; values?: Record<string, string> }): { stereotype?: Stereotype } =>
    e.stereotype ? { stereotype: { profile, name: e.stereotype, ...(e.values && { values: e.values }) } } : {};
  p.objects.push({ id: OBJECT, name: m.object?.label ?? m.title ?? 'Object', ...st(m.object ?? {}) });
  const regionOf = new Map(m.regions.flatMap((r) => r.states.map((s) => [s.id, r.id] as const)));
  p.machines.push({
    object: OBJECT,
    regions: m.regions.map((r, ri) => ({
      id: r.id,
      name: nameOf(r),
      ...(r.states.find((s) => s.initial) && { initial: r.states.find((s) => s.initial)!.id }),
      states: r.states.map((s, si) => ({ id: s.id, name: nameOf(s), ...st(s), ...(s.entry?.length && { entry: s.entry.map((op) => ({ kind: 'call' as const, operation: op })) }), src: pointer('regions', ri, 'states', si) })),
      src: pointer('regions', ri),
    })),
    transitions: (m.transitions ?? []).map((t, i) => {
      const tr = t.trigger && trigger(t.trigger);
      return { id: transitionId(t, i), name: t.label ?? `${t.from} → ${t.to}`, region: regionOf.get(t.from) ?? '', from: t.from, to: t.to, ...(tr && { trigger: tr }), ...(t.guard && { guard: t.guard }), src: pointer('transitions', i) };
    }),
  });
  (m.operations ?? []).forEach((o, i) => p.operations.push({ id: o.id, name: nameOf(o), object: OBJECT, ...(o.callers?.length && { callers: o.callers }), ...st(o), src: pointer('operations', i) }));
  (m.permissions ?? []).forEach((x, i) => p.permissions.push({ state: x.state, operation: x.operation, ...(x.role && { role: x.role }), outcome: x.outcome, src: pointer('permissions', i) }));
  (m.workflows ?? []).forEach((w, wi) =>
    p.workflows.push({
      id: w.id,
      name: w.label,
      ...st(w),
      nodes: w.nodes.map((n, ni) => ({
        id: n.id,
        name: n.label ?? n.id,
        kind: n.kind,
        ...st(n),
        ...(n.role && { role: n.role }),
        ...(n.calls?.length && { calls: n.calls.map((operation) => ({ operation })) }),
        ...(n.signal && { signal: n.signal }),
        src: pointer('workflows', wi, 'nodes', ni),
      })),
      flows: w.flows.map((f, fi) => ({ id: `${f.from}>${f.to}:${fi}`, name: f.guard ?? '', from: f.from, to: f.to, ...(f.guard && { guard: f.guard }), src: pointer('workflows', wi, 'flows', fi) })),
      src: pointer('workflows', wi),
    }),
  );
  eventsToProcess(p, m, (state) => [state]);
  return p;
}
