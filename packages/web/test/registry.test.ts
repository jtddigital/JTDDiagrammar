import { readdirSync, readFileSync } from 'node:fs';
import { createRegistry } from '@jtd/core';
import { describe, expect, it } from 'vitest';
import { checklist } from '../../core/test/fixture-type.ts';
import { examplesOf } from '../src/registry.ts';

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));

describe('web app is type-agnostic (URS-EXT-002, URS-WEB-010)', () => {
  it('offers the examples of whatever types are registered', () => {
    const ex = examplesOf(createRegistry().registerType(checklist));
    expect(ex.map((e) => e.type)).toContain('Checklist');
  });

  it('never names a diagram type in its source', () => {
    const src = new URL('../src', import.meta.url).pathname;
    const ids = createRegistry().types().map((t) => t.id);
    for (const f of files(src)) for (const id of ids) expect(readFileSync(f, 'utf8'), `${f} mentions '${id}'`).not.toMatch(new RegExp(`['"\`]${id}['"\`]`));
  });
});

describe('web registry module (URS-EXT-008)', () => {
  it('defaults to the built-ins and follows REGISTRY_MODULE like the API', async () => {
    const { registryModule } = await import('../registry-alias.ts');
    expect(registryModule({})).toBe('@jtd/core');
    expect(registryModule({ REGISTRY_MODULE: '@acme/diagrams' })).toBe('@acme/diagrams');
    expect(registryModule({ REGISTRY_MODULE: './types.ts' }, '/srv/app')).toBe('/srv/app/types.ts');
  });
});
