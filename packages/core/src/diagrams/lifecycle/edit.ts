import { pointer } from '../../diagnostics.ts';
import type { EditAssets } from '../../registry/diagram-type.ts';
import type { Lifecycle, StepKind } from './model.ts';

const STEPS: [StepKind, string, string][] = [
  ['task', 'Task', 'New task'],
  ['decision', 'Decision', 'Decision?'],
  ['notification', 'Notification', 'Notify'],
  ['system', 'System action', 'System action'],
  ['stateChange', 'State change', ''],
  ['end', 'Workflow end', ''],
];
const STATE = /^\/states\/(\d+)$/;
const STEP = /^\/workflows\/(\d+)\/steps\/(\d+)$/;

/**
 * Toolbar editing (URS-EXT-012): states, workflows, and steps in the first workflow (in the first state);
 * a state to a state is a user action, a step to a step of the same workflow is a flow.
 */
export const lifecycleEdit: EditAssets<Lifecycle> = {
  add: [
    { label: 'State', make: (id) => ({ at: '/states', append: true, value: { id, label: 'New state' } }) },
    {
      label: 'Workflow',
      make: (id, m) => ({ at: '/workflows', append: true, value: { id, label: 'New workflow', steps: [{ id: `${id}-start`, kind: 'start', state: m.states[0]!.id }] } }),
      available: (m) => m.states.length > 0,
    },
    ...STEPS.map(([kind, label, text]) => ({
      label,
      make: (id: string, m: Lifecycle) => ({
        at: '/workflows/0/steps',
        append: true,
        value: { id, kind, ...(text && { label: text }), ...(kind === 'stateChange' ? { target: m.states[0]!.id } : { state: m.states[0]!.id }) },
      }),
      available: (m: Lifecycle) => Boolean(m.workflows?.length) && m.states.length > 0,
    })),
  ],
  connect: (m, from, to) => {
    const [a, b] = [STATE.exec(from.src ?? ''), STATE.exec(to.src ?? '')];
    if (a && b) return a[1] === b[1] ? undefined : { at: pointer('states', Number(a[1]), 'to'), append: true, value: { state: m.states[Number(b[1])]!.id, label: 'Move on' } };
    const [s, t] = [STEP.exec(from.src ?? ''), STEP.exec(to.src ?? '')];
    if (!s || !t || s[1] !== t[1] || s[2] === t[2]) return undefined;
    const steps = m.workflows![Number(s[1])]!.steps;
    const [x, y] = [steps[Number(s[2])]!, steps[Number(t[2])]!];
    if (x.kind === 'end' || y.kind === 'start' || x.to?.some((l) => l.step === y.id)) return undefined;
    return { at: pointer('workflows', Number(s[1]), 'steps', Number(s[2]), 'to'), append: true, value: { step: y.id } };
  },
};
