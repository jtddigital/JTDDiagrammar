import type { Theme } from '../../ir/types.ts';
import { STROKE } from '../../style.ts';

/** Colours per theme (URS-DM-010). Element styles override these. */
export interface Palette {
  background: string;
  text: string;
  nodeFill: string;
  nodeStroke: string;
  edge: string;
  labelFill: string;
  bandStroke: string;
  laneFill: string;
  laneHeaderFill: string;
  phaseHeaderFill: string;
  containerFill: string;
  noteFill: string;
}

export const PALETTES: Record<Theme, Palette> = {
  default: {
    background: '#ffffff',
    text: '#0f172a',
    nodeFill: '#ffffff',
    nodeStroke: '#334155',
    edge: '#475569',
    labelFill: '#ffffff',
    bandStroke: '#94a3b8',
    laneFill: '#ffffff',
    laneHeaderFill: '#f1f5f9',
    phaseHeaderFill: '#e2e8f0',
    containerFill: '#f8fafc',
    noteFill: '#fef9c3',
  },
  dark: {
    background: '#0f172a',
    text: '#e2e8f0',
    nodeFill: '#1e293b',
    nodeStroke: '#94a3b8',
    edge: '#94a3b8',
    labelFill: '#0f172a',
    bandStroke: '#475569',
    laneFill: '#0f172a',
    laneHeaderFill: '#1e293b',
    phaseHeaderFill: '#334155',
    containerFill: '#162033',
    noteFill: '#3b3520',
  },
};

/** Sizes, independent of theme. */
export const METRICS = { stroke: STROKE, margin: 24, titleGap: 16 } as const;

const DASH = { solid: '', dashed: ' stroke-dasharray="6 4"', dotted: ' stroke-dasharray="1.5 3" stroke-linecap="round"' } as const;
export const dash = (d: keyof typeof DASH | undefined) => (d ? DASH[d] : '');

/** Whole-element opacity (URS-DM-016). */
export const opacity = (o: number | undefined) => (o !== undefined && o < 1 ? ` opacity="${o}"` : '');
