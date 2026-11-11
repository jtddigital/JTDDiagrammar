# JTDDiagrammar

Diagrams as structured text. Write JSON and get SVG back, from an API or a web app. You can also let Claude draft the diagram from a document.

The main target is the **cross-functional flowchart** (lanes × phases, as in Visio). The engine is built for multiple diagram types: each type is a plugin, and everything downstream of the plugin is type-agnostic.

## Status

| Phase | Scope | State |
|-------|-------|-------|
| P0 | Monorepo, CI, type registry, Graph IR, schemas, validation, README pipeline | **Done** |
| P1 | Flowchart layout + SVG rendering, README images | **Done** |
| P2 | Cross-functional layout (lanes × phases) | **Done** |
| P3 | REST API + web app (editor, live preview, SVG export) | **Done** |
| P4 | AI generation from documents (Claude) | **Done** |
| P5 | State diagrams (composite states) | **Done** |
| P6 | Layout quality, styling and themes | **Done** |
| P7 | Extras (see URS Should/Could items) | Next |

Today you can write **state diagrams** (with composite states) and flowcharts, including **cross-functional flowcharts** (lanes × phases, `LR` or `TB`), in a web editor with live preview and SVG export, or render them through the REST API. You can also have Claude draft one from documents or notes. Layouts avoid running edges through nodes and keep labels off nodes and each other; colours and a dark theme are available.

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

### State diagram

`type: state` · States, pseudostates and transitions labelled `event [guard] / action`.

![State diagram](docs/img/state-basic.svg)

<details><summary>Source</summary>

```json
{
  "version": "1",
  "type": "state",
  "title": "Support ticket",
  "states": [
    {
      "id": "start",
      "kind": "initial"
    },
    {
      "id": "open",
      "label": "Open"
    },
    {
      "id": "progress",
      "label": "In progress"
    },
    {
      "id": "waiting",
      "label": "Waiting on customer"
    },
    {
      "id": "closed",
      "label": "Closed"
    },
    {
      "id": "end",
      "kind": "final"
    }
  ],
  "transitions": [
    {
      "from": "start",
      "to": "open"
    },
    {
      "from": "open",
      "to": "progress",
      "event": "assign"
    },
    {
      "from": "progress",
      "to": "waiting",
      "event": "ask",
      "action": "notify customer"
    },
    {
      "from": "waiting",
      "to": "progress",
      "event": "reply"
    },
    {
      "from": "progress",
      "to": "closed",
      "event": "resolve",
      "guard": "fix verified"
    },
    {
      "from": "closed",
      "to": "end"
    }
  ]
}
```

</details>

### Composite state diagram

`type: state` · Nested states, a transition out of an inner state, and a self-transition.

![Composite state diagram](docs/img/state-composite.svg)

<details><summary>Source</summary>

```json
{
  "version": "1",
  "type": "state",
  "title": "Media player",
  "states": [
    {
      "id": "init",
      "kind": "initial"
    },
    {
      "id": "stopped",
      "label": "Stopped"
    },
    {
      "id": "active",
      "label": "Active",
      "states": [
        {
          "id": "a0",
          "kind": "initial"
        },
        {
          "id": "playing",
          "label": "Playing"
        },
        {
          "id": "paused",
          "label": "Paused"
        }
      ]
    },
    {
      "id": "error",
      "label": "Error"
    }
  ],
  "transitions": [
    {
      "from": "init",
      "to": "stopped"
    },
    {
      "from": "stopped",
      "to": "active",
      "event": "play"
    },
    {
      "from": "a0",
      "to": "playing"
    },
    {
      "from": "playing",
      "to": "paused",
      "event": "pause"
    },
    {
      "from": "paused",
      "to": "playing",
      "event": "resume"
    },
    {
      "from": "playing",
      "to": "playing",
      "event": "tick",
      "action": "advance"
    },
    {
      "from": "active",
      "to": "stopped",
      "event": "stop"
    },
    {
      "from": "playing",
      "to": "error",
      "event": "decode failure"
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
| `theme` | no | `default` or `dark`. |
| `$schema` | no | Optional schema URL for editor tooling. |

### `flowchart`

| Field | Description |
|-------|-------------|
| `direction` | `LR` (default) or `TB`. |
| `lanes[]` | `{ id, label, style? }`. Present → cross-functional flowchart. A lane's `style.fill` colours its header. |
| `phases[]` | `{ id, label, style? }`. Requires `lanes`. |
| `nodes[]` | `{ id, shape?, label?, lane?, phase?, order?, style? }`. `shape` is one of `process` (default), `decision`, `terminator`, `document`, `data`, `subprocess`, `connector`. `label` defaults to `id`. `order` is a hint: nodes in the same column and lane are placed in ascending `order`. |
| `edges[]` | `{ from, to, label?, id?, style? }` |

Ids match `^[A-Za-z_][A-Za-z0-9_.-]*$`. With lanes present, every node needs a `lane`. With phases present, every node also needs a `phase`.

### `state`

| Field | Description |
|-------|-------------|
| `direction` | `LR` (default) or `TB`. |
| `states[]` | `{ id, kind?, label?, states?, style? }`. `kind` is `state` (default), `initial`, `final` or `choice`. A `state` with nested `states` is a composite state; nesting can go any depth. `label` defaults to the id for ordinary states; pseudostates draw no label. |
| `transitions[]` | `{ from, to, event?, guard?, action?, id?, style? }`, drawn as `event [guard] / action`. Endpoints can be any state, including a composite state or a state inside one. |

Rules: at most one `initial` per region (the top level or a composite), with no incoming transitions; `final` states have no outgoing transitions; pseudostates cannot contain states. Ids are unique across all levels.

### Styling

Any node, edge, lane, phase, state or transition can take a `style`:

```json
{ "fill": "#dcfce7", "stroke": "#14532d", "text": "#14532d", "dash": "dashed" }
```

Colours are hex (`#rgb` or `#rrggbb`); `dash` is `solid`, `dashed` or `dotted`. On edges, `stroke` also colours the arrowhead. Set `"theme": "dark"` on the diagram for the dark palette; styles override either theme.

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

