# User Requirements Specification (URS) — JTDDiagrammar

| Field   | Value |
|---------|-------|
| Version | 0.3 (draft) |
| Status  | Planning |
| Owner   | Product |

## 1. Purpose
A multi-type diagram language. Users define diagrams (flowcharts, cross-functional flowcharts, state diagrams, more later) in structured text and render them to SVG through an API and a web app. An AI component (Claude) generates validated diagram source from documents and unstructured text. The first priority is the cross-functional flowchart (swimlanes × phases, Visio-style), but no part of the system other than its type plugin may assume it.

## 2. Conventions
- **ID**: `URS-<AREA>-<NNN>`. IDs are never reused or renumbered; retired items are marked `Withdrawn`.
- **Priority** (MoSCoW): M = Must, S = Should, C = Could, W = Won't (this release).
- **Verify**: T = automated test, I = inspection, D = demonstration.
- **Status**: Proposed → Accepted → Implemented → Verified (or Withdrawn).

## 3. Requirements

### 3.1 Extensibility (EXT)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-EXT-001 | M | Each diagram type is a plugin that implements one `DiagramType` interface and is registered in core. | Registry lists all built-in types. | T | Proposed |
| URS-EXT-002 | M | Adding a type requires no change to adapters, API, web app or SVG renderer. | A test-only fixture type renders through the API and the web app. | T | Proposed |
| URS-EXT-003 | M | Every source declares `type`. A missing or unknown type returns a diagnostic that lists the registered types. | Test. | T | Proposed |
| URS-EXT-004 | M | Types compile to a shared Graph IR (nodes, edges, containers, partitions). Layout and rendering consume only the IR and the geometry built from it. | Lint rule: `layout/` and `render/` never import from `types/`. | T | Proposed |
| URS-EXT-005 | M | Layout engines are pluggable and each type selects one. v1 ships `layered`. | Engine registry test. | T | Proposed |
| URS-EXT-006 | M | Each type ships its own JSON Schema. The combined schema dispatches on `type`. | Ajv validates per-type fixtures through the combined schema. | T | Proposed |
| URS-EXT-007 | M | Each type can add semantic validation rules through a hook. | Hook test. | T | Proposed |
| URS-EXT-008 | C | Diagram types can be registered from outside the repo as separate packages. | — | T | Proposed |
| URS-EXT-009 | M | Each type also ships its AI generation assets: a generation schema, guidance text, examples and a converter from generated output to authoring source (URS-AI-004). Adding a type requires no change to the `ai` package. | The test-only fixture type generates through a mock client. | T | Proposed |
| URS-EXT-010 | M | Each type ships a README example (source + rendered image) (URS-DOC-002). | CI check (URS-DOC-004). | T | Proposed |

### 3.2 Diagram Types (TYP)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-TYP-001 | M | `flowchart`: nodes (`process`, `decision`, `terminator`, `document`, `data`, `subprocess`, `connector`) and directed edges. | Each shape has a snapshot. | T | Proposed |
| URS-TYP-002 | M | Cross-functional flowchart = `flowchart` with `lanes` and optional `phases` (URS-DM-001/002). It is not a separate type. | Same nodes render both with and without lanes. | T | Proposed |
| URS-TYP-003 | S | `state`: states, pseudostates (`initial`, `final`, `choice`), and transitions labelled `event [guard] / action`. | Snapshot. | T | Proposed |
| URS-TYP-004 | S | `state`: composite (nested) states. | Snapshot. | T | Proposed |
| URS-TYP-005 | S | `state`: self-transitions. | Snapshot. | T | Proposed |
| URS-TYP-006 | C | Further types (sequence, ER, org chart), each as a plugin. | — | T | Proposed |

