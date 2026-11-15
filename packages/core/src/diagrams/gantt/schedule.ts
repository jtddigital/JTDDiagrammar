import { error, warning, type Diagnostic } from '../../diagnostics.ts';
import { calendar, type Calendar } from './calendar.ts';
import { dayOf, isoOf } from './dates.ts';
import { contains, flatten, leavesOf, type Row } from './flatten.ts';
import { parseLink, POINT_TYPES, type Gantt, type Link } from './model.ts';

/** An item placed in time (URS-TYP-016). */
export interface Placed extends Row {
  summary: boolean;
  /** A moment (milestone, deliverable, gate): no duration. */
  point: boolean;
  /** Working-day line: occupies [ws, wf). */
  ws: number;
  wf: number;
  /** Calendar days drawn: [from, to); equal for a moment. */
  from: number;
  to: number;
  /** Dates shown in the table. */
  first: string;
  last: string;
  /** Working days. */
  days: number;
  /** Links into this item, resolved. */
  links: { link: Link; from: Row; path: string }[];
}

export interface Schedule {
  rows: Placed[];
  diagnostics: Diagnostic[];
  start: number;
  /** Day after the last day of work. */
  finish: number;
  deadline?: number;
  /** Non-working days within [from, to). */
  offDays(from: number, to: number): number[];
}

const cache = new WeakMap<Gantt, Schedule>();

/** Schedule once per document: the rules and the drawing share it. */
export const scheduleOf = (m: Gantt): Schedule => cache.get(m) ?? cache.set(m, schedule(m)).get(m)!;

/**
 * Forward pass on the working-day line. An item without fixed dates starts as early as its links and the
 * project start allow; one with fixed dates keeps them, and each link it breaks is a warning. A summary
 * spans the items inside it. Works on any schema-valid document: bad links and loops are reported and
 * left out, never thrown.
 */
