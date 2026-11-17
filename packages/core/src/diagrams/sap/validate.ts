import { error, pointer, warning, type Diagnostic } from '../../diagnostics.ts';
import { nextOf, numbered, type Sap } from './model.ts';

/**
 * SAP rules (URS-TYP-019..021), in SAP terms. Unknown references are reported here and kept out of
 * the IR, so the common rules never repeat them in lane and phase terms.
 */
export function validateSap(m: Sap): Diagnostic[] {
  const out: Diagnostic[] = [];
  const sys = m.systemStatuses ?? [];
  const users = m.userStatuses ?? [];
  const tx = new Set((m.transactions ?? []).map((t) => t.id));
  const codes = new Set<string>();
  const unique = (code: string, at: string) => (codes.has(code) ? out.push(error('sap.code', `status code '${code}' is used twice`, at)) : codes.add(code));
  sys.forEach((s, i) => unique(s.code, pointer('systemStatuses', i, 'code')));
  users.forEach((u, i) => unique(u.code, pointer('userStatuses', i, 'code')));
  if (!sys.length && !users.length) out.push(error('sap.statuses', 'an SAP chart needs system or user statuses', ''));
  const sysCodes = new Set(sys.map((s) => s.code));
  const txRef = (id: string, at: string, what: string) => tx.has(id) || out.push(error('ref.transaction', `${what} references unknown business transaction '${id}'`, at));

  const seen = new Map<number, string>();
  users.forEach((u, i) => {
    const at = (...k: (string | number)[]) => pointer('userStatuses', i, ...k);
    if (u.number !== undefined) {
      if (seen.has(u.number)) out.push(error('sap.number', `status number ${u.number} is used by '${seen.get(u.number)}' and '${u.code}'`, at('number')));
      seen.set(u.number, u.code);
      if ((u.low ?? u.number) > (u.high ?? u.number)) out.push(error('sap.range', `'${u.code}': lowest number ${u.low ?? u.number} is above highest ${u.high ?? u.number}`, at('low')));
    } else if (u.low !== undefined || u.high !== undefined) out.push(warning('sap.range', `'${u.code}' has no number, so its lowest and highest numbers do nothing`, at()));
    if (u.system !== undefined && !sysCodes.has(u.system)) out.push(error('ref.status', `'${u.code}' is used in unknown system status '${u.system}'`, at('system')));
    for (const t of Object.keys(u.control ?? {})) txRef(t, at('control', t), `'${u.code}' transaction control`);
    u.setBy?.forEach((t, j) => txRef(t, at('setBy', j), `'${u.code}'`));
    u.deletedBy?.forEach((t, j) => txRef(t, at('deletedBy', j), `'${u.code}'`));
  });

  // One initial numbered status; every other numbered status reachable from another's range.
  const nums = numbered(m);
  const initials = nums.filter((u) => u.initial);
  if (initials.length > 1) out.push(error('sap.initial', `only one numbered status can be initial: ${initials.map((u) => `'${u.code}'`).join(', ')}`, '/userStatuses'));
  if (nums.length && !initials.length) out.push(warning('sap.initial', 'no numbered user status is marked `initial`', '/userStatuses'));
  const reached = new Set(nums.flatMap((u) => nextOf(m, u).map((t) => t.code)));
  for (const u of nums) if (!u.initial && !reached.has(u.code)) out.push(warning('sap.unreachable', `no status's range reaches '${u.code}' (number ${u.number})`, pointer('userStatuses', users.indexOf(u))));

  m.transactions?.forEach((t, i) => t.sets?.forEach((c, j) => sysCodes.has(c) || out.push(error('ref.status', `business transaction '${t.id}' sets unknown system status '${c}'`, pointer('transactions', i, 'sets', j)))));

  const known = new Set([...sysCodes, ...users.map((u) => u.code)]);
  const status = (c: string | undefined, at: string, what: string) => c === undefined || known.has(c) || out.push(error('ref.status', `${what} references unknown status '${c}'`, at));
  m.workflows?.forEach((w, i) => {
    status(w.trigger?.status, pointer('workflows', i, 'trigger', 'status'), `workflow '${w.id}'`);
    status(w.released, pointer('workflows', i, 'released'), `workflow '${w.id}'`);
    status(w.rejected, pointer('workflows', i, 'rejected'), `workflow '${w.id}'`);
    const ids = new Set<string>();
    w.steps.forEach((s, j) => {
      if (ids.has(s.id)) out.push(error('sap.step', `step id '${s.id}' is used twice in workflow '${w.id}'`, pointer('workflows', i, 'steps', j, 'id')));
      ids.add(s.id);
      status(s.status, pointer('workflows', i, 'steps', j, 'status'), `step '${s.id}'`);
    });
    if (!w.trigger && !w.steps.some((s) => s.status)) out.push(warning('sap.place', `workflow '${w.id}' has no trigger status, so it is placed in the first column`, pointer('workflows', i)));
  });
  return out;
}
