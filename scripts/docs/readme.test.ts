import { createRegistry } from '@jtd/core';
import { describe, expect, it } from 'vitest';
import { checklist } from '../../packages/core/test/fixture-type.ts';
import { BEGIN, END, examplesSection, exampleProblems, images, replaceSection } from './readme.ts';

describe('README generation (URS-DOC-002, URS-DOC-004)', () => {
  it('includes every example of every registered type', () => {
    const reg = createRegistry().registerType(checklist);
    const section = examplesSection(reg);
    for (const t of reg.types()) for (const ex of t.examples) expect(section).toContain(`### ${ex.title}`);
    expect(section).toContain('`type: checklist`');
  });

  it('replaces only the marked section and is idempotent', () => {
    const readme = `intro\n${BEGIN}\nold\n${END}\noutro`;
    const once = replaceSection(readme, 'new');
    expect(once).toBe(`intro\n${BEGIN}\n\nnew\n${END}\noutro`);
    expect(replaceSection(once, 'new')).toBe(once);
    expect(() => replaceSection('no markers', 'x')).toThrow(/markers/);
  });

  it('reports examples that do not compile', () => {
    const broken = { ...checklist, examples: [{ name: 'bad', title: 'Bad', source: { version: '1', type: 'checklist' } }] as const };
    expect(exampleProblems(createRegistry().registerType(broken))).toEqual(["checklist/bad: / must have required property 'items'"]);
  });
});

describe('README images (URS-DOC-002, URS-DOC-003)', () => {
  it('renders one SVG per example and links it from the section', () => {
    const reg = createRegistry().registerType(checklist);
    const imgs = images(reg);
    const section = examplesSection(reg);
    expect(imgs.size).toBe(reg.types().reduce((n, t) => n + t.examples.length, 0));
    for (const [path, svg] of imgs) {
      expect(svg).toMatch(/^<svg /);
      expect(section).toContain(`](${path})`);
    }
  });

  it('surfaces layout warnings next to the image', () => {
    // Containers inside lanes are the one combination the engine does not lay out yet.
    const grouped = {
      ...checklist,
      toIR: (m: unknown) => {
        const ir = checklist.toIR(m as never);
        return { ...ir, nodes: ir.nodes.map((n) => ({ ...n, lane: 'l' })), partitions: { lanes: [{ id: 'l', label: 'L' }] }, containers: [{ id: 'group' }] };
      },
    };
    expect(examplesSection(createRegistry().registerType(grouped))).toContain('> **Not yet supported:** containers cannot be combined with lanes or phases yet; they are not drawn.');
  });
});

describe('language reference (URS-DOC-006)', () => {
  it('documents every schema field of every registered type, nested ones included', async () => {
    const { referenceSection } = await import('./reference.ts');
    const reg = createRegistry().registerType(checklist);
    const ref = referenceSection(reg);
    for (const t of reg.types()) expect(ref).toContain(`### \`${t.id}\``);
    for (const f of ['`nodes[].shape`', '`nodes[].style`', '`nodes[].to[].node`', '`edgeStyle`', '`states[].kind`', '`states[].to[].guard`', '`transitionStyle`', '`items[].label`', '`theme`']) expect(ref).toContain(f);
    expect(ref).toContain('Same fields as `states[]`');
  });
});
