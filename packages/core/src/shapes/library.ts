import { num as n } from '../num.ts';
import { boxPort, boxSize, circlePort, midPort, PAD_X, PAD_Y, type Shape } from './shape.ts';

const rect = (w: number, h: number) => `M0 0H${n(w)}V${n(h)}H0Z`;

const process: Shape = { id: 'process', size: boxSize(), outline: rect, port: boxPort() };

const terminator: Shape = {
  id: 'terminator',
  size: (tw, th) => {
    const { h } = boxSize()(tw, th);
    return { w: Math.max(h * 2, tw + h), h };
  },
  outline: (w, h) => {
    const r = h / 2;
    return `M${n(r)} 0H${n(w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w - r)} ${n(h)}H${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0Z`;
  },
  // Rounded ends: spread along the arc.
  port: (side, w, h, t) =>
    side === 'N' || side === 'S' ? boxPort()(side, w, h, t) : circlePort(side === 'W' ? h / 2 : w - h / 2, h / 2, h / 2, side, t),
};

const decision: Shape = {
  id: 'decision',
  tips: true,
  // The text box (tw × th) fits inside the diamond when tw/w + th/h ≤ 1.
  size: (tw, th) => {
    const h = Math.max(56, 2 * (th + PAD_Y));
    return { w: Math.max(112, (tw + PAD_X) / (1 - (th + PAD_Y) / h)), h };
  },
  outline: (w, h) => `M${n(w / 2)} 0L${n(w)} ${n(h / 2)}L${n(w / 2)} ${n(h)}L0 ${n(h / 2)}Z`,
  // Branches use separate vertices: t < 0 → the lower-coordinate side vertex, t > 0 → the higher one.
  port: (side, w, h, t) => {
    if (Math.abs(t) < 0.5) return midPort(side, w, h);
    const horizontal = side === 'N' || side === 'S';
    return midPort(horizontal ? (t < 0 ? 'W' : 'E') : t < 0 ? 'N' : 'S', w, h);
  },
};

const wave = (h: number) => Math.max(4, h * 0.08);
const document: Shape = {
  id: 'document',
  size: (tw, th) => {
    const s = boxSize()(tw, th);
    return { w: s.w, h: s.h + wave(s.h) };
  },
  // Bottom edge is a symmetric S-curve whose midpoint is (w/2, h - a).
  outline: (w, h) => {
    const a = wave(h);
    return `M0 0H${n(w)}V${n(h - a)}C${n(w / 2)} ${n(h - 3 * a)} ${n(w / 2)} ${n(h + a)} 0 ${n(h - a)}Z`;
  },
  labelDy: (_w, h) => -wave(h) / 2,
  port: boxPort((side, _w, h) => (side === 'S' ? wave(h) : 0)),
};

const skew = (h: number) => h * 0.25;
const data: Shape = {
  id: 'data',
  size: (tw, th) => {
    const { h } = boxSize()(tw, th);
    return { w: Math.max(96, tw + 2 * PAD_X + 2 * skew(h)), h };
  },
  outline: (w, h) => `M${n(skew(h))} 0H${n(w)}L${n(w - skew(h))} ${n(h)}H0Z`,
  port: (side, w, h, t) =>
    side === 'N' || side === 'S'
      ? { x: w / 2 + t * (w - 2 * skew(h)) * 0.3, y: side === 'N' ? 0 : h }
      : { x: side === 'W' ? skew(h) / 2 : w - skew(h) / 2, y: h / 2 },
};

const BAR = 10;
const subprocess: Shape = {
  id: 'subprocess',
  size: boxSize(2 * BAR),
  outline: rect,
  detail: (w, h) => `M${BAR} 0V${n(h)}M${n(w - BAR)} 0V${n(h)}`,
  port: boxPort(),
};

const connector: Shape = {
  id: 'connector',
  size: (tw, th) => {
    const d = Math.max(32, Math.hypot(tw, th) + PAD_Y);
    return { w: d, h: d };
  },
  outline: (w) => {
    const r = n(w / 2);
    return `M0 ${r}A${r} ${r} 0 1 1 ${n(w)} ${r}A${r} ${r} 0 1 1 0 ${r}Z`;
  },
  port: (side, w, _h, t) => circlePort(w / 2, w / 2, w / 2, side, t),
};

const circle = (cx: number, cy: number, r: number) =>
  `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 1 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 1 ${n(cx - r)} ${n(cy)}Z`;
const fixed = (d: number) => () => ({ w: d, h: d });

/** State: rounded rectangle. */
const state: Shape = {
  id: 'state',
  size: (tw, th) => ({ w: Math.max(80, tw + 2 * PAD_X), h: Math.max(36, th + 2 * PAD_Y) }),
  outline: (w, h) => {
    const r = Math.min(10, h / 2);
    return `M${r} 0H${n(w - r)}A${r} ${r} 0 0 1 ${n(w)} ${r}V${n(h - r)}A${r} ${r} 0 0 1 ${n(w - r)} ${n(h)}H${r}A${r} ${r} 0 0 1 0 ${n(h - r)}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
  },
  port: boxPort(),
};

/** Initial pseudostate: filled dot. */
const round = (side: Parameters<Shape['port']>[0], w: number, _h: number, t: number) => circlePort(w / 2, w / 2, w / 2, side, t);
const initial: Shape = { id: 'initial', unlabelled: true, size: fixed(18), outline: (w) => circle(w / 2, w / 2, w / 2), solid: (w) => circle(w / 2, w / 2, w / 2), port: round };

/** Final state: ring around a dot. */
const final: Shape = { id: 'final', unlabelled: true, size: fixed(22), outline: (w) => circle(w / 2, w / 2, w / 2), solid: (w) => circle(w / 2, w / 2, w / 2 - 4), port: round };

/** Choice pseudostate: small diamond. */
const choice: Shape = { ...decision, id: 'choice', unlabelled: true, size: fixed(26) };

const FOLD = 10;
/** Note: rectangle with a folded corner (URS-DM-012). */
const note: Shape = {
  id: 'note',
  paint: 'noteFill',
  size: boxSize(FOLD),
  outline: (w, h) => `M0 0H${n(w - FOLD)}L${n(w)} ${FOLD}V${n(h)}H0Z`,
  detail: (w) => `M${n(w - FOLD)} 0V${FOLD}H${n(w)}`,
  port: boxPort(),
};

/** Card: rounded rectangle for people and entities. */
const card: Shape = { ...state, id: 'card' };

/** Shared shape library (URS-DM-004). */
export const SHAPES: ReadonlyMap<string, Shape> = new Map(
  [process, terminator, decision, document, data, subprocess, connector, state, initial, final, choice, note, card].map((s) => [s.id, s]),
);

export const shape = (id: string): Shape => SHAPES.get(id) ?? process;
