# User Requirements Specification (URS) — JTDDiagrammar

| Field   | Value |
|---------|-------|
| Version | 0.8.2 (draft) |
| Status  | Planning |
| Owner   | Product |

## 1. Purpose
A multi-type diagram language. Users define diagrams (flowcharts, cross-functional flowcharts, state diagrams, more later) in structured text and render them to SVG through an API and a web app. An AI component (Claude) generates validated diagram source from documents and unstructured text. The first priority is the cross-functional flowchart (swimlanes × phases, Visio-style), but no part of the system other than its type plugin may assume it.

## 2. Conventions
- **ID**: `URS-<AREA>-<NNN>`. IDs are never reused or renumbered; retired items are marked `Withdrawn`.
- **Priority** (MoSCoW): M = Must, S = Should, C = Could, W = Won't (this release).
- **Verify**: T = automated test, I = inspection, D = demonstration.
- **Status**: Proposed → Accepted → Partial (some acceptance criteria met; see matrix) → Implemented → Verified (automated test passes) — or Withdrawn.

## 3. Requirements

### 3.1 Extensibility (EXT)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-EXT-001 | M | Each diagram type is a plugin that implements one `DiagramType` interface and is registered in core. | Registry lists all built-in types. | T | Verified |
| URS-EXT-002 | M | Adding a type requires no change to adapters, API, web app or SVG renderer. | A test-only fixture type renders through the API and the web app. | T | Partial |
| URS-EXT-003 | M | Every source declares `type`. A missing or unknown type returns a diagnostic that lists the registered types. | Test. | T | Verified |
| URS-EXT-004 | M | Types compile to a shared Graph IR (nodes, edges, containers, partitions). Layout and rendering consume only the IR and the geometry built from it. | Lint rule: `layout/` and `render/` never import from `diagrams/`. | T | Verified |
| URS-EXT-005 | M | Layout engines are pluggable and each type selects one. v1 ships `layered`. | Engine registry test. | T | Verified |
| URS-EXT-006 | M | Each type ships its own JSON Schema. The combined schema dispatches on `type`. | Ajv validates per-type fixtures through the combined schema. | T | Verified |
| URS-EXT-007 | M | Each type can add semantic validation rules through a hook. | Hook test. | T | Verified |
| URS-EXT-008 | C | Diagram types can be registered from outside the repo as separate packages. | — | T | Proposed |
| URS-EXT-009 | M | Each type also ships its AI generation assets: a generation schema, guidance text, examples and a converter from generated output to authoring source (URS-AI-004). Adding a type requires no change to the `ai` package. | The test-only fixture type generates through a mock client. | T | Verified |
| URS-EXT-010 | M | Each type ships a README example (source + rendered image) (URS-DOC-002). | CI check (URS-DOC-004). | T | Verified |

### 3.2 Diagram Types (TYP)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-TYP-001 | M | `flowchart`: nodes (`process`, `decision`, `terminator`, `document`, `data`, `subprocess`, `connector`) and directed edges. | Each shape has a snapshot. | T | Verified |
| URS-TYP-002 | M | Cross-functional flowchart = `flowchart` with `lanes` and optional `phases` (URS-DM-001/002). It is not a separate type. | Same nodes render both with and without lanes. | T | Verified |
| URS-TYP-003 | S | `state`: states, pseudostates (`initial`, `final`, `choice`), and transitions labelled `event [guard] / action`. | Snapshot. | T | Proposed |
| URS-TYP-004 | S | `state`: composite (nested) states. | Snapshot. | T | Proposed |
| URS-TYP-005 | S | `state`: self-transitions. | Snapshot. | T | Proposed |
| URS-TYP-006 | C | Further types (sequence, ER, org chart), each as a plugin. | — | T | Proposed |

