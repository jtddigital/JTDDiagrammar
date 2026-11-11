# User Requirements Specification (URS) — JTDDiagrammar

| Field   | Value |
|---------|-------|
| Version | 0.1 (draft) |
| Status  | Planning |
| Owner   | Product |

## 1. Purpose
Define cross-functional flowcharts (swimlanes × phases, Visio-style) in structured text and render them to SVG via an API and a web app.

## 2. Conventions
- **ID**: `URS-<AREA>-<NNN>`. IDs are never reused or renumbered; retired items are marked `Withdrawn`.
- **Priority** (MoSCoW): M = Must, S = Should, C = Could, W = Won't (this release).
- **Verify**: T = automated test, I = inspection, D = demonstration.
- **Status**: Proposed → Accepted → Implemented → Verified (or Withdrawn).

## 3. Requirements

### 3.1 Input / Language (IN)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-IN-001 | M | Diagrams are defined in JSON conforming to a published JSON Schema. | Valid sample passes Ajv; invalid samples fail. | T | Proposed |
| URS-IN-002 | M | Source declares a schema `version`; breaking changes bump major. | Unknown major → explicit error. | T | Proposed |
| URS-IN-003 | M | Model is flat: `lanes`, `phases`, `nodes`, `edges`, cross-referenced by `id`. | Schema enforces structure. | I | Proposed |
| URS-IN-004 | M | Validation reports **all** errors, each with a JSON Pointer path and message. | Doc with 3 errors yields 3 diagnostics. | T | Proposed |
| URS-IN-005 | M | Semantic validation: unique IDs, no dangling lane/phase/node refs. | Each rule has a failing test. | T | Proposed |
| URS-IN-006 | S | XML input via adapter mapping to the identical internal model. | JSON and XML equivalents render byte-identical SVG. | T | Proposed |
| URS-IN-007 | C | YAML input via adapter. | As URS-IN-006. | T | Proposed |
| URS-IN-008 | C | Terse text DSL compiling to the same model. | As URS-IN-006. | T | Proposed |

### 3.2 Diagram Model (DM)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-DM-001 | M | Ordered, labelled **lanes** (functional bands). | Render order = source order. | T | Proposed |
| URS-DM-002 | M | Ordered, labelled **phases** (bands perpendicular to lanes). Optional; absent → one implicit phase, no header. | Both cases render. | T | Proposed |
| URS-DM-003 | M | `orientation`: `horizontal` (lanes are rows, flow L→R) or `vertical` (lanes are columns, flow T→B). | Same model renders both ways. | T | Proposed |
| URS-DM-004 | M | Node types: `process`, `decision`, `terminator`, `document`, `data`, `subprocess`, `connector`. | Each type has a shape renderer + snapshot. | T | Proposed |
| URS-DM-005 | M | Each node belongs to exactly one lane and one phase. | Missing/invalid ref → diagnostic. | T | Proposed |
| URS-DM-006 | M | Directed edges with optional label. | Label rendered on edge. | T | Proposed |
| URS-DM-007 | S | Multi-line labels; auto-wrap at configurable max node width. | `\n` and long text wrap. | T | Proposed |
| URS-DM-008 | S | Optional `order` hint on nodes overrides automatic in-cell ordering. | Hint respected. | T | Proposed |
| URS-DM-009 | S | Optional edge port hints (`fromSide`/`toSide`). | Ports respected. | T | Proposed |
| URS-DM-010 | S | Styling: theme + per-lane/node/edge overrides (fill, stroke, font, dash). | Overrides applied. | T | Proposed |
| URS-DM-011 | C | Nested sub-lanes. | — | T | Proposed |
| URS-DM-012 | C | Free annotations / notes attached to nodes. | — | T | Proposed |

### 3.3 Layout (LY)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-LY-001 | M | Deterministic: identical input → byte-identical SVG. | Repeat render hash equal. | T | Proposed |
| URS-LY-002 | M | Nodes never overlap and stay inside their lane×phase cell. | Geometry assertion over fixtures. | T | Proposed |
| URS-LY-003 | M | Lanes span all phases; phases span all lanes; band sizes auto-fit content. | Geometry assertion. | T | Proposed |
| URS-LY-004 | M | Nodes ordered along flow axis by edge direction; cycles tolerated (back-edges). | Cyclic fixture renders. | T | Proposed |
| URS-LY-005 | M | Orthogonal (Manhattan) edge routing. | All segments axis-aligned. | T | Proposed |
| URS-LY-006 | S | Edges do not pass through nodes. | Segment/box intersection test. | T | Proposed |
| URS-LY-007 | S | Minimise edge crossings and bends (heuristic). | Crossing count ≤ baseline on fixtures. | T | Proposed |
| URS-LY-008 | S | Edge labels do not overlap nodes. | Box intersection test. | T | Proposed |
| URS-LY-009 | M | Text measurement identical in Node and browser (bundled font metrics, no DOM). | Same widths in both runtimes. | T | Proposed |
| URS-LY-010 | S | 200 nodes / 300 edges laid out in < 500 ms (server). | Benchmark in CI. | T | Proposed |

