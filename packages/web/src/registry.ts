import { createRegistry, type Registry } from '@jtd/core';

/** The same registry and renderer the API uses, so exports match the API byte for byte (URS-WEB-003). */
export const registry = createRegistry();

/** Every example of every registered type (URS-WEB-007); no type-specific code (URS-WEB-010). */
export const examplesOf = (reg: Registry) => reg.types().flatMap((t) => t.examples.map((ex) => ({ type: t.title, title: ex.title, source: ex.source })));
export const examples = examplesOf(registry);

export const pretty = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
