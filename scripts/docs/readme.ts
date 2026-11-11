import { compile, hasErrors, render, type Registry } from '@jtd/core';

export const BEGIN = '<!-- BEGIN GENERATED: examples (pnpm docs:build) -->';
export const END = '<!-- END GENERATED: examples -->';
export const IMG_DIR = 'docs/img';

const imagePath = (type: string, example: string) => `${IMG_DIR}/${type}-${example}.svg`;

const examples = (reg: Registry) => reg.types().flatMap((t) => t.examples.map((ex) => ({ type: t.id, ex })));

/** Rendered SVG per README image path (URS-DOC-003). */
export const images = (reg: Registry): Map<string, string> =>
  new Map(examples(reg).map(({ type, ex }) => [imagePath(type, ex.name), render(ex.source, reg).svg ?? '']));

/** README section: every example of every registered type, image plus source (URS-DOC-002). */
export const examplesSection = (reg: Registry): string =>
  examples(reg)
    .map(({ type, ex }) => {
      const notes = render(ex.source, reg).diagnostics.filter((d) => d.severity === 'warning');
      return [
        `### ${ex.title}`,
        '',
        `\`type: ${type}\`${ex.description ? ` · ${ex.description}` : ''}`,
        '',
        `![${ex.title}](${imagePath(type, ex.name)})`,
        '',
        ...notes.map((d) => `> **Not yet supported:** ${d.message}.\n`),
        '<details><summary>Source</summary>',
        '',
        '```json',
        JSON.stringify(ex.source, null, 2),
        '```',
        '',
        '</details>',
        '',
      ].join('\n');
    })
    .join('\n');

export function replaceSection(readme: string, body: string): string {
  const start = readme.indexOf(BEGIN);
  const end = readme.indexOf(END);
  if (start < 0 || end < start) throw new Error('README is missing the generated examples markers');
  return `${readme.slice(0, start + BEGIN.length)}\n\n${body}\n${readme.slice(end)}`;
}

/** Every example must compile cleanly (URS-DOC-004, URS-EXT-010). */
export const exampleProblems = (reg: Registry): string[] =>
  examples(reg).flatMap(({ type, ex }) => {
    const { diagnostics } = compile(ex.source, reg);
    return hasErrors(diagnostics) ? diagnostics.map((d) => `${type}/${ex.name}: ${d.path || '/'} ${d.message}`) : [];
  });
