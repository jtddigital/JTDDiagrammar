# JTDDiagrammar

Diagrams as structured text. Write JSON and get SVG back, from an API or a web app. You can also let Claude draft the diagram from a document.

The main target is the **cross-functional flowchart** (lanes × phases, as in Visio). The engine is built for multiple diagram types: each type is a plugin, and everything downstream of the plugin is type-agnostic.

## Status

| Phase | Scope | State |
|-------|-------|-------|
| P0 | Monorepo, CI, type registry, Graph IR, schemas, validation, README pipeline | **Done** |
| P1 | Flowchart layout + SVG rendering, README images | **Done** |
| P2 | REST API + web app (editor, live preview, SVG export) | Next |
| P3 | Cross-functional layout (lanes × phases) | Planned |
| P4 | AI generation from documents (Claude) | Planned |
| P5 | State diagrams | Planned |
| P6–P7 | Layout quality, extras | Planned |

Today the core library **validates and renders flowcharts to SVG**. Lanes and phases are validated but not laid out until P3. Layout quality is basic: edges can cross more than needed, and labels can overlap lines (P6).

## Diagram types

The examples and images below are generated from the registered types (`pnpm docs:build`) by the same renderer the API will use. CI fails if any of them go stale, and each example also has to pass validation.

<!-- BEGIN GENERATED: examples (pnpm docs:build) -->

### Flowchart

`type: flowchart` · A plain flowchart: nodes and directed edges.

![Flowchart](docs/img/flowchart-basic.svg)

<details><summary>Source</summary>

```json
{
  "version": "1",
  "type": "flowchart",
  "title": "Password reset",
  "direction": "TB",
  "nodes": [
    {
      "id": "start",
      "shape": "terminator",
      "label": "Start"
    },
    {
      "id": "request",
      "label": "Request reset link"
    },
    {
      "id": "known",
      "shape": "decision",
      "label": "Email known?"
    },
    {
      "id": "send",
      "label": "Send link"
    },
    {
      "id": "end",
      "shape": "terminator",
      "label": "End"
    }
  ],
  "edges": [
    {
      "from": "start",
      "to": "request"
    },
    {
      "from": "request",
      "to": "known"
    },
    {
      "from": "known",
      "to": "send",
      "label": "Yes"
    },
    {
      "from": "known",
      "to": "end",
      "label": "No"
    },
    {
      "from": "send",
      "to": "end"
    }
  ]
}
```

</details>

### Cross-functional flowchart

`type: flowchart` · The same flowchart type with `lanes` (functions) and `phases`.

![Cross-functional flowchart](docs/img/flowchart-cross-functional.svg)

> **Not yet supported:** lanes and phases are not laid out yet; nodes are drawn without them.

<details><summary>Source</summary>

```json
{
  "version": "1",
  "type": "flowchart",
  "title": "Order fulfilment",
  "direction": "LR",
  "lanes": [
    {
      "id": "customer",
      "label": "Customer"
    },
    {
      "id": "sales",
      "label": "Sales"
    },
    {
      "id": "warehouse",
      "label": "Warehouse"
    }
  ],
  "phases": [
    {
      "id": "order",
      "label": "Order"
    },
    {
      "id": "fulfil",
      "label": "Fulfil"
    }
  ],
  "nodes": [
    {
      "id": "start",
      "shape": "terminator",
      "label": "Start",
      "lane": "customer",
      "phase": "order"
    },
    {
      "id": "place",
      "label": "Place order",
      "lane": "customer",
      "phase": "order"
    },
    {
      "id": "stock",
      "shape": "decision",
      "label": "In stock?",
      "lane": "sales",
      "phase": "order"
    },
    {
      "id": "ship",
      "label": "Ship order",
      "lane": "warehouse",
      "phase": "fulfil"
    },
    {
      "id": "notify",
      "label": "Notify backorder",
      "lane": "sales",
      "phase": "fulfil"
    },
    {
      "id": "end",
      "shape": "terminator",
      "label": "End",
      "lane": "customer",
      "phase": "fulfil"
    }
  ],
  "edges": [
    {
      "from": "start",
      "to": "place"
    },
    {
      "from": "place",
      "to": "stock"
    },
    {
      "from": "stock",
      "to": "ship",
      "label": "Yes"
    },
    {
      "from": "stock",
      "to": "notify",
      "label": "No"
    },
    {
      "from": "ship",
      "to": "end"
    },
    {
      "from": "notify",
      "to": "end"
    }
  ]
}
```

</details>

<!-- END GENERATED: examples -->

## Language

Every diagram is a JSON object with a common envelope:

