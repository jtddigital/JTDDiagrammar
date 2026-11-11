import type { Font } from './measure/text.ts';

/** Typography shared by layout (measuring) and render (drawing); they must agree. */
export const NODE_FONT: Font = { size: 14 };
export const LABEL_FONT: Font = { size: 12 };
export const TITLE_FONT: Font = { size: 18, bold: true };
export const NODE_TEXT_MAX = 180;
export const LABEL_TEXT_MAX = 140;
export const BAND_FONT: Font = { size: 13, bold: true };
export const BAND_TEXT_MAX = 140;
export const CONTAINER_FONT: Font = { size: 13, bold: true };
export const CONTAINER_TEXT_MAX = 220;
/** Space above and below a container's label. */
export const CONTAINER_HEAD_PAD = 6;
