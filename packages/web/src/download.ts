export const fileName = (title?: string) =>
  (title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram';

function save(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

/** Save the exact SVG string the renderer produced (URS-WEB-003). */
export const downloadSvg = (svg: string, title?: string) => save(new Blob([svg], { type: 'image/svg+xml' }), `${fileName(title)}.svg`);

/** Rasterise the SVG in the browser at `scale`× and save it as PNG (URS-RN-007). */
export async function downloadPng(svg: string, title?: string, scale = 2): Promise<void> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  // The root's own size: naturalWidth/Height round to whole pixels.
  const [w, h] = ['width', 'height'].map((k) => Number(new RegExp(`^<svg[^>]* ${k}="([\\d.]+)"`).exec(svg)?.[1] ?? 0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w! * scale);
  canvas.height = Math.ceil(h! * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (blob) save(blob, `${fileName(title)}.png`);
}
