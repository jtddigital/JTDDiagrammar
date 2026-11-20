import { PdfPage, svgPath, type Paint, type Rgb } from '@jtd/documents';
import { textWidth } from '@jtd/core';

/**
 * The app's SVG drawn on a PDF page as vectors (URS-WS-046): groups with transforms and opacity, paths,
 * rectangles, circles, ellipses, lines, polygons, text and arrowhead markers, with SVG's inherited
 * presentation attributes. Text is set in Helvetica, metric-compatible with the fonts the SVG was measured in.
 */
const NAMED: Record<string, Rgb> = { black: [0, 0, 0], white: [1, 1, 1], red: [1, 0, 0], green: [0, 0.5, 0], blue: [0, 0, 1], gray: [0.5, 0.5, 0.5], grey: [0.5, 0.5, 0.5] };

export function color(v: string | null | undefined): Rgb | undefined {
  if (!v || v === 'none' || v === 'transparent') return undefined;
  const s = v.trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]!].map((c) => parseInt(c + c, 16) / 255) as Rgb;
  m = /^#([0-9a-f]{6})/.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16) / 255) as Rgb;
  const rgb = /^rgba?\(([^)]+)\)$/.exec(s);
  if (rgb) return rgb[1]!.split(/[ ,/]+/).slice(0, 3).map((x) => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x) / 255)) as Rgb;
  return undefined;
}

interface Style {
  fill: string;
  stroke: string;
  width: number;
  dash?: number[];
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
  size: number;
  bold: boolean;
  italic: boolean;
  anchor: string;
}

const INITIAL: Style = { fill: '#000', stroke: 'none', width: 1, opacity: 1, fillOpacity: 1, strokeOpacity: 1, size: 16, bold: false, italic: false, anchor: 'start' };

function inherit(el: Element, up: Style): Style {
  const a = (k: string) => el.getAttribute(k) ?? undefined;
  const dash = a('stroke-dasharray');
  const weight = a('font-weight');
  return {
    fill: a('fill') ?? up.fill,
    stroke: a('stroke') ?? up.stroke,
    width: a('stroke-width') !== undefined ? parseFloat(a('stroke-width')!) : up.width,
    ...(dash !== undefined ? (dash === 'none' ? {} : { dash: dash.split(/[ ,]+/).map(Number).filter((x) => !Number.isNaN(x)) }) : up.dash && { dash: up.dash }),
    // Opacity multiplies down the tree.
    opacity: up.opacity * (a('opacity') !== undefined ? parseFloat(a('opacity')!) : 1),
    fillOpacity: a('fill-opacity') !== undefined ? parseFloat(a('fill-opacity')!) : up.fillOpacity,
    strokeOpacity: a('stroke-opacity') !== undefined ? parseFloat(a('stroke-opacity')!) : up.strokeOpacity,
    size: a('font-size') !== undefined ? parseFloat(a('font-size')!) : up.size,
    bold: weight !== undefined ? weight === 'bold' || Number(weight) >= 600 : up.bold,
    italic: a('font-style') !== undefined ? a('font-style') === 'italic' : up.italic,
    anchor: a('text-anchor') ?? up.anchor,
  };
}

const paint = (s: Style): Paint => {
  const fill = color(s.fill);
  const stroke = color(s.stroke);
  const opacity = s.opacity * Math.min(fill ? s.fillOpacity : 1, stroke ? s.strokeOpacity : 1);
  return { ...(fill && { fill }), ...(stroke && { stroke, width: s.width, ...(s.dash?.length && { dash: s.dash }) }), ...(opacity < 1 && { opacity }) };
};

