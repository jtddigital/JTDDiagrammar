/**
 * A table as an Excel workbook (.xlsx, Office Open XML SpreadsheetML), built in the repo (D-007, URS-WS-045):
 * one sheet, the first row bold and frozen, numbers stored as numbers (thousands separators and percentages
 * kept as formats), everything else as text. Column widths follow the content.
 */
import { zip, type Deflate } from '../zip/write.ts';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // XML 1.0 has no place for most control characters.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** Column letters: 0 → A, 25 → Z, 26 → AA. */
export const column = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : column(Math.floor(i / 26) - 1) + column(i % 26));

/** Style indexes in styles.xml. */
const S = { Text: 0, Header: 1, Thousands: 2, ThousandsDecimal: 3, Percent: 4, PercentDecimal: 5 } as const;
type Style = (typeof S)[keyof typeof S];

/**
 * A cell's number and style when the text is a number Excel should calculate with; undefined for text.
 * Leading zeros (codes such as 007) and more than 15 digits (Excel's precision) stay text.
 */
export function cellNumber(text: string): { value: number; style: Style } | undefined {
  const t = text.trim();
  const m = /^([-+]?)(\d{1,3}(?:,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?(%?)$/.exec(t);
  if (!m || !/\d/.test(t) || (m[2] === undefined && m[3] === undefined)) return undefined;
  const digits = (m[2] ?? '').replace(/,/g, '');
  if (/^0\d/.test(digits) || (digits + (m[3] ?? '')).replace(/\D/g, '').length > 15) return undefined;
  const value = Number(`${m[1]}${digits || '0'}${m[3] ?? ''}${m[4] ?? ''}`) / (m[5] ? 100 : 1);
  if (!Number.isFinite(value)) return undefined;
  const decimal = m[3] !== undefined;
  const style: Style = m[5] ? (decimal ? S.PercentDecimal : S.Percent) : m[2]?.includes(',') ? (decimal ? S.ThousandsDecimal : S.Thousands) : S.Text;
  return { value, style };
}

const STYLES = `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** A sheet name Excel accepts: at most 31 characters, none of : \ / ? * [ ]. */
export const sheetName = (name: string) => name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet1';

/** The workbook's bytes. `rows[0]` is the header. */
export async function xlsx(rows: readonly (readonly string[])[], name = 'Sheet1', deflate?: Deflate): Promise<Uint8Array> {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const chars = Array.from({ length: width }, (_, c) => Math.max(...rows.slice(0, 1000).map((r) => (r[c] ?? '').length)));
  const cols = chars.map((n, c) => `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, Math.max(8, n + 2))}" customWidth="1"/>`).join('');
  const body = rows
    .map((r, y) => {
      const cells = r
        .map((text, x) => {
          if (text === '') return '';
          const ref = `${column(x)}${y + 1}`;
          const n = y > 0 ? cellNumber(text) : undefined;
          if (n) return `<c r="${ref}"${n.style ? ` s="${n.style}"` : ''}><v>${n.value}</v></c>`;
          const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
          return `<c r="${ref}" t="inlineStr"${y === 0 ? ` s="${S.Header}"` : ''}><is><t${space}>${esc(text)}</t></is></c>`;
        })
        .join('');
      return `<row r="${y + 1}">${cells}</row>`;
    })
    .join('');
  const freeze = rows.length > 1 ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
  const sheet = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    [
      'xl/workbook.xml',
      `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName(name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  return zip(
    files.map(([path, text]) => ({ path, text })),
    deflate,
  );
}
