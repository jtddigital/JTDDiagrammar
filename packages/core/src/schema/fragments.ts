/** Schema fragments shared by diagram types. */
export const SUPPORTED_MAJOR = 1;

export const id = { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_.-]*$' } as const;

export const direction = { type: 'string', enum: ['LR', 'TB'], default: 'LR' } as const;

export const band = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label'],
  properties: { id, label: { type: 'string' } },
} as const;

/** Envelope properties every type schema includes (URS-IN-002, URS-EXT-003). */
export const envelope = (type: string) =>
  ({
    $schema: { type: 'string' },
    version: { type: 'string', pattern: `^${SUPPORTED_MAJOR}(\\.[0-9]+)?$` },
    type: { type: 'string', const: type },
    title: { type: 'string' },
  }) as const;
