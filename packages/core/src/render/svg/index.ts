import type { Geometry, PlacedNode, RoutedEdge } from '../../geometry.ts';
import { FONT_FAMILY, lineHeight, textBlock } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { shape } from '../../shapes/library.ts';
import { fontOf, LABEL_FONT, NODE_FONT, TITLE_FONT } from '../../style.ts';
import { bands } from './bands.ts';
import { containers } from './containers.ts';
import { esc } from './escape.ts';
import { fontAttrs, lines } from './text.ts';
import { dash, METRICS as M, opacity, PALETTES, type Palette } from './theme.ts';
import type { Style } from '../../ir/types.ts';

export interface SvgOptions {
  title?: string;
  /** Extra class on the root element, e.g. the diagram type (URS-RN-005). */
  className?: string;
}

const stroke = (color: string, width: number = M.stroke) => `stroke="${color}" stroke-width="${num(width)}"`;
/** Provenance as a native tooltip (URS-AI-014). */
const tooltip = (q: string | undefined) => (q ? `<title>${esc(q)}</title>` : '');
const fillAttr = (c: string | undefined) => (c ? ` fill="${c}"` : '');

type Head = Exclude<Style['arrowhead'], 'none' | undefined>;
interface Arrow {
  head: Head;
  color: string;
  width: number;
}
const HEADS: Record<Head, (c: string) => string> = {
  triangle: (c) => `<path d="M0 0L10 5L0 10Z" fill="${c}"/>`,
  open: (c) => `<path d="M1 1L9 5L1 9" fill="none" stroke="${c}" stroke-width="1.5"/>`,
  diamond: (c) => `<path d="M0 5L5 1L10 5L5 9Z" fill="${c}"/>`,
  circle: (c) => `<path d="M1 5A4 4 0 1 1 9 5A4 4 0 1 1 1 5Z" fill="${c}"/>`,
};
/** Arrowheads grow with lines thicker than the default so they stay visible (URS-DM-014). */
const arrowSize = (width: number) => 9 * Math.max(1, width / M.stroke);
/** One marker per head shape, colour and size; the default keeps the id `jtd-arrow`. */
const markerId = ({ head, color, width }: Arrow, P: Palette) =>
  'jtd-arrow' + (head === 'triangle' ? '' : `-${head}`) + (color === P.edge ? '' : `-${color.slice(1)}`) + (width > M.stroke ? `-w${num(width).replace('.', '_')}` : '');
const marker = (a: Arrow, P: Palette) => {
  const s = num(arrowSize(a.width));
  return `<marker id="${markerId(a, P)}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="${s}" markerHeight="${s}" markerUnits="userSpaceOnUse" orient="auto">${HEADS[a.head](a.color)}</marker>`;
};
/** The arrowhead an edge draws, if any. */
const arrowOf = (e: RoutedEdge, P: Palette): Arrow | undefined =>
  e.marker === 'none' || e.style?.arrowhead === 'none' ? undefined : { head: e.style?.arrowhead ?? 'triangle', color: e.style?.stroke ?? P.edge, width: e.style?.lineWidth ?? M.stroke };

function node(n: PlacedNode, P: Palette): string {
  const s = shape(n.shape);
  const line = n.style?.stroke ?? P.nodeStroke;
  const width: number = n.style?.lineWidth ?? M.stroke;
  const fill = n.style?.fill ?? (s.paint ? P[s.paint] : P.nodeFill);
  const font = fontOf(NODE_FONT, n.style);
  const attrs = fontAttrs(font, NODE_FONT) + fillAttr(n.style?.text);
  const textTop = n.h / 2 + (s.labelDy?.(n.w, n.h) ?? 0) - (n.lines.length * lineHeight(font)) / 2;
  const detail = s.detail ? `<path d="${s.detail(n.w, n.h)}" fill="none" ${stroke(line, width)}/>` : '';
  const solid = s.solid ? `<path d="${s.solid(n.w, n.h)}" fill="${line}"/>` : '';
  const text = s.unlabelled ? '' : lines(n.lines, n.w / 2, textTop, font, attrs);
  return (
    `<g id="n-${esc(n.id)}" class="jtd-node jtd-shape-${esc(n.shape)}" transform="translate(${num(n.x)} ${num(n.y)})"${opacity(n.style?.opacity)}>` +
    tooltip(n.quote) +
    `<path d="${s.outline(n.w, n.h)}" fill="${fill}" ${stroke(line, width)}${dash(n.style?.dash)}/>${detail}${solid}${text}${callout(n, font, attrs, P)}</g>`
  );
}

