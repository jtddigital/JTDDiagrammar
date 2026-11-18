import { pointer } from '../../diagnostics.ts';
import type { Band, BandGroup } from '../../ir/types.ts';
import { flags, hasStatuses, nameOf, numbered, type Sap, type SapUserStatus } from './model.ts';

export const FLAGS_GROUP = 'sap:flags';
const col = (kind: string, code: string) => `col:${kind}:${code}`;
/** Without statuses, each document is a column (URS-TYP-027). */
export const docColumn = (id: string) => col('doc', id);

/** Each numbered user status's system status: its own, else the one before it, else the first (URS-TYP-019). */
export function systemOf(m: Sap): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  let last = m.systemStatuses?.[0]?.code;
  for (const u of numbered(m)) out.set(u.code, (last = u.system ?? last));
  return out;
}

const txName = (m: Sap, id: string) => {
  const t = m.transactions?.find((x) => x.id === id);
  return t?.label ?? id;
};

/** Header detail of a user status: its number and range (or "Any time"), who sets it, its authorization key. */
function detail(m: Sap, u: SapUserStatus): string {
  const head = u.number === undefined ? 'Any time' : `No. ${u.number} · next ${u.low ?? u.number}–${u.high ?? u.number}`;
  return [head, u.setBy?.length && `Set by: ${u.setBy.map((t) => txName(m, t)).join(', ')}`, u.auth && `Auth: ${u.auth}`].filter(Boolean).join('\n');
}

/**
 * The chart's columns (URS-TYP-019): for each system status in order, its numbered user statuses by
 * number, or the system status alone when it has none; numbered statuses of no known system status
 * next; then one column per flag, grouped. `at` maps every status code to its column: a user status to
 * its own, a system status to the first of its columns.
 */
export function columnsOf(m: Sap) {
  if (!hasStatuses(m)) {
    const columns: Band[] = (m.documents ?? []).map((d, i) => ({ id: docColumn(d.id), label: d.label, ...(d.kind && { detail: d.kind }), src: pointer('documents', i) }));
    return { columns, groups: [] as BandGroup[], at: new Map<string, string>() };
  }
  const sys = m.systemStatuses ?? [];
  const of = systemOf(m);
  const known = new Set(sys.map((s) => s.code));
  const index = new Map((m.userStatuses ?? []).map((u, i) => [u.code, i]));
  const user = (u: SapUserStatus): Band => ({ id: col('user', u.code), label: nameOf(u), detail: detail(m, u), src: pointer('userStatuses', index.get(u.code)!) });
  const columns: Band[] = [];
  const at = new Map<string, string>();
  sys.forEach((s, i) => {
    const mine = numbered(m).filter((u) => of.get(u.code) === s.code);
    const bands = mine.length ? mine.map(user) : [{ id: col('system', s.code), label: nameOf(s), detail: `System status ${s.code}`, src: pointer('systemStatuses', i) }];
    columns.push(...bands);
    at.set(s.code, bands[0]!.id);
  });
  columns.push(...numbered(m).filter((u) => !known.has(of.get(u.code) ?? '')).map(user));
  const flagCols = flags(m).map(user);
  columns.push(...flagCols);
  for (const u of m.userStatuses ?? []) at.set(u.code, col('user', u.code));
  const groups: BandGroup[] = flagCols.length ? [{ id: FLAGS_GROUP, label: 'Flags (any time)', members: flagCols.map((b) => b.id), src: flagCols[0]!.src }] : [];
  return { columns, groups, at };
}
