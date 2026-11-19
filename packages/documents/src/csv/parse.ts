/**
 * CSV to RFC 4180 (URS-WS-012, D-007): quoted fields, doubled quotes, line breaks inside quotes, CRLF, LF or
 * CR line ends. The separator is given or detected (comma, semicolon or tab). Problems are reported at the
 * line they start on, and parsing goes on: a viewer shows what it can.
 */
export type Separator = ',' | ';' | '\t';
export const SEPARATORS: readonly Separator[] = [',', ';', '\t'];

export interface CsvProblem {
  /** 1-based line the row (or quote) starts on. */
  line: number;
  message: string;
}

export interface Csv {
  rows: string[][];
  /** 1-based line each row starts on. */
  lines: number[];
  separator: Separator;
  problems: CsvProblem[];
}

/** Rows of `text` split by `sep`, honouring quotes. Stops after `limit` rows. */
function split(text: string, sep: string, limit = Infinity): Omit<Csv, 'separator'> {
  const rows: string[][] = [];
  const lines: number[] = [];
  const problems: CsvProblem[] = [];
  let row: string[] = [];
  let field = '';
  let line = 1;
  let rowLine = 1;
  let i = 0;
  const n = text.length;
  const endRow = () => {
    row.push(field);
    field = '';
    rows.push(row);
    lines.push(rowLine);
    row = [];
  };
  while (i < n && rows.length < limit) {
    let c = text[i]!;
    if (c === '"' && field === '') {
      // A quoted field: to the closing quote; "" is a quote.
      const opened = line;
      i++;
      let closed = false;
      while (i < n) {
        c = text[i]!;
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        if (c === '\r' || c === '\n') {
          line++;
          if (c === '\r' && text[i + 1] === '\n') {
            field += '\r\n';
            i += 2;
            continue;
          }
        }
        field += c;
        i++;
      }
      if (!closed) problems.push({ line: opened, message: 'a quoted field is never closed' });
      // Text between the closing quote and the separator is kept, but reported.
      let stray = false;
      while (i < n && text[i] !== sep && text[i] !== '\n' && text[i] !== '\r') {
        field += text[i];
        i++;
        stray = true;
      }
      if (stray) problems.push({ line, message: 'text after a closing quote' });
      continue;
    }
    if (c === sep) {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\r' || c === '\n') {
      endRow();
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line++;
      rowLine = line;
    } else {
      field += c;
      i++;
    }
  }
  // The last row, unless the text ended with a line break.
  if (rows.length < limit && (field !== '' || row.length)) endRow();
  return { rows, lines, problems };
}

/** The separator that splits the first lines into the same number of fields most consistently. */
export function detectSeparator(text: string): Separator {
  let best: Separator = ',';
  let score = -1;
  for (const sep of SEPARATORS) {
    const { rows } = split(text, sep, 20);
    const counts = rows.filter((r) => r.length > 1 || r[0] !== '').map((r) => r.length);
    if (!counts.length || Math.max(...counts) < 2) continue;
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    const [width, times] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!;
    const s = times * 1000 + width;
    if (s > score) [best, score] = [sep, s];
  }
  return best;
}

/** Parse CSV; rows with a different number of fields from the first are reported, not dropped. */
export function parseCsv(text: string, separator?: Separator): Csv {
  const sep = separator ?? detectSeparator(text);
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const { rows, lines, problems } = split(body, sep);
  const width = rows[0]?.length ?? 0;
  rows.forEach((r, k) => {
    if (k && r.length !== width && !(r.length === 1 && r[0] === '')) problems.push({ line: lines[k]!, message: `row has ${r.length} field${r.length === 1 ? '' : 's'}; the header has ${width}` });
  });
  problems.sort((a, b) => a.line - b.line);
  return { rows, lines, separator: sep, problems };
}

/** Whether a cell reads as a number (sign, thousands separators, decimals, exponent, percent). */
export const numeric = (s: string) => /^\s*[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?%?\s*$/.test(s) && /\d/.test(s);
