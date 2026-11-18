import { BpmnModdle } from 'bpmn-moddle';
import { describe, expect, it } from 'vitest';
import { compile, createRegistry, exportDiagram, exportFormats } from '../src/index.ts';
import { toBpmn } from '../src/diagrams/process/bpmn.ts';
import { emptyModel } from '../src/diagrams/process/model.ts';

const reg = createRegistry();
const exporting = reg.types().filter((t) => t.exports?.bpmn);

/** What a BPMN modeller does on open: parse against the BPMN 2.0 metamodel, collecting warnings for anything it cannot place. */
async function open(xml: string) {
  const { rootElement, warnings } = await new BpmnModdle().fromXML(xml);
  return { root: rootElement as { rootElements: { $type: string; id: string; name?: string; flowElements?: { $type: string; name?: string }[]; laneSets?: { lanes: { name?: string }[] }[] }[]; diagrams: { plane: { planeElement: unknown[] } }[] }, warnings };
}

describe('BPMN 2.0 export, one way (URS-PM-018)', () => {
  it('is offered by the process-oriented types only', () => {
    expect(exporting.map((t) => t.id)).toEqual(['lifecycle', 'sap', 'process']);
    expect(exportFormats({ type: 'sap' }, reg)).toEqual([{ id: 'bpmn', label: 'BPMN', extension: 'bpmn' }]);
    expect(exportFormats({ type: 'flowchart' }, reg)).toEqual([]);
  });

  it.each(exporting.flatMap((t) => t.examples.map((e) => [`${t.id}/${e.name}`, e.source] as const)))('%s opens without warnings, with every workflow node and flow', async (_name, source) => {
    const out = exportDiagram(source, 'bpmn', reg);
    expect(out.text).toBeDefined();
    const { root, warnings } = await open(out.text!);
    expect(warnings).toEqual([]);
    // Every element the file defines is drawn.
    const elements = root.rootElements.flatMap((r) => [...(r.flowElements ?? [])]);
    expect(root.diagrams[0]!.plane.planeElement.length).toBeGreaterThanOrEqual(elements.length);
  });

  it('maps workflow nodes per ARCHITECTURE §13.8: events, user and service tasks, gateways, signals, lanes', async () => {
    const doc = reg.type('process')!.examples.find((e) => e.name === 'work-order')!.source;
    const { root } = await open(exportDiagram(doc, 'bpmn', reg).text!);
    const proc = root.rootElements.find((r) => r.$type === 'bpmn:Process')!;
    expect(proc.name).toBe('Approval');
    expect(proc.flowElements!.filter((f) => f.$type !== 'bpmn:SequenceFlow').map((f) => f.$type)).toEqual([
      'bpmn:StartEvent',
      'bpmn:ExclusiveGateway',
      'bpmn:UserTask',
      'bpmn:ServiceTask',
      'bpmn:ExclusiveGateway',
      'bpmn:IntermediateThrowEvent',
      'bpmn:EndEvent',
    ]);
    expect(proc.laneSets![0]!.lanes.map((l) => l.name)).toEqual(['Maintenance manager', 'System', undefined]);
    expect(root.rootElements.filter((r) => r.$type === 'bpmn:Signal').map((r) => r.name)).toEqual(['Work order created', 'Work order approved']);
    const xml = exportDiagram(doc, 'bpmn', reg).text!;
    // The signal that starts the workflow is its start event's trigger; guards become conditions.
    expect(xml).toMatch(/<bpmn:startEvent id="Node_approval\.start"[^>]*>[\s\S]*?<bpmn:signalEventDefinition signalRef="Signal_created"\/>/);
    expect(xml).toContain('<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">large</bpmn:conditionExpression>');
    expect(xml).toContain('Edits made in other tools are not read back');
  });

  it('places parallel branches, loops and an empty model so they still open', async () => {
    const sap = reg.type('sap')!.examples.find((e) => e.name === 'document-flow')!.source;
    expect((await open(exportDiagram(sap, 'bpmn', reg).text!)).warnings).toEqual([]);
    expect((await open(toBpmn(emptyModel('process'), 'Nothing'))).warnings).toEqual([]);
    expect(toBpmn(emptyModel('process'), 'A & <B>')).toContain('A &amp; &lt;B&gt;');
  });

  it('exports only valid sources, in formats the type offers', () => {
    const bad = { version: '1', type: 'process', regions: [] };
    expect(exportDiagram(bad, 'bpmn', reg).text).toBeUndefined();
    expect(exportDiagram(bad, 'bpmn', reg).diagnostics).toEqual(compile(bad, reg).diagnostics);
    const flow = reg.type('flowchart')!.examples[0]!.source;
    expect(exportDiagram(flow, 'bpmn', reg).diagnostics.map((d) => d.code)).toContain('export.format');
  });
});
