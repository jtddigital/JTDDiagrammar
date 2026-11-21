import { describe, expect, it } from 'vitest';
import { createRegistry, PROPERTY_GROUPS } from '../src/index.ts';

const reg = createRegistry();
const GROUPS = new Set<string>(PROPERTY_GROUPS.map((g) => g.id));

/** Every `$comment` in a schema, with where it is. */
function comments(s: unknown, at = '', out: [string, string][] = []): [string, string][] {
  if (Array.isArray(s)) s.forEach((x, i) => comments(x, `${at}/${i}`, out));
  else if (s && typeof s === 'object')
    for (const [k, v] of Object.entries(s)) {
      if (k === '$comment' && typeof v === 'string') out.push([at, v]);
      else comments(v, `${at}/${k}`, out);
    }
  return out;
}

describe('editor hints in the schemas (URS-WEB-027, URS-WEB-028)', () => {
  it('are known tags only: a reference or a category the editors know', () => {
    for (const t of reg.types())
      for (const [at, c] of comments(t.schema))
        for (const tag of c.split(' ')) {
          const [key, value = ''] = tag.split(':');
          const ok = key === 'ref' ? /^[\w,]+(#\w+)?$/.test(value) : key === 'group' && GROUPS.has(value);
          expect(ok, `${t.id}${at}: ${c}`).toBe(true);
        }
  });

  it('put each type’s placement, connections and looks in their categories', () => {
    const tagged = (name: string, group: string) => comments(reg.type(name)!.schema).filter(([, c]) => c.includes(`group:${group}`)).length;
    for (const t of reg.types()) expect(tagged(t.id, 'appearance'), t.id).toBeGreaterThan(0);
    expect(tagged('flowchart', 'placement')).toBeGreaterThan(0);
    expect(tagged('flowchart', 'links')).toBeGreaterThan(0);
    expect(tagged('gantt', 'schedule')).toBe(3);
  });
});