### 3.3 Input / Language (IN)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-IN-001 | M | Diagrams are defined in JSON that conforms to the published JSON Schema. | A valid sample passes Ajv; invalid samples fail. | T | Verified |
| URS-IN-002 | M | Every source declares a schema `version`. Breaking changes bump the major version. | An unknown major version gives an explicit error. | T | Verified |
| URS-IN-003 | M | Each type picks the source structure that fits it best (flat ID references for flowcharts, nesting for composite states). Every structure compiles to the same IR. | I | I | Partial |
| URS-IN-004 | M | Validation reports **all** errors, each with a JSON Pointer path and a message. | A doc with 3 errors yields 3 diagnostics. | T | Verified |
| URS-IN-005 | M | Common semantic validation: unique IDs and no dangling references. | Each rule has a failing test. | T | Verified |
| URS-IN-006 | S | XML input via an adapter that maps to the identical source model. | JSON and XML equivalents render byte-identical SVG. | T | Proposed |
| URS-IN-007 | C | YAML input via an adapter. | As URS-IN-006. | T | Proposed |
| URS-IN-008 | C | A short text language that compiles to the same model. | As URS-IN-006. | T | Proposed |

### 3.4 Common Model (DM) — available to any type that opts in
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-DM-001 | M | Partitions: **lanes**, ordered and labelled bands. Each type opts in. | Lanes render in source order. | T | Verified |
| URS-DM-002 | M | Partitions: **phases**, bands perpendicular to lanes. Optional. | Renders both with and without phases. | T | Verified |
| URS-DM-003 | M | `direction`: `LR` or `TB` for every type. With partitions, lanes run along the flow direction. | Same model renders in both directions. | T | Verified |
| URS-DM-004 | M | Shared shape library (a registry). Each type declares which shapes it allows. | A disallowed shape gives a diagnostic. | T | Verified |
| URS-DM-005 | M | With partitions, each node belongs to exactly one lane, and to exactly one phase when phases exist. | A missing or invalid reference gives a diagnostic. | T | Verified |
| URS-DM-006 | M | Directed edges with an optional label. | The label renders on the edge. | T | Verified |
| URS-DM-007 | S | Multi-line labels, with auto-wrap at a configurable maximum node width. | `\n` and long text both wrap. | T | Verified |
| URS-DM-008 | S | An optional `order` hint on a node overrides automatic ordering. | The hint is respected. | T | Proposed |
| URS-DM-009 | S | Optional edge port hints (`fromSide` / `toSide`). | Ports are respected. | T | Proposed |
| URS-DM-010 | S | Styling: a theme plus overrides per lane, node and edge (fill, stroke, font, dash). | Overrides are applied. | T | Proposed |
| URS-DM-011 | C | Nested sub-lanes. | — | T | Proposed |
| URS-DM-012 | C | Free annotations and notes attached to nodes. | — | T | Proposed |
| URS-DM-013 | S | Containers: nestable groups with labels (used by composite states and flowchart groups). | Snapshot. | T | Proposed |

### 3.5 Layout (LY)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-LY-001 | M | Deterministic: identical input gives byte-identical SVG. | Repeated renders have equal hashes. | T | Verified |
| URS-LY-002 | M | Nodes never overlap. With partitions, each node stays inside its lane × phase cell. With containers, each node stays inside its container. | Geometry assertions over fixtures. | T | Verified |
| URS-LY-003 | M | With partitions, lanes span all phases, phases span all lanes, and band sizes fit their content. | Geometry assertion. | T | Verified |
| URS-LY-004 | M | Nodes are ordered along the flow axis by edge direction. Cycles are tolerated (back-edges). | A cyclic fixture renders. | T | Verified |
| URS-LY-005 | M | Orthogonal (right-angle) edge routing. | All segments are horizontal or vertical. | T | Verified |
| URS-LY-006 | S | Edges do not pass through nodes. | Segment/box intersection test. | T | Proposed |
| URS-LY-007 | S | Edge crossings and bends are minimised (heuristic). | Crossing count ≤ baseline on fixtures. | T | Partial |
| URS-LY-008 | S | Edge labels do not overlap nodes. | Box intersection test. | T | Proposed |
| URS-LY-009 | M | Text measurement is identical in Node and the browser (bundled font metrics, no DOM). | Same widths in both runtimes. | T | Verified |
| URS-LY-010 | S | 200 nodes / 300 edges laid out in < 500 ms on the server. | Benchmark in CI. | T | Verified |
| URS-LY-011 | S | Self-loop edges are routed without overlapping their node. | Geometry assertion. | T | Partial |
| URS-LY-012 | S | Compound layout: containers are sized to their children, and edges may cross container boundaries. | Geometry assertion. | T | Proposed |

