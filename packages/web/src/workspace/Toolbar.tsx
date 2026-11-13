import { Download, FolderOpen, Link, Save } from '../ui/icons.tsx';
import { examples } from '../registry.ts';
import { PANES, type Layout, type PaneId } from './layout.ts';

export const PANE_LABELS: Record<PaneId, string> = { ai: 'AI', source: 'Source', diagram: 'Diagram' };

interface Props {
  fileName?: string;
  dirty: boolean;
  onOpen(): void;
  onSave(saveAs: boolean): void;
  onExample(i: number): void;
  layout: Layout;
  onToggle(p: PaneId): void;
  status: { state: 'ok' | 'error' | 'pending'; text: string };
  shared: boolean;
  onShare(): void;
  canExport: boolean;
  onSvg(): void;
  onPng(): void;
}

/** App toolbar: file, examples, pane visibility (URS-WEB-015), status, share and export. */
export function Toolbar(p: Props) {
  return (
    <header className="toolbar cluster">
      <h1 className="toolbar__brand">
        <span className="toolbar__logo" aria-hidden="true">
          J
        </span>
        JTDDiagrammar
      </h1>
      <button type="button" className="btn" data-variant="ghost" title="Open (Ctrl+O)" onClick={p.onOpen}>
        <FolderOpen /> Open
      </button>
      <button type="button" className="btn" data-variant="ghost" title="Save (Ctrl+S); Shift-click or Ctrl+Shift+S to save as" onClick={(e) => p.onSave(e.shiftKey)}>
        <Save /> Save
      </button>
      <span className="toolbar__file" title={p.fileName}>
        {p.fileName ?? 'Untitled'}
        {p.dirty && <span aria-label="unsaved changes"> •</span>}
      </span>
      <span className="toolbar__divider" />
      <select className="select" aria-label="Example" value="" onChange={(e) => p.onExample(Number(e.target.value))}>
        <option value="" disabled>
          Examples…
        </option>
        {examples.map((ex, i) => (
          <option key={i} value={i}>
            {ex.type}: {ex.title}
          </option>
        ))}
      </select>
      <span className="push-right" />
      <div className="segmented" role="group" aria-label="Panes">
        {PANES.map((id) => (
          <button key={id} type="button" className="btn" aria-pressed={!p.layout.hidden.includes(id)} title={`Show or hide ${PANE_LABELS[id]}`} onClick={() => p.onToggle(id)}>
            {PANE_LABELS[id]}
          </button>
        ))}
      </div>
      <span className="status" role="status" data-state={p.status.state}>
        {p.status.text}
      </span>
      <span className="toolbar__divider" />
      <button type="button" className="btn" data-variant="ghost" onClick={p.onShare}>
        <Link /> {p.shared ? 'Link copied' : 'Share link'}
      </button>
      <button type="button" className="btn" aria-label="Export SVG" disabled={!p.canExport} onClick={p.onSvg}>
        <Download /> SVG
      </button>
      <button type="button" className="btn" aria-label="Export PNG" disabled={!p.canExport} onClick={p.onPng}>
        <Download /> PNG
      </button>
    </header>
  );
}
