import { compile, hasErrors, type Registry } from '@jtd/core';

export const BEGIN = '<!-- BEGIN GENERATED: examples (pnpm docs:build) -->';
export const END = '<!-- END GENERATED: examples -->';

/** README section with every example of every registered type (URS-DOC-002). Images are added in P1 (URS-DOC-003). */
export const examplesSection = (reg: Registry): string =>
  reg
    .types()
    .flatMap((t) =>
      t.examples.map((ex) =>
        [`### ${ex.title}`, '', `\`type: ${t.id}\`${ex.description ? ` · ${ex.description}` : ''}`, '', '```json', JSON.stringify(ex.source, null, 2), '```', ''].join('\n'),
      ),
    )
    .join('\n');

export function replaceSection(readme: string, body: string): string {
  const start = readme.indexOf(BEGIN);
  const end = readme.indexOf(END);
  if (start < 0 || end < start) throw new Error('README is missing the generated examples markers');
  return `${readme.slice(0, start + BEGIN.length)}\n\n${body}\n${readme.slice(end)}`;
}

/** Every example must compile cleanly (URS-DOC-004, URS-EXT-010). */
export const exampleProblems = (reg: Registry): string[] =>
  reg.types().flatMap((t) =>
    t.examples.flatMap((ex) => {
      const { diagnostics } = compile(ex.source, reg);
      return hasErrors(diagnostics) ? diagnostics.map((d) => `${t.id}/${ex.name}: ${d.path || '/'} ${d.message}`) : [];
    }),
  );
