import { processEdit } from './edit.ts';
import type { DiagramType } from '../../../registry/diagram-type.ts';
import { bpmnExport } from '../bpmn.ts';
import { processAi } from './ai.ts';
import { processToModel } from './to-model.ts';
import { examples } from './examples.ts';
import type { ProcessDoc } from './model.ts';
import { processSchema } from './schema.ts';
import { processToIR } from './to-ir.ts';
import { validateProcess } from './validate.ts';

/** A process in the canonical terms, for platforms without a type of their own (URS-PM-020). */
export const processType: DiagramType<ProcessDoc> = {
  id: 'process',
  title: 'Process',
  description: 'An object’s states (in one or more regions), the operations, signals and rules that move it, what each state permits, and its workflows, written in the canonical process terms. For platforms without a type of their own, e.g. IBM Maximo, PTC Windchill, ServiceNow.',
  schema: processSchema,
  engine: 'layered',
  validate: validateProcess,
  toIR: processToIR,
  examples,
  ai: processAi,
  exports: { bpmn: bpmnExport(processToModel) },
  edit: processEdit,
};