/** Label beside a fixed-size node with a leader line to it, in the node's local coordinates (URS-DM-017). */
function callout(n: PlacedNode, font: ReturnType<typeof fontOf>, attrs: string, P: Palette): string {
  const c = n.callout;
  if (!c) return '';
  const [x, y] = [c.x - n.x, c.y - n.y];
  const [a, b] = c.leader.map((p) => ({ x: p.x - n.x, y: p.y - n.y }));
  const border = n.style?.stroke ?? P.nodeStroke;
  return (
    `<path d="M${num(a!.x)} ${num(a!.y)}L${num(b!.x)} ${num(b!.y)}" fill="none" stroke="${border}" stroke-width="1"/>` +
    `<rect x="${num(x)}" y="${num(y)}" width="${num(c.w)}" height="${num(c.h)}" rx="4" fill="${n.style?.labelFill ?? P.labelFill}" stroke="${border}" stroke-width="1"/>` +
    lines(c.lines, x + c.w / 2, y + (c.h - c.lines.length * lineHeight(font)) / 2, font, attrs)
  );
}

function edge(e: RoutedEdge, P: Palette): string {
  const color = e.style?.stroke ?? P.edge;
  const width: number = e.style?.lineWidth ?? M.stroke;
  const font = fontOf(LABEL_FONT, e.style);
  const arrow = arrowOf(e, P);
  const d = e.points.map((p, i) => `${i ? 'L' : 'M'}${num(p.x)} ${num(p.y)}`).join('');
  const l = e.label;
  const label = l
    ? `<rect x="${num(l.x)}" y="${num(l.y)}" width="${num(l.w)}" height="${num(l.h)}" rx="3" fill="${e.style?.labelFill ?? P.labelFill}"/>` +
      lines(l.lines, l.x + l.w / 2, l.y + (l.h - l.lines.length * lineHeight(font)) / 2, font, ` font-size="${num(font.size)}"${fontAttrs(font, { size: font.size })}${fillAttr(e.style?.text)}`)
    : '';
  return (
    `<g id="e-${esc(e.id)}" class="jtd-edge"${opacity(e.style?.opacity)}>` +
    tooltip(e.quote) +
    `<path d="${d}" fill="none" ${stroke(color, width)}${dash(e.style?.dash)}${arrow ? ` marker-end="url(#${markerId(arrow, P)})"` : ''}/>${label}</g>`
  );
}

/** Standalone SVG 1.1 from geometry; knows nothing about diagram types (URS-RN-001..005, URS-DM-010). */
export function renderSvg(g: Geometry, opts: SvgOptions = {}): string {
  const P = PALETTES[g.theme ?? 'default'];
  const title = opts.title ? textBlock(opts.title, Math.max(g.width, 480), TITLE_FONT) : undefined;
  const titleH = title ? title.height + M.titleGap : 0;
  const innerW = Math.max(g.width, title?.width ?? 0);
  const W = innerW + 2 * M.margin;
  const H = g.height + titleH + 2 * M.margin;
  const cls = ['jtd', ...(opts.className ? [opts.className] : [])].join(' ');
  const titleSvg = title ? lines(title.lines, W / 2, M.margin, TITLE_FONT, ` font-size="${TITLE_FONT.size}" font-weight="bold" class="jtd-title"`) : '';
  const plain: Arrow = { head: 'triangle', color: P.edge, width: M.stroke };
  const arrows = new Map<string, Arrow>([[markerId(plain, P), plain]]);
  for (const e of g.edges) {
    const a = arrowOf(e, P);
    if (a) arrows.set(markerId(a, P), a);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${num(W)}" height="${num(H)}" viewBox="0 0 ${num(W)} ${num(H)}" class="${esc(cls)}">` +
    (opts.title ? `<title>${esc(opts.title)}</title>` : '') +
    `<defs>${[...arrows.values()].map((a) => marker(a, P)).join('')}</defs>` +
    `<rect width="${num(W)}" height="${num(H)}" fill="${P.background}"/>` +
    `<g font-family="${esc(FONT_FAMILY)}" font-size="${NODE_FONT.size}" fill="${P.text}" style="font-kerning:none;font-variant-ligatures:none">` +
    titleSvg +
    `<g transform="translate(${num(M.margin + (innerW - g.width) / 2)} ${num(M.margin + titleH)})">` +
    bands(g.bands, P, g.corner) +
    containers(g.containers, P) +
    g.edges.map((e) => edge(e, P)).join('') +
    g.nodes.map((n) => node(n, P)).join('') +
    `</g></g></svg>\n`
  );
}
