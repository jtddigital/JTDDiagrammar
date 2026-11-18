import { error, hasErrors, pointer, warning, type Diagnostic } from '../../diagnostics.ts';
import { processDiagnostics } from '../process/diagnose.ts';
import { eventDiagnostics, ruleRefs } from '../process/events.ts';
import { hasStatuses, nextOf, numbered, type Sap } from './model.ts';
import { sapToProcess } from './to-process.ts';

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
  // Without statuses, a chart is its documents and their release (URS-TYP-027).
  if (!hasStatuses(m) && !m.documents?.length) out.push(error('sap.statuses', 'an SAP chart needs statuses, or documents to chart instead', ''));
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

  // Document flow (URS-TYP-023): unique ids, known statuses and preceding documents, no loops.
  const docs = new Map<string, number>();
  m.documents?.forEach((d, i) => {
    if (docs.has(d.id)) out.push(error('sap.document', `document id '${d.id}' is used twice`, pointer('documents', i, 'id')));
    docs.set(d.id, i);
    status(d.status, pointer('documents', i, 'status'), `document '${d.id}'`);
  });
  m.documents?.forEach((d, i) =>
    d.from?.forEach((f, j) => {
      if (!docs.has(f)) out.push(error('ref.document', `document '${d.id}' follows unknown document '${f}'`, pointer('documents', i, 'from', j)));
      else if (f === d.id) out.push(error('sap.document', `document '${d.id}' follows itself`, pointer('documents', i, 'from', j)));
    }),
  );
  const loop = cycle(new Map((m.documents ?? []).map((d) => [d.id, d.from ?? []])));
  if (loop) out.push(warning('sap.documentLoop', `the document flow goes round in a loop: ${loop.join(' → ')}`, pointer('documents', docs.get(loop[0]!)!)));

  // Release strategies (URS-TYP-022): known document and status; unique codes; prerequisites known and not circular.
  m.releaseStrategies?.forEach((r, i) => {
    if (r.document !== undefined && !docs.has(r.document)) out.push(error('ref.document', `release strategy '${r.id}' releases unknown document '${r.document}'`, pointer('releaseStrategies', i, 'document')));
    status(r.status, pointer('releaseStrategies', i, 'status'), `release strategy '${r.id}'`);
    const codes = new Set<string>();
    r.codes.forEach((c, j) => {
      if (codes.has(c.code)) out.push(error('sap.releaseCode', `release code '${c.code}' is used twice in '${r.id}'`, pointer('releaseStrategies', i, 'codes', j, 'code')));
      codes.add(c.code);
    });
    r.codes.forEach((c, j) =>
      c.prerequisites?.forEach((q, k) => {
        const at = pointer('releaseStrategies', i, 'codes', j, 'prerequisites', k);
        if (q === c.code) out.push(error('sap.releaseCode', `release code '${c.code}' cannot wait for itself`, at));
        else if (!codes.has(q)) out.push(error('ref.releaseCode', `release code '${c.code}' waits for unknown code '${q}'`, at));
      }),
    );
    const order = cycle(new Map(r.codes.map((c) => [c.code, c.prerequisites ?? []])));
    if (order) out.push(error('sap.releaseOrder', `release codes wait for each other in a loop: ${order.join(' → ')}`, pointer('releaseStrategies', i, 'codes')));
  });
  // Signals, subscribers and rules (URS-TYP-029).
  out.push(
    ...eventDiagnostics(m, {
      states: known,
      workflows: new Set([...(m.workflows ?? []).map((w) => w.id), ...(m.releaseStrategies ?? []).map((r) => r.id)]),
      ruleRefs: [
        ...ruleRefs(m.workflows, (i) => pointer('workflows', i)),
        ...(m.workflows ?? []).flatMap((w, i) => ruleRefs(w.steps, (j) => pointer('workflows', i, 'steps', j))),
        ...ruleRefs(m.releaseStrategies, (i) => pointer('releaseStrategies', i)),
      ],
    }),
  );
  // The process model's checks (URS-PM-017): dead joins, never-permitted transactions, orphan subscriptions…
  return hasErrors(out) ? out : [...out, ...processDiagnostics(sapToProcess(m))];
}

/** A loop in a graph given as node → predecessors, as the nodes along it; undefined when there is none. */
function cycle(before: Map<string, string[]>): string[] | undefined {
  const state = new Map<string, 'open' | 'done'>();
  const path: string[] = [];
  const visit = (n: string): string[] | undefined => {
    if (state.get(n) === 'done') return undefined;
    if (state.get(n) === 'open') return [...path.slice(path.indexOf(n)), n];
    state.set(n, 'open');
    path.push(n);
    for (const p of before.get(n) ?? []) {
      if (p === n || !before.has(p)) continue;
      const found = visit(p);
      if (found) return found;
    }
    path.pop();
    state.set(n, 'done');
    return undefined;
  };
  for (const n of before.keys()) {
    const found = visit(n);
    if (found) return found;
  }
  return undefined;
}