### 3.3 Input / Language (IN)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-IN-001 | M | Diagrams are defined in JSON that conforms to the published JSON Schema. | A valid sample passes Ajv; invalid samples fail. | T | Proposed |
| URS-IN-002 | M | Every source declares a schema `version`. Breaking changes bump the major version. | An unknown major version gives an explicit error. | T | Proposed |
| URS-IN-003 | M | Each type picks the source structure that fits it best (flat ID references for flowcharts, nesting for composite states). Every structure compiles to the same IR. | I | I | Proposed |
| URS-IN-004 | M | Validation reports **all** errors, each with a JSON Pointer path and a message. | A doc with 3 errors yields 3 diagnostics. | T | Proposed |
| URS-IN-005 | M | Common semantic validation: unique IDs and no dangling references. | Each rule has a failing test. | T | Proposed |
| URS-IN-006 | S | XML input via an adapter that maps to the identical source model. | JSON and XML equivalents render byte-identical SVG. | T | Proposed |
| URS-IN-007 | C | YAML input via an adapter. | As URS-IN-006. | T | Proposed |
| URS-IN-008 | C | A short text language that compiles to the same model. | As URS-IN-006. | T | Proposed |

### 3.4 Common Model (DM) — available to any type that opts in
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-DM-001 | M | Partitions: **lanes**, ordered and labelled bands. Each type opts in. | Lanes render in source order. | T | Proposed |
| URS-DM-002 | M | Partitions: **phases**, bands perpendicular to lanes. Optional. | Renders both with and without phases. | T | Proposed |
| URS-DM-003 | M | `direction`: `LR` or `TB` for every type. With partitions, lanes run along the flow direction. | Same model renders in both directions. | T | Proposed |
| URS-DM-004 | M | Shared shape library (a registry). Each type declares which shapes it allows. | A disallowed shape gives a diagnostic. | T | Proposed |
| URS-DM-005 | M | With partitions, each node belongs to exactly one lane, and to exactly one phase when phases exist. | A missing or invalid reference gives a diagnostic. | T | Proposed |
| URS-DM-006 | M | Directed edges with an optional label. | The label renders on the edge. | T | Proposed |
| URS-DM-007 | S | Multi-line labels, with auto-wrap at a configurable maximum node width. | `\n` and long text both wrap. | T | Proposed |
| URS-DM-008 | S | An optional `order` hint on a node overrides automatic ordering. | The hint is respected. | T | Proposed |
| URS-DM-009 | S | Optional edge port hints (`fromSide` / `toSide`). | Ports are respected. | T | Proposed |
| URS-DM-010 | S | Styling: a theme plus overrides per lane, node and edge (fill, stroke, font, dash). | Overrides are applied. | T | Proposed |
| URS-DM-011 | C | Nested sub-lanes. | — | T | Proposed |
| URS-DM-012 | C | Free annotations and notes attached to nodes. | — | T | Proposed |
| URS-DM-013 | S | Containers: nestable groups with labels (used by composite states and flowchart groups). | Snapshot. | T | Proposed |

### 3.5 Layout (LY)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-LY-001 | M | Deterministic: identical input gives byte-identical SVG. | Repeated renders have equal hashes. | T | Proposed |
| URS-LY-002 | M | Nodes never overlap. With partitions, each node stays inside its lane × phase cell. With containers, each node stays inside its container. | Geometry assertions over fixtures. | T | Proposed |
| URS-LY-003 | M | With partitions, lanes span all phases, phases span all lanes, and band sizes fit their content. | Geometry assertion. | T | Proposed |
| URS-LY-004 | M | Nodes are ordered along the flow axis by edge direction. Cycles are tolerated (back-edges). | A cyclic fixture renders. | T | Proposed |
| URS-LY-005 | M | Orthogonal (right-angle) edge routing. | All segments are horizontal or vertical. | T | Proposed |
| URS-LY-006 | S | Edges do not pass through nodes. | Segment/box intersection test. | T | Proposed |
| URS-LY-007 | S | Edge crossings and bends are minimised (heuristic). | Crossing count ≤ baseline on fixtures. | T | Proposed |
| URS-LY-008 | S | Edge labels do not overlap nodes. | Box intersection test. | T | Proposed |
| URS-LY-009 | M | Text measurement is identical in Node and the browser (bundled font metrics, no DOM). | Same widths in both runtimes. | T | Proposed |
| URS-LY-010 | S | 200 nodes / 300 edges laid out in < 500 ms on the server. | Benchmark in CI. | T | Proposed |
| URS-LY-011 | S | Self-loop edges are routed without overlapping their node. | Geometry assertion. | T | Proposed |
| URS-LY-012 | S | Compound layout: containers are sized to their children, and edges may cross container boundaries. | Geometry assertion. | T | Proposed |

