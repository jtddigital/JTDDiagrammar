/** What a shape dragged from the palette carries (HTML drag and drop). */
export const ADD_TYPE = 'application/x-jtd-add';

interface Props {
  /** What the diagram's type can add (URS-EXT-012); empty when it offers none. */
  addable: readonly string[];
  /** The addition waiting for a click on the drawing, if any. */
  placing: string | undefined;
  /** Pick an addition: placed by the next click on the drawing, or added at once (`now`, from the keyboard). */
  onAdd(label: string, now: boolean): void;
  canConnect: boolean;
  connecting: boolean;
  onConnect(): void;
  canDelete: boolean;
  onDelete(): void;
  detailsShown: boolean;
  onDetails(): void;
  status?: string;
}

/**
 * The diagram toolbar (URS-WEB-026, WEB-031, experimental, D-009): a palette of what the type can add (drag one
 * onto the drawing, or click it and then the drawing; from the keyboard it is added at once), after connect,
 * delete, details.
 */
export function EditBar(p: Props) {
  return (
    <div className="editbar cluster" role="toolbar" aria-label="Edit diagram">
      <button type="button" className="btn" data-size="small" aria-pressed={p.connecting} disabled={!p.canConnect} title="Click the shape to connect from, then the one to connect to (Escape cancels); or drag one shape onto another" onClick={p.onConnect}>
        Connect
      </button>
      <button type="button" className="btn" data-size="small" disabled={!p.canDelete} title="Remove the selected element from the source, or discard the selected draft" onClick={p.onDelete}>
        Delete
      </button>
      <button type="button" className="btn" data-size="small" aria-pressed={p.detailsShown} title="Show or hide the details of the selected element" onClick={p.onDetails}>
        Details
      </button>
      <span className="editbar__sep" aria-hidden="true" />
      <div className="editbar__palette cluster" role="group" aria-label="Add">
        <span className="editbar__label text-small text-muted" aria-hidden="true">
          Add
        </span>
        {p.addable.length === 0 && <span className="text-small text-muted">nothing from here</span>}
        {p.addable.map((a) => (
          <button
            key={a}
            type="button"
            className="btn editbar__shape"
            data-size="small"
            draggable
            aria-pressed={p.placing === a}
            title={`${a}: drag it onto the diagram, or click here and then where it goes`}
            onDragStart={(e) => {
              e.dataTransfer.setData(ADD_TYPE, a);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={(e) => p.onAdd(a, e.detail === 0)}
          >
            {a}
          </button>
        ))}
      </div>
      {p.status && (
        <span className="editbar__status text-small" aria-live="polite">
          {p.status}
        </span>
      )}
    </div>
  );
}
