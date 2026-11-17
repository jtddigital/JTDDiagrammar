import { num as n } from '../num.ts';
import { circlePort, type Shape, type Side } from './shape.ts';

/** Matrix marks (URS-TYP-020): small fixed symbols for a cell, drawn in the node's stroke colour. */
const D = 16;
const c = D / 2;
const ring = (w: number) => `M0 ${n(w / 2)}A${n(w / 2)} ${n(w / 2)} 0 1 1 ${n(w)} ${n(w / 2)}A${n(w / 2)} ${n(w / 2)} 0 1 1 0 ${n(w / 2)}Z`;
const round = (side: Side, w: number, _h: number, t: number) => circlePort(w / 2, w / 2, w / 2, side, t);
const mark = (id: string, detail: string, extra: Partial<Shape> = {}): Shape => ({ id, unlabelled: true, size: () => ({ w: D, h: D }), outline: ring, detail: () => detail, port: round, ...extra });

/** Allowed: a tick in a circle. */
export const allowed = mark('allowed', `M${c - 4} ${c}L${c - 1} ${c + 3}L${c + 4} ${c - 3}`);
/** Forbidden: a circle struck through. */
export const forbidden = mark('forbidden', `M${n(c - 5.2)} ${n(c + 5.2)}L${n(c + 5.2)} ${n(c - 5.2)}`);
/** Sets the status: a plus in a circle. */
export const setStatus = mark('setStatus', `M${c - 4} ${c}H${c + 4}M${c} ${c - 4}V${c + 4}`);
/** Deletes the status: a minus in a circle. */
export const deleteStatus = mark('deleteStatus', `M${c - 4} ${c}H${c + 4}`);
/** Allowed with a warning: an exclamation mark in a triangle. */
const triangle = (w: number, h: number) => `M${n(w / 2)} 0L${n(w)} ${n(h)}H0Z`;
export const warning = mark('warning', `M${c} ${c - 2.5}V${c + 2}`, {
  outline: triangle,
  solid: () => `M${c - 1} ${c + 4}H${c + 1}V${c + 6}H${c - 1}Z`,
  port: (side, w, h) => (side === 'N' ? { x: w / 2, y: 0 } : side === 'S' ? { x: w / 2, y: h } : { x: side === 'W' ? w / 4 : (3 * w) / 4, y: h / 2 }),
});

export const MARKS = [allowed, warning, forbidden, setStatus, deleteStatus];
