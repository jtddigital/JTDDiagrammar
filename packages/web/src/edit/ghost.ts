import { sanitizeSvg } from '../preview/sanitize.ts';

const NS = 'http://www.w3.org/2000/svg';

/** An SVG of size w × h that draws past its box (a drag moves its shape out of it). */
function frame(w: number, h: number): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of [['width', w], ['height', h], ['viewBox', `0 0 ${w} ${h}`], ['overflow', 'visible']] as const) svg.setAttribute(k, String(v));
  return svg;
}

/**
 * A draft's shape (URS-WEB-031): its node cut from a drawing of the diagram with it, with the text settings of
 * that drawing, at the origin and with the draft's own id (`draft-<key>`), so the drawing treats it as an element.
 */
export function ghost(svg: string, nodeId: string, key: string, w: number, h: number): SVGSVGElement | undefined {
  const root = sanitizeSvg(svg);
  const node = root?.querySelector(`[id="${CSS.escape(`n-${nodeId}`)}"]`);
  if (!root || !node) return undefined;
  const out = frame(w, h);
  out.setAttribute('class', root.getAttribute('class') ?? '');
  const text = root.querySelector('g[font-family]');
  const wrap = document.createElementNS(NS, 'g');
  for (const k of ['font-family', 'font-size', 'fill', 'style']) if (text?.hasAttribute(k)) wrap.setAttribute(k, text.getAttribute(k)!);
  const g = node.cloneNode(true) as Element;
  g.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  g.setAttribute('id', `draft-${key}`);
  g.setAttribute('transform', 'translate(0 0)');
  wrap.append(g);
  out.append(wrap);
  return out;
}

/** A plain box with the draft's name, for an addition that draws no node of its own. */
export function box(key: string, label: string, w: number, h: number): SVGSVGElement {
  const out = frame(w, h);
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('id', `draft-${key}`);
  g.setAttribute('transform', 'translate(0 0)');
  const rect = document.createElementNS(NS, 'rect');
  for (const [k, v] of [['width', w], ['height', h], ['rx', 6], ['fill', '#ffffff'], ['stroke', '#334155'], ['stroke-width', 1.5]] as const) rect.setAttribute(k, String(v));
  const t = document.createElementNS(NS, 'text');
  for (const [k, v] of [['x', w / 2], ['y', h / 2 + 5], ['text-anchor', 'middle'], ['font-size', 14], ['font-family', 'sans-serif'], ['fill', '#0f172a']] as const) t.setAttribute(k, String(v));
  t.textContent = label;
  g.append(rect, t);
  out.append(g);
  return out;
}
