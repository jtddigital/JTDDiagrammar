import type { DiagramType } from '../../registry/diagram-type.ts';
import { stateAi } from './ai.ts';
import { examples } from './examples.ts';
import type { StateDiagram } from './model.ts';
import { stateSchema } from './schema.ts';
import { stateToIR } from './to-ir.ts';
import { validateState } from './validate.ts';

export const state: DiagramType<StateDiagram> = {
  id: 'state',
  title: 'State diagram',
  description: 'States and the transitions between them, with composite (nested) states. For lifecycles and modes.',
  schema: stateSchema,
  engine: 'layered',
  validate: validateState,
  toIR: stateToIR,
  examples,
  ai: stateAi,
};
