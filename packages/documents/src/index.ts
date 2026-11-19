/** Document engines built in the repo (D-007): pure, no DOM, no Node built-ins, no dependencies. */
export { utf8 } from './utf8.ts';
export { crc32, zip, type Deflate, type ZipEntry } from './zip/write.ts';
export { detectSeparator, numeric, parseCsv, SEPARATORS, type Csv, type CsvProblem, type Separator } from './csv/parse.ts';
