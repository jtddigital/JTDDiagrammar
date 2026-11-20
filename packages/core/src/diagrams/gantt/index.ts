import { ganttEdit } from './edit.ts';
import type { DiagramType } from '../../registry/diagram-type.ts';
import { ai } from './ai.ts';
import { examples } from './examples.ts';
import type { Gantt } from './model.ts';
import { scheduleOf } from './schedule.ts';
import { ganttSchema } from './schema.ts';
import { checkTags } from './style.ts';
import { toIR } from './to-ir.ts';

/** Gantt chart (URS-TYP-015..017): items in time, scheduled from links and a working calendar. */
export const gantt: DiagramType<Gantt> = {
  id: 'gantt',
  title: 'Gantt chart',
  description: 'Tasks, milestones and their dependencies over time. For project plans.',
  schema: ganttSchema,
  engine: 'timeline',
  validate: (m) => [...scheduleOf(m).diagnostics, ...checkTags(m, scheduleOf(m).rows)],
  toIR,
  examples,
  ai,
  edit: ganttEdit,
};
