import { pointer } from '../../diagnostics.ts';
import { eventsToProcess, ruleTexts } from '../process/events.ts';
import { emptyModel, type Flow, type ProcessModel, type PState, type Transition, type WNode } from '../process/model.ts';
import { KIND, sharedFrom, stateOf, type Lifecycle, type LcStep } from './model.ts';

const VEEVA = 'veeva';
const st = (name: string, values?: Record<string, unknown>) => ({ profile: VEEVA, name, ...(values && { values }) });
const OBJECT = 'object';
const REGION = 'lifecycle';
/** The lifecycle operation that moves the record into a state, called by workflows' state changes. */
export const changeTo = (state: string) => `change:${state}`;
/** The signal published when the record enters a state; workflows started on entry subscribe to it. */
export const entered = (state: string) => `entered:${state}`;

/**
 * Map a lifecycle onto the canonical process model in the Veeva profile (URS-PM-016, ARCHITECTURE §13.7).
 * Presentation (styles, legend, annotations, layout settings) is not part of the model.
 */
export function lifecycleToProcess(m: Lifecycle): ProcessModel {
  const p = emptyModel(VEEVA);
  const name = new Map(m.states.map((s) => [s.id, s.label ?? s.id]));
  p.objects.push({ id: OBJECT, name: m.title ?? m.object ?? 'Object', stereotype: st('Veeva Object', m.object ? { apiName: m.object } : undefined) });

  // States, each publishing that it was entered; gates and entry criteria guard the way in.
  const stage = new Map((m.stages ?? []).flatMap((g) => g.states.map((s) => [s, g.id] as const)));
  const states: PState[] = m.states.map((s, i) => ({
    id: s.id,
    name: name.get(s.id)!,
    stereotype: st('Veeva State', { stateType: s.stateType ?? 'steady', ...(stage.has(s.id) && { stage: stage.get(s.id) }) }),
    entry: [
      { kind: 'signal' as const, signal: entered(s.id) },
      ...(s.records ?? []).map((_, j) => ({ kind: 'call' as const, operation: `create:${s.id}:${j}`, object: `record:${s.id}:${j}` })),
    ],
    src: pointer('states', i),
  }));
  const guard = new Map<string, string>();
  m.states.forEach((s, i) => {
    const text = [...(s.entryCriteria ?? []), ...(s.gate?.criteria ?? []), ...(s.gate?.fields?.length ? [`Required: ${s.gate.fields.join(', ')}`] : []), ...ruleTexts(m, s.gate?.rules)];
    if (!text.length) return;
    p.rules.push({ id: `entry:${s.id}`, name: `entry into ${name.get(s.id)}`, text: text.join('; '), via: s.gate?.fields?.length ? 'required fields' : 'entry criteria', src: pointer('states', i, s.gate ? 'gate' : 'entryCriteria') });
    guard.set(s.id, `entry:${s.id}`);
  });
  for (const s of m.states) p.signals.push({ id: entered(s.id), name: `${name.get(s.id)} entered` });

  // Child records: created on entry, related «create».
  m.states.forEach((s, i) =>
    (s.records ?? []).forEach((r, j) => {
      const id = `record:${s.id}:${j}`;
      p.objects.push({ id, name: r.label ?? r.record, stereotype: st('Veeva Child Record', r.fields ? { fields: r.fields } : undefined), src: pointer('states', i, 'records', j) });
      p.relations.push({ id: `rel:${id}`, name: `${r.record} created in ${name.get(s.id)}`, kind: 'create', from: OBJECT, to: id, src: pointer('states', i, 'records', j) });
      p.operations.push({ id: `create:${s.id}:${j}`, name: `create ${r.record}`, object: id });
    }),
  );

  const transitions: Transition[] = [];
  const into = (to: string) => (guard.has(to) ? { guard: guard.get(to)! } : {});
  // User actions and scheduled jobs (a job is a time trigger; no permission check).
  m.states.forEach((s, i) =>
    (s.to ?? []).forEach((a, j) => {
      const id = a.id ?? `action:${s.id}:${j}`;
      const src = pointer('states', i, 'to', j);
      if (a.by === 'job') {
        transitions.push({ id, name: a.label ?? `${name.get(s.id)} → ${name.get(a.state) ?? a.state}`, region: REGION, from: s.id, to: a.state, trigger: { kind: 'time', ...(a.after && { after: a.after }) }, ...into(a.state), src });
        return;
      }
      p.operations.push({ id, name: a.label ?? id, object: OBJECT, callers: ['user'], stereotype: st('Veeva User Action'), src });
      transitions.push({ id: `t:${id}`, name: a.label ?? id, region: REGION, from: s.id, to: a.state, trigger: { kind: 'call', operation: id }, ...into(a.state), src });
    }),
  );
  (m.sharedActions ?? []).forEach((a, i) => {
    const id = a.id ?? `shared:${i}`;
    const src = pointer('sharedActions', i);
    p.operations.push({ id, name: a.label ?? id, object: OBJECT, callers: ['user'], stereotype: st('Veeva User Action'), src });
    for (const f of sharedFrom(m, a)) transitions.push({ id: `t:${id}:${f}`, name: a.label ?? id, region: REGION, from: f, to: a.state, trigger: { kind: 'call', operation: id }, ...into(a.state), src });
  });
  // Workflow state changes: an operation per target state, from the state the record is in just before.
  const changes = new Set<string>();
  for (const w of m.workflows ?? []) {
    for (const s of w.steps) {
      if (s.kind !== 'stateChange' || !s.target) continue;
      changes.add(s.target);
      const before = w.steps.filter((x) => [...(x.to ?? []).map((l) => l.step), ...(x.verdicts ?? []).map((v) => v.step)].includes(s.id)).map(stateOf);
      for (const from of new Set(before.filter((x): x is string => !!x && x !== s.target)))
        transitions.push({ id: `t:${changeTo(s.target)}:${from}`, name: `${name.get(from) ?? from} → ${name.get(s.target) ?? s.target}`, region: REGION, from, to: s.target, trigger: { kind: 'call', operation: changeTo(s.target) }, ...into(s.target) });
    }
  }
  for (const t of changes) p.operations.push({ id: changeTo(t), name: `change state to ${name.get(t) ?? t}`, object: OBJECT });
  const initial = m.states.find((s) => s.stateType === 'initial');
  p.machines.push({ object: OBJECT, regions: [{ id: REGION, name: 'Lifecycle', ...(initial && { initial: initial.id }), states }], transitions: dedupe(transitions) });

  // Atomic security: state × read/edit × role.
  if (m.states.some((s) => s.security && Object.keys(s.security).length)) {
    for (const op of ['read', 'edit']) p.operations.push({ id: op, name: op, object: OBJECT, callers: ['user'] });
    m.states.forEach((s, i) =>
      Object.entries(s.security ?? {}).forEach(([role, access]) => {
        for (const op of /edit/i.test(access) ? ['read', 'edit'] : /read/i.test(access) ? ['read'] : []) p.permissions.push({ state: s.id, operation: op, role, outcome: 'allowed', src: pointer('states', i, 'security', role) });
      }),
    );
  }

  (m.workflows ?? []).forEach((w, wi) => p.workflows.push(workflow(m, w, wi, p)));
  eventsToProcess(p, m, (state) => [state]);
  return p;
}

