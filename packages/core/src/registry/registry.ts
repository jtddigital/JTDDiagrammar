import type { DiagramType } from './diagram-type.ts';
import type { LayoutEngine } from './layout-engine.ts';

/** Holds diagram types and layout engines (URS-EXT-001, URS-EXT-005). */
export class Registry {
  readonly #types = new Map<string, DiagramType>();
  readonly #engines = new Map<string, LayoutEngine>();

  registerType(t: DiagramType): this {
    if (this.#types.has(t.id)) throw new Error(`Diagram type '${t.id}' is already registered`);
    if (typeof t.schema.$id !== 'string') throw new Error(`Diagram type '${t.id}' schema needs a $id`);
    this.#types.set(t.id, t);
    return this;
  }

  registerEngine(e: LayoutEngine): this {
    if (this.#engines.has(e.id)) throw new Error(`Layout engine '${e.id}' is already registered`);
    this.#engines.set(e.id, e);
    return this;
  }

  type(id: string): DiagramType | undefined {
    return this.#types.get(id);
  }

  engine(id: string): LayoutEngine | undefined {
    return this.#engines.get(id);
  }

  types(): DiagramType[] {
    return [...this.#types.values()];
  }
}