### 3.6 Rendering (RN)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-RN-001 | M | Output is standalone, valid SVG 1.1. | Opens in Chrome, Firefox and Inkscape; passes a validator. | T/D | Proposed |
| URS-RN-002 | M | Partition header bands and container labels render (Visio CFF style). | Snapshot. | T | Proposed |
| URS-RN-003 | M | Edge end markers (arrowheads; others via the registry). | Snapshot. | T | Proposed |
| URS-RN-004 | M | All user text is XML-escaped; no script or foreignObject is emitted. | Injection fixtures are escaped. | T | Proposed |
| URS-RN-005 | S | SVG elements carry `id`/`class` values derived from model IDs and the diagram type. | Selector test. | T | Proposed |
| URS-RN-006 | S | Font is embedded, or a safe fallback stack is used, so the file renders standalone. | D | D | Proposed |
| URS-RN-007 | C | PNG / PDF export. | — | T | Proposed |
| URS-RN-008 | C | Visio (.vsdx) export/import. | — | T | Proposed |

### 3.7 API (API)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-API-001 | M | REST over HTTP, versioned under `/v1`. | — | I | Proposed |
| URS-API-002 | M | `POST /v1/render` returns `image/svg+xml` for any registered type. | Integration test per type. | T | Proposed |
| URS-API-003 | M | `POST /v1/validate` returns diagnostics JSON. | Integration test. | T | Proposed |
| URS-API-004 | M | `GET /v1/schema` returns the combined schema; `GET /v1/schema/{type}` returns one type's schema. | Integration test. | T | Proposed |
| URS-API-005 | M | Invalid input returns `400` with diagnostics; oversize input returns `413`. | Integration test. | T | Proposed |
| URS-API-006 | M | Limits on body size, node/edge count and render time. | Limit tests. | T | Proposed |
| URS-API-007 | S | Input format is chosen by `Content-Type` (JSON; XML once URS-IN-006 lands). | Integration test. | T | Proposed |
| URS-API-008 | S | An OpenAPI document is published. | `GET /v1/openapi.json`. | T | Proposed |
| URS-API-009 | S | `GET /health`. | Returns 200. | T | Proposed |
| URS-API-010 | C | `GET /v1/render?src=<base64url>` for `<img>` embedding. | Integration test. | T | Proposed |
| URS-API-011 | M | `GET /v1/types` lists the registered types with their descriptions. | Integration test. | T | Proposed |
| URS-API-012 | M | `POST /v1/generate` (multipart: `files[]`, `text`, `type` or `auto`, options) returns `{ source, valid, diagnostics, attempts, usage }`, plus `svg` when valid. | Integration test with a mock client. | T | Proposed |
| URS-API-013 | S | `POST /v1/refine` (`{ source, instruction }`) returns the same shape as URS-API-012. | Integration test with a mock client. | T | Proposed |
| URS-API-014 | S | `generate` and `refine` stream progress as SSE when called with `Accept: text/event-stream` (URS-AI-015). | Integration test. | T | Proposed |
| URS-API-015 | M | With no AI credentials configured, the AI endpoints return `503`; every other endpoint keeps working. | Integration test. | T | Proposed |

### 3.8 Web App (WEB)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-WEB-001 | M | Source editor with syntax highlighting. | D | D | Proposed |
| URS-WEB-002 | M | Live preview with debounced re-render on edit. The last good render is kept when there is an error. | E2E test. | T | Proposed |
| URS-WEB-003 | M | Export SVG download, byte-identical to the API output for the same input. | E2E hash comparison. | T | Proposed |
| URS-WEB-004 | M | Diagnostics shown inline at their source location. | E2E test. | T | Proposed |
| URS-WEB-005 | S | Schema-aware autocomplete. | D | D | Proposed |
| URS-WEB-006 | S | Pan and zoom in the preview. | D | D | Proposed |
| URS-WEB-007 | S | Built-in example templates for each type. | D | D | Proposed |
| URS-WEB-008 | C | Persist to localStorage; shareable URL. | E2E test. | T | Proposed |
| URS-WEB-009 | C | Clicking a node in the preview jumps to its source. | E2E test. | T | Proposed |
| URS-WEB-010 | M | Editor validation and autocomplete follow the document's `type`, with no type-specific code in the web app. | E2E test with two types. | T | Proposed |
| URS-WEB-011 | M | Generate panel: paste text or drop files, pick a type or `auto`, then generate. The result loads into the editor (editable) with its diagnostics. | E2E test with a mock API. | T | Proposed |
| URS-WEB-012 | S | Generation shows staged progress and can be cancelled. | E2E test. | T | Proposed |
| URS-WEB-013 | S | Refine box: a natural-language instruction applied to the current source. | E2E test. | T | Proposed |
| URS-WEB-014 | S | Hovering a node shows its provenance quote (URS-AI-014). | E2E test. | T | Proposed |

