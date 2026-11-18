/** The part of bpmn-moddle the BPMN export test uses; the package ships no types for its main entry. */
declare module 'bpmn-moddle' {
  export class BpmnModdle {
    fromXML(xml: string): Promise<{ rootElement: unknown; warnings: unknown[] }>;
  }
}
