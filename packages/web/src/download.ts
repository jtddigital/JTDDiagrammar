export const fileName = (title?: string) =>
  (title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram';

/** Save the exact SVG string the renderer produced (URS-WEB-003). */
export function downloadSvg(svg: string, title?: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  a.download = `${fileName(title)}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
