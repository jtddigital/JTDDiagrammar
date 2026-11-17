import type { PlacedNotes } from '../../geometry.ts';
import { NOTE_TEXT_X, NOTES_TITLE } from '../../layout/notes.ts';
import { baseline, lineHeight } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { NOTE_FONT, NOTE_R } from '../../style.ts';
import { esc } from './escape.ts';
import type { Palette } from './theme.ts';

/** Left-aligned lines from (x, top). */
const left = (ls: readonly string[], x: number, top: number, attrs = '') =>
  ls.map((l, i) => `<text x="${num(x)}" y="${num(top + i * lineHeight(NOTE_FONT) + baseline(NOTE_FONT))}"${attrs}>${esc(l)}</text>`).join('');

/** A numbered balloon centred on (cx, cy), as on an engineering drawing, the note as its tooltip (URS-DM-029). */
export function balloon(cx: number, cy: number, n: number, line: string, P: Palette, note?: string): string {
  const t = String(n);
  return (
    `<g class="jtd-note-marker">${note ? `<title>${esc(note)}</title>` : ''}<path d="M${num(cx - NOTE_R)} ${num(cy)}a${NOTE_R} ${NOTE_R} 0 1 1 ${2 * NOTE_R} 0a${NOTE_R} ${NOTE_R} 0 1 1 ${-2 * NOTE_R} 0Z" fill="${P.labelFill}" stroke="${line}" stroke-width="1"/>` +
    `<text x="${num(cx)}" y="${num(cy - lineHeight(NOTE_FONT) / 2 + baseline(NOTE_FONT))}" text-anchor="middle" font-size="${t.length > 1 ? 9 : NOTE_FONT.size}">${t}</text></g>`
  );
}

/** The notes box beside the diagram: each balloon, then its text (URS-DM-029). */
export function notes(b: PlacedNotes | undefined, P: Palette): string {
  if (!b) return '';
  const font = ` font-size="${NOTE_FONT.size}"`;
  // What it is attached to, in bold, then the note.
  const items = b.items.map((it) => {
    const top = it.y + Math.max(0, NOTE_R - lineHeight(NOTE_FONT) / 2);
    const on = it.on ?? [];
    return (
      balloon(it.x + NOTE_R, it.y + NOTE_R, it.n, P.nodeStroke, P, on.length ? `${on.join(' ')}: ${it.text}` : it.text) +
      left(on, it.x + NOTE_TEXT_X, top, `${font} font-weight="bold"`) +
      left(it.lines, it.x + NOTE_TEXT_X, top + on.length * lineHeight({ ...NOTE_FONT, bold: true }), font)
    );
  });
  return (
    `<g class="jtd-notes"><rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" fill="${P.background}" stroke="${P.bandStroke}" stroke-width="1"/>` +
    left([NOTES_TITLE], b.x + 10, b.y + 10, `${font} font-weight="bold"`) +
    items.join('') +
    '</g>'
  );
}