/** One transition per source, target and trigger. */
const dedupe = (ts: Transition[]) => [...new Map(ts.map((t) => [`${t.from}|${t.to}|${JSON.stringify(t.trigger)}`, t])).values()];

const NODE: Record<NonNullable<LcStep['kind']>, WNode['kind']> = {
  start: 'initial',
  end: 'final',
  task: 'task',
  decision: 'decision',
  notification: 'send',
  system: 'task',
  stateChange: 'task',
  parallel: 'fork',
  join: 'join',
};

function workflow(m: Lifecycle, w: NonNullable<Lifecycle['workflows']>[number], wi: number, p: ProcessModel) {
  const nodes: WNode[] = w.steps.map((s, si) => {
    const kind = s.kind ?? 'task';
    const src = pointer('workflows', wi, 'steps', si);
    const calls = kind === 'stateChange' && s.target ? [{ operation: changeTo(s.target) }] : undefined;
    const stereotype =
      kind === 'task'
        ? st('Veeva Task', { ...(s.fields && { fields: s.fields }), ...(s.due && { due: s.due }), ...(s.completion && { completion: s.completion }), ...(s.signature && { signature: true }) })
        : kind === 'system'
          ? st('Veeva System Action', s.fields ? { fields: s.fields } : undefined)
          : kind === 'notification'
            ? st('Veeva Notification', s.owner ? { recipients: s.owner } : undefined)
            : undefined;
    const signal = kind === 'notification' ? `notified:${w.id}:${s.id}` : undefined;
    if (signal) p.signals.push({ id: signal, name: `${s.label ?? KIND[kind]} sent` });
    return { id: s.id, kind: NODE[kind], name: s.label ?? (kind === 'stateChange' ? `to ${s.target}` : s.id), ...(s.owner && { role: s.owner }), ...(calls && { calls }), ...(signal && { signal }), ...(stereotype && { stereotype }), src };
  });
  const flows: Flow[] = w.steps.flatMap((s, si) => [
    ...(s.to ?? []).map((l, j) => ({ id: `${s.id}>${l.step}:${j}`, name: l.label ?? '', from: s.id, to: l.step, src: pointer('workflows', wi, 'steps', si, 'to', j) })),
    ...(s.verdicts ?? []).map((v, j) => ({ id: `${s.id}>${v.step}:v${j}`, name: v.name, from: s.id, to: v.step, guard: v.name, src: pointer('workflows', wi, 'steps', si, 'verdicts', j) })),
  ]);
  // Started on entry: a subscription to the state's entered signal.
  if (w.start?.by === 'entry')
    p.subscriptions.push({ id: `start:${w.id}`, name: `${w.label} on entry`, signal: entered(w.start.state), consumer: { kind: 'workflow', workflow: w.id }, channel: 'local', src: `${pointer('workflows', wi)}/start` });
  return { id: w.id, name: w.label, stereotype: st('Veeva Workflow'), nodes, flows, src: pointer('workflows', wi) };
}