### 3.6 Rendering (RN)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-RN-001 | M | Output is standalone, valid SVG 1.1. | Opens in Chrome, Firefox and Inkscape; passes a validator. | T/D | Partial |
| URS-RN-002 | M | Partition header bands and container labels render (Visio CFF style). | Snapshot. | T | Verified |
| URS-RN-003 | M | Edge end markers (arrowheads; others via the registry). | Snapshot. | T | Verified |
| URS-RN-004 | M | All user text is XML-escaped; no script or foreignObject is emitted. | Injection fixtures are escaped. | T | Verified |
| URS-RN-005 | S | SVG elements carry `id`/`class` values derived from model IDs and the diagram type. | Selector test. | T | Verified |
| URS-RN-006 | S | Font is embedded, or a safe fallback stack is used, so the file renders standalone. | D | D | Implemented |
| URS-RN-007 | C | PNG / PDF export. | — | T | Proposed |
| URS-RN-008 | C | Visio (.vsdx) export/import. | — | T | Proposed |

### 3.7 API (API)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-API-001 | M | REST over HTTP, versioned under `/v1`. | — | I | Verified |
| URS-API-002 | M | `POST /v1/render` returns `image/svg+xml` for any registered type. | Integration test per type. | T | Verified |
| URS-API-003 | M | `POST /v1/validate` returns diagnostics JSON. | Integration test. | T | Verified |
| URS-API-004 | M | `GET /v1/schema` returns the combined schema; `GET /v1/schema/{type}` returns one type's schema. | Integration test. | T | Verified |
| URS-API-005 | M | Invalid input returns `400` with diagnostics; oversize input returns `413`. | Integration test. | T | Verified |
| URS-API-006 | M | Limits on body size, node/edge count and render time. | Limit tests. | T | Verified |
| URS-API-007 | S | Input format is chosen by `Content-Type` (JSON; XML once URS-IN-006 lands). | Integration test. | T | Partial |
| URS-API-008 | S | An OpenAPI document is published. | `GET /v1/openapi.json`. | T | Verified |
| URS-API-009 | S | `GET /health`. | Returns 200. | T | Verified |
| URS-API-010 | C | `GET /v1/render?src=<base64url>` for `<img>` embedding. | Integration test. | T | Proposed |
| URS-API-011 | M | `GET /v1/types` lists the registered types with their descriptions. | Integration test. | T | Verified |
| URS-API-012 | M | `POST /v1/generate` (multipart: `files[]`, `text`, `type` or `auto`, options) returns `{ source, valid, diagnostics, attempts, usage }`, plus `svg` when valid. | Integration test with a mock client. | T | Verified |
| URS-API-013 | S | `POST /v1/refine` (`{ source, instruction }`) returns the same shape as URS-API-012. | Integration test with a mock client. | T | Proposed |
| URS-API-014 | S | `generate` and `refine` stream progress as SSE when called with `Accept: text/event-stream` (URS-AI-015). | Integration test. | T | Proposed |
| URS-API-015 | M | With no AI credentials configured, the AI endpoints return `503`; every other endpoint keeps working. | Integration test. | T | Verified |
| URS-API-016 | S | `GET /v1/ai` reports whether AI generation is available, so clients can hide it when it isn't. | Integration test. | T | Verified |

### 3.8 Web App (WEB)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-WEB-001 | M | Source editor with syntax highlighting. | D | D | Verified |
| URS-WEB-002 | M | Live preview with debounced re-render on edit. The last good render is kept when there is an error. | E2E test. | T | Verified |
| URS-WEB-003 | M | Export SVG download, byte-identical to the API output for the same input. | E2E hash comparison. | T | Verified |
| URS-WEB-004 | M | Diagnostics shown inline at their source location. | E2E test. | T | Verified |
| URS-WEB-005 | S | Schema-aware autocomplete. | D | D | Proposed |
| URS-WEB-006 | S | Pan and zoom in the preview. | D | D | Proposed |
| URS-WEB-007 | S | Built-in example templates for each type. | D | D | Verified |
| URS-WEB-008 | C | Persist to localStorage; shareable URL. | E2E test. | T | Proposed |
| URS-WEB-009 | C | Clicking a node in the preview jumps to its source. | E2E test. | T | Proposed |
| URS-WEB-010 | M | Editor validation and autocomplete follow the document's `type`, with no type-specific code in the web app. | E2E test with two types. | T | Partial |
| URS-WEB-011 | M | Generate panel: paste text or drop files, pick a type or `auto`, then generate. The result loads into the editor (editable) with its diagnostics. | E2E test with a mock API. | T | Verified |
| URS-WEB-012 | S | Generation shows staged progress and can be cancelled. | E2E test. | T | Partial |
| URS-WEB-013 | S | Refine box: a natural-language instruction applied to the current source. | E2E test. | T | Proposed |
| URS-WEB-014 | S | Hovering a node shows its provenance quote (URS-AI-014). | E2E test. | T | Proposed |

