import { error, warning, type Diagnostic } from '../../diagnostics.ts';
import { walk, type StateDiagram } from './model.ts';

/** State-specific rules (URS-EXT-007, URS-TYP-003/004). References are checked by the common rules. */
export function validateState(m: StateDiagram): Diagnostic[] {
  const out: Diagnostic[] = [];
  const all = [...walk(m.states)];
  const kind = new Map(all.map(({ state: s }) => [s.id, s.kind ?? 'state']));
  const ts = m.transitions ?? [];
  const from = (id: string) => ts.filter((t) => t.from === id).length;
  const into = (id: string) => ts.filter((t) => t.to === id).length;

  const initials = new Map<string, number>();
  for (const { state: s, path, parent } of all) {
    const k = kind.get(s.id);
    if (k !== 'state' && s.states?.length) out.push(error('state.nested', `${k} '${s.id}' cannot contain states`, `${path}/states`));
    if (k === 'initial') {
      const region = parent ?? '';
      initials.set(region, (initials.get(region) ?? 0) + 1);
      if (initials.get(region) === 2) out.push(error('state.initial', `more than one initial state in ${parent ? `'${parent}'` : 'the top level'}`, path));
      if (into(s.id)) out.push(error('state.initial', `initial state '${s.id}' cannot have incoming transitions`, path));
      if (from(s.id) !== 1) out.push(warning('state.initial', `initial state '${s.id}' should have exactly one outgoing transition`, path));
    }
    if (k === 'final' && from(s.id)) out.push(error('state.final', `final state '${s.id}' cannot have outgoing transitions`, path));
    if (k === 'choice' && from(s.id) < 2) out.push(warning('state.choice', `choice '${s.id}' should have at least two outgoing transitions`, path));
  }
  return out;
}
