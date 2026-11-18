import { pointer } from '../../diagnostics.ts';
import { emptyModel, type Flow, type ProcessModel, type Transition, type WNode } from '../process/model.ts';
import { eventsToProcess } from '../process/events.ts';
import { flags, nameOf, nextOf, numbered, withRules, type Sap, type SapReleaseStrategy, type SapWorkflow } from './model.ts';

const SAP = 'sap';
const st = (name: string, values?: Record<string, unknown>) => ({ profile: SAP, name, ...(values && { values }) });
const OBJECT = 'object';
/** Operation that sets a user status by hand (or from a workflow). */
export const setStatus = (code: string) => `set:${code}`;
/** Signal published when a status is set; workflows subscribe to it. */
export const statusSet = (code: string) => `${code} set`;
const on = (code: string) => `${code}:on`;
const off = (code: string) => `${code}:off`;

/**
 * Map an SAP chart onto the canonical process model in the SAP profile (URS-PM-016, ARCHITECTURE §13.7):
 * system status, user status and one region per flag; business transactions as operations with transaction
 * control as permissions; flexible workflows and release strategies as activities; documents as objects.
 */
export function sapToProcess(source: Sap): ProcessModel {
  const m = withRules(source);
  const p = emptyModel(SAP);
  const sys = m.systemStatuses ?? [];
  const users = m.userStatuses ?? [];
  const idx = (code: string) => users.findIndex((u) => u.code === code);
  p.objects.push({ id: OBJECT, name: m.title ?? m.object ?? 'Object', stereotype: st('SAP Object', { ...(m.object && { objectType: m.object }), ...(m.profile && { statusProfile: m.profile }) }) });
  const t: Transition[] = [];
  
  // Business transactions, run by users; the system statuses each one sets, from the one before.
  (m.transactions ?? []).forEach((x, i) => p.operations.push({ id: x.id, name: x.label ?? x.id, object: OBJECT, callers: ['user'], stereotype: st('SAP Business Transaction'), src: pointer('transactions', i) }));
  sys.forEach((s, i) => {
    if (!i) return;
    for (const x of (m.transactions ?? []).filter((y) => y.sets?.includes(s.code)))
      t.push({ id: `sys:${x.id}:${s.code}`, name: `${x.label ?? x.id} sets ${s.code}`, region: 'system', from: sys[i - 1]!.code, to: s.code, trigger: { kind: 'call', operation: x.id }, src: pointer('systemStatuses', i) });
  });

  // Numbered user statuses: set by hand within the range, or by the transactions that set them.
  for (const u of numbered(m)) {
    p.operations.push({ id: setStatus(u.code), name: `set ${u.code}`, object: OBJECT, callers: ['user'], src: pointer('userStatuses', idx(u.code)) });
    if (u.auth) for (const s of users) p.permissions.push({ state: s.number === undefined ? on(s.code) : s.code, operation: setStatus(u.code), role: u.auth, outcome: 'allowed', src: pointer('userStatuses', idx(u.code), 'auth') });
  }
  for (const u of numbered(m)) {
    for (const n of nextOf(m, u)) t.push({ id: `user:${u.code}>${n.code}`, name: `${u.code} → ${n.code}`, region: 'user', from: u.code, to: n.code, trigger: { kind: 'call', operation: setStatus(n.code) }, src: pointer('userStatuses', idx(u.code), 'high') });
    for (const x of u.setBy ?? [])
      for (const from of numbered(m)) if (from !== u) t.push({ id: `user:${x}:${from.code}>${u.code}`, name: `${x} sets ${u.code}`, region: 'user', from: from.code, to: u.code, trigger: { kind: 'call', operation: x }, src: pointer('userStatuses', idx(u.code), 'setBy') });
  }

  // Flags: each its own two-state region, set and deleted by hand or by transactions.
  for (const f of flags(m)) {
    const i = idx(f.code);
    p.operations.push({ id: setStatus(f.code), name: `set ${f.code}`, object: OBJECT, callers: ['user'], src: pointer('userStatuses', i) }, { id: `delete:${f.code}`, name: `delete ${f.code}`, object: OBJECT, callers: ['user'], src: pointer('userStatuses', i) });
    t.push({ id: `flag:${f.code}:set`, name: `set ${f.code}`, region: `flag:${f.code}`, from: off(f.code), to: on(f.code), trigger: { kind: 'call', operation: setStatus(f.code) }, src: pointer('userStatuses', i) });
    t.push({ id: `flag:${f.code}:delete`, name: `delete ${f.code}`, region: `flag:${f.code}`, from: on(f.code), to: off(f.code), trigger: { kind: 'call', operation: `delete:${f.code}` }, src: pointer('userStatuses', i) });
    for (const x of f.setBy ?? []) t.push({ id: `flag:${f.code}:${x}:set`, name: `${x} sets ${f.code}`, region: `flag:${f.code}`, from: off(f.code), to: on(f.code), trigger: { kind: 'call', operation: x }, src: pointer('userStatuses', i, 'setBy') });
    for (const x of f.deletedBy ?? []) t.push({ id: `flag:${f.code}:${x}:delete`, name: `${x} deletes ${f.code}`, region: `flag:${f.code}`, from: on(f.code), to: off(f.code), trigger: { kind: 'call', operation: x }, src: pointer('userStatuses', i, 'deletedBy') });
  }

  // Transaction control: state × business transaction → allowed / warning / forbidden.
  users.forEach((u, i) =>
    Object.entries(u.control ?? {}).forEach(([x, rule]) => p.permissions.push({ state: u.number === undefined ? on(u.code) : u.code, operation: x, outcome: rule, src: pointer('userStatuses', i, 'control', x) })),
  );

  // Documents: created on entering their status, derived from the documents before them.
  (m.documents ?? []).forEach((d, i) => {
    p.objects.push({ id: `doc:${d.id}`, name: d.label, stereotype: st('SAP Document', d.kind ? { kind: d.kind } : undefined), src: pointer('documents', i) });
    p.operations.push({ id: `create:${d.id}`, name: `create ${d.label}`, object: `doc:${d.id}` }, { id: `release:${d.id}`, name: `release ${d.label}`, object: `doc:${d.id}` });
    p.signals.push({ id: `${d.id} created`, name: `${d.label} created` });
    (d.from ?? []).forEach((f, j) => p.relations.push({ id: `rel:${f}>${d.id}`, name: `${f} → ${d.id}`, kind: 'derive', from: `doc:${f}`, to: `doc:${d.id}`, src: pointer('documents', i, 'from', j) }));
  });
  const creates = (code: string) =>
    (m.documents ?? []).filter((d) => d.status === code).flatMap((d) => [{ kind: 'call' as const, operation: `create:${d.id}`, object: `doc:${d.id}` }, { kind: 'signal' as const, signal: `${d.id} created` }]);

  // Entering a status publishes that it was set and creates the documents made in it; a flag's only when it is set.
  const region = (id: string, name: string, initial: string | undefined, states: { id: string; name: string; values?: Record<string, unknown>; stereo: string; src: string; creates?: string }[]) => ({
    id,
    name,
    ...(initial && { initial }),
    states: states.map((s) => ({ id: s.id, name: s.name, stereotype: st(s.stereo, s.values), ...(s.creates && { entry: [{ kind: 'signal' as const, signal: statusSet(s.creates) }, ...creates(s.creates)] }), src: s.src })),
  });
  const regions = [
    ...(sys.length ? [region('system', 'System status', sys[0]!.code, sys.map((s, i) => ({ id: s.code, name: nameOf(s), values: { code: s.code }, stereo: 'SAP System Status', src: pointer('systemStatuses', i), creates: s.code })))] : []),
    ...(numbered(m).length
      ? [region('user', 'User status', numbered(m).find((u) => u.initial)?.code, numbered(m).map((u) => ({ id: u.code, name: nameOf(u), values: { code: u.code, number: u.number, low: u.low ?? u.number, high: u.high ?? u.number }, stereo: 'SAP User Status', src: pointer('userStatuses', idx(u.code)), creates: u.code })))]
      : []),
    ...flags(m).map((f) =>
      region(`flag:${f.code}`, nameOf(f), f.initial ? on(f.code) : off(f.code), [
        { id: off(f.code), name: `${f.code} not set`, values: { code: f.code, flag: true }, stereo: 'SAP User Status', src: pointer('userStatuses', idx(f.code)) },
        { id: on(f.code), name: `${f.code} set`, values: { code: f.code, flag: true }, stereo: 'SAP User Status', src: pointer('userStatuses', idx(f.code)), creates: f.code },
      ]),
    ),
  ];
  p.machines.push({ object: OBJECT, regions, transitions: t });
  for (const s of [...sys.map((x) => x.code), ...users.map((x) => x.code)]) p.signals.push({ id: statusSet(s), name: `${s} set` });

  (m.workflows ?? []).forEach((w, wi) => p.workflows.push(flexible(w, wi, p)));
  (m.releaseStrategies ?? []).forEach((r, ri) => p.workflows.push(release(r, ri, p)));
  const isFlag = new Set(flags(m).map((f) => f.code));
  eventsToProcess(p, m, (code) => [isFlag.has(code) ? on(code) : code]);
  return p;
}

