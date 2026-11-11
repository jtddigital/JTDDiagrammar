import type { Geometry, PlacedNode, RoutedEdge } from '../../geometry.ts';
import { FONT_FAMILY, lineHeight, textBlock } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { shape } from '../../shapes/library.ts';
import { LABEL_FONT, NODE_FONT, TITLE_FONT } from '../../style.ts';
import { bands } from './bands.ts';
import { containers } from './containers.ts';
import { esc } from './escape.ts';
import { lines } from './text.ts';
import { dash, METRICS as M, PALETTES, type Palette } from './theme.ts';

export interface SvgOptions {
  title?: string;
  /** Extra class on the root element, e.g. the diagram type (URS-RN-005). */
  className?: string;
}

const stroke = (color: string, width: number = M.stroke) => `stroke="${color}" stroke-width="${num(width)}"`;
/** Provenance as a native tooltip (URS-AI-014). */
const tooltip = (q: string | undefined) => (q ? `<title>${esc(q)}</title>` : '');
const fillAttr = (c: string | undefined) => (c ? ` fill="${c}"` : '');

/** Arrowheads grow with lines thicker than the default so they stay visible (URS-DM-014). */
const arrowSize = (width: number) => 9 * Math.max(1, width / M.stroke);
/** One arrowhead per edge colour and size; the default keeps the id `jtd-arrow`. */
const markerId = (color: string, width: number, P: Palette) =>
  (color === P.edge ? 'jtd-arrow' : `jtd-arrow-${color.slice(1)}`) + (width > M.stroke ? `-w${num(width).replace('.', '_')}` : '');
const marker = (color: string, width: number, P: Palette) => {
  const s = num(arrowSize(width));
  return `<marker id="${markerId(color, width, P)}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="${s}" markerHeight="${s}" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${color}"/></marker>`;
};

function node(n: PlacedNode, P: Palette): string {
  const s = shape(n.shape);
  const line = n.style?.stroke ?? P.nodeStroke;
  const width: number = n.style?.lineWidth ?? M.stroke;
  const fill = n.style?.fill ?? (s.paint ? P[s.paint] : P.nodeFill);
  const textTop = n.h / 2 + (s.labelDy?.(n.w, n.h) ?? 0) - (n.lines.length * lineHeight(NODE_FONT)) / 2;
  const detail = s.detail ? `<path d="${s.detail(n.w, n.h)}" fill="none" ${stroke(line, width)}/>` : '';
  const solid = s.solid ? `<path d="${s.solid(n.w, n.h)}" fill="${line}"/>` : '';
  const text = s.unlabelled ? '' : lines(n.lines, n.w / 2, textTop, NODE_FONT, fillAttr(n.style?.text));
  return (
    `<g id="n-${esc(n.id)}" class="jtd-node jtd-shape-${esc(n.shape)}" transform="translate(${num(n.x)} ${num(n.y)})">` +
    tooltip(n.quote) +
    `<path d="${s.outline(n.w, n.h)}" fill="${fill}" ${stroke(line, width)}${dash(n.style?.dash)}/>${detail}${solid}${text}</g>`
  );
}

function edge(e: RoutedEdge, P: Palette): string {
  const color = e.style?.stroke ?? P.edge;
  const width: number = e.style?.lineWidth ?? M.stroke;
  const d = e.points.map((p, i) => `${i ? 'L' : 'M'}${num(p.x)} ${num(p.y)}`).join('');
  const l = e.label;
  const label = l
    ? `<rect x="${num(l.x)}" y="${num(l.y)}" width="${num(l.w)}" height="${num(l.h)}" rx="3" fill="${P.labelFill}"/>` +
      lines(l.lines, l.x + l.w / 2, l.y + (l.h - l.lines.length * lineHeight(LABEL_FONT)) / 2, LABEL_FONT, ` font-size="${LABEL_FONT.size}"${fillAttr(e.style?.text)}`)
    : '';
  return (
    `<g id="e-${esc(e.id)}" class="jtd-edge">` +
    tooltip(e.quote) +
    `<path d="${d}" fill="none" ${stroke(color, width)}${dash(e.style?.dash)}${e.marker === 'none' ? '' : ` marker-end="url(#${markerId(color, width, P)})"`}/>${label}</g>`
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
  const arrows = new Map<string, readonly [string, number]>([[markerId(P.edge, M.stroke, P), [P.edge, M.stroke]]]);
  for (const e of g.edges.filter((x) => x.marker !== 'none')) {
    const [c, w] = [e.style?.stroke ?? P.edge, e.style?.lineWidth ?? M.stroke];
    arrows.set(markerId(c, w, P), [c, w]);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${num(W)}" height="${num(H)}" viewBox="0 0 ${num(W)} ${num(H)}" class="${esc(cls)}">` +
    (opts.title ? `<title>${esc(opts.title)}</title>` : '') +
    `<defs>${[...arrows.values()].map(([c, w]) => marker(c, w, P)).join('')}</defs>` +
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
