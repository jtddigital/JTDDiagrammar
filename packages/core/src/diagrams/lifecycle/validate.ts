import { error, pointer, warning, type Diagnostic } from '../../diagnostics.ts';
import { badStages, ends, nextOf, stateOf, stepsOf, transitions, type Lifecycle } from './model.ts';

/**
 * Lifecycle rules (URS-TYP-008), worded in lifecycle terms. References that toIR cannot place
 * (unknown states, bad stages) are reported here and kept out of the IR, so the common rules
 * never repeat them in lane/phase terms.
 */
export function validateLifecycle(m: Lifecycle): Diagnostic[] {
  const out: Diagnostic[] = [];
  const states = new Set(m.states.map((s) => s.id));
  if (!m.states.length) out.push(error('lifecycle.states', 'a lifecycle needs at least one state', '/states'));

  const initials = m.states.flatMap((s, i) => (s.stateType === 'initial' ? [i] : []));
  if (initials.length > 1) for (const i of initials.slice(1)) out.push(error('lifecycle.initial', `only one state can be initial; '${m.states[initials[0]!]!.id}' already is`, pointer('states', i, 'stateType')));
  if (m.states.length && !initials.length) out.push(warning('lifecycle.initial', 'no state is marked `stateType: initial`', '/states'));

  m.states.forEach((s, i) =>
    (s.to ?? []).forEach((a, j) => {
      if (!states.has(a.state)) out.push(error('ref.state', `user action from '${s.id}' references unknown state '${a.state}'`, pointer('states', i, 'to', j, 'state')));
    }),
  );
  m.sharedActions?.forEach((a, i) => {
    if (!states.has(a.state)) out.push(error('ref.state', `shared action targets unknown state '${a.state}'`, pointer('sharedActions', i, 'state')));
    for (const [k, list] of [['from', a.from], ['except', a.except]] as const)
      list?.forEach((id, j) => states.has(id) || out.push(error('ref.state', `shared action references unknown state '${id}'`, pointer('sharedActions', i, k, j))));
  });
  m.workflows?.forEach((w, i) => {
    if (w.start && !states.has(w.start.state)) out.push(error('ref.state', `workflow '${w.id}' starts in unknown state '${w.start.state}'`, pointer('workflows', i, 'start', 'state')));
  });
  m.stages?.forEach((g, i) => {
    const why = badStages(m).get(g.id);
    if (why) out.push(error('lifecycle.stage', why, pointer('stages', i)));
  });

  for (const { step: s, src } of stepsOf(m)) {
    if (s.kind === 'stateChange') {
      if (s.target === undefined) out.push(error('lifecycle.target', `state change '${s.id}' needs a target state`, src));
      else if (!states.has(s.target)) out.push(error('ref.state', `state change '${s.id}' targets unknown state '${s.target}'`, `${src}/target`));
    }
    const at = stateOf(s);
    if (at === undefined) out.push(error('lifecycle.state', `step '${s.id}' needs a state`, src));
    else if (s.state !== undefined && !states.has(s.state)) out.push(error('ref.state', `step '${s.id}' references unknown state '${s.state}'`, `${src}/state`));
  }

  // Each workflow starts once, and every step can be reached from its start.
  (m.workflows ?? []).forEach((w, wi) => {
    const starts = w.steps.filter((s) => s.kind === 'start');
    if (starts.length !== 1) out.push(warning('lifecycle.start', `workflow '${w.id}' should have exactly one start step`, pointer('workflows', wi)));
    const next = new Map(w.steps.map((s) => [s.id, nextOf(s)]));
    const seen = new Set(starts.map((s) => s.id));
    for (const queue = [...seen]; queue.length; )
      for (const n of next.get(queue.pop()!) ?? [])
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
    if (starts.length)
      w.steps.forEach((s, si) => {
        if (!seen.has(s.id)) out.push(warning('lifecycle.reach', `step '${s.id}' cannot be reached from the start of '${w.id}'`, pointer('workflows', wi, 'steps', si)));
      });
    if (!w.steps.some((s) => s.kind === 'stateChange')) out.push(warning('lifecycle.noStateChange', `workflow '${w.id}' never changes the record's state`, pointer('workflows', wi)));
    w.steps.forEach((s, si) => {
      if (s.kind === 'decision' && nextOf(s).length < 2) out.push(warning('lifecycle.decision', `decision '${s.id}' needs at least two ways out`, pointer('workflows', wi, 'steps', si)));
      if (s.verdicts?.length && s.kind !== undefined && s.kind !== 'task') out.push(warning('lifecycle.verdicts', `only tasks have verdicts; '${s.id}' is a ${s.kind}`, pointer('workflows', wi, 'steps', si, 'verdicts')));
    });
  });
  return [...out, ...lint(m)];
}

/**
 * Lifecycle checks (URS-TYP-009): states no transition reaches from the initial state, and states
 * that are neither final nor cancelled but have no way out. Transitions are user and shared actions
 * and workflow state changes.
 */
function lint(m: Lifecycle): Diagnostic[] {
  const init = m.states.find((s) => s.stateType === 'initial');
  if (!init) return [];
  const ts = transitions(m);
  const reached = new Set([init.id]);
  for (const queue = [init.id]; queue.length; ) {
    const at = queue.pop()!;
    for (const t of ts)
      if (t.from === at && !reached.has(t.to)) {
        reached.add(t.to);
        queue.push(t.to);
      }
  }
  return m.states.flatMap((s, i) => [
    ...(reached.has(s.id) ? [] : [warning('lifecycle.unreachable', `no transition reaches state '${s.id}' from '${init.id}'`, pointer('states', i))]),
    ...(ends(s.stateType) || ts.some((t) => t.from === s.id) ? [] : [warning('lifecycle.deadEnd', `state '${s.id}' is not final or cancelled but has no way out`, pointer('states', i))]),
  ]);
}
