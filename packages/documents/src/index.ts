/** Document engines built in the repo (D-007): pure, no DOM, no Node built-ins, no dependencies. */
export { utf8 } from './utf8.ts';
export { crc32, zip, type Deflate, type ZipEntry } from './zip/write.ts';
export { detectSeparator, numeric, parseCsv, SEPARATORS, type Csv, type CsvProblem, type Separator } from './csv/parse.ts';
export { MdNode, parseMarkdown, plainText, renderHtml, type Align, type MarkdownOptions, type NodeType } from './markdown/index.ts';
export { highlight, language, type Token, type TokenKind } from './markdown/extras/highlight.ts';
export { slugger } from './markdown/extras/slug.ts';
export { mathmlString, texToMathml, type MathEl } from './markdown/extras/tex.ts';
export { diff, type Op, type OpType } from './diff/myers.ts';
export { changeStarts, diffLines, fold, rows, splitLines, type LineDiff, type Row, type Segment } from './diff/lines.ts';
export { diffWords, tokens, type Part } from './diff/words.ts';
export { blocks, diffBlocks, fingerprint, type BlockDiff, type Mark } from './diff/blocks.ts';
export { diffTable, type TableDiff, type TableRow } from './diff/table.ts';
export { cellNumber, column, sheetName, xlsx } from './xlsx/write.ts';
export { svgPath, type PathInfo } from './pdf/path.ts';
export { A4, FONTS, MM, pdf, PdfPage, winAnsi, type FontName, type Paint, type Rgb } from './pdf/write.ts';
export { typeset, type Block, type FlowOptions, type Measure, type Run } from './pdf/flow.ts';
