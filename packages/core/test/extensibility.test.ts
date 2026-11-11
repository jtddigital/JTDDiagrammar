import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { combinedSchema, compile, createRegistry } from '../src/index.ts';
import { checklist } from './fixture-type.ts';

const reg = createRegistry().registerType(checklist);

describe('plugin seams (URS-EXT-002, URS-EXT-006)', () => {
  it('compiles a newly registered type with no pipeline changes', () => {
    const { ir, diagnostics } = compile({ version: '1', type: 'checklist', items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, reg);
    expect(diagnostics).toEqual([]);
    expect(ir?.edges).toEqual([{ id: 'edge:0', from: 'a', to: 'b' }]);
  });

  it('combined schema dispatches on type', () => {
    const validate = new Ajv2020({ discriminator: true, strict: true }).compile(combinedSchema(reg));
    for (const t of reg.types()) for (const ex of t.examples) expect(validate(ex.source), `${t.id}/${ex.name}`).toBe(true);
    expect(validate({ version: '1', type: 'gantt' })).toBe(false);
    expect(validate({ version: '1', type: 'checklist', nodes: [] })).toBe(false);
  });
});
