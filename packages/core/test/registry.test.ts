import { describe, expect, it } from 'vitest';
import { createRegistry, Registry } from '../src/index.ts';
import { checklist } from './fixture-type.ts';

describe('Registry (URS-EXT-001, URS-EXT-005)', () => {
  it('lists built-in types', () => {
    expect(createRegistry().types().map((t) => t.id)).toEqual(['flowchart']);
    expect(createRegistry().engine('layered')).toBeDefined();
  });

  it('rejects duplicate types and schemas without $id', () => {
    const reg = new Registry().registerType(checklist);
    expect(() => reg.registerType(checklist)).toThrow(/already registered/);
    expect(() => new Registry().registerType({ ...checklist, schema: {} })).toThrow(/\$id/);
  });

  it('registers and resolves layout engines', () => {
    const engine = { id: 'fake', layout: () => ({ geometry: { width: 0, height: 0, bands: [], nodes: [], edges: [] }, diagnostics: [] }) };
    const reg = new Registry().registerEngine(engine);
    expect(reg.engine('fake')).toBe(engine);
    expect(reg.engine('none')).toBeUndefined();
    expect(() => reg.registerEngine(engine)).toThrow(/already registered/);
  });
});
