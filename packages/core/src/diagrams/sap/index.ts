import { sapEdit } from './edit.ts';
import type { DiagramType } from '../../registry/diagram-type.ts';
import { bpmnExport } from '../process/bpmn.ts';
import { sapAi } from './ai.ts';
import { sapToProcess } from './to-process.ts';
import { examples } from './examples.ts';
import type { Sap } from './model.ts';
import { sapSchema } from './schema.ts';
import { sapToIR } from './to-ir.ts';
import { validateSap } from './validate.ts';

/** SAP status management and flexible workflow (URS-TYP-019..021). */
export const sap: DiagramType<Sap> = {
  id: 'sap',
  title: 'SAP status and workflow',
  description: 'An SAP object’s system and user statuses, the business transactions each allows, and the flexible workflows that approve it. For status profiles, transaction control and flexible workflow.',
  schema: sapSchema,
  engine: 'layered',
  validate: validateSap,
  toIR: sapToIR,
  examples,
  ai: sapAi,
  exports: { bpmn: bpmnExport(sapToProcess) },
  edit: sapEdit,
};