/** A flexible workflow as an activity: start conditions and step conditions as decisions, release and rejection, rework loops. */
function flexible(w: SapWorkflow, wi: number, p: ProcessModel) {
  const src = (...k: (string | number)[]) => pointer('workflows', wi, ...k);
  const nodes: WNode[] = [{ id: 'start', kind: 'initial', name: 'start', src: src('trigger') }, { id: 'end', kind: 'final', name: 'end', src: src() }];
  const flows: Flow[] = [];
  const flow = (from: string, to: string, guard?: string) => flows.push({ id: `${from}>${to}:${flows.length}`, name: guard ?? '', from, to, ...(guard && { guard }) });
  const finish = (code: string | undefined, key: string) => {
    if (!code) return 'end';
    nodes.push({ id: key, kind: 'task', name: `set ${code}`, calls: [{ operation: setStatus(code) }], src: src(key) });
    flow(key, 'end');
    return key;
  };
  const released = finish(w.released, 'released');
  const rejected = finish(w.rejected, 'rejected');
  if (w.trigger) p.subscriptions.push({ id: `start:${w.id}`, name: w.trigger.event ?? `${w.label} on ${w.trigger.status}`, signal: statusSet(w.trigger.status), consumer: { kind: 'workflow', workflow: w.id }, channel: 'local', src: src('trigger') });
  let entry = 'start';
  if (w.conditions?.length) {
    p.rules.push({ id: `${w.id}:start`, name: `${w.label} start conditions`, text: w.conditions.join('; '), via: 'workflow condition', src: src('conditions') });
    nodes.push({ id: 'if', kind: 'decision', name: 'start conditions', src: src('conditions') });
    flow('start', 'if');
    entry = 'if';
  }
  const ids = w.steps.map((s) => `step:${s.id}`);
  // Where each step is entered: a decision when it has step conditions or is optional, else the step itself.
  const gateOf = w.steps.map((s, i) => (s.conditions?.length || s.optional ? `skip:${s.id}` : ids[i]!));
  const next = (i: number) => (i + 1 < w.steps.length ? gateOf[i + 1]! : released);
  w.steps.forEach((s, i) => {
    nodes.push({ id: ids[i]!, kind: 'task', name: `${s.label ?? 'Approve'}${s.recipients ? ` (${s.recipients})` : ''}`, ...(s.recipients && { role: s.recipients }), stereotype: st('SAP Workflow Step', { ...(s.deadline && { deadline: s.deadline }), ...(s.optional && { optional: true }) }), src: src('steps', i) });
    if (gateOf[i] !== ids[i]) {
      nodes.push({ id: gateOf[i]!, kind: 'decision', name: `${s.label ?? 'Approve'}: condition`, src: src('steps', i, 'conditions') });
      if (s.conditions?.length) p.rules.push({ id: `${w.id}:${s.id}`, name: `${s.label ?? 'Approve'} step conditions`, text: s.conditions.join('; '), via: 'workflow condition', src: src('steps', i, 'conditions') });
      flow(gateOf[i]!, ids[i]!, `${w.id}:${s.id}`);
      flow(gateOf[i]!, next(i), 'skipped');
    }
    flow(ids[i]!, next(i), 'Release');
    flow(ids[i]!, rejected, 'Reject');
    if (s.rework) {
      const back = `rework:${s.id}`;
      nodes.push({ id: back, kind: 'task', name: 'Rework', role: 'Requester', stereotype: st('SAP Rework'), src: src('steps', i, 'rework') });
      flow(ids[i]!, back, 'Rework');
      flow(back, s.rework === 'repeat' ? ids[i]! : s.rework === 'restart' ? gateOf[0]! : next(i));
    }
  });
  flow(entry, gateOf[0] ?? released, entry === 'if' ? `${w.id}:start` : undefined);
  if (entry === 'if') flow('if', 'end', 'not met');
  return { id: w.id, name: w.label, stereotype: st('SAP Flexible Workflow'), nodes, flows, src: pointer('workflows', wi) };
}

