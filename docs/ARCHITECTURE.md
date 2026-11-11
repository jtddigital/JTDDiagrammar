# Architecture & Plan — JTDDiagrammar

## 1. Principle
Diagram types are plugins, each carrying its own schema, IR converter, AI generation assets and README example. Everything downstream of a type plugin (layout, routing, shapes, SVG, API, web app) is type-agnostic and works only on a shared **Graph IR**. A cross-functional flowchart is a flowchart with partitions. A state diagram is a graph with containers. Neither gets special code outside its own plugin. (URS-EXT-001..006)

## 2. Pipeline
```
source ─adapter─▶ doc ─registry[type]─▶ DiagramType
                         │ validate (schema + semantic hook)
                         │ toIR()
                         ▼
                      Graph IR ─engine[type.engine].layout()─▶ Geometry ─svg.render()─▶ SVG
```
| Layer | Knows about | Never knows about |
|-------|-------------|-------------------|
| adapters (json, xml*) | text formats | diagram types |
| diagrams/* | its own source model, the IR | layout internals, SVG |
| layout/* | IR, geometry, text metrics | types |
| render/svg | geometry, shape registry | types, layout |

Enforced with `no-restricted-imports` (URS-EXT-004, URS-NF-001).

## 3. Core contracts
```ts
// As implemented in P0: packages/core/src/registry/diagram-type.ts
interface DiagramType<M = unknown> {
  id: string;                          // "flowchart" | "state" | …
  title: string; description: string;
  schema: JSONSchema;                  // authoring schema with unique $id (URS-EXT-006); allowed shapes are an enum (URS-DM-004)
  engine: string;                      // "layered" (URS-EXT-005)
  validate?(m: M): Diagnostic[];       // semantic hook (URS-EXT-007)
  toIR(m: M): GraphIR;
  examples: [Example, ...Example[]];   // README + web templates (URS-EXT-010, URS-DOC-002, URS-WEB-007)
  ai: {                                // added in P4 (URS-EXT-009)
    schema: JSONSchema;                // generation schema: structured-output-safe subset (URS-AI-004)
    fromGenerated(g: unknown): M;      // deterministic: generation output → authoring source
    guide: string;                     // type-specific prompt guidance
    examples: { input: string; output: unknown }[];
  };
}

// As implemented in P0: packages/core/src/ir/types.ts. Every element carries `src` (JSON Pointer) for diagnostics.
interface GraphIR {
  direction: 'LR' | 'TB';
  nodes: { id; shape; label; parent?; order?; lane?; phase?; src? }[];   // lane/phase on the node, not in a lookup map
  edges: { id; from; to; label?; src? }[];                               // ports/marker/style added with DM-009/010
  containers: { id; label?; parent?; src? }[];                           // URS-DM-013
  partitions?: { lanes: Band[]; phases?: Band[] };                       // URS-DM-001/002
}

interface LayoutEngine { id: string; layout(ir: GraphIR, m: Measurer): Geometry }
interface Shape { id: string; textBox(w, h): Box; outline(w, h): PathData; ports(w, h): PortMap }
```
`Geometry` = positioned nodes, containers, bands, edge polylines and label boxes. The renderer turns it into SVG with no type knowledge.

## 4. Repo layout (pnpm workspaces, TypeScript strict)
```
packages/
  core/src/
    registry/                 diagram-type.ts, layout-engine.ts, registry.ts
    ir/                       types.ts
    schema/                   fragments.ts (envelope, id, band), combined.ts
    adapters/                 json.ts, xml.ts*
    validate/                 envelope.ts, schema.ts (Ajv), common.ts (ids, refs, partitions)
    compile.ts                envelope → schema → type rules + IR + common rules
    diagrams/                 index.ts (createRegistry)
      flowchart/              schema.ts, model.ts, to-ir.ts, validate.ts, examples.ts, index.ts
      state/                  (P5)
    shapes/                   shape.ts (contract, port helpers), library.ts (7 flowchart shapes; state shapes P5)
    builtins.ts               createRegistry(): built-in types + engines
    render.ts                 compile → engine.layout → renderSvg
    geometry.ts               engine output, renderer input
    style.ts                  typography shared by layout and render
    num.ts                    stable number formatting
    measure/                  font-metrics.ts (generated), text.ts
    layout/
      flow.ts                 (main, cross) ↔ (x, y) per direction
      pack.ts                 ordered packing (isotonic regression)
      simplify.ts, normalize.ts
      layered/                graph.ts, cycles.ts, rank.ts, order.ts, place.ts, route.ts, index.ts
      constraints/            partitions.ts (P3), containers.ts (P5)
    render/svg/               index.ts, text.ts, escape.ts, theme.ts; bands/containers in P3/P5
    index.ts                  render(src) → { svg, diagnostics }
  ai/src/                     Node only; core never imports it (URS-NF-009)
    client/                   claude.ts (Anthropic SDK), mock.ts, types.ts   (URS-AI-020)
    ingest/                   pdf.ts (pass-through document block), docx.ts, html.ts, text.ts, limits.ts
    prompt/                   system.ts, build.ts (cache-stable prefix ordering)
    generate.ts               select type → generate → convert → validate → repair loop
    repair.ts                 diagnostics → correction message
    eval/                     corpus/, run.ts, metrics.ts   (URS-AI-018)
  api/src/routes/             render.ts, validate.ts, schema.ts, types.ts, generate.ts, refine.ts, health.ts
  web/src/                    editor/, preview/, export/, generate/, examples/<type>/
fixtures/<type>/              samples + golden SVGs + README example
scripts/docs/                 readme.ts + cli.ts (P0: example sources, check); images.ts (P1: examples → docs/img/*.svg, Playwright → *.png); reference.ts
docs/img/                     generated; never hand-edited
README.md
```

## 5. Source formats (schema v1, drafts)
Each type picks the source structure that fits it best; the IR is what they share (URS-IN-003).

**Flowchart, with lanes = cross-functional** (URS-TYP-001/002). The format is flat with ID references: edges cross lanes, and diffs stay small.
```json
{
  "version": "1", "type": "flowchart", "direction": "LR",
  "lanes":  [{ "id": "cust", "label": "Customer" }, { "id": "wh", "label": "Warehouse" }],
  "phases": [{ "id": "order", "label": "Order" }, { "id": "fulfil", "label": "Fulfil" }],
  "nodes": [
    { "id": "start", "shape": "terminator", "label": "Start",     "lane": "cust", "phase": "order" },
    { "id": "stock", "shape": "decision",   "label": "In stock?", "lane": "wh",   "phase": "order" },
    { "id": "ship",  "shape": "process",    "label": "Ship",      "lane": "wh",   "phase": "fulfil" }
  ],
  "edges": [
    { "from": "start", "to": "stock" },
    { "from": "stock", "to": "ship", "label": "Yes" }
  ]
}
```
Drop `lanes`/`phases` and the same file is a plain flowchart.

**State** (URS-TYP-003..005). Nested, because the hierarchy is the meaning.
```json
{
  "version": "1", "type": "state", "direction": "LR",
  "states": [
    { "id": "init", "kind": "initial" },
    { "id": "idle", "label": "Idle" },
    { "id": "active", "label": "Active", "states": [
        { "id": "a0", "kind": "initial" }, { "id": "run", "label": "Running" }, { "id": "paused", "label": "Paused" } ] },
    { "id": "done", "kind": "final" }
  ],
  "transitions": [
    { "from": "init", "to": "idle" },
    { "from": "idle", "to": "active", "event": "start", "guard": "ready", "action": "boot()" },
    { "from": "run", "to": "paused", "event": "pause" },
    { "from": "run", "to": "run", "event": "tick" },
    { "from": "active", "to": "done", "event": "stop" }
  ]
}
```
`toIR` turns composite states into containers and builds labels from the `event [guard] / action` parts.

## 6. Layout
One engine at first, `layered` (Sugiyama-style), with optional constraint modules. Types turn features on by populating the IR. Engines never check the type.

1. **Cycles**: DFS to find back-edges, which are reversed for ranking. (URS-LY-004)
2. **Rank**: longest-path layering. When `phases` are present, ranks are scoped per phase and phases stay in order. (`constraints/partitions.ts`)
3. **Order**: barycenter crossing reduction. Nodes are confined to their lane band and to their container's span; `order` hints are respected. (URS-LY-007, URS-DM-008)
4. **Place**: compute coordinates, size bands and containers to their content, recursing bottom-up for nested containers. (URS-LY-002/003/012)
5. **Route**: orthogonal A* over a channel graph built from the gaps between nodes and bands, with a dedicated self-loop router. (URS-LY-005/006/011)
6. **Labels**: place on the longest segment, then nudge off obstacles. (URS-LY-008)
7. **Direction**: lay out in LR coordinates, then swap axes for TB. (URS-DM-003)

Future types that don't fit a layered layout (sequence, ER) add a new engine and change nothing else.

**Text measurement** (URS-LY-009), as built in P1: `scripts/fonts/metrics.ts` generates a table of advance widths (code points 32–255, regular and bold) from **Liberation Sans** (OFL), committed as `measure/font-metrics.ts`. Liberation Sans is metric-compatible with Arial, and Arial is close to Helvetica. The SVG declares `Arial, 'Liberation Sans', Helvetica, sans-serif` with kerning and ligatures off, so text measures the same everywhere **without embedding a font**. Chromium measurements match the table to within 0.02 px. Characters outside the table count as 1 em, which over-estimates and is safe. Embedding a font remains an option (URS-RN-006) if a non-Arial font is ever wanted.

**P1 implementation notes.** Ranks come from longest-path layering; sources are then pulled next to their earliest successor. Crossings are reduced with 8 barycenter sweeps, keeping the best result. Cross-axis placement uses neighbour-mean targets packed with isotonic regression (`layout/pack.ts`), which gives no overlaps and least-squares alignment. Routing is orthogonal through the gaps between layers: jogs are assigned to tracks by interval colouring, ports spread along each side, and diamonds use their side tips for branches. Each edge label sits in its edge's first gap. Not yet done: obstacle avoidance beyond the layer grid, label collision handling, and partitions or containers (warnings are emitted).

## 7. API (Fastify)
| Method | Path | Out |
|--------|------|-----|
| POST | `/v1/render` | `image/svg+xml`, or 400 with diagnostics |
| POST | `/v1/validate` | `{ valid, diagnostics[] }` |
| POST | `/v1/generate` | `{ source, valid, diagnostics, attempts, usage, svg? }`, or an SSE stream |
| POST | `/v1/refine` | as `generate` |
| GET  | `/v1/types` | registered types |
| GET  | `/v1/schema[/{type}]` | JSON Schema |
| GET  | `/v1/openapi.json` | OpenAPI |
| GET  | `/health` | 200 |

Limits: 1 MB body, 1000 nodes, 2000 edges, 2 s render time (URS-API-006). Diagnostic shape: `{ severity, code, message, path }`, where `path` is a JSON Pointer.

## 8. Web app
Split pane: a CodeMirror editor next to an SVG preview with pan and zoom. Rendering happens client-side through `@jtd/core`. The editor fetches its schema from the registry using the document's `type`, so it contains no type-specific code (URS-WEB-010). Export downloads the SVG string that is already rendered (URS-WEB-003). The generate panel calls the API (the key never reaches the browser) and loads the result into the editor (URS-WEB-011..014).

## 9. AI generation (`@jtd/ai`)
```
files/text ─ingest─▶ content blocks ─(type=auto? select)─▶ Claude + output_config.format(type.ai.schema)
   ─▶ JSON ─type.ai.fromGenerated─▶ source ─core: schema + semantic + layout─▶ ok? ─▶ { source, svg }
                                                   └─ fail ─▶ repair msg (diagnostics) ─▶ Claude … ≤ N
```
- **Two schemas per type.** The *authoring* schema is the full schema used by the editor, the API and Ajv. The *generation* schema is the subset structured outputs supports: no recursion, no `minLength`/`minimum`, `additionalProperties: false` everywhere. For example, a state diagram is generated flat with `parent` refs, and `fromGenerated` nests it. The authoring validators remain the source of truth, so a constraint the generation schema had to drop is still enforced. (URS-AI-004/005)
- **Repair loop.** Diagnostics (JSON Pointer + message) go back to Claude as a follow-up turn. The default is 2 retries, and the best attempt is always returned with an honest `valid` flag. (URS-AI-006)
- **Ingest.** PDF is passed through as a `document` block (≤ 32 MB, ≤ 600 pages). DOCX, HTML and MD are converted to text server-side. Inputs over the limits are rejected after a `count_tokens` pre-check, never truncated. (URS-AI-001/009)
- **Request.** The model defaults to `claude-opus-5-5`, with adaptive thinking and effort configurable. Requests are streamed. Server-side `fallbacks` handle refusals, and `stop_reason` is checked before parsing. (URS-AI-002/008)
- **Caching.** Prefix order: system prompt → type guide → examples → [cache breakpoint] → documents → instruction. Nothing volatile goes in the prefix. (URS-AI-016)
- **Safety.** No tools are exposed, and the server fixes the type and schema, so document text can only influence field *values*, which the renderer escapes. Nothing is logged or persisted by default. (URS-AI-010..012)
- **Provenance.** An optional `source` quote is stored per node or edge as a schema field, because Citations can't be combined with structured outputs. (URS-AI-014)
- **Tests.** `ClaudeClient` is an interface; CI uses a deterministic mock and the live eval runs on demand. (URS-AI-018/020)

## 10. Documentation
- `README.md` contains overview, quick start, API with `curl`, a per-type section (source + rendered image), AI usage and config, architecture and workflow. (URS-DOC-001/002)
- `pnpm docs:images` renders every type's README fixture through core into `docs/img/<type>.svg` and captures the web app (editor, generate panel) to PNG with Playwright. (URS-DOC-003/005)
- A CI job re-runs the script and fails on any diff, or when a registered type has no fixture. That ties the docs to the registry, so a new type can't ship undocumented. (URS-DOC-004, URS-EXT-010)

## 11. Delivery phases
| Phase | Scope | Key URS |
|-------|-------|---------|
| **P0** Foundations | monorepo, CI, registry, IR, schema composition, common validation, README skeleton + docs-image pipeline | EXT-001..007, EXT-010, IN-001..005, NF-001..004, NF-008, DOC-001, DOC-003/004 |
| **P1** Flowchart | measuring, layered engine, basic router, flowchart shapes, SVG, README example | TYP-001, DM-003..006, LY-001..005, LY-009, RN-001..005, DOC-002 |
| **P2** API + Web (thin) | render/validate/types/schema routes, editor, preview, export | API-001..009, API-011, WEB-001..004, WEB-010, DOC-005 |
| **P3** Cross-functional | partitions constraint, band rendering | TYP-002, DM-001/002/005, LY-002/003, RN-002 |
| **P4** AI generation | `ai` package, ingest, generation schemas, repair loop, generate API, generate panel, mock + eval | AI-001..012, AI-020, EXT-009, API-012/015, WEB-011, NF-009 |
| **P5** State | containers, compound layout, self-loops, state shapes | TYP-003..005, DM-013, LY-011/012 |
| **P6** Layout quality | obstacle avoidance, crossing minimisation, label placement, wrapping, styling | LY-006..008, LY-010, DM-007..010 |
| **P7** Extras | AI refine/provenance/streaming/eval, XML/YAML adapters, autocomplete, share links, PNG/PDF | AI-013..019, API-013/014, WEB-005..009, WEB-012..014, IN-006..008, RN-007, DOC-006 |

P1 → P2 gets a working end-to-end slice early. AI generation (P4) comes after cross-functional so the main target type exists first. P5 then tests the plugin seams, generation included, with a very different type. Each phase updates the README images; CI enforces it.

## 12. Risks
| Risk | Mitigation |
|------|------------|
| The IR is shaped around flowcharts and doesn't fit later types | Build P3 (partitions) and P4 (containers) before stabilising the IR. Add new engines rather than bending `layered`. |
| Edge routing quality makes or breaks the product | Keep it isolated behind the `route/` interface; maintain a fixture suite of hard cases. |
| Font metrics drift between runtimes | Generated width table for an Arial-compatible font; never measure through the DOM. Residual risk: a viewer with no Arial or Liberation Sans falls back to Helvetica or another sans-serif (small width differences). |
| Schema churn breaks users | `version` field per document, plus adapters from older major versions. |
| Generated diagrams are schema-valid but semantically wrong (missed steps, wrong lane) | Run the eval corpus with recall and lane-accuracy metrics; the user reviews in the editor before export; provenance quotes. |
| The generation schema drifts from the authoring schema | A property test proves that every generated output converts to an authoring-valid source shape (URS-AI-004). |
| Large documents cost money and are slow | `count_tokens` pre-check, a per-request token budget, prompt caching, and configurable effort. |
| Prompt injection via documents | No tools; type and schema fixed by the server; output is data only and escaped. |
