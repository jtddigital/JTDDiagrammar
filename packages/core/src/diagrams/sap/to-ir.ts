import { pointer } from '../../diagnostics.ts';
import type { Band, BandGroup, GraphIR, IREdge, IRNode } from '../../ir/types.ts';
import { noted } from '../annotations.ts';
import { merged, over, styled } from '../section-styles.ts';
import { columnsOf } from './columns.ts';
import { sapLegend } from './legend.ts';
import { matrixParts } from './matrix.ts';
import { nextOf, numbered, type Sap } from './model.ts';
import { DASHED, workflowParts } from './workflows.ts';

export const SYSTEM_LANE = 'sap:system';
export const USER_LANE = 'sap:user';

/**
 * SAP status management and flexible workflow (URS-TYP-019..021). Columns are the numbered user statuses,
 * under the system status each is used in, then the flags. Rows: the system statuses, set by business
 * transactions; the user statuses, with an arrow to each status in a numbered status's range; one row
 * per workflow; and with `matrix`, one row per business transaction.
 */
export function sapToIR(m: Sap): GraphIR {
  const sys = m.systemStatuses ?? [];
  const users = m.userStatuses ?? [];
  const { columns, groups, at } = columnsOf(m);
  const first = columns[0]?.id ?? 'col:none';
  const phases: Band[] = columns.length ? columns : [{ id: first, label: '' }];
  const col = (code: string | undefined) => (code !== undefined && at.get(code)) || first;
  const sysCodes = new Set(sys.map((s) => s.code));
  const userCodes = new Set(users.map((u) => u.code));
  const pill = (code: string) => (sysCodes.has(code) ? `sys:${code}` : userCodes.has(code) ? `us:${code}` : undefined);
  const lanes: Band[] = [];
  const nodes: IRNode[] = [];
  const edges: IREdge[] = [];
  const line = over(m.edgeStyle, undefined);

  // System statuses in order; the arrow into each names the business transactions that set it.
  if (sys.length) {
    lanes.push({ id: SYSTEM_LANE, label: 'System status', src: '/systemStatuses/0' });
    const place = { lane: SYSTEM_LANE };
    nodes.push({ id: 'sys:start', shape: 'initial', label: '', ...place, phase: col(sys[0]!.code), src: '/systemStatuses/0' });
    edges.push({ id: 'sys:start>', from: 'sys:start', to: `sys:${sys[0]!.code}`, ...line, src: '/systemStatuses/0' });
    sys.forEach((s, i) => {
      nodes.push({
        id: `sys:${s.code}`,
        shape: 'state',
        label: s.code,
        ...(s.label && { sub: s.label }),
        ...noted(m, s.annotation, { id: s.code, label: s.label ?? s.code, type: 'System status', ...(s.tags && { tags: s.tags }) }),
        ...place,
        phase: col(s.code),
        ...styled(m.styles, 'systemStatuses', s.style),
        ...(s.quote && { quote: s.quote }),
        src: pointer('systemStatuses', i),
      });
      if (!i) return;
      const by = (m.transactions ?? []).filter((t) => t.sets?.includes(s.code)).map((t) => t.label ?? t.id);
      edges.push({ id: `sys:${sys[i - 1]!.code}>${s.code}`, from: `sys:${sys[i - 1]!.code}`, to: `sys:${s.code}`, ...(by.length && { labels: [{ text: by.join(', ') }] }), ...line, src: pointer('systemStatuses', i) });
    });
  }

  // User statuses: numbered ones linked by their ranges, flags dashed in their own columns.
  if (users.length) {
    lanes.push({ id: USER_LANE, label: 'User status', src: '/userStatuses/0' });
    const initial = numbered(m).find((u) => u.initial);
    if (initial) {
      nodes.push({ id: 'us:start', shape: 'initial', label: '', lane: USER_LANE, phase: col(initial.code), src: pointer('userStatuses', users.indexOf(initial), 'initial') });
      edges.push({ id: 'us:start>', from: 'us:start', to: `us:${initial.code}`, ...line, src: pointer('userStatuses', users.indexOf(initial), 'initial') });
    }
    users.forEach((u, i) => {
      const range = m.transitions === 'ranges' && u.number !== undefined ? `Next ${u.low ?? u.number}–${u.high ?? u.number}` : undefined;
      nodes.push({
        id: `us:${u.code}`,
        shape: 'state',
        label: u.code,
        ...(range && { sub: range }),
        ...noted(m, u.annotation, { id: u.code, label: u.label ?? u.code, type: u.number === undefined ? 'Flag' : 'User status', ...(u.tags && { tags: u.tags }) }),
        lane: USER_LANE,
        phase: col(u.code),
        ...over(merged(m.styles?.userStatuses, u.number === undefined ? DASHED : undefined), u.style),
        ...(u.quote && { quote: u.quote }),
        src: pointer('userStatuses', i),
      });
      if (m.transitions !== 'ranges' && u.number !== undefined)
        for (const t of nextOf(m, u)) edges.push({ id: `next:${u.code}>${t.code}`, from: `us:${u.code}`, to: `us:${t.code}`, ...line, src: pointer('userStatuses', i, 'high') });
    });
  }

  (m.workflows ?? []).forEach((w, wi) => {
    const part = workflowParts({ m, col, pill }, w, wi);
    lanes.push(part.lane);
    nodes.push(...part.nodes);
    edges.push(...part.edges);
  });

  const laneGroups: BandGroup[] = [];
  if (m.matrix) {
    const mx = matrixParts(m, col);
    lanes.push(...mx.lanes);
    nodes.push(...mx.nodes);
    if (mx.group) laneGroups.push(mx.group);
  }

  const title = m.title ?? m.object;
  const meta: [string, string][] = [
    ...(m.title && m.object ? [['Object', m.object] as [string, string]] : []),
    ...(m.profile ? [['Status profile', m.profile] as [string, string]] : []),
    ...Object.entries(m.info ?? {}),
  ];
  const legend = m.legend === false ? [] : sapLegend(m, nodes, edges);
  return {
    ...(title !== undefined && { title }),
    ...(m.theme && { theme: m.theme }),
    direction: 'LR',
    nodes,
    edges,
    containers: [],
    partitions: { lanes: lanes.length ? lanes : [{ id: USER_LANE, label: 'User status' }], phases, ...(groups.length && { phaseGroups: groups }), ...(laneGroups.length && { laneGroups }) },
    ...(legend.length && { legend }),
    ...(meta.length && { meta }),
  };
}