### 3.9 AI Generation (AI)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-AI-001 | M | Generate diagram source from pasted text and from uploaded documents (PDF, DOCX, TXT, MD, HTML). | One fixture per format. | T | Verified |
| URS-AI-002 | M | Claude is called through the official Anthropic TypeScript SDK. The model is configurable (default `claude-opus-5-5`), and so is effort. | Config test. | T | Verified |
| URS-AI-003 | M | Output is constrained with structured outputs (`output_config.format`) using the type's generation schema. | Request includes the format; mock asserts it. | T | Verified |
| URS-AI-004 | M | Generation schemas use only the JSON Schema subset that structured outputs support: no recursion, no numeric or length constraints, and `additionalProperties: false` on every object. Each type converts generated output to its authoring source deterministically, e.g. flat `parent` refs into nested composite states. | A lint test checks each generation schema against the supported subset. A property test confirms that any schema-valid generation output converts to an authoring-valid source shape. | T | Verified |
| URS-AI-005 | M | Every generated source passes the full pipeline: authoring schema (Ajv), common and type semantic rules, and a successful layout. Nothing that fails is returned as `valid: true`. | Mock returns invalid output and the response has `valid: false`. | T | Verified |
| URS-AI-006 | M | Repair loop: when validation fails, the diagnostics go back to Claude for correction, up to N retries (default 2). A final failure returns the best attempt, its diagnostics and `valid: false`. | Mock: invalid → valid on retry 1; invalid ×3 → `valid: false`. | T | Verified |
| URS-AI-007 | M | The caller sets `type`, or `auto` lets the model choose from the registered types and return its reason. | Mock test for both. | T | Verified |
| URS-AI-008 | M | Stop reasons are handled: `refusal` (with server-side fallbacks enabled) and `max_tokens` (truncation counts as a failure and is never parsed as success). Each surfaces as a distinct error code. | Mock test per stop reason. | T | Verified |
| URS-AI-009 | M | Input limits on file size, file count and pages (PDF ≤ 600 pages, request ≤ 32 MB), plus a token pre-check with `count_tokens`. Over-limit input returns `413` with the reason. No silent truncation. | Limit tests. | T | Partial |
| URS-AI-010 | M | The Anthropic API key exists only on the server. It is never sent to the browser and never logged. | Log scrub test; bundle grep in CI. | T | Verified |
| URS-AI-011 | M | Input documents are untrusted data. The model gets no tools, and the requested type and schema are fixed by the server, so instructions inside a document cannot change them. The output is data only and is escaped at render time (URS-RN-004). | Injection fixtures produce schema-valid, escaped output. | T | Verified |
| URS-AI-012 | M | Input documents and generated output are not persisted or logged by default. Retention is configurable. | Inspection plus log test. | T/I | Implemented |
| URS-AI-013 | S | Refine: modify an existing source from a natural-language instruction. The result goes through URS-AI-005/006. | Mock test. | T | Proposed |
| URS-AI-014 | S | Provenance: generated nodes and edges may carry a `source` quote from the input. This is a schema field, because the Citations API cannot be combined with structured outputs. | Fixture test. | T | Proposed |
| URS-AI-015 | S | Staged progress events: ingest → generate → validate → repair → render. | Event-order test. | T | Proposed |
| URS-AI-016 | S | Prompt caching: the stable prefix (system prompt, type guidance, examples) is cached and kept free of volatile data. | Live check: `cache_read_input_tokens > 0` on a repeat call. | T | Verified |
| URS-AI-017 | S | Usage reported per request: input/output tokens, cache reads, attempts and estimated cost. | Mock test. | T | Partial |
| URS-AI-018 | S | Evaluation suite: a corpus of input documents with reference diagrams. Metrics: valid on first try, valid after repairs, node/edge recall, lane-assignment accuracy. It runs on demand (it costs money), not on every CI run. | Report produced. | D | Partial |
| URS-AI-019 | S | Rate limits per client and a token budget per request. | Limit test. | T | Proposed |
| URS-AI-020 | M | The Claude client sits behind an interface with a deterministic mock. CI never calls the live API. | CI has no key; tests pass. | T | Verified |
| URS-AI-021 | C | Image input (whiteboard photos, screenshots of existing diagrams). | — | T | Proposed |
| URS-AI-022 | C | Bulk generation via the Message Batches API. | — | T | Proposed |