| Field | Required | Description |
|-------|----------|-------------|
| `version` | yes | Schema version. Major `1` is supported (`"1"`, `"1.2"`). |
| `type` | yes | Diagram type id, e.g. `flowchart`. |
| `title` | no | Diagram title. |
| `$schema` | no | Optional schema URL for editor tooling. |

### `flowchart`

| Field | Description |
|-------|-------------|
| `direction` | `LR` (default) or `TB`. |
| `lanes[]` | `{ id, label }`. Present → cross-functional flowchart. |
| `phases[]` | `{ id, label }`. Requires `lanes`. |
| `nodes[]` | `{ id, shape?, label?, lane?, phase?, order? }`. `shape` is one of `process` (default), `decision`, `terminator`, `document`, `data`, `subprocess`, `connector`. `label` defaults to `id`. |
| `edges[]` | `{ from, to, label?, id? }` |

Ids match `^[A-Za-z_][A-Za-z0-9_.-]*$`. With lanes present, every node needs a `lane`. With phases present, every node also needs a `phase`.

### Diagnostics

Validation reports **every** problem, not only the first. Each one carries a JSON Pointer to its location in the source:

```json
{ "severity": "error", "code": "ref.lane", "message": "node 'ship' references unknown lane 'wh'", "path": "/nodes/3" }
```

## Quick start

Requires Node ≥ 22.12 and pnpm 10.

```bash
pnpm install
```

```bash
pnpm check
```

```ts
import { createRegistry, parseJson, render } from '@jtd/core';

const { value } = parseJson(text);
const { svg, diagnostics } = render(value, createRegistry()); // svg is undefined if there are errors
```

Output is standalone SVG 1.1. Text uses `Arial, Liberation Sans, Helvetica, sans-serif`; the first two have identical metrics, so text fits its boxes without embedding a font. Elements carry ids and classes for styling and scripting: `n-<id>` / `jtd-node jtd-shape-<shape>` for nodes, and `e-<id>` / `jtd-edge` for edges.

## API (planned, P2)

| Method | Path | Returns |
|--------|------|---------|
| POST | `/v1/render` | `image/svg+xml` |
| POST | `/v1/validate` | `{ valid, diagnostics[] }` |
| POST | `/v1/generate` | AI-generated source + SVG (P4) |
| GET | `/v1/types` | Registered diagram types |
| GET | `/v1/schema[/{type}]` | JSON Schema |

## AI generation (planned, P4)

Upload PDF, DOCX, TXT, MD or HTML, or paste text, and Claude produces diagram source. Claude's output is constrained to a schema, and the result then goes through the same validation as hand-written source, with automatic repair attempts. See [URS §3.9](docs/URS.md).

## Architecture

```
packages/core/src
  registry/     DiagramType + LayoutEngine contracts, Registry
  diagrams/     one folder per diagram type (the only type-specific code)
  ir/           shared Graph IR
  schema/       shared schema fragments, combined schema
  validate/     envelope, JSON Schema (Ajv), common IR rules
  adapters/     source formats (JSON)
  measure/      text metrics from a generated font table (no DOM)
  shapes/       shape library: size, outline, ports
  layout/       layered engine: cycles → rank → order → place → route
  render/svg/   geometry → SVG string
scripts/docs/   README generation + checks
scripts/fonts/  font metrics generator
```

Pipeline: `parse → envelope → type schema → type rules + IR + common rules → layout engine → geometry → SVG`.

Enforced boundaries (lint + tests):
- `core` has no DOM and no Node built-ins, so it runs in the browser and on the server.
- `layout/` and `render/` never import diagram types.
- `core` never imports the Anthropic SDK.

Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Requirements: [docs/URS.md](docs/URS.md).

## Development

| Script | Does |
|--------|------|
| `pnpm check` | lint + typecheck + tests + docs check (what CI runs) |
| `pnpm test` | Vitest (unit, layout invariants, golden SVGs) |
| `pnpm test -u` | Accept changed golden SVGs. Review the diff first. |
| `pnpm docs:build` | Regenerate README examples and `docs/img/*.svg` |
| `pnpm fonts:metrics` | Regenerate `measure/font-metrics.ts` from Liberation Sans |

Every change cites URS IDs and includes an impact assessment in the commit body ([URS §5](docs/URS.md)).

### Adding a diagram type

1. Create `packages/core/src/diagrams/<type>/` with a schema (unique `$id`), model, `toIR`, optional `validate`, and ≥ 1 example.
2. Register it in `packages/core/src/builtins.ts`.
3. Run `pnpm docs:build`.

Nothing else changes. The test-only `checklist` type (`packages/core/test/fixture-type.ts`) proves it.

## Licence

[MIT](LICENSE). Font metrics are derived from Liberation Sans (SIL Open Font License 1.1); no font files are distributed.