Build the web app and start the API, which also serves the web app, at http://localhost:8080:

```bash
pnpm --filter @jtd/web build
```

```bash
pnpm dev:api
```

For web development with hot reload (Vite, http://localhost:5173), run this alongside the API:

```bash
pnpm dev:web
```

Or run everything in one container:

```bash
docker build -t jtd .
```

```bash
docker run -p 8080:8080 jtd
```

Configuration is through environment variables; see [`.env.example`](.env.example).

### Web app

![Web app: JSON editor with inline diagnostics, live SVG preview, export](docs/img/web-app.png)

Edit JSON on the left, and the preview updates as you type. Errors are underlined in the editor and listed below it, with their JSON Pointer. The preview keeps the last valid diagram until the errors are fixed. **Export SVG** downloads exactly what the API would return for the same source. The example picker loads every registered example. Rendering happens in the browser with the same core library the API uses.

### Library

```ts
import { createRegistry, parseJson, render } from '@jtd/core';

const { value } = parseJson(text);
const { svg, diagnostics } = render(value, createRegistry()); // svg is undefined if there are errors
```

Output is standalone SVG 1.1. Text uses `Arial, Liberation Sans, Helvetica, sans-serif`; the first two have identical metrics, so text fits its boxes without embedding a font. Elements carry ids and classes for styling and scripting: `n-<id>` / `jtd-node jtd-shape-<shape>` for nodes, and `e-<id>` / `jtd-edge` for edges.

## API

| Method | Path | Returns |
|--------|------|---------|
| POST | `/v1/render` | `image/svg+xml`, or `{ svg, diagnostics }` with `Accept: application/json` |
| POST | `/v1/validate` | `{ valid, diagnostics }` |
| GET | `/v1/types` | Registered diagram types and their examples |
| GET | `/v1/schema`, `/v1/schema/{type}` | JSON Schema (2020-12), combined or per type |
| POST | `/v1/generate` | Diagram source generated by Claude from text and/or documents (see [AI generation](#ai-generation)) |
| GET | `/v1/ai` | `{ enabled, model? }`: whether AI generation is configured |
| GET | `/v1/openapi.json` | OpenAPI 3.1, generated from the route table |
| GET | `/health` | `{ status: "ok" }` |

```bash
curl -X POST localhost:8080/v1/render -H 'content-type: application/json' --data @diagram.json -o diagram.svg
```

Errors come back as `{ diagnostics: [...] }` (shape as in [Diagnostics](#diagnostics)):

| Status | When |
|--------|------|
| 400 | Invalid JSON or invalid diagram |
| 413 | Body over `BODY_LIMIT`, or more than `MAX_NODES` / `MAX_EDGES` |
| 415 | Body is not `application/json` |
| 422 | Rendering took longer than `RENDER_TIMEOUT_MS`, so the render was stopped |

Rendering runs in worker threads, so one slow diagram can't stall the server. Request bodies are never logged. SVG responses carry `Content-Security-Policy: default-src 'none'`.

## AI generation

Give it a process description, meeting notes or a procedure, as pasted text or as PDF, DOCX, HTML, TXT or MD files. Claude drafts the diagram source, and you review and edit it like anything else.

![Generate panel: paste text or attach documents, pick a type or auto-detect](docs/img/web-generate.png)

```bash
curl -X POST localhost:8080/v1/generate -F type=auto -F files=@procedure.pdf -F 'text=Focus on the approval steps'
```

The response is `{ type, reason?, source, valid, diagnostics, attempts, usage, svg? }`.

**How it stays correct:**
1. Claude's reply is constrained to the diagram type's generation schema (structured outputs).
2. The reply then passes the **same validation as hand-written source**: schema, references, lanes and phases, and a real layout.
3. If anything fails, the diagnostics go back to Claude for correction, up to `AI_MAX_REPAIRS` times (default 2).
4. If it still fails, you get the best attempt with `valid: false` and its diagnostics. A failed attempt is never presented as valid.

**Setup:**
- Set `ANTHROPIC_API_KEY` on the server. Without it, generation returns `503` and the web panel says it's unavailable.
- The default model is `claude-opus-5-5` (`AI_MODEL`), at effort `high` (`AI_EFFORT`).
- Server-side refusal fallbacks are on; set `AI_FALLBACKS=off` to disable them.
- Limits on file count, file size, total size and input tokens are in [`.env.example`](.env.example). Input is checked with token counting *before* any generation spend.

**Safety:**
- The key is read only by the SDK on the server. The browser never sees it, and lint rules stop the web app from importing AI code.
- Uploaded material is treated as data. It's wrapped and can't close its own wrapper, Claude gets no tools, and the server fixes the type and schema. Any text that ends up in the diagram is escaped when rendered.
- Material and results are not logged or stored.
- Closing the request (or **Cancel** in the web app) aborts the Claude call.

**Status:** CI tests generation end to end against a deterministic mock, never the live API. `pnpm ai:live` runs three real cases (cross-functional, plain, prompt injection) with pass/fail checks; its first run (2026-11-11, `claude-opus-5-5`) passed all three, each valid on the first attempt, with the cached prefix read on repeat calls. A full accuracy evaluation with reference diagrams (URS-AI-018) is still to do.

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
packages/ai/src    Claude client (SDK + mock), ingest, prompts, generate + repair loop
packages/api/src   Fastify server: route table → routes + OpenAPI, worker-thread render pool
packages/web/src   Vite + React + CodeMirror: editor, live preview, export
scripts/docs/   README generation + checks
scripts/fonts/  font metrics generator
```

Pipeline: `parse → envelope → type schema → type rules + IR + common rules → layout engine → geometry → SVG`.

Enforced boundaries (lint + tests):
- `core` has no DOM and no Node built-ins, so it runs in the browser and on the server.
- `layout/` and `render/` never import diagram types.
- Only `packages/ai` imports the Anthropic SDK, and the web app never imports AI code.

Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Requirements: [docs/URS.md](docs/URS.md).

## Development

| Script | Does |
|--------|------|
| `pnpm check` | lint + typecheck + tests + docs check (what CI runs) |
| `pnpm test` | Vitest (unit, layout invariants, golden SVGs) |
| `pnpm test -u` | Accept changed golden SVGs. Review the diff first. |
| `pnpm e2e` | Playwright tests: built web app against the real API |
| `pnpm docs:build` | Regenerate README examples and `docs/img/*.svg` |
| `pnpm docs:screens` | Regenerate web app screenshots (`docs/img/*.png`) |
| `pnpm quality` | Layout quality table (crossings, overlaps, label collisions, timing) over all fixtures; `--update` lowers the baseline that CI enforces |
| `pnpm ai:live` | Live check of AI generation against the real API. Needs `ANTHROPIC_API_KEY`, costs a few cents, never runs in CI; outputs go to `.live/` |
| `pnpm fonts:metrics` | Regenerate `measure/font-metrics.ts` from Liberation Sans |

Every change cites URS IDs and includes an impact assessment in the commit body ([URS §5](docs/URS.md)).

### Adding a diagram type

1. Create `packages/core/src/diagrams/<type>/` with a schema (unique `$id`), model, `toIR`, optional `validate`, ≥ 1 example, and AI assets: a generation schema in the structured-outputs subset, `fromGenerated`, a guide and few-shot examples.
2. Register it in `packages/core/src/builtins.ts`.
3. Run `pnpm docs:build`.

Nothing else changes. The test-only `checklist` type (`packages/core/test/fixture-type.ts`) proves it.

## Licence

[MIT](LICENSE). Font metrics are derived from Liberation Sans (SIL Open Font License 1.1); no font files are distributed.
