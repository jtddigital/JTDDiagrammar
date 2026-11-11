import type { Progress } from './api.ts';

const STAGE: Record<Progress['stage'], string> = {
  ingest: 'Reading documents…',
  select: 'Choosing a diagram type…',
  generate: 'Drafting the diagram…',
  validate: 'Checking the result…',
  repair: 'Fixing problems…',
};
/** Status line for a progress event (URS-WEB-012). */
export const stageText = (p: Progress) => `${STAGE[p.stage]}${p.attempt && p.attempt > 1 ? ` (attempt ${p.attempt})` : ''}`;
