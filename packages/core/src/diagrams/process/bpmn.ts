import type { ProcessModel, WNode, Workflow } from './model.ts';

/**
 * One-way BPMN 2.0 export of a process model's workflows (URS-PM-018, D-003, ARCHITECTURE §13.8): a pool per
 * workflow with a lane per role, events, tasks and gateways, sequence flows with their guards, signals, and
 * diagram interchange (positions), so BPMN modellers can open it. States, permissions and object relations
 * have no BPMN equivalent and are left out; BPMN edited elsewhere is not read back.
 */
export function toBpmn(m: ProcessModel, title = 'Process'): string {
  const ids = new Ids();
  const sig = new Map(m.signals.map((s) => [s.id, { xml: ids.of('Signal', s.id), name: s.name }]));
  const used = new Set<string>();
  const pools: string[] = [];
  const processes: string[] = [];
  const shapes: string[] = [];
  let top = 0;
  for (const w of m.workflows) {
    const starts = m.subscriptions.filter((s) => s.consumer.kind === 'workflow' && s.consumer.workflow === w.id && sig.has(s.signal)).map((s) => s.signal);
    starts.forEach((s) => used.add(s));
    w.nodes.forEach((n) => n.kind === 'send' && n.signal && sig.has(n.signal) && used.add(n.signal));
    const out = pool(w, ids, sig, starts[0], top);
    pools.push(out.participant);
    processes.push(out.process);
    shapes.push(...out.shapes);
    top += out.height + 40;
  }
  const collab = ids.of('Collaboration', 'main');
  // Without workflows, an empty process, so the file still opens.
  if (!pools.length) processes.push(`  <bpmn:process id="Process_empty" name="${esc(title)}" isExecutable="false"/>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- ${esc(title)}: exported one way from JTDDiagrammar (BPMN 2.0). Edits made in other tools are not read back. -->`,
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions" targetNamespace="urn:jtd:bpmn" exporter="JTDDiagrammar" exporterVersion="1">',
    ...[...used].map((s) => `  <bpmn:signal id="${sig.get(s)!.xml}" name="${esc(sig.get(s)!.name)}"/>`),
    ...(pools.length ? [`  <bpmn:collaboration id="${collab}">`, ...pools, '  </bpmn:collaboration>'] : []),
    ...processes,
    '  <bpmndi:BPMNDiagram id="Diagram">',
    `    <bpmndi:BPMNPlane id="Plane" bpmnElement="${pools.length ? collab : 'Process_empty'}">`,
    ...shapes,
    '    </bpmndi:BPMNPlane>',
    '  </bpmndi:BPMNDiagram>',
    '</bpmn:definitions>',
    '',
  ].join('\n');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** XML ids (NCName) from model ids, unique across the file. */
class Ids {
  private readonly seen = new Map<string, string>();
  private readonly taken = new Set<string>();
  of(kind: string, id: string): string {
    const key = `${kind}|${id}`;
    if (this.seen.has(key)) return this.seen.get(key)!;
    const base = `${kind}_${id.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
    let out = base;
    for (let i = 2; this.taken.has(out); i++) out = `${base}_${i}`;
    this.taken.add(out);
    this.seen.set(key, out);
    return out;
  }
}

const SIZE: Record<WNode['kind'], [number, number]> = { initial: [36, 36], final: [36, 36], send: [36, 36], task: [100, 80], decision: [50, 50], merge: [50, 50], fork: [50, 50], join: [50, 50] };
const [POOL_LABEL, COL, ROW, PAD] = [30, 160, 110, 60];

/** Rank of each node: longest path from the initial nodes, ignoring flows that loop back. */
function ranks(w: Workflow): Map<string, number> {
  const next = new Map(w.nodes.map((n) => [n.id, w.flows.filter((f) => f.from === n.id).map((f) => f.to)]));
  const state = new Map<string, 'open' | 'done'>();
  const order: string[] = [];
  const back = new Set<string>();
  const visit = (n: string) => {
    state.set(n, 'open');
    for (const t of next.get(n) ?? []) {
      if (state.get(t) === 'open') back.add(`${n}>${t}`);
      else if (!state.has(t) && next.has(t)) visit(t);
    }
    state.set(n, 'done');
    order.unshift(n);
  };
  for (const n of [...w.nodes.filter((x) => x.kind === 'initial'), ...w.nodes]) if (!state.has(n.id)) visit(n.id);
  const rank = new Map(w.nodes.map((n) => [n.id, 0]));
  for (const n of order) for (const t of next.get(n) ?? []) if (!back.has(`${n}>${t}`) && rank.has(t)) rank.set(t, Math.max(rank.get(t)!, rank.get(n)! + 1));
  return rank;
}

function pool(w: Workflow, ids: Ids, sig: Map<string, { xml: string; name: string }>, startSignal: string | undefined, top: number) {
  const proc = ids.of('Process', w.id);
  const part = ids.of('Participant', w.id);
  const nid = (n: string) => ids.of('Node', `${w.id}.${n}`);
  const fid = (i: number) => ids.of('Flow', `${w.id}.${i}`);
  const roles = [...new Set(w.nodes.flatMap((n) => (n.role ? [n.role] : [])))];
  const lanes = roles.length ? [...roles, ...(w.nodes.some((n) => !n.role) ? [''] : [])] : [''];
  const laneOf = (n: WNode) => (roles.length ? lanes.indexOf(n.role ?? '') : 0);

  // Place: column by rank, row by lane, stacked within a lane.
  const rank = ranks(w);
  const slots = new Map<string, number>();
  const slot = new Map<string, number>();
  for (const n of w.nodes) {
    const key = `${laneOf(n)}|${rank.get(n.id)}`;
    slot.set(n.id, slots.get(key) ?? 0);
    slots.set(key, (slots.get(key) ?? 0) + 1);
  }
  const rows = lanes.map((_, l) => Math.max(1, ...w.nodes.filter((n) => laneOf(n) === l).map((n) => slot.get(n.id)! + 1)));
  const laneTop = rows.map((_, l) => top + rows.slice(0, l).reduce((a, b) => a + b * ROW, 0));
  const height = rows.reduce((a, b) => a + b * ROW, 0);
  const width = POOL_LABEL + PAD * 2 + Math.max(0, ...w.nodes.map((n) => rank.get(n.id)!)) * COL + 100;
  const centre = (n: WNode) => ({ x: POOL_LABEL + PAD + rank.get(n.id)! * COL, y: laneTop[laneOf(n)]! + ROW / 2 + slot.get(n.id)! * ROW });
  const bounds = (n: WNode) => {
    const [bw, bh] = SIZE[n.kind];
    const c = centre(n);
    return { x: c.x - bw / 2, y: c.y - bh / 2, w: bw, h: bh };
  };

  const byId = new Map(w.nodes.map((n) => [n.id, n]));
  const flows = w.flows.filter((f) => byId.has(f.from) && byId.has(f.to));
  const io = (n: WNode) => [
    ...flows.flatMap((f, i) => (f.to === n.id ? [`      <bpmn:incoming>${fid(i)}</bpmn:incoming>`] : [])),
    ...flows.flatMap((f, i) => (f.from === n.id ? [`      <bpmn:outgoing>${fid(i)}</bpmn:outgoing>`] : [])),
  ];
  const signalDef = (s: string | undefined) => (s && sig.has(s) ? [`      <bpmn:signalEventDefinition signalRef="${sig.get(s)!.xml}"/>`] : []);
  const doc = (n: WNode) => (n.calls?.length ? [`      <bpmn:documentation>Calls: ${esc(n.calls.map((c) => c.operation).join(', '))}</bpmn:documentation>`] : []);
  const element = (n: WNode): string[] => {
    const tag = { initial: 'startEvent', final: 'endEvent', send: 'intermediateThrowEvent', task: n.role && n.role !== 'System' ? 'userTask' : n.calls?.length ? 'serviceTask' : 'task', decision: 'exclusiveGateway', merge: 'exclusiveGateway', fork: 'parallelGateway', join: 'parallelGateway' }[n.kind];
    // Events and gateways named only by their id stay unnamed, as modellers draw them.
    const plain = n.kind !== 'task' && n.kind !== 'send' && n.name === n.id;
    const name = n.name && n.name !== n.kind && !plain ? ` name="${esc(n.name)}"` : '';
    const body = [...doc(n), ...io(n), ...signalDef(n.kind === 'initial' ? startSignal : n.kind === 'send' ? n.signal : undefined)];
    return body.length ? [`    <bpmn:${tag} id="${nid(n.id)}"${name}>`, ...body, `    </bpmn:${tag}>`] : [`    <bpmn:${tag} id="${nid(n.id)}"${name}/>`];
  };
  const sequence = flows.flatMap((f, i) => {
    const head = `    <bpmn:sequenceFlow id="${fid(i)}" sourceRef="${nid(f.from)}" targetRef="${nid(f.to)}"${f.guard ? ` name="${esc(f.guard)}"` : ''}`;
    const branch = f.guard && byId.get(f.from)!.kind === 'decision';
    return branch ? [`${head}>`, `      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${esc(f.guard!)}</bpmn:conditionExpression>`, '    </bpmn:sequenceFlow>'] : [`${head}/>`];
  });
  const laneSet = roles.length
    ? [
        `    <bpmn:laneSet id="${ids.of('LaneSet', w.id)}">`,
        ...lanes.flatMap((r, l) => [
          `      <bpmn:lane id="${ids.of('Lane', `${w.id}.${l}`)}"${r ? ` name="${esc(r)}"` : ''}>`,
          ...w.nodes.filter((n) => laneOf(n) === l).map((n) => `        <bpmn:flowNodeRef>${nid(n.id)}</bpmn:flowNodeRef>`),
          '      </bpmn:lane>',
        ]),
        '    </bpmn:laneSet>',
      ]
    : [];
  const process = [`  <bpmn:process id="${proc}" name="${esc(w.name)}" isExecutable="false">`, ...laneSet, ...w.nodes.flatMap(element), ...sequence, '  </bpmn:process>'].join('\n');

  // Diagram interchange: the pool, its lanes, every node and flow.
  const box = (b: { x: number; y: number; w: number; h: number }) => `<dc:Bounds x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
  const shape = (el: string, b: Parameters<typeof box>[0], extra = '') => `      <bpmndi:BPMNShape id="${el}_di" bpmnElement="${el}"${extra}>${box(b)}</bpmndi:BPMNShape>`;
  const edge = (f: (typeof flows)[number], i: number) => {
    const [a, b] = [bounds(byId.get(f.from)!), bounds(byId.get(f.to)!)];
    const pts =
      b.x > a.x
        ? [
            [a.x + a.w, a.y + a.h / 2],
            [b.x, b.y + b.h / 2],
          ]
        : [
            [a.x + a.w / 2, a.y + a.h],
            [a.x + a.w / 2, top + height - 10],
            [b.x + b.w / 2, top + height - 10],
            [b.x + b.w / 2, b.y + b.h],
          ];
    return `      <bpmndi:BPMNEdge id="${fid(i)}_di" bpmnElement="${fid(i)}">${pts.map(([x, y]) => `<di:waypoint x="${x}" y="${y}"/>`).join('')}</bpmndi:BPMNEdge>`;
  };
  const shapes = [
    shape(part, { x: 0, y: top, w: width, h: height }, ' isHorizontal="true"'),
    ...(roles.length ? lanes.map((_, l) => shape(ids.of('Lane', `${w.id}.${l}`), { x: POOL_LABEL, y: laneTop[l]!, w: width - POOL_LABEL, h: rows[l]! * ROW }, ' isHorizontal="true"')) : []),
    ...w.nodes.map((n) => shape(nid(n.id), bounds(n), n.kind === 'decision' || n.kind === 'merge' ? ' isMarkerVisible="true"' : '')),
    ...flows.map(edge),
  ];
  return { participant: `    <bpmn:participant id="${part}" name="${esc(w.name)}" processRef="${proc}"/>`, process, shapes, height };
}

/** The `bpmn` export of a type, from its mapping onto the process model (URS-PM-018). */
export const bpmnExport = <M,>(toProcess: (m: M) => ProcessModel) => ({
  label: 'BPMN',
  mediaType: 'application/xml',
  extension: 'bpmn',
  run: (m: M, title?: string) => toBpmn(toProcess(m), title),
});