/** The transform attribute as one matrix [a b c d e f]. */
export function matrix(t: string | null): number[] | undefined {
  if (!t) return undefined;
  let m = [1, 0, 0, 1, 0, 0];
  const mul = (n: number[]) => {
    m = [m[0]! * n[0]! + m[2]! * n[1]!, m[1]! * n[0]! + m[3]! * n[1]!, m[0]! * n[2]! + m[2]! * n[3]!, m[1]! * n[2]! + m[3]! * n[3]!, m[0]! * n[4]! + m[2]! * n[5]! + m[4]!, m[1]! * n[4]! + m[3]! * n[5]! + m[5]!];
  };
  for (const [, fn, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = args!.split(/[ ,]+/).filter(Boolean).map(Number);
    if (fn === 'translate') mul([1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0]);
    else if (fn === 'scale') mul([v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]);
    else if (fn === 'matrix' && v.length === 6) mul(v);
    else if (fn === 'rotate') {
      const r = ((v[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
      mul([1, 0, 0, 1, cx, cy]);
      mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
      mul([1, 0, 0, 1, -cx, -cy]);
    }
  }
  return m;
}

const num = (el: Element, k: string, d = 0) => {
  const v = parseFloat(el.getAttribute(k) ?? '');
  return Number.isNaN(v) ? d : v;
};

/** Draw a marker (arrowhead) at a path end, pointing along the path. */
function marker(page: PdfPage, m: Element, at: { x: number; y: number; angle: number }, s: Style, defs: Map<string, Element>) {
  const vb = (m.getAttribute('viewBox') ?? '0 0 10 10').split(/[ ,]+/).map(Number);
  const [mw, mh] = [num(m, 'markerWidth', 3), num(m, 'markerHeight', 3)];
  const scaleBy = m.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : s.width;
  const [sx, sy] = [(mw * scaleBy) / vb[2]!, (mh * scaleBy) / vb[3]!];
  const orient = m.getAttribute('orient');
  const angle = orient === 'auto' || orient === 'auto-start-reverse' ? at.angle : (parseFloat(orient ?? '0') * Math.PI) / 180;
  page.save();
  page.transform(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), at.x, at.y);
  page.transform(sx, 0, 0, sy, -num(m, 'refX') * sx + vb[0]! * sx, -num(m, 'refY') * sy + vb[1]! * sy);
  for (const c of m.children) draw(page, c, inherit(m, { ...INITIAL, opacity: s.opacity }), defs);
  page.restore();
}

function draw(page: PdfPage, el: Element, up: Style, defs: Map<string, Element>): void {
  const tag = el.localName;
  if (tag === 'defs' || tag === 'marker' || tag === 'title' || tag === 'desc' || tag === 'style' || tag === 'metadata') return;
  const s = inherit(el, up);
  if (el.getAttribute('display') === 'none' || el.getAttribute('visibility') === 'hidden') return;
  const m = matrix(el.getAttribute('transform'));
  if (m) {
    page.save();
    page.transform(m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!);
  }
  const p = paint(s);
  switch (tag) {
    case 'svg':
    case 'g':
    case 'a':
      for (const c of el.children) draw(page, c, s, defs);
      break;
    case 'path': {
      const d = el.getAttribute('d') ?? '';
      page.path(d, p);
      const info = svgPath(d);
      const end = /url\(#([^)]+)\)/.exec(el.getAttribute('marker-end') ?? '')?.[1];
      const start = /url\(#([^)]+)\)/.exec(el.getAttribute('marker-start') ?? '')?.[1];
      if (end && info.end && defs.get(end)) marker(page, defs.get(end)!, info.end, s, defs);
      if (start && info.start && defs.get(start)) marker(page, defs.get(start)!, { ...info.start, angle: info.start.angle + Math.PI }, s, defs);
      break;
    }
    case 'rect': {
      const [x, y, w, h] = [num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height')];
      const rx = Math.min(w / 2, num(el, 'rx', num(el, 'ry')));
      const ry = Math.min(h / 2, num(el, 'ry', rx));
      if (rx > 0 || ry > 0) page.path(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`, p);
      else page.rect(x, y, w, h, p);
      break;
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [num(el, 'cx'), num(el, 'cy')];
      const [rx, ry] = tag === 'circle' ? [num(el, 'r'), num(el, 'r')] : [num(el, 'rx'), num(el, 'ry')];
      page.path(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`, p);
      break;
    }
    case 'line':
      page.path(`M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`, { ...p, fill: undefined } as Paint);
      break;
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[ ,]+/).map(Number);
      const d = pts.reduce((acc, v, i) => (i % 2 ? acc : `${acc}${i ? 'L' : 'M'}${v} ${pts[i + 1]}`), '') + (tag === 'polygon' ? 'Z' : '');
      page.path(d, p);
      break;
    }
    case 'text':
      text(page, el, s);
      break;
  }
  if (m) page.restore();
}

/** Text and its tspans, each placed by its own x and y where it has them. */
function text(page: PdfPage, el: Element, s: Style) {
  let [x, y] = [num(el, 'x'), num(el, 'y')];
  const parts: { text: string; s: Style; x?: number; y?: number; dy: number }[] = [];
  for (const n of el.childNodes) {
    if (n.nodeType === 3) parts.push({ text: n.textContent ?? '', s, dy: 0 });
    else if (n instanceof Element && n.localName === 'tspan') {
      const ts = inherit(n, s);
      parts.push({ text: n.textContent ?? '', s: ts, ...(n.hasAttribute('x') && { x: num(n, 'x') }), ...(n.hasAttribute('y') && { y: num(n, 'y') }), dy: num(n, 'dy') });
    }
  }
  for (const part of parts) {
    const t = part.text.replace(/\s+/g, ' ');
    if (!t.trim()) continue;
    if (part.x !== undefined) x = part.x;
    if (part.y !== undefined) y = part.y;
    y += part.dy;
    const fill = color(part.s.fill) ?? [0, 0, 0];
    const w = textWidth(t, { size: part.s.size, bold: part.s.bold });
    const left = part.s.anchor === 'middle' ? x - w / 2 : part.s.anchor === 'end' ? x - w : x;
    const font = part.s.bold ? (part.s.italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : part.s.italic ? 'Helvetica-Oblique' : 'Helvetica';
    const opacity = part.s.opacity * part.s.fillOpacity;
    page.text(t, left, y, font, part.s.size, fill, opacity < 1 ? opacity : undefined);
    x = left + w;
  }
}

/** Size of an SVG document in its own units. */
export function svgSize(svg: SVGSVGElement | Element): { width: number; height: number } {
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number);
  return { width: num(svg, 'width', vb[2] ?? 300), height: num(svg, 'height', vb[3] ?? 150) };
}

/** Draw a parsed SVG document onto a page at the current transform, in SVG units. */
export function drawSvg(page: PdfPage, svg: Element) {
  const defs = new Map<string, Element>();
  for (const m of svg.querySelectorAll('marker[id]')) defs.set(m.id, m);
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number);
  const { width, height } = svgSize(svg);
  page.save();
  if (vb.length === 4 && vb.every((v) => !Number.isNaN(v)) && vb[2]! > 0 && vb[3]! > 0) page.transform(width / vb[2]!, 0, 0, height / vb[3]!, (-vb[0]! * width) / vb[2]!, (-vb[1]! * height) / vb[3]!);
  draw(page, svg, INITIAL, defs);
  page.restore();
}

/** Parse SVG text into its root element. */
export const parseSvg = (svg: string): Element => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
