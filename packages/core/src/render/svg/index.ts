import type { Geometry, PlacedNode, RoutedEdge } from '../../geometry.ts';
import { FONT_FAMILY, lineHeight, textBlock } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { shape } from '../../shapes/library.ts';
import { LABEL_FONT, NODE_FONT, TITLE_FONT } from '../../style.ts';
import { bands } from './bands.ts';
import { esc } from './escape.ts';
import { lines } from './text.ts';
import { THEME as T } from './theme.ts';

export interface SvgOptions {
  title?: string;
  /** Extra class on the root element, e.g. the diagram type (URS-RN-005). */
  className?: string;
}

const stroke = (color: string) => `stroke="${color}" stroke-width="${T.stroke}"`;

const MARKER = `<marker id="jtd-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${T.edge}"/></marker>`;

function node(n: PlacedNode): string {
  const s = shape(n.shape);
  const textTop = n.h / 2 + (s.labelDy?.(n.w, n.h) ?? 0) - (n.lines.length * lineHeight(NODE_FONT)) / 2;
  const detail = s.detail ? `<path d="${s.detail(n.w, n.h)}" fill="none" ${stroke(T.nodeStroke)}/>` : '';
  return (
    `<g id="n-${esc(n.id)}" class="jtd-node jtd-shape-${esc(n.shape)}" data-id="${esc(n.id)}" transform="translate(${num(n.x)} ${num(n.y)})">` +
    `<path d="${s.outline(n.w, n.h)}" fill="${T.nodeFill}" ${stroke(T.nodeStroke)}/>${detail}${lines(n.lines, n.w / 2, textTop, NODE_FONT)}</g>`
  );
}

function edge(e: RoutedEdge): string {
  const d = e.points.map((p, i) => `${i ? 'L' : 'M'}${num(p.x)} ${num(p.y)}`).join('');
  const l = e.label;
  const label = l
    ? `<rect x="${num(l.x)}" y="${num(l.y)}" width="${num(l.w)}" height="${num(l.h)}" rx="3" fill="${T.labelFill}"/>` +
      lines(l.lines, l.x + l.w / 2, l.y + (l.h - l.lines.length * lineHeight(LABEL_FONT)) / 2, LABEL_FONT, ` font-size="${LABEL_FONT.size}"`)
    : '';
  return (
    `<g id="e-${esc(e.id)}" class="jtd-edge" data-id="${esc(e.id)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}">` +
    `<path d="${d}" fill="none" ${stroke(T.edge)} marker-end="url(#jtd-arrow)"/>${label}</g>`
  );
}

/** Standalone SVG 1.1 from geometry; knows nothing about diagram types (URS-RN-001..005). */
export function renderSvg(g: Geometry, opts: SvgOptions = {}): string {
  const title = opts.title ? textBlock(opts.title, Math.max(g.width, 480), TITLE_FONT) : undefined;
  const titleH = title ? title.height + T.titleGap : 0;
  const innerW = Math.max(g.width, title?.width ?? 0);
  const W = innerW + 2 * T.margin;
  const H = g.height + titleH + 2 * T.margin;
  const cls = ['jtd', ...(opts.className ? [opts.className] : [])].join(' ');
  const titleSvg = title ? lines(title.lines, W / 2, T.margin, TITLE_FONT, ` font-size="${TITLE_FONT.size}" font-weight="bold" class="jtd-title"`) : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${num(W)}" height="${num(H)}" viewBox="0 0 ${num(W)} ${num(H)}" class="${esc(cls)}">` +
    (opts.title ? `<title>${esc(opts.title)}</title>` : '') +
    `<defs>${MARKER}</defs>` +
    `<rect width="${num(W)}" height="${num(H)}" fill="${T.background}"/>` +
    `<g font-family="${esc(FONT_FAMILY)}" font-size="${NODE_FONT.size}" fill="${T.text}" style="font-kerning:none;font-variant-ligatures:none">` +
    titleSvg +
    `<g transform="translate(${num(T.margin + (innerW - g.width) / 2)} ${num(T.margin + titleH)})">` +
    bands(g.bands, g.corner) +
    g.edges.map(edge).join('') +
    g.nodes.map(node).join('') +
    `</g></g></svg>\n`
  );
}