### 3.10 Documentation (DOC)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-DOC-001 | M | The README covers purpose, features, quick start (install, run the API, run the web app), API reference with `curl` examples, language reference per type, AI generation usage and configuration, an architecture overview, the development workflow (URS process) and the licence. | Inspection checklist. | I | Verified |
| URS-DOC-002 | M | The README shows a rendered example of **every** registered diagram type (flowchart, cross-functional, state, …) next to its source. | CI check (URS-DOC-004). | T | Verified |
| URS-DOC-003 | M | README images are generated by a script (`pnpm docs:images`) from `fixtures/`: diagrams as SVG from core, the web app as PNG via Playwright. None are made by hand. | The script reproduces the committed files. | T | Verified |
| URS-DOC-004 | M | CI fails if README images differ from the current renderer output, or if a registered type has no README example. | CI job. | T | Verified |
| URS-DOC-005 | S | Web app screenshots of the editor with preview and of the AI generate panel. | Present in the README. | I | Verified |
| URS-DOC-006 | S | The per-type language reference (field tables) is generated from the authoring schemas. | The script reproduces the committed files. | T | Proposed |

### 3.11 Non-Functional (NF)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-NF-001 | M | Modular: `core` is pure and isomorphic (no DOM, no Node APIs); `api` and `web` consume it. | Lint rule bans those imports. | T | Verified |
| URS-NF-002 | M | TypeScript `strict`. | `tsc` runs in CI. | T | Verified |
| URS-NF-003 | M | Unit tests per module plus golden SVG snapshots; CI runs on every push. | CI is green. | T | Verified |
| URS-NF-004 | M | Every change cites URS IDs and records an impact assessment (§5). | Commit/PR inspection. | I | Implemented |
| URS-NF-005 | S | ≥ 80 % line coverage on `core`. | CI gate. | T | Proposed |
| URS-NF-006 | S | A container image serves the API and the static web app. | `docker run` serves both. | D | Verified |
| URS-NF-007 | S | Only permissively licensed dependencies (MIT/Apache/BSD/ISC/OFL). | License check in CI. | T | Proposed |
| URS-NF-008 | M | Secrets come from environment variables only. No secrets in the repo; `.env.example` documents each variable. | Secret scan in CI. | T | Verified |
| URS-NF-009 | M | AI code lives in a separate `ai` package (Node only). `core` never depends on the Anthropic SDK. | Lint rule. | T | Verified |

## 4. Traceability Matrix
Updated with each change. `—` = not started.

