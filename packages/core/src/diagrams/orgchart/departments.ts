import { error, pointer, warning, type Diagnostic } from '../../diagnostics.ts';
import type { Department, OrgChart } from './model.ts';

/** A department to box (URS-TYP-012): listed ones first, then those only named on people, in order. */
export interface Dept {
  id: string;
  name: string;
  entry?: Department;
  /** Where it is defined: its `departments` entry, else the first person naming it. */
  src: string;
}

export function departmentsOf(m: OrgChart): Dept[] {
  const out = new Map<string, Dept>();
  (m.departments ?? []).forEach((d, i) => out.has(d.name) || out.set(d.name, { id: `dept${out.size}`, name: d.name, entry: d, src: pointer('departments', i) }));
  m.people.forEach((p, i) => p.department !== undefined && !out.has(p.department) && out.set(p.department, { id: `dept${out.size}`, name: p.department, src: pointer('people', i, 'department') }));
  return [...out.values()];
}

/** The chain of parents from `name` back to itself, if it loops. */
export function loopOf(name: string, parentOf: ReadonlyMap<string, string | undefined>): string[] | undefined {
  const path = [name];
  for (let x = parentOf.get(name); x !== undefined; x = parentOf.get(x)) {
    path.push(x);
    if (x === name) return path;
    if (path.length > parentOf.size + 1) return undefined;
  }
  return undefined;
}

/** Unknown or circular parents are errors; a department split across the chart is a warning, since its box covers the people between. */
export function checkDepartments(m: OrgChart): Diagnostic[] {
  const list = m.departments ?? [];
  const named = new Set([...list.map((d) => d.name), ...m.people.flatMap((p) => (p.department === undefined ? [] : [p.department]))]);
  const parentOf = new Map(list.map((d) => [d.name, d.parent]));
  const out: Diagnostic[] = [];
  list.forEach((d, i) => {
    if (list.findIndex((x) => x.name === d.name) !== i) out.push(error('orgchart.department', `department '${d.name}' is listed twice`, pointer('departments', i, 'name')));
    if (d.parent === undefined) return;
    if (!named.has(d.parent)) return out.push(error('ref.department', `unknown department '${d.parent}'`, pointer('departments', i, 'parent')));
    const loop = loopOf(d.name, parentOf);
    if (loop) out.push(error('orgchart.department', `department '${d.name}' sits inside itself (${loop.join(' → ')})`, pointer('departments', i, 'parent')));
  });
  if (out.length) return out;
  // Members of a department include those of departments inside it.
  const within = (dept: string | undefined, d: string) => {
    for (let x = dept; x !== undefined; x = parentOf.get(x)) if (x === d) return true;
    return false;
  };
  const byId = new Map(m.people.map((p) => [p.id, p]));
  for (const d of named) {
    const entries = m.people.flatMap((p, i) => (within(p.department, d) && !within(byId.get(p.manager ?? '')?.department, d) ? [i] : []));
    if (entries.length > 1)
      out.push(
        warning(
          'orgchart.department',
          `'${d}' is in ${entries.length} separate parts of the chart; its box will also cover the people between them. Give it one head that the others report to, directly or not.`,
          pointer('people', entries[1]!, 'department'),
        ),
      );
  }
  return out;
}