### 3.4 Rendering (RN)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-RN-001 | M | Output is standalone, valid SVG 1.1. | Opens in Chrome/Firefox/Inkscape; passes validator. | T/D | Proposed |
| URS-RN-002 | M | Lane and phase header bands rendered (Visio CFF style). | Snapshot. | T | Proposed |
| URS-RN-003 | M | Arrowheads on edge targets. | Snapshot. | T | Proposed |
| URS-RN-004 | M | All user text XML-escaped; no script/foreignObject emitted. | Injection fixtures escaped. | T | Proposed |
| URS-RN-005 | S | SVG elements carry `id`/`class` derived from model IDs. | Selector test. | T | Proposed |
| URS-RN-006 | S | Font embedded or safe fallback stack so file renders standalone. | D | D | Proposed |
| URS-RN-007 | C | PNG / PDF export. | — | T | Proposed |
| URS-RN-008 | C | Visio (.vsdx) export/import. | — | T | Proposed |

### 3.5 API (API)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-API-001 | M | REST over HTTP, versioned under `/v1`. | — | I | Proposed |
| URS-API-002 | M | `POST /v1/render` → `image/svg+xml`. | Integration test. | T | Proposed |
| URS-API-003 | M | `POST /v1/validate` → diagnostics JSON. | Integration test. | T | Proposed |
| URS-API-004 | M | `GET /v1/schema` → JSON Schema. | Integration test. | T | Proposed |
| URS-API-005 | M | Invalid input → `400` + diagnostics; oversize → `413`. | Integration test. | T | Proposed |
| URS-API-006 | M | Limits: body size, node/edge count, render timeout. | Limit tests. | T | Proposed |
| URS-API-007 | S | Input format by `Content-Type` (JSON; XML when URS-IN-006 lands). | Integration test. | T | Proposed |
| URS-API-008 | S | OpenAPI document published. | `GET /v1/openapi.json`. | T | Proposed |
| URS-API-009 | S | `GET /health`. | 200. | T | Proposed |
| URS-API-010 | C | `GET /v1/render?src=<base64url>` for `<img>` embedding. | Integration test. | T | Proposed |

### 3.6 Web App (WEB)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-WEB-001 | M | Source editor with syntax highlighting. | D | D | Proposed |
| URS-WEB-002 | M | Live preview, debounced re-render on edit; last good render kept on error. | E2E test. | T | Proposed |
| URS-WEB-003 | M | Export SVG download, byte-identical to API output for same input. | E2E hash compare. | T | Proposed |
| URS-WEB-004 | M | Diagnostics shown inline at source location. | E2E test. | T | Proposed |
| URS-WEB-005 | S | Schema-aware autocomplete. | D | D | Proposed |
| URS-WEB-006 | S | Pan/zoom preview. | D | D | Proposed |
| URS-WEB-007 | S | Built-in example templates. | D | D | Proposed |
| URS-WEB-008 | C | Persist to localStorage; shareable URL. | E2E test. | T | Proposed |
| URS-WEB-009 | C | Click node in preview → jump to source. | E2E test. | T | Proposed |

### 3.7 Non-Functional (NF)
| ID | Pri | Requirement | Acceptance criteria | Verify | Status |
|----|-----|-------------|---------------------|--------|--------|
| URS-NF-001 | M | Modular: `core` is pure/isomorphic (no DOM, no Node APIs); `api` and `web` consume it. | Lint rule bans imports. | T | Proposed |
| URS-NF-002 | M | TypeScript `strict`. | `tsc` in CI. | T | Proposed |
| URS-NF-003 | M | Unit tests per module + golden SVG snapshots; CI on every push. | CI green. | T | Proposed |
| URS-NF-004 | M | Every change cites URS IDs and records an impact assessment (§5). | Commit/PR inspection. | I | Proposed |
| URS-NF-005 | S | ≥ 80 % line coverage on `core`. | CI gate. | T | Proposed |
| URS-NF-006 | S | Container image for API + static web. | `docker run` serves both. | D | Proposed |
| URS-NF-007 | S | Only permissive-licence dependencies (MIT/Apache/BSD/ISC/OFL). | License check in CI. | T | Proposed |

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
