import { pointer } from '../../diagnostics.ts';
import type { EditAssets } from '../../registry/diagram-type.ts';
import type { Sap } from './model.ts';

const DOC = /^\/documents\/(\d+)$/;
/** A status code from a fresh id: codes are short and upper case by convention. */
const code = (id: string) => id.toUpperCase().replace(/-/g, '_');

/** Toolbar editing (URS-EXT-012): statuses and documents (things that draw on their own); a document to a document is the document flow. */
export const sapEdit: EditAssets<Sap> = {
  add: [
    { label: 'User status', make: (id) => ({ at: '/userStatuses', append: true, value: { code: code(id), label: 'New status' } }) },
    { label: 'System status', make: (id) => ({ at: '/systemStatuses', append: true, value: { code: code(id), label: 'New status' } }) },
    { label: 'Document', make: (id) => ({ at: '/documents', append: true, value: { id, label: 'New document' } }) },
  ],
  connect: (m, from, to) => {
    const [a, b] = [DOC.exec(from.src ?? ''), DOC.exec(to.src ?? '')];
    if (!a || !b || a[1] === b[1]) return undefined;
    const [x, y] = [m.documents![Number(a[1])]!, m.documents![Number(b[1])]!];
    if (y.from?.includes(x.id)) return undefined;
    return { at: pointer('documents', Number(b[1]), 'from'), append: true, value: x.id };
  },
};
