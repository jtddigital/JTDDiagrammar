import type { Badge, EdgeLabel, IREdge, IRNode, Style } from '../../ir/types.ts';
import { edgeLabels } from '../edge-labels.ts';
import { merged, over, ruled } from '../section-styles.ts';
import { stepsOf, type LcLink, type LcStep, type LcVerdict, type Lifecycle, type StepKind } from './model.ts';

export const SHAPE: Record<StepKind, string> = {
  start: 'terminator',
  end: 'terminator',
  task: 'process',
  decision: 'decision',
  notification: 'document',
  system: 'hexagon',
  stateChange: 'chevron',
  parallel: 'bar',
  join: 'bar',
};

/** Emphasis for the main path, and fading for the rest, when any connection is marked `main` (URS-TYP-009). */
export const MAIN: Style = { lineWidth: 2.5 };
const FADED: Style = { opacity: 0.45 };
/** Workflow starts and summary transitions are dashed. */
export const DASHED: Style = { dash: 'dashed' };

/** Whether anything is marked as the main path. */
export const hasMain = (m: Lifecycle) =>
  m.states.some((s) => s.to?.some((a) => a.main)) ||
  !!m.sharedActions?.some((a) => a.main) ||
  stepsOf(m).some(({ step: s }) => s.to?.some((l) => l.main) || s.verdicts?.some((v) => v.main));

/** An edge's style: edge default, then main-path emphasis (or fading), then its own (URS-TYP-009). */
export const edgeStyleOf = (m: Lifecycle, main: boolean | undefined, own: Style | undefined, extra?: Style) =>
  over(merged(merged(m.edgeStyle, hasMain(m) ? (main ? MAIN : FADED) : undefined), extra), own);

/** Text under the divider: owner, then the fields a task completes or a system action sets (URS-DM-021). */
const subOf = (s: LcStep, kind: StepKind) =>
  [s.owner, ...(s.fields?.length ? (kind === 'task' ? [`Complete: ${s.fields.join(', ')}`] : s.fields) : [])].filter(Boolean).join('\n') || undefined;

/** Badges: eSignature, due time, and how several participants complete (URS-DM-025). */
const badgesOf = (s: LcStep): Badge[] => [
  ...(s.signature ? [{ icon: 'signature' as const }] : []),
  ...(s.due ? [{ icon: 'clock' as const, text: s.due }] : []),
  ...(s.completion ? [{ icon: s.completion }] : []),
];

/** Reasons and comment rules of a verdict, for its tooltip. */
const verdictNote = (v: LcVerdict) =>
  [v.quote, v.reasons?.length && `Reasons: ${v.reasons.join('; ')}`, v.comment && 'Comment required'].filter(Boolean).join(' · ') || undefined;

/** A step's node: shape by kind, label and owner, badges, style by section, kind, owner and its own. */
export function stepNode(m: Lifecycle, s: LcStep, src: string, stateLabel: (id: string | undefined) => string, place: object): IRNode {
  const kind = s.kind ?? 'task';
  const label = s.label ?? (kind === 'stateChange' ? stateLabel(s.target) : kind === 'start' ? 'Start' : kind === 'end' ? 'End' : kind === 'parallel' || kind === 'join' ? '' : s.id);
  const sub = subOf(s, kind);
  const badges = badgesOf(s);
  return {
    id: s.id,
    shape: SHAPE[kind],
    label,
    ...(sub && { sub }),
    ...(badges.length && { badges }),
    ...place,
    ...(s.order !== undefined && { order: s.order }),
    ...over(merged(m.styles?.steps, ruled(m.styleBy, { kind, owner: s.owner })), s.style),
    ...(s.quote && { quote: s.quote }),
    src,
  } as IRNode;
}

/** Side hints as IR ports (URS-DM-009). */
const ports = (l: Pick<LcLink, 'exitSide' | 'entrySide'>) => {
  const p = { ...(l.exitSide && { from: l.exitSide }), ...(l.entrySide && { to: l.entrySide }) };
  return Object.keys(p).length ? { ports: p } : {};
};

/** A step's outgoing edges: connections, then verdicts (a verdict's label carries an eSignature icon when it needs one). */
export function stepEdges(m: Lifecycle, s: LcStep, src: string): IREdge[] {
  const links = (s.to ?? []).map(
    (l, j): IREdge => ({
      id: l.id ?? `edge:${s.id}:${j}`,
      from: s.id,
      to: l.step,
      ...edgeLabels(l.label, l.labels),
      ...ports(l),
      ...edgeStyleOf(m, l.main, l.style),
      ...(l.quote && { quote: l.quote }),
      src: `${src}/to/${j}`,
    }),
  );
  const verdicts = (s.verdicts ?? []).map((v, j): IREdge => {
    const name: EdgeLabel = { text: v.name, ...(v.signature && { icon: 'signature' as const }) };
    const note = verdictNote(v);
    return {
      id: v.id ?? `verdict:${s.id}:${j}`,
      from: s.id,
      to: v.step,
      labels: [name, ...(edgeLabels(undefined, v.labels).labels ?? [])],
      ...ports(v),
      ...edgeStyleOf(m, v.main, v.style),
      ...(note && { quote: note }),
      src: `${src}/verdicts/${j}`,
    };
  });
  return [...links, ...verdicts];
}
