import type { Style } from '../../ir/types.ts';

/**
 * Drawing conventions shared by process-oriented types (URS-PM-019): what starts a workflow and rework are
 * dashed; things hanging off a state (child records, documents created in it) are dotted, without an arrowhead.
 */
export const DASHED: Style = { dash: 'dashed' };
export const DOTTED: Style = { dash: 'dotted' };
export const HANGING = { marker: 'none' as const };
