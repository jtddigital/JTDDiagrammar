/** Schema fragments shared by diagram types. */
export const SUPPORTED_MAJOR = 1;

export const id = { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_.-]*$', description: 'Unique id: a letter or `_`, then letters, digits, `_`, `.` or `-`.' } as const;

/** An id that refers to another element. */
export const ref = (what: string) => ({ ...id, description: what }) as const;

export const direction = { type: 'string', enum: ['LR', 'TB'], default: 'LR', description: 'Flow direction: left to right (default) or top to bottom.' } as const;

/** Hex colours only, so nothing but a colour can reach an SVG attribute. */
export const color = { type: 'string', pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', description: 'Hex colour, `#rgb` or `#rrggbb`.' } as const;

/** Per-element style overrides (URS-DM-010, URS-DM-014, URS-DM-016, URS-DM-017). */
export const style = {
  type: 'object',
  title: 'Style',
  description: 'Colours, lines, text and node sizing (see Styling).',
  additionalProperties: false,
  properties: {
    fill: color,
    stroke: color,
    text: color,
    dash: { type: 'string', enum: ['solid', 'dashed', 'dotted'], description: 'Line style.' },
    lineWidth: { type: 'number', minimum: 0.5, maximum: 8, description: 'Line thickness in pixels, 0.5 to 8.' },
    fontSize: { type: 'number', minimum: 8, maximum: 32, description: 'Text size in pixels, 8 to 32.' },
    bold: { type: 'boolean', description: 'Bold text.' },
    italic: { type: 'boolean', description: 'Italic text.' },
    opacity: { type: 'number', minimum: 0.1, maximum: 1, description: 'Whole-element opacity, 0.1 to 1.' },
    arrowhead: { type: 'string', enum: ['triangle', 'open', 'diamond', 'circle', 'none'], description: 'Edges: arrowhead shape (default `triangle`).' },
    labelFill: { ...color, description: 'Background of edge labels and callouts.' },
    label: { type: 'string', enum: ['inside', 'callout', 'auto'], description: 'Nodes: `inside` (default; the node grows to fit), `callout` (fixed-size node, label in a callout beside it) or `auto` (callout only when the label does not fit).' },
    width: { type: 'number', minimum: 16, maximum: 600, description: 'Nodes: fixed width in pixels.' },
    height: { type: 'number', minimum: 16, maximum: 400, description: 'Nodes: fixed height in pixels.' },
  },
} as const;

/** Diagram-level default style for each named section; an item's own `style` overrides it field by field (URS-DM-015). */
export const sectionStyles = (sections: readonly string[]) =>
  ({
    type: 'object',
    additionalProperties: false,
    description: `Default style per section (${sections.map((k) => `\`${k}\``).join(', ')}); each item’s own \`style\` overrides it field by field.`,
    properties: Object.fromEntries(sections.map((s) => [s, { ...style, description: `Default style for every item in \`${s}\`.` }])),
  }) as const;

/**
 * Style rules by attribute value (URS-DM-023). A key with a list of values (e.g. shapes) only takes
 * those; a key without one (e.g. owner) takes any value.
 */
export const styleBy = (keys: Readonly<Record<string, readonly string[] | undefined>>, description: string) =>
  ({
    type: 'object',
    additionalProperties: false,
    description,
    properties: Object.fromEntries(
      Object.entries(keys).map(([k, values]) => [
        k,
        values
          ? { type: 'object', additionalProperties: false, properties: Object.fromEntries(values.map((v) => [v, style])), description: `Style for every item with this \`${k}\`, by value: ${values.map((v) => `\`${v}\``).join(', ')}.` }
          : { type: 'object', additionalProperties: style, description: `Style for every item with this \`${k}\`, by value.` },
      ]),
    ),
  }) as const;

/** Extra edge labels, each pinned along the edge or placed automatically (URS-DM-024). */
export const edgeLabels = {
  type: 'array',
  description: 'Labels on the connection, after `label`. Each sits `at` percent of the way along it, or wherever fits best when `at` is absent.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: {
      text: { type: 'string', description: 'Label text; `\\n` breaks lines.' },
      at: { type: 'number', minimum: 0, maximum: 100, description: 'Position along the connection in percent of its length: 0 at the start, 50 in the middle, 100 at the end.' },
    },
  },
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
