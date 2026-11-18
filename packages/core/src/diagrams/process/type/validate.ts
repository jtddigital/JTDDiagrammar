import { error, hasErrors, pointer, type Diagnostic } from '../../../diagnostics.ts';
import { processDiagnostics } from '../diagnose.ts';
import { eventDiagnostics } from '../events.ts';
import { CORE_OUTCOMES, profiles } from '../profiles.ts';
import { statesOf, triggerKinds, type ProcessDoc } from './model.ts';
import { processToModel } from './to-model.ts';

/** Unique ids, known references and a known profile; then the process model's checks (URS-PM-017, URS-PM-020). */
export function validateProcess(m: ProcessDoc): Diagnostic[] {
  const out: Diagnostic[] = [];
  const err = (code: string, message: string, at: string) => out.push(error(code, message, at));
  const unique = (items: { id: string }[], at: (i: number) => string, what: string) => {
    const seen = new Set<string>();
    items.forEach((x, i) => (seen.has(x.id) ? err('process.id', `${what} id '${x.id}' is used twice`, `${at(i)}/id`) : seen.add(x.id)));
    return seen;
  };
  const reg = profiles();
  const profile = m.profile === undefined ? undefined : reg.get(m.profile);
  if (m.profile !== undefined && !profile) err('process.profileUnknown', `unknown profile '${m.profile}'`, '/profile');

  if (!m.regions.length) err('process.regions', 'a process needs at least one region with states', '/regions');
  unique(m.regions, (i) => pointer('regions', i), 'region');
  const all = statesOf(m);
  const states = unique(
    all.map((x) => x.state),
    (k) => pointer('regions', m.regions.indexOf(all[k]!.region), 'states', all[k]!.region.states.indexOf(all[k]!.state)),
    'state',
  );
  const regionOf = new Map(all.map((x) => [x.state.id, x.region.id]));
  const ops = unique(m.operations ?? [], (i) => pointer('operations', i), 'operation');
  const workflows = unique(m.workflows ?? [], (i) => pointer('workflows', i), 'workflow');
  const signals = new Set((m.signals ?? []).map((s) => s.id));
  const op = (id: string, at: string, what: string) => ops.has(id) || err('ref.operation', `${what} references unknown operation '${id}'`, at);
  const state = (id: string, at: string, what: string) => states.has(id) || err('ref.state', `${what} references unknown state '${id}'`, at);

  m.regions.forEach((r, ri) => {
    if (r.states.filter((s) => s.initial).length > 1) err('process.initial', `region '${r.id}' has more than one initial state`, pointer('regions', ri));
    r.states.forEach((s, si) => s.entry?.forEach((o, j) => op(o, pointer('regions', ri, 'states', si, 'entry', j), `state '${s.id}'`)));
  });
  const ruleRefs: { id: string; at: string }[] = [];
  m.transitions?.forEach((t, i) => {
    const at = (...k: (string | number)[]) => pointer('transitions', i, ...k);
    state(t.from, at('from'), 'a transition');
    state(t.to, at('to'), 'a transition');
    if (states.has(t.from) && states.has(t.to) && regionOf.get(t.from) !== regionOf.get(t.to)) err('process.region', `a transition cannot move from '${t.from}' to '${t.to}' in another region`, at('to'));
    const tr = t.trigger;
    if (tr) {
      if (triggerKinds(tr).length !== 1) err('process.trigger', 'a trigger names exactly one of call, signal, after, at or when', at('trigger'));
      if (tr.call !== undefined) op(tr.call, at('trigger', 'call'), 'a transition');
      if (tr.signal !== undefined && !signals.has(tr.signal)) err('ref.signal', `a transition waits for unknown signal '${tr.signal}'`, at('trigger', 'signal'));
      if (tr.when !== undefined) ruleRefs.push({ id: tr.when, at: at('trigger', 'when') });
    }
    if (t.guard !== undefined) ruleRefs.push({ id: t.guard, at: at('guard') });
  });
  const outcomes = new Set<string>([...CORE_OUTCOMES, ...(profile?.outcomes ?? [])]);
  m.permissions?.forEach((x, i) => {
    state(x.state, pointer('permissions', i, 'state'), 'a permission');
    op(x.operation, pointer('permissions', i, 'operation'), 'a permission');
    if (!outcomes.has(x.outcome)) err('process.outcome', `outcome '${x.outcome}' is not one of ${[...outcomes].join(', ')}`, pointer('permissions', i, 'outcome'));
  });
  m.workflows?.forEach((w, wi) => {
    const nodes = unique(w.nodes, (ni) => pointer('workflows', wi, 'nodes', ni), `node (in '${w.id}')`);
    w.nodes.forEach((n, ni) => {
      const at = (...k: (string | number)[]) => pointer('workflows', wi, 'nodes', ni, ...k);
      n.calls?.forEach((o, j) => op(o, at('calls', j), `node '${n.id}'`));
      if (n.kind === 'send' && n.signal === undefined) err('process.send', `send node '${n.id}' needs a signal`, at());
      if (n.signal !== undefined && !signals.has(n.signal)) err('ref.signal', `node '${n.id}' sends unknown signal '${n.signal}'`, at('signal'));
    });
    w.flows.forEach((f, fi) =>
      (['from', 'to'] as const).forEach((k) => nodes.has(f[k]) || err('ref.node', `a flow in '${w.id}' references unknown node '${f[k]}'`, pointer('workflows', wi, 'flows', fi, k))),
    );
  });
  out.push(...eventDiagnostics(m, { states, workflows, ruleRefs }));
  // Free stereotypes need no profile check; a named profile's are checked (URS-PM-015).
  return hasErrors(out) ? out : [...out, ...processDiagnostics(processToModel(m), m.profile ? [] : ['profile'])];
}
