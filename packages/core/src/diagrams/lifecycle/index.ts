import type { DiagramType } from '../../registry/diagram-type.ts';
import { lifecycleAi } from './ai.ts';
import { examples } from './examples.ts';
import type { Lifecycle } from './model.ts';
import { lifecycleSchema } from './schema.ts';
import { lifecycleToIR } from './to-ir.ts';
import { validateLifecycle } from './validate.ts';

/** Object lifecycle, e.g. a Veeva Vault object (URS-TYP-008): states × workflows, stage groups, user actions. */
export const lifecycle: DiagramType<Lifecycle> = {
  id: 'lifecycle',
  title: 'Object lifecycle',
  description: 'Object states (grouped into lifecycle stages) against the workflows that move a record between them. For Veeva Vault and similar object lifecycles.',
  schema: lifecycleSchema,
  engine: 'layered',
  validate: validateLifecycle,
  toIR: lifecycleToIR,
  examples,
  ai: lifecycleAi,
};
