interface Props {
  /** What the diagram's type can add (URS-EXT-012); empty when it offers none. */
  addable: readonly string[];
  onAdd(i: number): void;
  canConnect: boolean;
  connecting: boolean;
  onConnect(): void;
  canDelete: boolean;
  onDelete(): void;
  detailsShown: boolean;
  onDetails(): void;
  status?: string;
}

/** The diagram toolbar (URS-WEB-026, experimental, D-009): add, connect, delete, details. */
export function EditBar(p: Props) {
  return (
    <div className="editbar cluster" role="toolbar" aria-label="Edit diagram">
      <select className="select" data-size="small" aria-label="Add" value="" disabled={!p.addable.length} title={p.addable.length ? 'Add an element' : 'This diagram type has nothing to add from here'} onChange={(e) => p.onAdd(Number(e.target.value))}>
        <option value="" disabled>
          Add…
        </option>
        {p.addable.map((a, i) => (
          <option key={a} value={i}>
            {a}
          </option>
        ))}
      </select>
      <button type="button" className="btn" data-size="small" aria-pressed={p.connecting} disabled={!p.canConnect} title="Click the element to connect from, then the one to connect to (Escape cancels)" onClick={p.onConnect}>
        Connect
      </button>
      <button type="button" className="btn" data-size="small" disabled={!p.canDelete} title="Remove the selected element from the source" onClick={p.onDelete}>
        Delete
      </button>
      <button type="button" className="btn" data-size="small" aria-pressed={p.detailsShown} title="Show or hide the details of the selected element" onClick={p.onDetails}>
        Details
      </button>
      {p.status && (
        <span className="editbar__status text-small" aria-live="polite">
          {p.status}
        </span>
      )}
    </div>
  );
}
