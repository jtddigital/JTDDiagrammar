import type { Icon, IREdge, IRNode, LegendItem } from '../../ir/types.ts';
import { merged, ruled } from '../section-styles.ts';
import { stepsOf, type Lifecycle, type StateType, type StepKind } from './model.ts';
import { DASHED, hasMain, MAIN, SHAPE } from './steps.ts';
import { stateStyle } from './state-style.ts';

const KIND: Record<StepKind, string> = {
  start: 'Start / end',
  end: 'Start / end',
  task: 'Task',
  decision: 'Decision',
  notification: 'Notification',
  system: 'System action',
  stateChange: 'State change',
  parallel: 'Parallel split / join',
  join: 'Parallel split / join',
};
const TYPE: Record<StateType, string> = { initial: 'Initial state', steady: 'State', final: 'Final state', cancelled: 'Cancelled state' };
const ICON_TEXT: Record<Icon, string> = {
  signature: 'eSignature required',
  clock: 'Time allowed',
  timer: 'Scheduled job',
  all: 'All participants complete',
  any: 'Any one participant completes',
  each: 'One task per participant',
};

/**
 * The legend of a lifecycle chart (URS-DM-026): only what the chart uses. Step kinds in their kind
 * style; owners and state types that have a colour of their own; markers; the main path, workflow
 * starts and summary transitions.
 */
export function lifecycleLegend(m: Lifecycle, nodes: readonly IRNode[], edges: readonly IREdge[]): LegendItem[] {
  const steps = stepsOf(m).map((x) => x.step);
  const ids = new Set(nodes.map((n) => n.id));
  const shown = steps.filter((s) => ids.has(s.id));
  const out: LegendItem[] = [];
  const add = (it: LegendItem) => out.some((o) => o.label === it.label) || out.push(it);

  for (const s of shown) {
    const kind = s.kind ?? 'task';
    const style = merged(m.styles?.steps, ruled(m.styleBy, { kind }));
    add({ label: KIND[kind], shape: SHAPE[kind], ...(style && { style }) });
  }
  for (const owner of new Set(shown.flatMap((s) => (s.owner ? [s.owner] : [])))) {
    const own = ruled(m.styleBy, { owner });
    if (own) add({ label: owner, shape: 'process', style: merged(m.styles?.steps, own)! });
  }
  if (nodes.some((n) => n.shape === 'state'))
    for (const s of m.states) {
      const style = stateStyle(m, s);
      if (style?.fill) add({ label: TYPE[s.stateType ?? 'steady'], shape: 'state', style });
    }
  if (nodes.some((n) => n.style?.dash === 'dashed' && n.shape === 'state')) add({ label: 'Action available in several states', shape: 'state', style: { dash: 'dashed' } });

  const icons = new Set<Icon>([...nodes.flatMap((n) => (n.badges ?? []).flatMap((b) => (b.icon ? [b.icon] : []))), ...edges.flatMap((e) => (e.labels ?? []).flatMap((l) => (l.icon ? [l.icon] : [])))]);
  for (const i of Object.keys(ICON_TEXT) as Icon[]) if (icons.has(i)) add({ label: ICON_TEXT[i], icon: i });

  if (hasMain(m) && m.view !== 'summary') add({ label: 'Main path', line: MAIN });
  if (edges.some((e) => e.id.startsWith('start:'))) add({ label: 'Starts a workflow', line: DASHED });
  if (edges.some((e) => e.id.startsWith('flow:'))) add({ label: 'Workflow transition', line: DASHED });
  return out;
}
