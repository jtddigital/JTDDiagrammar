import type { JsonSchema } from '../registry/diagram-type.ts';
import type { Registry } from '../registry/registry.ts';

/** One schema for all registered types, dispatching on `type` (URS-EXT-006). */
export const combinedSchema = (reg: Registry): JsonSchema => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:jtd:schema:v1',
  title: 'JTDDiagrammar diagram',
  type: 'object',
  required: ['type'],
  properties: { type: { type: 'string', enum: reg.types().map((t) => t.id) } },
  discriminator: { propertyName: 'type' },
  oneOf: reg.types().map((t) => ({ $ref: t.schema.$id })),
  $defs: Object.fromEntries(reg.types().map((t) => [t.id, t.schema])),
});
