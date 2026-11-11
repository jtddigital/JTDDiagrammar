/** Schema fragments shared by diagram types. */
export const SUPPORTED_MAJOR = 1;

export const id = { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_.-]*$', description: 'Unique id: a letter or `_`, then letters, digits, `_`, `.` or `-`.' } as const;

/** An id that refers to another element. */
export const ref = (what: string) => ({ ...id, description: what }) as const;

export const direction = { type: 'string', enum: ['LR', 'TB'], default: 'LR', description: 'Flow direction: left to right (default) or top to bottom.' } as const;

/** Hex colours only, so nothing but a colour can reach an SVG attribute. */
export const color = { type: 'string', pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', description: 'Hex colour, `#rgb` or `#rrggbb`.' } as const;

/** Per-element style overrides (URS-DM-010). */
export const style = {
  type: 'object',
  description: 'Colour and dash overrides (see Styling).',
  additionalProperties: false,
  properties: { fill: color, stroke: color, text: color, dash: { type: 'string', enum: ['solid', 'dashed', 'dotted'], description: 'Line style.' } },
} as const;

export const band = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label'],
  properties: { id, label: { type: 'string', description: 'Header text.' }, style },
} as const;

/** Envelope properties every type schema includes (URS-IN-002, URS-EXT-003). */
export const envelope = (type: string) =>
  ({
    $schema: { type: 'string', description: 'Optional schema URL for editor tooling.' },
    version: { type: 'string', pattern: `^${SUPPORTED_MAJOR}(\\.[0-9]+)?$`, description: `Schema version; major ${SUPPORTED_MAJOR} (e.g. "1", "1.2").` },
    type: { type: 'string', const: type, description: 'Diagram type.' },
    title: { type: 'string', description: 'Title shown above the diagram.' },
    theme: { type: 'string', enum: ['default', 'dark'], default: 'default', description: 'Colour theme; element styles override it.' },
  }) as const;
