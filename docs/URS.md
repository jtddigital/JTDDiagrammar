# User Requirements Specification (URS) — JTDDiagrammar

| Field   | Value |
|---------|-------|
| Version | 0.21 (draft) |
| Status  | Planning |
| Owner   | Product |

## 1. Purpose
A multi-type diagram language. Users define diagrams (flowcharts, cross-functional flowcharts, state diagrams, more later) in structured text and render them to SVG through an API and a web app. An AI component (Claude) generates validated diagram source from documents and unstructured text. The first priority is the cross-functional flowchart (swimlanes × phases, Visio-style), but no part of the system other than its type plugin may assume it.

## 2. Conventions
- **ID**: `URS-<AREA>-<NNN>`. IDs are never reused or renumbered; retired items are marked `Withdrawn`.
- **Priority** (MoSCoW): M = Must, S = Should, C = Could, W = Won't (this release). W items keep their ID and stay `Proposed`; the matrix records why they were deferred.
- **Verify**: T = automated test, I = inspection, D = demonstration.
- **Status**: Proposed → Accepted → Partial (some acceptance criteria met; see matrix) → Implemented → Verified (automated test passes) — or Withdrawn.

### 2.1 Decisions
| ID | Decision | Consequence |
|----|----------|-------------|
| D-001 | **Internal hosting** (2026-11-11): the API and web app run on an internal network for trusted users. | No end-user authentication in this release. AI spend is still guarded by per-client rate limits and per-request token budgets (URS-AI-019, URS-AI-009). Public exposure would need auth first. |

## 3. Requirements

### 3.1 Extensibility (EXT)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-EXT-001 | M | Each diagram type is a plugin that implements one `DiagramType` interface and is registered in core. | Registry lists all built-in types. | T | Verified |
| URS-EXT-002 | M | Adding a type requires no change to adapters, API, web app or SVG renderer. | A test-only fixture type renders through the API and the web app. | T | Verified |
| URS-EXT-003 | M | Every source declares `type`. A missing or unknown type returns a diagnostic that lists the registered types. | Test. | T | Verified |
| URS-EXT-004 | M | Types compile to a shared Graph IR (nodes, edges, containers, partitions). Layout and rendering consume only the IR and the geometry built from it. | Lint rule: `layout/` and `render/` never import from `diagrams/`. | T | Verified |
| URS-EXT-005 | M | Layout engines are pluggable and each type selects one. v1 ships `layered`. | Engine registry test. | T | Verified |
| URS-EXT-006 | M | Each type ships its own JSON Schema. The combined schema dispatches on `type`. | Ajv validates per-type fixtures through the combined schema. | T | Verified |
| URS-EXT-007 | M | Each type can add semantic validation rules through a hook. | Hook test. | T | Verified |
| URS-EXT-008 | C | Diagram types can be registered from outside the repo as separate packages. | `REGISTRY_MODULE` selects the registry in the API and, at build time, in the web app. | T | Verified |
| URS-EXT-009 | M | Each type also ships its AI generation assets: a generation schema, guidance text, examples and a converter from generated output to authoring source (URS-AI-004). Adding a type requires no change to the `ai` package. | The test-only fixture type generates through a mock client. | T | Verified |
| URS-EXT-010 | M | Each type ships a README example (source + rendered image) (URS-DOC-002). | CI check (URS-DOC-004). | T | Verified |

### 3.2 Diagram Types (TYP)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-TYP-001 | M | `flowchart`: nodes (`process`, `decision`, `terminator`, `document`, `data`, `subprocess`, `connector`) and directed edges. | Each shape has a snapshot. | T | Verified |
| URS-TYP-002 | M | Cross-functional flowchart = `flowchart` with `lanes` and optional `phases` (URS-DM-001/002). It is not a separate type. | Same nodes render both with and without lanes. | T | Verified |
| URS-TYP-003 | S | `state`: states, pseudostates (`initial`, `final`, `choice`), and transitions labelled `event [guard] / action`. | Snapshot. | T | Verified |
| URS-TYP-004 | S | `state`: composite (nested) states. | Snapshot. | T | Verified |
| URS-TYP-005 | S | `state`: self-transitions. | Snapshot. | T | Verified |
| URS-TYP-006 | C | Org chart type, as a plugin. | README example; validation and layout tests. | T | Verified |
| URS-TYP-007 | W | Sequence and ER diagram types. | — | T | Proposed |

