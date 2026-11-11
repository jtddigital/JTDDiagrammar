declare module 'opentype.js' {
  interface Glyph { advanceWidth?: number }
  interface Font { unitsPerEm: number; ascender: number; descender: number; charToGlyph(c: string): Glyph }
  const opentype: { parse(buffer: ArrayBuffer): Font };
  export default opentype;
}
