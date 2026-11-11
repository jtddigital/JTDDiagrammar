/**
 * Inline-SVG sanitiser (defence in depth; the renderer already escapes everything): keeps only the
 * SVG 1.1 elements and attributes the renderer emits (the URS-RN-001 allowlist), with values that
 * cannot reference anything external. Everything else, scripts and event handlers included, is dropped.
 */
const ELEMENTS: Record<string, string[]> = {
  svg: ['xmlns', 'version', 'width', 'height', 'viewBox', 'class'],
  title: [],
  defs: [],
  marker: ['id', 'viewBox', 'refX', 'refY', 'markerWidth', 'markerHeight', 'markerUnits', 'orient'],
  path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'marker-end'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray'],
  g: ['id', 'class', 'transform', 'font-family', 'font-size', 'fill', 'style'],
  text: ['x', 'y', 'text-anchor', 'font-size', 'font-weight', 'fill', 'class'],
};

const SAFE: Record<string, RegExp> = {
  fill: /^(#[0-9a-f]{3}|#[0-9a-f]{6}|none)$/i,
  stroke: /^(#[0-9a-f]{3}|#[0-9a-f]{6}|none)$/i,
  'marker-end': /^url\(#[\w-]+\)$/,
  style: /^[a-z-]+:[a-z-]+(;[a-z-]+:[a-z-]+)*$/,
  transform: /^translate\([-\d.]+ [-\d.]+\)$/,
};

function clean(el: Element): void {
  for (const child of [...el.children]) {
    if (!(child.localName in ELEMENTS)) child.remove();
    else clean(child);
  }
  const allowed = ELEMENTS[el.localName] ?? [];
  for (const a of [...el.attributes]) if (!allowed.includes(a.name) || (SAFE[a.name] && !SAFE[a.name]!.test(a.value))) el.removeAttribute(a.name);
}

export function sanitizeSvg(svg: string): SVGSVGElement | undefined {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return undefined;
  clean(root);
  return document.importNode(root, true) as unknown as SVGSVGElement;
}