### 3.3 Input / Language (IN)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-IN-001 | M | Diagrams are defined in JSON that conforms to the published JSON Schema. | A valid sample passes Ajv; invalid samples fail. | T | Verified |
| URS-IN-002 | M | Every source declares a schema `version`. Breaking changes bump the major version. | An unknown major version gives an explicit error. | T | Verified |
| URS-IN-003 | M | Each type picks the source structure that fits it best (flat ID references for flowcharts, nesting for composite states). Every structure compiles to the same IR. | I | I | Verified |
| URS-IN-004 | M | Validation reports **all** errors, each with a JSON Pointer path and a message. | A doc with 3 errors yields 3 diagnostics. | T | Verified |
| URS-IN-005 | M | Common semantic validation: unique IDs and no dangling references. | Each rule has a failing test. | T | Verified |
| URS-IN-006 | S | XML input via an adapter that maps to the identical source model. | JSON and XML equivalents render byte-identical SVG. | T | Verified |
| URS-IN-007 | C | YAML input via an adapter. | As URS-IN-006. | T | Verified |
| URS-IN-008 | W | A short text language that compiles to the same model. | As URS-IN-006. | T | Proposed |

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
| URS-DM-008 | S | An optional `order` hint on a node overrides automatic ordering. | The hint is respected. | T | Verified |
| URS-DM-009 | S | Optional edge port hints (`fromSide` / `toSide`). | Ports are respected. | T | Verified |
| URS-DM-010 | S | Styling: a theme plus overrides per lane, node and edge (fill, stroke, font, dash). | Overrides are applied. | T | Verified |
| URS-DM-015 | S | Section defaults: a top-level `styles` object sets a default style per section (a type's top-level lists, e.g. `nodes`, `edges`, `lanes`, `phases`). An item's own `style` overrides it field by field. | Defaults and overrides applied for every type; unknown sections rejected; kept through XML and AI refine. | T | Verified |
| URS-DM-016 | S | More style options: font size, bold, italic, opacity, arrowhead shape (triangle, open, diamond, circle, none) and edge-label background. Layout measures styled text. | Each option rendered; nodes and headers resize for font size; out-of-range values rejected. | T | Verified |
| URS-DM-017 | S | Standard-size nodes: `label: callout | auto` (or a fixed `width`/`height`) keeps nodes at a standard size. Labels that do not fit go into a callout beside the node, joined by a leader line. The layout reserves room for it in the node's lane, phase and container. | Same size per shape; callouts clear of nodes and labels, inside their lane or container, in LR and TB; pseudostates unchanged. | T | Verified |
| URS-DM-014 | S | Line thickness: `style.lineWidth` (px, 0.5–8) on nodes, edges, lanes, phases and containers. Arrowheads scale with thicker lines. Default output is unchanged. | Thickness applied per element; out-of-range values rejected; default output byte-identical. | T | Verified |
| URS-DM-011 | W | Nested sub-lanes. | — | T | Proposed |
| URS-DM-012 | C | Free annotations and notes attached to nodes. | — | T | Verified |
| URS-DM-013 | S | Containers: nestable groups with labels (used by composite states and flowchart groups). | Snapshot. | T | Verified |

### 3.5 Layout (LY)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-LY-001 | M | Deterministic: identical input gives byte-identical SVG. | Repeated renders have equal hashes. | T | Verified |
| URS-LY-002 | M | Nodes never overlap. With partitions, each node stays inside its lane × phase cell. With containers, each node stays inside its container. | Geometry assertions over fixtures. | T | Verified |
| URS-LY-003 | M | With partitions, lanes span all phases, phases span all lanes, and band sizes fit their content. | Geometry assertion. | T | Verified |
| URS-LY-004 | M | Nodes are ordered along the flow axis by edge direction. Cycles are tolerated (back-edges). | A cyclic fixture renders. | T | Verified |
| URS-LY-005 | M | Orthogonal (right-angle) edge routing. | All segments are horizontal or vertical. | T | Verified |
| URS-LY-006 | S | Edges do not pass through nodes. | Segment/box intersection test. | T | Verified |
| URS-LY-007 | S | Edge crossings and bends are minimised (heuristic). | Crossing count ≤ baseline on fixtures. | T | Verified |
| URS-LY-008 | S | Edge labels do not overlap nodes. | Box intersection test. | T | Verified |
| URS-LY-009 | M | Text measurement is identical in Node and the browser (bundled font metrics, no DOM). | Same widths in both runtimes. | T | Verified |
| URS-LY-010 | S | 200 nodes / 300 edges laid out in < 500 ms on the server. | Benchmark in CI. | T | Verified |
| URS-LY-011 | S | Self-loop edges are routed without overlapping their node. | Geometry assertion. | T | Verified |
| URS-LY-012 | S | Compound layout: containers are sized to their children, and edges may cross container boundaries. | Geometry assertion. | T | Verified |

### 3.6 Rendering (RN)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-RN-001 | M | Output is standalone, valid SVG 1.1. | Opens in Chrome, Firefox and Inkscape; passes a validator. | T/D | Verified |
| URS-RN-002 | M | Partition header bands and container labels render (Visio CFF style). | Snapshot. | T | Verified |
| URS-RN-003 | M | Edge end markers (arrowheads; others via the registry). | Snapshot. | T | Verified |
| URS-RN-004 | M | All user text is XML-escaped; no script or foreignObject is emitted. | Injection fixtures are escaped. | T | Verified |
| URS-RN-005 | S | SVG elements carry `id`/`class` values derived from model IDs and the diagram type. | Selector test. | T | Verified |
| URS-RN-006 | S | Font is embedded, or a safe fallback stack is used, so the file renders standalone. | D | D | Verified |
| URS-RN-007 | C | PNG export from the web app, at 2× the SVG size. | E2E test checks the PNG dimensions. | T | Verified |
| URS-RN-008 | W | Visio (.vsdx) export/import. | — | T | Proposed |
| URS-RN-009 | W | PDF export. | — | T | Proposed |

### 3.7 API (API)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-API-001 | M | REST over HTTP, versioned under `/v1`. | — | I | Verified |
| URS-API-002 | M | `POST /v1/render` returns `image/svg+xml` for any registered type. | Integration test per type. | T | Verified |
| URS-API-003 | M | `POST /v1/validate` returns diagnostics JSON. | Integration test. | T | Verified |
| URS-API-004 | M | `GET /v1/schema` returns the combined schema; `GET /v1/schema/{type}` returns one type's schema. | Integration test. | T | Verified |
| URS-API-005 | M | Invalid input returns `400` with diagnostics; oversize input returns `413`. | Integration test. | T | Verified |
| URS-API-006 | M | Limits on body size, node/edge count and render time. | Limit tests. | T | Verified |
| URS-API-007 | S | Input format is chosen by `Content-Type` (JSON; XML once URS-IN-006 lands). | Integration test. | T | Verified |
| URS-API-008 | S | An OpenAPI document is published. | `GET /v1/openapi.json`. | T | Verified |
| URS-API-009 | S | `GET /health`. | Returns 200. | T | Verified |
| URS-API-010 | C | `GET /v1/render?src=<base64url>` for `<img>` embedding. | Integration test. | T | Verified |
| URS-API-011 | M | `GET /v1/types` lists the registered types with their descriptions. | Integration test. | T | Verified |
| URS-API-012 | M | `POST /v1/generate` (multipart: `files[]`, `text`, `type` or `auto`, options) returns `{ source, valid, diagnostics, attempts, usage }`, plus `svg` when valid. | Integration test with a mock client. | T | Verified |
| URS-API-013 | S | `POST /v1/refine` (`{ source, instruction }`) returns the same shape as URS-API-012. | Integration test with a mock client. | T | Verified |
| URS-API-014 | S | `generate` and `refine` stream progress as SSE when called with `Accept: text/event-stream` (URS-AI-015). | Integration test. | T | Verified |
| URS-API-015 | M | With no AI credentials configured, the AI endpoints return `503`; every other endpoint keeps working. | Integration test. | T | Verified |
| URS-API-016 | S | `GET /v1/ai` reports whether AI generation is available, so clients can hide it when it isn't. | Integration test. | T | Verified |

### 3.8 Web App (WEB)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-WEB-001 | M | Source editor with syntax highlighting. | D | D | Verified |
| URS-WEB-002 | M | Live preview with debounced re-render on edit. The last good render is kept when there is an error. | E2E test. | T | Verified |
| URS-WEB-003 | M | Export SVG download, byte-identical to the API output for the same input. | E2E hash comparison. | T | Verified |
| URS-WEB-004 | M | Diagnostics shown inline at their source location. | E2E test. | T | Verified |
| URS-WEB-005 | S | Schema-aware autocomplete: property names and enum values from the document type's schema. | Unit and E2E tests. | T | Verified |
| URS-WEB-006 | S | Pan and zoom in the preview. | E2E test (buttons, wheel, drag). | T | Verified |
| URS-WEB-007 | S | Built-in example templates for each type. | D | D | Verified |
| URS-WEB-008 | C | Persist to localStorage; shareable URL. | E2E test. | T | Verified |
| URS-WEB-009 | C | Clicking a node in the preview jumps to its source. | E2E test. | T | Verified |
| URS-WEB-010 | M | Editor validation and autocomplete follow the document's `type`, with no type-specific code in the web app. | E2E test with two types. | T | Verified |
| URS-WEB-011 | M | Generate panel: paste text or drop files, pick a type or `auto`, then generate. The result loads into the editor (editable) with its diagnostics. | E2E test with a mock API. | T | Verified |
| URS-WEB-012 | S | Generation shows staged progress and can be cancelled. | E2E test. | T | Verified |
| URS-WEB-013 | S | Refine box: a natural-language instruction applied to the current source. | E2E test. | T | Verified |
| URS-WEB-014 | S | Hovering a node shows its provenance quote (URS-AI-014). | E2E test. | T | Verified |

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
| URS-AI-009 | M | Input limits on file size, file count and pages (PDF ≤ 600 pages, request ≤ 32 MB), plus a token pre-check with `count_tokens`. Over-limit input returns `413` with the reason. No silent truncation. | Limit tests. | T | Verified |
| URS-AI-010 | M | The Anthropic API key exists only on the server. It is never sent to the browser and never logged. | Log scrub test; bundle grep in CI. | T | Verified |
| URS-AI-011 | M | Input documents are untrusted data. The model gets no tools, and the requested type and schema are fixed by the server, so instructions inside a document cannot change them. The output is data only and is escaped at render time (URS-RN-004). | Injection fixtures produce schema-valid, escaped output. | T | Verified |
| URS-AI-012 | M | Input documents and generated output are not persisted or logged by default. Retention is configurable. | Inspection plus log test. | T/I | Verified |
| URS-AI-013 | S | Refine: modify an existing source from a natural-language instruction. The result goes through URS-AI-005/006. | Mock test. | T | Verified |
| URS-AI-014 | S | Provenance: generated nodes and edges may carry a `source` quote from the input. This is a schema field, because the Citations API cannot be combined with structured outputs. | Fixture test. | T | Verified |
| URS-AI-015 | S | Staged progress events: ingest → generate → validate → repair → render. | Event-order test. | T | Verified |
| URS-AI-016 | S | Prompt caching: the stable prefix (system prompt, type guidance, examples) is cached and kept free of volatile data. | Live check: `cache_read_input_tokens > 0` on a repeat call. | T | Verified |
| URS-AI-017 | S | Usage reported per request: input/output tokens, cache reads, attempts and estimated cost. | Mock test. | T | Verified |
| URS-AI-018 | S | Evaluation suite: a corpus of input documents with reference diagrams. Metrics: valid on first try, valid after repairs, node/edge recall, lane-assignment accuracy. It runs on demand (it costs money), not on every CI run. | Report produced. | D | Partial |
| URS-AI-019 | S | Rate limits per client and a token budget per request. | Limit test. | T | Verified |
| URS-AI-020 | M | The Claude client sits behind an interface with a deterministic mock. CI never calls the live API. | CI has no key; tests pass. | T | Verified |
| URS-AI-021 | C | Image input (whiteboard photos, screenshots of existing diagrams). | — | T | Verified |
| URS-AI-022 | W | Bulk generation via the Message Batches API. | — | T | Proposed |

### 3.10 Documentation (DOC)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-DOC-001 | M | The README covers purpose, features, quick start (install, run the API, run the web app), API reference with `curl` examples, language reference per type, AI generation usage and configuration, an architecture overview, the development workflow (URS process) and the licence. | Inspection checklist. | I | Verified |
| URS-DOC-002 | M | The README shows a rendered example of **every** registered diagram type (flowchart, cross-functional, state, …) next to its source. | CI check (URS-DOC-004). | T | Verified |
| URS-DOC-003 | M | README images are generated by a script (`pnpm docs:images`) from `fixtures/`: diagrams as SVG from core, the web app as PNG via Playwright. None are made by hand. | The script reproduces the committed files. | T | Verified |
| URS-DOC-004 | M | CI fails if README images differ from the current renderer output, or if a registered type has no README example. | CI job. | T | Verified |
| URS-DOC-005 | S | Web app screenshots of the editor with preview and of the AI generate panel. | Present in the README. | I | Verified |
| URS-DOC-006 | S | The per-type language reference (field tables) is generated from the authoring schemas. | The script reproduces the committed files. | T | Verified |

### 3.11 Non-Functional (NF)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-NF-001 | M | Modular: `core` is pure and isomorphic (no DOM, no Node APIs); `api` and `web` consume it. | Lint rule bans those imports. | T | Verified |
| URS-NF-002 | M | TypeScript `strict`. | `tsc` runs in CI. | T | Verified |
| URS-NF-003 | M | Unit tests per module plus golden SVG snapshots; CI runs on every push. | CI is green. | T | Verified |
| URS-NF-004 | M | Every change cites URS IDs and records an impact assessment (§5). | Commit/PR inspection. | I | Verified |
| URS-NF-005 | S | ≥ 80 % line coverage on `core`. | CI gate. | T | Verified |
| URS-NF-006 | S | A container image serves the API and the static web app. | `docker run` serves both. | D | Verified |
| URS-NF-007 | S | Only permissively licensed dependencies (MIT/Apache/BSD/ISC/OFL). | License check in CI. | T | Verified |
| URS-NF-008 | M | Secrets come from environment variables only. No secrets in the repo; `.env.example` documents each variable. | Secret scan in CI. | T | Verified |
| URS-NF-009 | M | AI code lives in a separate `ai` package (Node only). `core` never depends on the Anthropic SDK. | Lint rule. | T | Verified |
| URS-NF-010 | M | One-command installer for Linux, macOS and Windows that installs the latest GitHub release (or a named one), verifies its SHA-256, works with a private repo given a token, keeps user config across updates, and can update in place. | CI installs a packed release from a stand-in GitHub API on Windows (PowerShell 5.1 and 7) and Linux. macOS shares the Linux script. | T | Implemented |
| URS-NF-011 | M | One command (`jtddiagrammar`), plus a Start Menu or desktop entry, starts the app on localhost, waits until it is healthy, and opens the browser. Bound to 127.0.0.1 by default. | CI launches the installed app and checks health, web app and render. | T | Implemented |
| URS-NF-013 | M | Windows is the primary install target: the installer works in Windows PowerShell 5.1 and PowerShell 7, needs no admin rights, installs Node.js LTS with winget when it is missing, and adds Start Menu and desktop shortcuts and a PATH entry. `jtddiagrammar uninstall` removes all of them. | CI on Windows with both PowerShells: install, launch, update, uninstall. | T | Implemented |
| URS-NF-012 | S | Pushing a `v*` tag runs the checks and publishes a GitHub release with the app bundle, its checksum and both installers. | Workflow inspection; bundle built by the same script CI tests. | I | Implemented |

## 4. Traceability Matrix
Updated with each change. `—` = not started.

| URS ID | Module(s) | Test(s) | Note |
|--------|-----------|---------|------|
| EXT-001, EXT-005 | core/src/registry/ | core/test/registry.test.ts | |
| EXT-002 | core/src/compile.ts, api/src/config.ts (registryModule), web/src/registry.ts (examplesOf) | core/test/extensibility.test.ts, api/test/api.test.ts, web/test/registry.test.ts | Web: examples come from any registry; a test proves web source names no diagram type. |
| EXT-003, IN-002 | core/src/validate/envelope.ts | core/test/envelope.test.ts | |
| EXT-004, NF-001, NF-009 | eslint.config.js, core/tsconfig.json (no DOM/Node types) | test/boundaries.test.ts | |
| EXT-006 | core/src/schema/combined.ts | core/test/extensibility.test.ts | |
| EXT-007 | core/src/diagrams/flowchart/validate.ts | core/test/flowchart.test.ts | |
| EXT-010 | core/src/registry/diagram-type.ts (`examples` required) | scripts/docs/readme.test.ts | |
| IN-001, IN-004 | core/src/validate/schema.ts, core/src/adapters/json.ts | core/test/schema.test.ts, core/test/json.test.ts | Semantic rules run only once the schema passes. |
| IN-003 | core/src/diagrams/{flowchart,state}/ | core/test/flowchart.test.ts, state.test.ts | Flat (flowchart) and nested (state) sources, one IR. |
| IN-005, DM-005 | core/src/validate/common.ts | core/test/common.test.ts | Pointer targets the element, not the field. |
| DM-001, DM-002, TYP-002, LY-003 | core/src/layout/layered/{layering,order,place,main-axis,bands}.ts | core/test/layout.test.ts (partitions: *, URS-TYP-002) | |
| RN-002 | core/src/render/svg/bands.ts | core/test/render.test.ts, golden/cff-* | |
| NF-002 | tsconfig.base.json | `pnpm typecheck` | |
| NF-004 | CLAUDE.md, scripts/ci/commits.ts | CI `commits` job | Every pushed commit must contain `URS impacted:`. |
| TYP-001, DM-004 | core/src/shapes/, core/src/diagrams/flowchart/ | core/test/shapes.test.ts, golden/shapes | |
| DM-003, LY-004 | core/src/layout/flow.ts, layout/layered/{cycles,rank}.ts | core/test/layout.test.ts | |
| DM-006, DM-007 | core/src/measure/text.ts, layout/layered/route.ts | core/test/measure.test.ts, golden/text | |
| LY-001 | core/src/num.ts (stable formatting); no randomness | core/test/layout.test.ts | |
| LY-002 | core/src/layout/pack.ts, layered/place.ts | core/test/layout.test.ts, pack.test.ts | No overlaps; nodes inside their lane × phase cell, clear of headers. |
| LY-005 | core/src/layout/layered/route.ts | core/test/layout.test.ts | |
| LY-006, LY-008 | core/src/layout/{metrics,labels,obstacles,grid}.ts | core/test/quality.test.ts (hard zero) | |
| LY-007 | core/src/layout/layered/{order,route}.ts, test/quality-baseline.json | core/test/quality.test.ts, order.test.ts, tips.test.ts | Ratchet per fixture; crossings 3452 → 3007 at P6. |
| DM-008 | core/src/layout/layered/order.ts (hints) | core/test/order.test.ts | |
| DM-009 | core/src/layout/layered/route.ts (hintOf, detourC, head/tail stubs), flowchart fromSide/toSide | core/test/sweep-c.test.ts, golden/hints-* | Hinted ends skip port spreading and tip allocation; edges never pass through nodes (quality ratchet). |
| DM-012 | flowchart `notes` → `note` shape + dotted, arrowless link (IR `marker: 'none'`) | core/test/sweep-c.test.ts, golden/hints-* | Notes inherit their node's lane and phase. |
| TYP-006 | core/src/diagrams/orgchart/* | core/test/sweep-c.test.ts, README example | Rescoped to org chart in v0.15; sequence and ER moved to TYP-007. |
| TYP-007, IN-008, DM-011, RN-008, RN-009, AI-022 | — | — | Won't (this release), v0.15. TYP-007: sequence diagrams need a new layout engine (lifelines, time axis); ER needs a crow's-foot marker set. IN-008: JSON/XML/YAML plus AI drafting cover authoring; a DSL adds a parser and a second syntax to maintain. DM-011: sub-lanes need nested band layout. RN-008: .vsdx is a large OPC/XML format. RN-009: browsers print SVG to PDF; a server PDF needs a renderer dependency. AI-022: no bulk use case under D-001. |
| DM-010 | core/src/schema/fragments.ts (style, theme), render/styles.ts, render/svg/* | core/test/styles.test.ts, golden/styled, golden/state-dark | |
| DM-015 | schema/fragments.ts (`sectionStyles`), diagrams/section-styles.ts, each type's schema and toIR, ai.ts merges | core/test/style-sections.test.ts | Merge is shallow per field; per-item `style` wins. |
| DM-016 | style.ts (`fontOf`), layout/layered/{build,route,index,compound}.ts, render/svg/* | core/test/style-sections.test.ts, golden/state-callouts | Italic is measured with upright widths (within ~1 %). Container header height now travels in geometry (`head`). |
| DM-017 | shapes (`inner`), layout/layered/{build,graph,place,route,compound}.ts (`after`/`reach` reserve room), layout/labels.ts (callout placement), render/svg/index.ts | core/test/style-sections.test.ts, golden/callouts-tb, golden/state-callouts, README example | Callouts start in the reserved spot; the placer moves them only if blocked. |
| DM-014 | schema/fragments.ts (`lineWidth`), render/svg/{index,bands,containers}.ts, web/src/preview/sanitize.ts | core/test/styles.test.ts (line thickness), golden/styled | One marker per colour and size; the sanitiser pattern-checks `stroke-width` and marker sizes. |
| LY-009 | scripts/fonts/metrics.ts → core/src/measure/font-metrics.ts | core/test/measure.test.ts | Automated in the browser: web/e2e/app.spec.ts (CI `e2e` job). |
| RN-001 | core/src/render/svg/ | core/test/render.test.ts (well-formed; SVG 1.1 element and attribute allowlist), web/e2e/svg.spec.ts (Chromium and Firefox) | `data-*` attributes removed (not SVG 1.1). No DTD check: the W3C DTD is unreachable from CI. |
| RN-003..005 | core/src/render/svg/{index,escape,text}.ts | core/test/render.test.ts, golden/* | |
| RN-006 | core/src/measure/font-metrics.ts (Arial-compatible stack) | web/e2e/svg.spec.ts, app.spec.ts (LY-009) | Safe fallback stack; renders standalone in Chromium and Firefox. |
| NF-003 | vitest + golden SVGs + CI | core/test/golden.test.ts | CI green on P0. |
| DOC-002..004 | scripts/docs/, docs/img/ | scripts/docs/readme.test.ts, `pnpm docs:check` | |
| NF-008 | .env.example, CI `secrets` job | CI | Green on P0. |
| API-001..006, API-009, API-011 | packages/api/src/{app,pool,render-worker,errors}.ts, routes/*.ts | packages/api/test/api.test.ts | Real worker threads; timeout kill and recovery tested. |
| API-007 | api/src/input.ts (content-type parsers) | api/test/api.test.ts | JSON, XML, YAML; others 415. |
| IN-006, IN-007 | core/src/adapters/{xml,yaml,index}.ts | core/test/adapters.test.ts | Schema-guided, type-agnostic XML; DOCTYPE refused; YAML alias cap. Every golden and example round-trips to byte-identical SVG. |
| DOC-006 | scripts/docs/reference.ts, schema descriptions | scripts/docs/readme.test.ts, `pnpm docs:check` | |
| API-008 | packages/api/src/openapi.ts (derived from route table) | api.test.ts | |
| WEB-001..004, WEB-007 | packages/web/src/** | packages/web/e2e/app.spec.ts, web/test/locate.test.ts | Includes regression test for stale export during debounce. |
| WEB-010 | packages/web/src (no type-specific code) | web/e2e/app.spec.ts (all examples; state edit, validate, export) | |
| TYP-003..005 | core/src/diagrams/state/* | core/test/state.test.ts, golden/state-* | |
| DM-013, LY-012 | core/src/layout/layered/compound.ts, render/svg/containers.ts | core/test/layout.test.ts (containers: *) | Containers inside lanes are not supported (warning). |
| LY-011 | core/src/layout/layered/route.ts (self-loops) | golden/cycle, state-composite example | Labels kept in compound layouts. |
| LY-010 | packages/core (math.ts: no spread min/max) | core/test/scale.test.ts | 200/300 in ~110 ms. 1000/2000 random graph ~2.4 s. |
| NF-006 | Dockerfile, CI `docker` job | CI | Image built and served in CI (P3 run green). |
| EXT-009, AI-004 | core/src/registry/diagram-type.ts (AiAssets), core/src/diagrams/flowchart/ai.ts | core/test/ai-assets.test.ts | Subset lint plus a 300-sample property test: only `pattern` errors survive conversion. |
| AI-001 | packages/ai/src/ingest/files.ts, generate.ts (count_tokens) | ai/test/ingest.test.ts, generate.test.ts | |
| API-010 | api/src/routes/render.ts (GET) | api/test/api.test.ts | |
| AI-009 | ai/src/ingest/files.ts (pdf-lib page count) | ai/test/ingest.test.ts | Files, size, total, pages, tokens. |
| EXT-008 | api/src/config.ts (`REGISTRY_MODULE`), web/vite.config.ts + registry-alias.ts (`@jtd/registry` alias) | api/test/api.test.ts, web/test/registry.test.ts | Web: chosen at build time. A build with the fixture registry ships the `checklist` type (checked by hand). |
| NF-005 | vitest.config.ts (threshold 80 %) | `pnpm test` | Core at 99.8 % lines. |
| NF-007 | scripts/ci/licences.ts (`pnpm licences`, part of `pnpm check`) | scripts/ci/licences.test.ts | SPDX expressions evaluated; prod deps only. |
| AI-002, AI-003, AI-008, AI-016 | packages/ai/src/anthropic.ts | ai/test/anthropic.test.ts (stubbed SDK) | AI-016: cache_control on a byte-stable system prompt. Live run 2026-11-11: first call wrote 1827 cached tokens, the next two read 1827 each. |
| AI-005..007 | packages/ai/src/generate.ts, prompt.ts | ai/test/generate.test.ts, api/test/generate.test.ts | |
| AI-010 | api/src/config.ts (presence only), eslint.config.js | api/test/generate.test.ts, test/boundaries.test.ts | Key read by the SDK only; web cannot import AI code. |
| AI-011 | ingest wrapper, prompt rules, no tools, fixed schema | ai/test/ingest.test.ts, `pnpm ai:live` (prompt injection case) | Structural defences tested. Live run 2026-11-11: injected title and `<script>` node ignored, output schema-valid, SVG has no unescaped script. One live fixture so far. |
| AI-012 | no logging of bodies or material | api/test/api.test.ts (log capture) | Nothing is stored, so retention is moot. |
| AI-020 | packages/ai/src/mock.ts | all AI tests | CI never calls the live API. |
| AI-013, API-013 | ai/src/generate.ts (refine), DiagramType.ai.toGenerated/merge, api/src/routes/generate.ts | ai/test/refine.test.ts, core/test/ai-assets.test.ts (lossless round trip), api/test/generate.test.ts | Styles, hints, notes, ids and theme carried over. |
| AI-014 | quote fields → IR → geometry → SVG `<title>` | core/test/styles.test.ts | Generation schemas ask for short verbatim excerpts. |
| AI-015, API-014 | generate/refine `onProgress`; SSE in api/src/routes/generate.ts | ai/test/refine.test.ts, api/test/generate.test.ts | Stages: ingest, select, generate, validate, repair. |
| AI-017 | ai/src/pricing.ts (`AI_PRICES` override) | ai/test/refine.test.ts | Priced per reply by the serving model; undefined if any model is unpriced. |
| AI-019 | api/src/rate-limit.ts (`AI_RATE_LIMIT`), `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_INPUT_TOKENS` | api/test/rate-limit.test.ts, generate.test.ts | Per client IP, in memory (D-001: internal hosting). |
| AI-021 | ai/src/ingest/files.ts (PNG, JPEG, GIF, WebP) | ai/test/refine.test.ts | |
| AI-018 | scripts/ai/{eval,corpus,metrics}.ts (`pnpm ai:eval`), live-check | scripts/ai/metrics.test.ts | Corpus of 6 documents across all three types; metrics: valid first/final, node and edge recall, lane accuracy. Not yet run with a key; the live smoke check passed 3/3 (v0.8.2). |
| API-012, API-015, API-016 | api/src/routes/generate.ts, errors.ts | api/test/generate.test.ts, web/e2e/generate.spec.ts | |
| WEB-011..013 | web/src/generate/{api,progress,GeneratePanel}.* | web/e2e/generate.spec.ts, web/test/api.test.ts | SSE parsed from the fetch stream; falls back to plain JSON replies. |
| WEB-005 | web/src/editor/complete.ts | web/test/complete.test.ts, web/e2e/preview.spec.ts | Driven by the registered schema of the document's `type` (WEB-010). |
| WEB-006, WEB-014, RN-004 | web/src/preview/{Preview.tsx,sanitize.ts} | web/e2e/preview.spec.ts, web/test/sanitize.test.ts | Inline SVG, sanitised against the RN-001 allowlist (scripts, handlers, links, `url()` refs dropped). Quotes show as native `<title>` tooltips. |
| WEB-008 | web/src/persist.ts | web/test/persist.test.ts, web/e2e/preview.spec.ts | Share link is `#src=` + base64url(deflate-raw); nothing stored server-side. |
| WEB-009 | core/src/render.ts (`ir` in result), web/src/pick.ts | web/test/pick.test.ts, web/e2e/preview.spec.ts | SVG id prefix + model id → IR `src` pointer → `locate()`. |
| RN-007 | web/src/download.ts (canvas) | web/e2e/preview.spec.ts | Client-side; the API stays SVG-only. |
| DOC-001, DOC-005 | README.md, web/e2e/screens.spec.ts | `pnpm docs:check` | |
| NF-010, NF-011, NF-013 | scripts/release/{install.sh,install.ps1,jtddiagrammar,jtddiagrammar.ps1} | scripts/release/e2e.ts (`pnpm release:e2e`; CI `install` job: Windows × {PowerShell 5.1, 7}, Linux bash, Linux PowerShell 7 in 5.1 argument mode), scripts/release/scripts.test.ts | Stand-in GitHub API demands a token; checks install, version, launch, web app, render, update, refused token, and uninstall (PowerShell). Dependencies come from the lockfile at install time, so one archive serves every OS. Locally: bash and PowerShell 7 (on Linux) pass. winget, shortcuts and PATH run only on Windows. |
| NF-012 | scripts/release/pack.ts, .github/workflows/release.yml | via NF-010 (same pack script) | Attaches to an existing release (made on the releases page) or creates one; `workflow_dispatch` re-attaches for a tag. Verified on the first tagged release. |

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
| 0.21 | 2026-11-11 | Added DM-015 (section defaults), DM-016 (more style options), DM-017 (standard-size nodes, callouts); all verified. |
| 0.20 | 2026-11-11 | Added DM-014 (line thickness, `style.lineWidth`); verified. |
| 0.19 | 2026-11-11 | Fix: a release made on the releases page made the Release workflow fail (`release already exists`), so no app bundle was attached. The workflow now attaches to an existing release and can be re-run for a tag; installers say what is missing. |
| 0.18 | 2026-11-11 | Fix: Windows PowerShell 5.1 strips quotes from native arguments, so the installer's `node -e` version check failed on Windows (user report). Version now compared in PowerShell; static test plus a CI job emulating 5.1 argument passing. |
| 0.17 | 2026-11-11 | Windows-first installer: added NF-013 (winget Node, shortcuts, uninstall, both PowerShells). macOS dropped from CI (shares the Linux script). |
| 0.16 | 2026-11-11 | Added NF-010 (installer), NF-011 (launcher), NF-012 (release workflow); implemented. Node floor raised to 22.18 (type stripping on by default). |
| 0.15 | 2026-11-11 | Sweep E: inline sanitised preview with pan/zoom, click to source, hover quotes, schema autocomplete, persistence and share links, staged progress and refine in the web app, PNG export, web `REGISTRY_MODULE`. EXT-008, TYP-006 (rescoped), RN-007 (rescoped), WEB-005/006/008/009/012/013/014 verified. Added TYP-007, RN-009. W: TYP-007, IN-008, DM-011, RN-008, RN-009, AI-022. |
| 0.14 | 2026-11-11 | Sweep D: refine, provenance, progress over SSE, cost estimate, rate limiting, image input, evaluation corpus. AI-013/014/015/017/019/021, API-013/014 verified; AI-018 partial (not yet run). |
| 0.13 | 2026-11-11 | Sweep C: port side hints, notes, org chart type. DM-009, DM-012 verified; TYP-006 partial. |
| 0.12 | 2026-11-11 | Sweep B: XML and YAML input (core + API), generated language reference. IN-006, IN-007, API-007, DOC-006 verified. |
| 0.11 | 2026-11-11 | Decision D-001 (internal hosting). Sweep A: EXT-002, IN-003, RN-001, RN-006, API-010, AI-009, AI-012, NF-004, NF-005, NF-007 verified; EXT-008 partial. |
| 0.10 | 2026-11-11 | P6: layout quality and styling. LY-006, LY-007, LY-008, DM-008 and DM-010 verified; DM-009 deferred to P7. |
| 0.9 | 2026-11-11 | P5: state diagrams with composite states. TYP-003..005, DM-013, LY-011, LY-012 and WEB-010 verified. |
| 0.8.2 | 2026-11-11 | First live run of `pnpm ai:live`: 3/3 pass. AI-011 and AI-016 verified; AI-018 stays partial (no reference corpus or recall metrics). |
| 0.8.1 | 2026-11-11 | AI-018 partial: live-check script (`pnpm ai:live`). |
| 0.8 | 2026-11-11 | P4: AI generation. Added API-016. 18 requirements verified; AI-009, AI-011, AI-016, AI-017 and WEB-012 partial; AI-012 implemented. No live API call yet. |
| 0.7 | 2026-11-11 | P3: REST API and web app. 17 requirements verified; API-007, WEB-010 and DOC-005 partial; NF-006 implemented. Render timeout default 5 s (benchmarked). |
| 0.6 | 2026-11-11 | Cross-functional layout delivered (now P2; API/web renumbered to P3 at the user's request). TYP-002, DM-001/002, LY-002/003, RN-002 verified. |
| 0.5 | 2026-11-11 | P1 implemented: flowchart layout and SVG rendering, README images, MIT licence. Statuses and matrix updated. |
| 0.4 | 2026-11-11 | P0 implemented: statuses and traceability matrix updated. Added the Partial status. |
| 0.3 | 2026-11-11 | Added AI generation (AI-001..022), documentation (DOC-001..006), EXT-009/010, API-012..015, WEB-011..014, NF-008/009. |
| 0.2 | 2026-11-11 | Generalised to multiple diagram types. Added EXT, TYP, DM-013, LY-011/012, API-011, WEB-010. Rescoped IN-003, DM-001..006, LY-002/003, RN-002/003, API-002/004, WEB-007 from cross-functional-only to type-agnostic. |
