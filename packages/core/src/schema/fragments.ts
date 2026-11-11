/** Schema fragments shared by diagram types. */
export const SUPPORTED_MAJOR = 1;

export const id = { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_.-]*$' } as const;

export const direction = { type: 'string', enum: ['LR', 'TB'], default: 'LR' } as const;

/** Hex colours only, so nothing but a colour can reach an SVG attribute. */
export const color = { type: 'string', pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' } as const;

/** Per-element style overrides (URS-DM-010). */
export const style = {
  type: 'object',
  additionalProperties: false,
  properties: { fill: color, stroke: color, text: color, dash: { type: 'string', enum: ['solid', 'dashed', 'dotted'] } },
} as const;

export const band = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label'],
  properties: { id, label: { type: 'string' }, style },
} as const;

/** Envelope properties every type schema includes (URS-IN-002, URS-EXT-003). */
export const envelope = (type: string) =>
  ({
    $schema: { type: 'string' },
    version: { type: 'string', pattern: `^${SUPPORTED_MAJOR}(\\.[0-9]+)?$` },
    type: { type: 'string', const: type },
    title: { type: 'string' },
    theme: { type: 'string', enum: ['default', 'dark'], default: 'default' },
  }) as const;
