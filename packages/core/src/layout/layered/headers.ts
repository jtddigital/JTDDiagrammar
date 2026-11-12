import type { Band, BandGroup } from '../../ir/types.ts';
import { textBlock } from '../../measure/text.ts';
import { BAND_FONT, BAND_TEXT_MAX, DETAIL_FONT, DETAIL_GAP, fontOf, GROUP_TEXT_MAX } from '../../style.ts';

/** A band header's label, optional detail text below it (URS-DM-020), and their combined size. */
export interface HeaderBlock {
  lines: string[];
  detail?: string[];
  width: number;
  height: number;
}

export function headerBlock(b: Band | BandGroup): HeaderBlock {
  const label = textBlock(b.label, 'members' in b ? GROUP_TEXT_MAX : BAND_TEXT_MAX, fontOf(BAND_FONT, b.style));
  const detail = 'detail' in b && b.detail ? textBlock(b.detail, BAND_TEXT_MAX, DETAIL_FONT) : undefined;
  if (!detail) return label;
  return { lines: label.lines, detail: detail.lines, width: Math.max(label.width, detail.width), height: label.height + DETAIL_GAP + detail.height };
}

/**
 * Raise member minimum sizes so each group's label fits across its members (URS-DM-019).
 * `need` is the group label's length across the members; the shortfall is shared equally.
 */
export function fitGroups(mins: number[], ids: readonly string[], groups: readonly BandGroup[] | undefined, need: (g: BandGroup) => number): number[] {
  const out = [...mins];
  for (const g of groups ?? []) {
    const idx = g.members.map((m) => ids.indexOf(m)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const short = need(g) - idx.reduce((s, i) => s + out[i]!, 0);
    if (short > 0) for (const i of idx) out[i]! += short / idx.length;
  }
  return out;
}
