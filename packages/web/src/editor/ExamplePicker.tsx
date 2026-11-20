import { examples } from '../registry.ts';

/**
 * Examples of every type (URS-WEB-007), in the Source pane. Choosing one shows it without making a file;
 * Save makes it one (URS-WS-005).
 */
export function ExamplePicker({ onPick }: { onPick(i: number): void }) {
  return (
    <select className="select" data-size="small" aria-label="Example" value="" onChange={(e) => onPick(Number(e.target.value))}>
      <option value="" disabled>
        Examples…
      </option>
      {examples.map((ex, i) => (
        <option key={i} value={i}>
          {ex.type}: {ex.title}
        </option>
      ))}
    </select>
  );
}
