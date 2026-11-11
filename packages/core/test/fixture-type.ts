import type { DiagramType } from '../src/index.ts';
import { pointer } from '../src/index.ts';
import { envelope, id } from '../src/schema/fragments.ts';

/** Test-only type proving new types need no pipeline changes (URS-EXT-002). */
interface Checklist {
  items: { id: string; label: string }[];
}

export const checklist: DiagramType<Checklist> = {
  id: 'checklist',
  title: 'Checklist',
  description: 'Test fixture: items chained top to bottom.',
  schema: {
    $id: 'urn:jtd:test:checklist',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'type', 'items'],
    properties: {
      ...envelope('checklist'),
      items: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id, label: { type: 'string' } } },
      },
    },
  },
  engine: 'layered',
  toIR: (m) => ({
    direction: 'TB',
    nodes: m.items.map((it, i) => ({ id: it.id, shape: 'process', label: it.label, src: pointer('items', i) })),
    edges: m.items.slice(1).map((it, i) => ({ id: `edge:${i}`, from: m.items[i]!.id, to: it.id })),
    containers: [],
  }),
  examples: [{ name: 'basic', title: 'Checklist', source: { version: '1', type: 'checklist', items: [{ id: 'a', label: 'A' }] } }],
};