function schedule(m: Gantt): Schedule {
  const out: Diagnostic[] = [];
  const start = dayOf(m.start) ?? 0;
  if (dayOf(m.start) === undefined) out.push(error('gantt.date', `'${m.start}' is not a real date`, '/start'));
  const holidays = (m.calendar?.holidays ?? []).flatMap((h, i) => {
    const d = dayOf(h);
    if (d === undefined) out.push(error('gantt.date', `'${h}' is not a real date`, `/calendar/holidays/${i}`));
    return d === undefined ? [] : [d];
  });
  const cal: Calendar = calendar(start, m.calendar?.workdays, holidays);
  const rows = flatten(m.tasks);
  const byId = new Map<string, Row>();
  for (const r of rows) {
    if (byId.has(r.item.id)) out.push(error('gantt.duplicate', `id '${r.item.id}' is used twice`, `${r.path}/id`));
    else byId.set(r.item.id, r);
  }
  const date = (r: Row, key: 'start' | 'end') => {
    const v = r.item[key];
    if (v === undefined) return undefined;
    const d = dayOf(v);
    if (d === undefined) out.push(error('gantt.date', `'${v}' is not a real date`, `${r.path}/${key}`));
    return d;
  };

  // Links, resolved; ones that cannot hold are reported and dropped.
  const links = new Map<Row, Placed['links']>(rows.map((r) => [r, []]));
  for (const r of rows)
    (r.item.after ?? []).forEach((s, k) => {
      const path = `${r.path}/after/${k}`;
      const link = parseLink(s);
      const from = link && byId.get(link.task);
      if (!link) return;
      if (!from) return void out.push(error('ref.task', `unknown task '${link.task}'`, path));
      if (from === r) return void out.push(error('gantt.link', `'${r.item.id}' cannot depend on itself`, path));
      if (contains(from, r) || contains(r, from)) return void out.push(error('gantt.link', `'${r.item.id}' cannot depend on '${from.item.id}', which ${contains(from, r) ? 'contains it' : 'it contains'}`, path));
      links.get(r)!.push({ link, from, path });
    });

  for (const r of rows) {
    const it = r.item;
    const own = (['start', 'end', 'duration'] as const).filter((k) => it[k] !== undefined);
    if (r.children.length && own.length)
      out.push(warning('gantt.summary', `'${it.id}' has items inside, so its dates come from them; its own ${own.join(' and ')} ${own.length > 1 ? 'are' : 'is'} ignored`, r.path));
    else if (!r.children.length && POINT_TYPES.includes(it.type ?? 'task') && it.duration)
      out.push(warning('gantt.duration', `a ${it.type} takes no time; its duration is ignored`, `${r.path}/duration`));
  }

  // Leaf order: a leaf waits for every leaf of every item it is linked from (and for its summaries' links).
  const leaves = rows.filter((r) => !r.children.length);
  const incoming = (leaf: Row) => {
    const out: Placed['links'] = [];
    for (let x: Row | undefined = leaf; x; x = x.parent) out.push(...links.get(x)!);
    return out;
  };
  const waits = new Map(leaves.map((l) => [l, incoming(l).flatMap((x) => leavesOf(x.from))]));
  const placed = new Map<Row, { ws: number; wf: number }>();
  const order: Row[] = [];
  const pending = new Set(leaves);
  while (pending.size) {
    const ready = [...pending].filter((l) => waits.get(l)!.every((w) => !pending.has(w)));
    if (!ready.length) {
      // A loop: report it once, then let its first leaf go ahead without the links that close it.
      const loop = loopFrom([...pending][0]!, waits, pending);
      out.push(error('gantt.cycle', `tasks depend on each other in a loop (${loop.map((l) => l.item.id).join(' → ')})`, loop[0]!.path));
      for (const l of loop.length > 1 ? loop : [...pending]) waits.set(l, waits.get(l)!.filter((w) => !loop.includes(w) && loop.length > 1));
      continue;
    }
    for (const l of ready) {
      pending.delete(l);
      order.push(l);
    }
  }

  const span = (r: Row) => {
    const ls = leavesOf(r).filter((l) => placed.has(l)).map((l) => placed.get(l)!);
    return { ws: Math.min(...ls.map((l) => l.ws)), wf: Math.max(...ls.map((l) => l.wf)) };
  };
  for (const leaf of order) {
    const it = leaf.item;
    const point = POINT_TYPES.includes(it.type ?? 'task');
    const [s, e] = [date(leaf, 'start'), date(leaf, 'end')];
    // Earliest start each link allows, on the working-day line.
    const bounds = incoming(leaf).flatMap(({ link, from, path }) => {
      if (!leavesOf(from).every((l) => placed.has(l))) return [];
      const p = span(from);
      const dur = point ? 0 : (it.duration ?? 1);
      const at = { FS: p.wf, SS: p.ws, FF: p.wf - dur, SF: p.ws - dur }[link.type] + link.lag;
      return [{ at, link, from, path }];
    });
    let ws: number, wf: number;
    if (point) {
      const d = e ?? s;
      ws = wf = d !== undefined ? cal.finishIndex(d) : Math.max(0, ...bounds.map((b) => b.at));
    } else if (s !== undefined && e !== undefined) {
      [ws, wf] = [cal.startIndex(s), cal.finishIndex(e)];
      if (wf < ws) {
        out.push(error('gantt.dates', `'${it.id}' ends before it starts`, `${leaf.path}/end`));
        wf = ws;
      }
    } else {
      if (it.duration === undefined && !(s !== undefined && e !== undefined)) out.push(warning('gantt.duration', `'${it.id}' has no duration or dates; 1 day assumed`, leaf.path));
      const dur = it.duration ?? 1;
      if (s !== undefined) [ws, wf] = [cal.startIndex(s), cal.startIndex(s) + dur];
      else if (e !== undefined) [ws, wf] = [cal.finishIndex(e) - dur, cal.finishIndex(e)];
      else [ws, wf] = [Math.max(0, ...bounds.map((b) => b.at)), Math.max(0, ...bounds.map((b) => b.at)) + dur];
    }
    const fixed = s !== undefined || e !== undefined;
    if (fixed) {
      for (const b of bounds)
        if (ws < b.at)
          out.push(
            warning('gantt.conflict', `'${it.id}' is fixed to ${isoOf(cal.dayAt(ws))}, before its ${b.link.type} link to '${b.from.item.id}' allows (${isoOf(cal.dayAt(b.at))}); its dates are kept`, `${leaf.path}/${s !== undefined ? 'start' : 'end'}`),
          );
      if (ws < 0) out.push(warning('gantt.early', `'${it.id}' starts before the project starts (${m.start})`, `${leaf.path}/${s !== undefined ? 'start' : 'end'}`));
    }
    placed.set(leaf, { ws, wf });
  }

  const result: Placed[] = rows.map((r) => {
    const { ws, wf } = r.children.length ? span(r) : placed.get(r)!;
    const point = !r.children.length && POINT_TYPES.includes(r.item.type ?? 'task');
    // A moment sits at the end of the working day before it; work covers whole calendar days.
    const end = (i: number) => (i > 0 ? cal.dayAt(i - 1) + 1 : cal.dayAt(0));
    const [from, to] = point || wf === ws ? [end(wf), end(wf)] : [cal.dayAt(ws), cal.dayAt(wf - 1) + 1];
    const [first, last] = from === to ? [isoOf(to - 1), isoOf(to - 1)] : [isoOf(from), isoOf(to - 1)];
    return { ...r, summary: r.children.length > 0, point, ws, wf, from, to, first, last, days: wf - ws, links: links.get(r)! };
  });
  const finish = Math.max(start, ...result.map((r) => r.to));
  const deadline = m.deadline === undefined ? undefined : dayOf(m.deadline);
  if (m.deadline !== undefined && deadline === undefined) out.push(error('gantt.date', `'${m.deadline}' is not a real date`, '/deadline'));
  if (deadline !== undefined && finish - 1 > deadline) out.push(warning('gantt.deadline', `the project finishes on ${isoOf(finish - 1)}, after its deadline (${m.deadline})`, '/deadline'));
  return {
    rows: result,
    diagnostics: out,
    start,
    finish,
    ...(deadline !== undefined && { deadline }),
    offDays: (from, to) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i).filter((d) => !cal.isWork(d)),
  };
}

/** A loop among `pending` leaves, starting from `first`, following what each waits for. */
function loopFrom(first: Row, waits: Map<Row, Row[]>, pending: Set<Row>): Row[] {
  const path: Row[] = [];
  for (let x: Row | undefined = first; x; x = waits.get(x)!.find((w) => pending.has(w))) {
    const at = path.indexOf(x);
    if (at >= 0) return [...path.slice(at), x];
    path.push(x);
  }
  return [first];
}
