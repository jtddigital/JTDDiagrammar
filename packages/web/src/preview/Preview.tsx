import { useEffect, useMemo } from 'react';

/** Rendered SVG shown as an image: scripts in it can never run here. */
export function Preview({ svg, current }: { svg?: string; current: boolean }) {
  const url = useMemo(() => (svg ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : undefined), [svg]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return (
    <section className="preview" aria-label="Preview">
      {!current && svg && <p className="stale">Showing the last valid diagram</p>}
      {url ? <img src={url} alt="Diagram preview" data-testid="preview" /> : <p className="empty">Nothing to show yet.</p>}
    </section>
  );
}
