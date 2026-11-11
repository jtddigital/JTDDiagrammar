import type { DiagramType } from '../../registry/diagram-type.ts';
import { examples } from './examples.ts';
import type { Flowchart } from './model.ts';
import { flowchartSchema } from './schema.ts';
import { flowchartToIR } from './to-ir.ts';
import { validateFlowchart } from './validate.ts';

export const flowchart: DiagramType<Flowchart> = {
  id: 'flowchart',
  title: 'Flowchart',
  description: 'Flowcharts. Add lanes (and optional phases) for a cross-functional flowchart.',
  schema: flowchartSchema,
  engine: 'layered',
  validate: validateFlowchart,
  toIR: flowchartToIR,
  examples,
};