### 3.9 AI Generation (AI)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-AI-001 | M | Generate diagram source from pasted text and from uploaded documents (PDF, DOCX, TXT, MD, HTML). | One fixture per format. | T | Proposed |
| URS-AI-002 | M | Claude is called through the official Anthropic TypeScript SDK. The model is configurable (default `claude-opus-5-5`), and so is effort. | Config test. | T | Proposed |
| URS-AI-003 | M | Output is constrained with structured outputs (`output_config.format`) using the type's generation schema. | Request includes the format; mock asserts it. | T | Proposed |
| URS-AI-004 | M | Generation schemas use only the JSON Schema subset that structured outputs support: no recursion, no numeric or length constraints, and `additionalProperties: false` on every object. Each type converts generated output to its authoring source deterministically, e.g. flat `parent` refs into nested composite states. | A lint test checks each generation schema against the supported subset. A property test confirms that any schema-valid generation output converts to an authoring-valid source shape. | T | Proposed |
| URS-AI-005 | M | Every generated source passes the full pipeline: authoring schema (Ajv), common and type semantic rules, and a successful layout. Nothing that fails is returned as `valid: true`. | Mock returns invalid output and the response has `valid: false`. | T | Proposed |
| URS-AI-006 | M | Repair loop: when validation fails, the diagnostics go back to Claude for correction, up to N retries (default 2). A final failure returns the best attempt, its diagnostics and `valid: false`. | Mock: invalid → valid on retry 1; invalid ×3 → `valid: false`. | T | Proposed |
| URS-AI-007 | M | The caller sets `type`, or `auto` lets the model choose from the registered types and return its reason. | Mock test for both. | T | Proposed |
| URS-AI-008 | M | Stop reasons are handled: `refusal` (with server-side fallbacks enabled) and `max_tokens` (truncation counts as a failure and is never parsed as success). Each surfaces as a distinct error code. | Mock test per stop reason. | T | Proposed |
| URS-AI-009 | M | Input limits on file size, file count and pages (PDF ≤ 600 pages, request ≤ 32 MB), plus a token pre-check with `count_tokens`. Over-limit input returns `413` with the reason. No silent truncation. | Limit tests. | T | Proposed |
| URS-AI-010 | M | The Anthropic API key exists only on the server. It is never sent to the browser and never logged. | Log scrub test; bundle grep in CI. | T | Proposed |
| URS-AI-011 | M | Input documents are untrusted data. The model gets no tools, and the requested type and schema are fixed by the server, so instructions inside a document cannot change them. The output is data only and is escaped at render time (URS-RN-004). | Injection fixtures produce schema-valid, escaped output. | T | Proposed |
| URS-AI-012 | M | Input documents and generated output are not persisted or logged by default. Retention is configurable. | Inspection plus log test. | T/I | Proposed |
| URS-AI-013 | S | Refine: modify an existing source from a natural-language instruction. The result goes through URS-AI-005/006. | Mock test. | T | Proposed |
| URS-AI-014 | S | Provenance: generated nodes and edges may carry a `source` quote from the input. This is a schema field, because the Citations API cannot be combined with structured outputs. | Fixture test. | T | Proposed |
| URS-AI-015 | S | Staged progress events: ingest → generate → validate → repair → render. | Event-order test. | T | Proposed |
| URS-AI-016 | S | Prompt caching: the stable prefix (system prompt, type guidance, examples) is cached and kept free of volatile data. | Live check: `cache_read_input_tokens > 0` on a repeat call. | T | Proposed |
| URS-AI-017 | S | Usage reported per request: input/output tokens, cache reads, attempts and estimated cost. | Mock test. | T | Proposed |
| URS-AI-018 | S | Evaluation suite: a corpus of input documents with reference diagrams. Metrics: valid on first try, valid after repairs, node/edge recall, lane-assignment accuracy. It runs on demand (it costs money), not on every CI run. | Report produced. | D | Proposed |
| URS-AI-019 | S | Rate limits per client and a token budget per request. | Limit test. | T | Proposed |
| URS-AI-020 | M | The Claude client sits behind an interface with a deterministic mock. CI never calls the live API. | CI has no key; tests pass. | T | Proposed |
| URS-AI-021 | C | Image input (whiteboard photos, screenshots of existing diagrams). | — | T | Proposed |
| URS-AI-022 | C | Bulk generation via the Message Batches API. | — | T | Proposed |