/** A release strategy as an activity: codes after their prerequisites (forks and joins where codes run in parallel), then release. */
function release(r: SapReleaseStrategy, ri: number, p: ProcessModel) {
  const src = (...k: (string | number)[]) => pointer('releaseStrategies', ri, ...k);
  const nodes: WNode[] = [{ id: 'start', kind: 'initial', name: 'start', src: src() }, { id: 'end', kind: 'final', name: 'end', src: src() }];
  const flows: Flow[] = [];
  const flow = (from: string, to: string, guard?: string) => flows.push({ id: `${from}>${to}:${flows.length}`, name: guard ?? '', from, to, ...(guard && { guard }) });
  if (r.document) p.subscriptions.push({ id: `start:${r.id}`, name: `${r.label} on ${r.document}`, signal: `${r.document} created`, consumer: { kind: 'workflow', workflow: r.id }, channel: 'local', src: src('document') });
  nodes.push({ id: 'released', kind: 'task', name: `release ${r.document ?? 'document'}`, ...(r.document && { calls: [{ operation: `release:${r.document}` }] }), src: src() });
  flow('released', 'end');
  let entry = 'start';
  if (r.conditions?.length) {
    p.rules.push({ id: `${r.id}:conditions`, name: `${r.label} release conditions`, text: r.conditions.join('; '), via: 'classification', src: src('conditions') });
    nodes.push({ id: 'if', kind: 'decision', name: 'release conditions', src: src('conditions') });
    flow('start', 'if');
    flow('if', 'released', 'not met');
    entry = 'if';
  }
  const code = (c: string) => `code:${c}`;
  const known = new Set(r.codes.map((c) => c.code));
  const before = new Map(r.codes.map((c) => [c.code, (c.prerequisites ?? []).filter((q) => known.has(q) && q !== c.code)]));
  const after = new Map(r.codes.map((c) => [c.code, r.codes.filter((x) => before.get(x.code)!.includes(c.code)).map((x) => x.code)]));
  r.codes.forEach((c, i) => nodes.push({ id: code(c.code), kind: 'task', name: `release code ${c.code}${c.label ? ` (${c.label})` : ''}`, ...(c.label && { role: c.label }), stereotype: st('SAP Release Code', { code: c.code, ...(c.indicator && { indicator: c.indicator }) }), src: src('codes', i) }));
  // Out of a node into several: a fork. Into a node from several: a join.
  const fan = (from: string, targets: string[], at: string) => {
    if (targets.length < 2) return targets.forEach((x) => flow(from, x, from === 'if' ? `${r.id}:conditions` : undefined));
    nodes.push({ id: `fork:${at}`, kind: 'fork', name: `after ${at}` });
    flow(from, `fork:${at}`, from === 'if' ? `${r.id}:conditions` : undefined);
    targets.forEach((x) => flow(`fork:${at}`, x));
  };
  const into = (target: string, sources: string[]) => {
    if (sources.length < 2) return sources.map((s) => [s, target] as const);
    nodes.push({ id: `join:${target}`, kind: 'join', name: `before ${target}` });
    flow(`join:${target}`, target);
    return sources.map((s) => [s, `join:${target}`] as const);
  };
  // Each source's outgoing targets, joins included.
  const outs = new Map<string, string[]>();
  const add = (s: string, x: string) => outs.set(s, [...(outs.get(s) ?? []), x]);
  for (const c of r.codes) for (const [s, x] of into(code(c.code), (before.get(c.code)!.length ? before.get(c.code)! : [entry]).map((q) => (q === entry ? entry : code(q))))) add(s, x);
  const last = r.codes.filter((c) => !after.get(c.code)!.length).map((c) => code(c.code));
  for (const [s, x] of into('released', last)) add(s, x);
  for (const [s, xs] of outs) fan(s, xs, s);
  return { id: r.id, name: r.label, stereotype: st('SAP Release Strategy'), nodes, flows, src: pointer('releaseStrategies', ri) };
}
