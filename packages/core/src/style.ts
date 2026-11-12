import type { Style } from './ir/types.ts';
import type { Font } from './measure/text.ts';

/** An element's font: its section's base font with the style's size, weight and slant (URS-DM-016). Layout and render both use this. */
export const fontOf = (base: Font, s: Style | undefined): Font => ({
  size: s?.fontSize ?? base.size,
  ...((s?.bold ?? base.bold) && { bold: true }),
  ...(s?.italic && { italic: true }),
});

/** Typography shared by layout (measuring) and render (drawing); they must agree. */
export const NODE_FONT: Font = { size: 14 };
export const LABEL_FONT: Font = { size: 12 };
export const TITLE_FONT: Font = { size: 18, bold: true };
export const NODE_TEXT_MAX = 180;
/** Text box a standard-size node is sized for: two lines this wide (URS-DM-017). */
export const STANDARD_TEXT_W = 96;
export const CALLOUT_TEXT_MAX = 160;
export const CALLOUT_PAD = { x: 8, y: 5 };
/** Gap between a node and its callout. */
export const CALLOUT_GAP = 16;
export const LABEL_TEXT_MAX = 140;
export const BAND_FONT: Font = { size: 13, bold: true };
export const BAND_TEXT_MAX = 140;
/** Group headers span several bands, so their labels may run wider (URS-DM-019). */
export const GROUP_TEXT_MAX = 480;
/** Header detail text, e.g. entry criteria (URS-DM-020). */
export const DETAIL_FONT: Font = { size: 11 };
export const DETAIL_GAP = 4;
export const CONTAINER_FONT: Font = { size: 13, bold: true };
export const CONTAINER_TEXT_MAX = 220;
/** Space above and below a container's label. */
export const CONTAINER_HEAD_PAD = 6;