| URS ID | Module(s) | Test(s) | Note |
|--------|-----------|---------|------|
| EXT-001, EXT-005 | core/src/registry/ | core/test/registry.test.ts | |
| EXT-002 | core/src/compile.ts, api/src/config.ts (registryModule) | core/test/extensibility.test.ts, api/test/api.test.ts | Core and API verified with the fixture type; the web app uses built-ins only. |
| EXT-003, IN-002 | core/src/validate/envelope.ts | core/test/envelope.test.ts | |
| EXT-004, NF-001, NF-009 | eslint.config.js, core/tsconfig.json (no DOM/Node types) | test/boundaries.test.ts | |
| EXT-006 | core/src/schema/combined.ts | core/test/extensibility.test.ts | |
| EXT-007 | core/src/diagrams/flowchart/validate.ts | core/test/flowchart.test.ts | |
| EXT-010 | core/src/registry/diagram-type.ts (`examples` required) | scripts/docs/readme.test.ts | |
| IN-001, IN-004 | core/src/validate/schema.ts, core/src/adapters/json.ts | core/test/schema.test.ts, core/test/json.test.ts | Semantic rules run only once the schema passes. |
| IN-003 | core/src/diagrams/flowchart/ | core/test/flowchart.test.ts | Flowchart only so far. |
| IN-005, DM-005 | core/src/validate/common.ts | core/test/common.test.ts | Pointer targets the element, not the field. |
| DM-001, DM-002, TYP-002, LY-003 | core/src/layout/layered/{layering,order,place,main-axis,bands}.ts | core/test/layout.test.ts (partitions: *, URS-TYP-002) | |
| RN-002 | core/src/render/svg/bands.ts | core/test/render.test.ts, golden/cff-* | |
| NF-002 | tsconfig.base.json | `pnpm typecheck` | |
| NF-004 | CLAUDE.md, commit bodies | — | Inspection. |
| TYP-001, DM-004 | core/src/shapes/, core/src/diagrams/flowchart/ | core/test/shapes.test.ts, golden/shapes | |
| DM-003, LY-004 | core/src/layout/flow.ts, layout/layered/{cycles,rank}.ts | core/test/layout.test.ts | |
| DM-006, DM-007 | core/src/measure/text.ts, layout/layered/route.ts | core/test/measure.test.ts, golden/text | |
| LY-001 | core/src/num.ts (stable formatting); no randomness | core/test/layout.test.ts | |
| LY-002 | core/src/layout/pack.ts, layered/place.ts | core/test/layout.test.ts, pack.test.ts | No overlaps; nodes inside their lane × phase cell, clear of headers. |
| LY-005 | core/src/layout/layered/route.ts | core/test/layout.test.ts | |
| LY-007 | core/src/layout/layered/order.ts | — | Barycenter heuristic; no crossing baseline yet (P6). |
| LY-009 | scripts/fonts/metrics.ts → core/src/measure/font-metrics.ts | core/test/measure.test.ts | Automated in the browser: web/e2e/app.spec.ts (CI `e2e` job). |
| LY-011 | core/src/layout/layered/route.ts (self-loops) | golden/cycle | Basic; no dedicated assertion. |
| RN-001 | core/src/render/svg/ | core/test/render.test.ts | Well-formed, allowed elements; Chromium render. No DTD/Inkscape check yet. |
| RN-003..005 | core/src/render/svg/{index,escape,text}.ts | core/test/render.test.ts, golden/* | |
| RN-006 | core/src/measure/font-metrics.ts (Arial-compatible stack) | — | Fallback stack, no embedding. |
| NF-003 | vitest + golden SVGs + CI | core/test/golden.test.ts | CI green on P0. |
| DOC-002..004 | scripts/docs/, docs/img/ | scripts/docs/readme.test.ts, `pnpm docs:check` | |
| NF-008 | .env.example, CI `secrets` job | CI | Green on P0. |
| API-001..006, API-009, API-011 | packages/api/src/{app,pool,render-worker,errors}.ts, routes/*.ts | packages/api/test/api.test.ts | Real worker threads; timeout kill and recovery tested. |
| API-007 | packages/api/src/app.ts (JSON only) | api.test.ts (415) | XML awaits URS-IN-006. |
| API-008 | packages/api/src/openapi.ts (derived from route table) | api.test.ts | |
| WEB-001..004, WEB-007 | packages/web/src/** | packages/web/e2e/app.spec.ts, web/test/locate.test.ts | Includes regression test for stale export during debounce. |
| WEB-010 | packages/web/src (no type-specific code) | e2e (all examples) | Second type arrives in P5; then E2E with two types. |
| LY-010 | packages/core (math.ts: no spread min/max) | core/test/scale.test.ts | 200/300 in ~110 ms. 1000/2000 random graph ~2.4 s. |
| NF-006 | Dockerfile, CI `docker` job | CI | Image built and served in CI (P3 run green). |
| EXT-009, AI-004 | core/src/registry/diagram-type.ts (AiAssets), core/src/diagrams/flowchart/ai.ts | core/test/ai-assets.test.ts | Subset lint plus a 300-sample property test: only `pattern` errors survive conversion. |
| AI-001, AI-009 | packages/ai/src/ingest/files.ts, generate.ts (count_tokens) | ai/test/ingest.test.ts, generate.test.ts | PDF page count not checked; the API's own limit applies. |
| AI-002, AI-003, AI-008, AI-016 | packages/ai/src/anthropic.ts | ai/test/anthropic.test.ts (stubbed SDK) | AI-016: cache_control on a byte-stable system prompt. Live run 2026-11-11: first call wrote 1827 cached tokens, the next two read 1827 each. |
| AI-005..007 | packages/ai/src/generate.ts, prompt.ts | ai/test/generate.test.ts, api/test/generate.test.ts | |
| AI-010 | api/src/config.ts (presence only), eslint.config.js | api/test/generate.test.ts, test/boundaries.test.ts | Key read by the SDK only; web cannot import AI code. |
| AI-011 | ingest wrapper, prompt rules, no tools, fixed schema | ai/test/ingest.test.ts, `pnpm ai:live` (prompt injection case) | Structural defences tested. Live run 2026-11-11: injected title and `<script>` node ignored, output schema-valid, SVG has no unescaped script. One live fixture so far. |
| AI-012 | no logging of bodies or material | Inspection | Retention: nothing is stored, so nothing to configure. |
| AI-017 | generate.ts usage totals | ai/test/generate.test.ts | Tokens, cache and attempts reported; no cost estimate yet. |
| AI-020 | packages/ai/src/mock.ts | all AI tests | CI never calls the live API. |
| AI-018 | scripts/ai/{live-check,cases}.ts (`pnpm ai:live`) | scripts/ai/cases.test.ts (checks only) | Smoke subset: 3 cases with pass/fail checks, usage and cache reporting. No reference diagrams or recall metrics yet. Live run 2026-11-11 (claude-opus-5-5, effort high): 3/3 pass, all valid on the first attempt, 5–7 s each. |
| API-012, API-015, API-016 | api/src/routes/generate.ts, errors.ts | api/test/generate.test.ts, web/e2e/generate.spec.ts | |
| WEB-011, WEB-012 | web/src/generate/* | web/e2e/generate.spec.ts | WEB-012: cancel plus a status line; no staged progress. |
| DOC-001, DOC-005 | README.md, web/e2e/screens.spec.ts | `pnpm docs:check` | |

## 5. Change Impact Assessment (required per change)
```
Change:       <summary>
URS impacted: <IDs added / modified / satisfied / at risk>
Modules:      <packages/files>
Risk:         Low | Med | High — <why>
Tests:        <added / updated>
```

## 6. Revision History
| Ver | Date | Change |
|-----|------|--------|
| 0.1 | 2026-11-11 | Initial draft. |
| 0.8.2 | 2026-11-11 | First live run of `pnpm ai:live`: 3/3 pass. AI-011 and AI-016 verified; AI-018 stays partial (no reference corpus or recall metrics). |
| 0.8.1 | 2026-11-11 | AI-018 partial: live-check script (`pnpm ai:live`). |
| 0.8 | 2026-11-11 | P4: AI generation. Added API-016. 18 requirements verified; AI-009, AI-011, AI-016, AI-017 and WEB-012 partial; AI-012 implemented. No live API call yet. |
| 0.7 | 2026-11-11 | P3: REST API and web app. 17 requirements verified; API-007, WEB-010 and DOC-005 partial; NF-006 implemented. Render timeout default 5 s (benchmarked). |
| 0.6 | 2026-11-11 | Cross-functional layout delivered (now P2; API/web renumbered to P3 at the user's request). TYP-002, DM-001/002, LY-002/003, RN-002 verified. |
| 0.5 | 2026-11-11 | P1 implemented: flowchart layout and SVG rendering, README images, MIT licence. Statuses and matrix updated. |
| 0.4 | 2026-11-11 | P0 implemented: statuses and traceability matrix updated. Added the Partial status. |
| 0.3 | 2026-11-11 | Added AI generation (AI-001..022), documentation (DOC-001..006), EXT-009/010, API-012..015, WEB-011..014, NF-008/009. |
| 0.2 | 2026-11-11 | Generalised to multiple diagram types. Added EXT, TYP, DM-013, LY-011/012, API-011, WEB-010. Rescoped IN-003, DM-001..006, LY-002/003, RN-002/003, API-002/004, WEB-007 from cross-functional-only to type-agnostic. |
