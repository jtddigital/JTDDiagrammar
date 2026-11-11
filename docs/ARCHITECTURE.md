# Architecture & Plan — JTDDiagrammar

## 1. Pipeline
```
source (JSON | XML*) ──adapter──▶ Model ──validate──▶ Model' ──layout──▶ Geometry ──render──▶ SVG string
```
Every stage is a pure function in `@jtd/core`. API and web call the **same** code → identical SVG (URS-WEB-003, URS-LY-001).

## 2. Repo layout (pnpm workspaces, TypeScript strict)
```
packages/
  core/                     # isomorphic, zero DOM/Node deps (URS-NF-001)
    src/model/              types.ts, schema.json
    src/adapters/           json.ts, xml.ts*
    src/validate/           schema.ts (Ajv), semantic.ts
    src/measure/            font-metrics.ts (generated table), text.ts (wrap/measure)
    src/layout/             rank.ts, grid.ts, place.ts, route.ts, labels.ts
    src/render/svg/         shapes/*.ts, bands.ts, edges.ts, defs.ts, escape.ts, index.ts
    src/index.ts            render(src, opts) → { svg, diagnostics }
  api/                      # Fastify
    src/routes/             render.ts, validate.ts, schema.ts, health.ts
    src/limits.ts
  web/                      # Vite + React + CodeMirror 6
    src/editor/  src/preview/  src/export/  src/examples/
fixtures/                   # shared sample diagrams + golden SVGs
docs/                       # URS.md, ARCHITECTURE.md
```
`*` = Should/Could, later phase.

## 3. Language (schema v1, draft)
Flat, ID-referenced (URS-IN-003). Flat beats nesting nodes under lanes: edges cross lanes, diffs stay small, moving a node = one field.
```json
{
  "version": "1",
  "title": "Order Fulfilment",
  "orientation": "horizontal",
  "lanes":  [{ "id": "cust", "label": "Customer" },
             { "id": "sales", "label": "Sales" },
             { "id": "wh", "label": "Warehouse" }],
  "phases": [{ "id": "order", "label": "Order" },
             { "id": "fulfil", "label": "Fulfil" }],
  "nodes": [
    { "id": "start", "type": "terminator", "label": "Start",       "lane": "cust",  "phase": "order" },
    { "id": "place", "type": "process",    "label": "Place order", "lane": "cust",  "phase": "order" },
    { "id": "stock", "type": "decision",   "label": "In stock?",   "lane": "sales", "phase": "order" },
    { "id": "ship",  "type": "process",    "label": "Ship",        "lane": "wh",    "phase": "fulfil" },
    { "id": "end",   "type": "terminator", "label": "End",         "lane": "cust",  "phase": "fulfil" }
  ],
  "edges": [
    { "from": "start", "to": "place" },
    { "from": "place", "to": "stock" },
    { "from": "stock", "to": "ship", "label": "Yes" },
    { "from": "stock", "to": "end",  "label": "No"  },
    { "from": "ship",  "to": "end" }
  ],
  "style": { "theme": "default" }
}
```
**Why JSON canonical:** native to JS, JSON Schema + Ajv for free, Fastify validates with the same schema, LLM-friendly. XML/YAML/DSL are thin adapters onto the same model — never separate render paths.

## 4. Layout algorithm (the hard part; why Mermaid/PlantUML fall short)
Generic engines (dagre, ELK) don't treat lanes×phases as hard constraints. Custom grid engine:

1. **Rank** (`rank.ts`): break cycles via DFS back-edges; longest-path layering *within each phase*. Global flow position = (phase index, local rank). Phases are monotonic → a node can't drift into another phase. (URS-LY-004)
2. **Grid** (`grid.ts`): column count per phase = max local rank across lanes. Cell = (lane, phase, rank).
3. **Place** (`place.ts`): nodes sharing a cell stack across the lane; order by `order` hint, else barycenter of neighbours (crossing reduction, URS-LY-007). Band sizes = max content + padding (URS-LY-002/003).
4. **Route** (`route.ts`): orthogonal A* on a sparse channel graph built from the gutters between cells; cost = length + bend penalty + crossing penalty. Ports chosen from relative direction unless hinted. (URS-LY-005/006)
5. **Labels** (`labels.ts`): place on longest segment, nudge off obstacles. (URS-LY-008)
6. **Orientation**: layout in horizontal coordinates; vertical = axis swap at the end. One algorithm. (URS-DM-003)

**Text measurement** (URS-LY-009): no DOM in Node, and canvas measurement differs per OS. Bundle one OFL font (e.g. Inter), generate an advance-width table at build time, embed the font in the SVG (`@font-face` data URI, subsetted). Deterministic everywhere.

## 5. API (Fastify)
| Method | Path | In | Out |
|--------|------|----|-----|
| POST | `/v1/render` | diagram (JSON) | `image/svg+xml` \| 400 diagnostics |
| POST | `/v1/validate` | diagram | `{ valid, diagnostics[] }` |
| GET  | `/v1/schema` | — | JSON Schema |
| GET  | `/v1/openapi.json` | — | OpenAPI |
| GET  | `/health` | — | 200 |

Limits: 1 MB body, 1000 nodes, 2000 edges, 2 s render timeout (URS-API-006). Diagnostic shape: `{ severity, code, message, path }` (JSON Pointer).

## 6. Web app
Split pane: CodeMirror (JSON mode + schema lint/autocomplete) | SVG preview (pan/zoom). Renders **client-side** via `@jtd/core` (no round-trip, works offline); export = download that SVG string. Diagnostics' JSON Pointer → source offset via `jsonc-parser` for inline markers.

## 7. Tooling
pnpm · TypeScript strict · Vitest (unit + golden SVG snapshots) · Playwright (web E2E) · ESLint `no-restricted-imports` guarding `core` purity · GitHub Actions CI · Docker.

## 8. Delivery phases
| Phase | Scope | Key URS |
|-------|-------|---------|
| **P0** Foundations | monorepo, CI, schema v1, types, validation | IN-001..005, NF-001..004 |
| **P1** MVP render | measure, rank, grid, place, simple orthogonal routing, all shapes, bands, SVG | DM-001..006, LY-001..005, LY-009, RN-001..004 |
| **P2** API | Fastify routes, limits, OpenAPI | API-001..009 |
| **P3** Web | editor, live preview, diagnostics, export | WEB-001..004 |
| **P4** Quality layout | obstacle-avoiding routing, crossing min, label placement, vertical orientation, wrap, styling | LY-006..008, LY-010, DM-007..010 |
| **P5** Extras | XML/YAML adapters, autocomplete, examples, share links, PNG/PDF | IN-006..008, WEB-005..009, RN-007 |

## 9. Risks
| Risk | Mitigation |
|------|------------|
| Edge routing quality is the make-or-break | Isolate in `route.ts` behind an interface; fixture suite of nasty cases; swap algorithms without touching others. |
| Font metric drift between runtimes | Single bundled font + generated table; never measure via DOM. |
| Schema churn breaks users | `version` field + adapters from old majors. |
