import { pointer } from '../../diagnostics.ts';
import type { EditAssets } from '../../registry/diagram-type.ts';
import type { OrgChart } from './model.ts';

/** Toolbar editing (URS-EXT-012): a person; connecting a manager to a person makes them report to that manager. */
export const orgchartEdit: EditAssets<OrgChart> = {
  add: [{ label: 'Person', make: (id) => ({ at: '/people', append: true, value: { id, name: 'New person' } }) }],
  connect: (m, { id: from }, { id: to }) => {
    const j = m.people.findIndex((p) => p.id === to);
    if (from === to || j < 0 || !m.people.some((p) => p.id === from)) return undefined;
    return { at: pointer('people', j, 'manager'), value: from };
  },
};
