import { Download, FolderOpen, Link, Save } from '../ui/icons.tsx';
import { VersionBadge } from '../update/VersionBadge.tsx';
import { PANES, type Layout, type PaneId } from './layout.ts';

export const PANE_LABELS: Record<PaneId, string> = { files: 'Files', ai: 'AI', source: 'Source', preview: 'Preview', details: 'Details', compare: 'Compare' };
/** Compare appears with a comparison and closes with it (URS-WS-031), so it has no switch. */
const SWITCHED = PANES.filter((p) => p !== 'compare');

interface Props {
  fileName?: string;
  dirty: boolean;
  /** Import files into the workspace (URS-WS-005). */
  onImport(): void;
  onSave(): void;
  canSave: boolean;
  layout: Layout;
  onToggle(p: PaneId): void;
  status: { state: 'ok' | 'error' | 'pending'; text: string };
  shared: boolean;
  onShare(): void;
  canExport: boolean;
  onSvg(): void;
  onPng(): void;
  /** The file on screen as a PDF, any kind (URS-WS-046). */
  onPdf(): void;
  canPdf: boolean;
  /** Other formats the current type exports, e.g. BPMN (URS-PM-018). */
  formats: { id: string; label: string }[];
  onExport(format: string): void;
}

/** App toolbar: file, pane visibility (URS-WEB-015), status, share and export. */
export function Toolbar(p: Props) {
  return (
    <header className="toolbar cluster">
      <h1 className="toolbar__brand">
        <span className="toolbar__logo" aria-hidden="true">
          J
        </span>
        JTDDiagrammar
      </h1>
      <VersionBadge />
      <button type="button" className="btn" data-variant="ghost" title="Import files into the workspace (Ctrl+O)" onClick={p.onImport}>
        <FolderOpen /> Import
      </button>
      <button type="button" className="btn" data-variant="ghost" title="Save a version into the workspace (Ctrl+S)" disabled={!p.canSave} onClick={p.onSave}>
        <Save /> Save
      </button>
      <span className="toolbar__file" title={p.fileName}>
        {p.fileName ?? 'No file open'}
        {p.dirty && <span aria-label="unsaved changes"> •</span>}
      </span>
      <span className="push-right" />
      <div className="segmented" role="group" aria-label="Panes">
        {SWITCHED.map((id) => (
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
      <button type="button" className="btn" aria-label="Export PDF" disabled={!p.canPdf} onClick={p.onPdf}>
        <Download /> PDF
      </button>
      {p.formats.map((f) => (
        <button key={f.id} type="button" className="btn" aria-label={`Export ${f.label}`} onClick={() => p.onExport(f.id)}>
          <Download /> {f.label}
        </button>
      ))}
    </header>
  );
}
