import { describe, expect, it } from 'vitest';
import { asJson, toEditorText } from '../src/files.ts';
import { registry } from '../src/registry.ts';

describe('open and save (URS-WEB-019)', () => {
  it('opens JSON as written and converts YAML and XML to JSON', () => {
    expect(toEditorText('a.json', '{ "x": 1 }', registry)).toEqual({ text: '{ "x": 1 }', converted: false, diagnostics: [] });
    const yaml = toEditorText('a.YML', 'version: "1"\ntype: flowchart\nnodes:\n  - id: a\n', registry);
    expect(JSON.parse(yaml.text!)).toEqual({ version: '1', type: 'flowchart', nodes: [{ id: 'a' }] });
    expect(yaml.converted).toBe(true);
    const xml = toEditorText('a.xml', '<diagram version="1" type="flowchart"><nodes><node id="a"/></nodes></diagram>', registry);
    expect(JSON.parse(xml.text!)).toMatchObject({ type: 'flowchart', nodes: [{ id: 'a' }] });
  });

  it('reports a file that does not parse instead of loading it', () => {
    const r = toEditorText('a.yaml', 'a: [', registry);
    expect(r.text).toBeUndefined();
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('saves as JSON', () => {
    expect(asJson('flow.yaml')).toBe('flow.json');
    expect(asJson('flow.json')).toBe('flow.json');
    expect(asJson('.json')).toBe('diagram.json');
  });
});