### 3.10 Documentation (DOC)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-DOC-001 | M | The README covers purpose, features, quick start (install, run the API, run the web app), API reference with `curl` examples, language reference per type, AI generation usage and configuration, an architecture overview, the development workflow (URS process) and the licence. | Inspection checklist. | I | Proposed |
| URS-DOC-002 | M | The README shows a rendered example of **every** registered diagram type (flowchart, cross-functional, state, …) next to its source. | CI check (URS-DOC-004). | T | Proposed |
| URS-DOC-003 | M | README images are generated by a script (`pnpm docs:images`) from `fixtures/`: diagrams as SVG from core, the web app as PNG via Playwright. None are made by hand. | The script reproduces the committed files. | T | Proposed |
| URS-DOC-004 | M | CI fails if README images differ from the current renderer output, or if a registered type has no README example. | CI job. | T | Proposed |
| URS-DOC-005 | S | Web app screenshots of the editor with preview and of the AI generate panel. | Present in the README. | I | Proposed |
| URS-DOC-006 | S | The per-type language reference (field tables) is generated from the authoring schemas. | The script reproduces the committed files. | T | Proposed |

### 3.11 Non-Functional (NF)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-NF-001 | M | Modular: `core` is pure and isomorphic (no DOM, no Node APIs); `api` and `web` consume it. | Lint rule bans those imports. | T | Proposed |
| URS-NF-002 | M | TypeScript `strict`. | `tsc` runs in CI. | T | Proposed |
| URS-NF-003 | M | Unit tests per module plus golden SVG snapshots; CI runs on every push. | CI is green. | T | Proposed |
| URS-NF-004 | M | Every change cites URS IDs and records an impact assessment (§5). | Commit/PR inspection. | I | Proposed |
| URS-NF-005 | S | ≥ 80 % line coverage on `core`. | CI gate. | T | Proposed |
| URS-NF-006 | S | A container image serves the API and the static web app. | `docker run` serves both. | D | Proposed |
| URS-NF-007 | S | Only permissively licensed dependencies (MIT/Apache/BSD/ISC/OFL). | License check in CI. | T | Proposed |
| URS-NF-008 | M | Secrets come from environment variables only. No secrets in the repo; `.env.example` documents each variable. | Secret scan in CI. | T | Proposed |
| URS-NF-009 | M | AI code lives in a separate `ai` package (Node only). `core` never depends on the Anthropic SDK. | Lint rule. | T | Proposed |

## 4. Traceability Matrix
Updated with each change. `—` = not started.

| URS ID | Module(s) | Test(s) |
|--------|-----------|---------|
| _all_  | —         | —       |

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
| 0.3 | 2026-11-11 | Added AI generation (AI-001..022), documentation (DOC-001..006), EXT-009/010, API-012..015, WEB-011..014, NF-008/009. |
| 0.2 | 2026-11-11 | Generalised to multiple diagram types. Added EXT, TYP, DM-013, LY-011/012, API-011, WEB-010. Rescoped IN-003, DM-001..006, LY-002/003, RN-002/003, API-002/004, WEB-007 from cross-functional-only to type-agnostic. |
