/** For providers or requests without structured outputs: the schema goes into the instructions (URS-AI-004). */
export const schemaInstruction = (schema: unknown) =>
  `Reply with one JSON object and nothing else: no prose, no code fences. It must match this JSON Schema exactly:\n${JSON.stringify(schema)}`;

/** The JSON object in a reply that may wrap it in prose or a code fence. */
export const jsonOf = (text: string) => {
  const [a, b] = [text.indexOf('{'), text.lastIndexOf('}')];
  return a >= 0 && b > a ? text.slice(a, b + 1) : text;
};
