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
`Geometry` = `{ width, height, bands, corner?, nodes, edges }` (`core/src/geometry.ts`): positioned lane/phase bands with header cells, nodes, edge polylines and label boxes. Containers are added in P5. The renderer turns it into SVG with no type knowledge.

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
      layered/                graph.ts, constants.ts, cycles.ts, rank.ts, layering.ts (phases), order.ts, place.ts (lanes),
                              main-axis.ts (phase spans), route.ts, bands.ts, index.ts; containers in P5
    render/svg/               index.ts, bands.ts, text.ts, escape.ts, theme.ts; containers in P5
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

**Flowchart, with lanes = cross-functional** (URS-TYP-001/002). Nodes are a flat list with ID references, so edges can cross lanes and diffs stay small. Since v0.22 each node lists its outgoing connections in `to` (URS-IN-009), so a node and where it leads read together; `edgeStyle` is the default style for all of them.
```json
{
  "version": "1", "type": "flowchart", "direction": "LR",
  "lanes":  [{ "id": "cust", "label": "Customer" }, { "id": "wh", "label": "Warehouse" }],
  "phases": [{ "id": "order", "label": "Order" }, { "id": "fulfil", "label": "Fulfil" }],
  "nodes": [
    { "id": "start", "shape": "terminator", "label": "Start",     "lane": "cust", "phase": "order",
      "to": [{ "node": "stock" }] },
    { "id": "stock", "shape": "decision",   "label": "In stock?", "lane": "wh",   "phase": "order",
      "to": [{ "node": "ship", "label": "Yes", "exitSide": "S" }] },
    { "id": "ship",  "shape": "process",    "label": "Ship",      "lane": "wh",   "phase": "fulfil" }
  ]
}
```
Drop `lanes`/`phases` and the same file is a plain flowchart.

**State** (URS-TYP-003..005). Nested, because the hierarchy is the meaning.
```json
{
  "version": "1", "type": "state", "direction": "LR",
  "states": [
    { "id": "init", "kind": "initial", "to": [{ "state": "idle" }] },
    { "id": "idle", "label": "Idle", "to": [{ "state": "active", "event": "start", "guard": "ready", "action": "boot()" }] },
    { "id": "active", "label": "Active", "to": [{ "state": "done", "event": "stop" }], "states": [
        { "id": "a0", "kind": "initial", "to": [{ "state": "run" }] },
        { "id": "run", "label": "Running", "to": [{ "state": "paused", "event": "pause" }, { "state": "run", "event": "tick" }] },
        { "id": "paused", "label": "Paused" } ] },
    { "id": "done", "kind": "final" }
  ]
}
```
`toIR` turns composite states into containers and builds labels from the `event [guard] / action` parts. Transitions are nested under their source state (`to`), at any depth; `transitionStyle` is their default style.

Both types flatten their nested connections with one helper (`linksOf`, `transitionsOf`). Each connection keeps its source, a generated id (`edge:<source>:<n>` unless the author set `id`) and its JSON Pointer (`/nodes/2/to/0`), so diagnostics point at the right entry. AI generation keeps flat `edges`/`transitions` (`from`, `to`), which are easier for a model to produce reliably; `fromGenerated` nests them (URS-AI-004). Refine edits the authoring source directly (URS-AI-013).

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

**P1 implementation notes.** Ranks come from longest-path layering; sources are then pulled next to their earliest successor. Crossings are reduced with 8 barycenter sweeps, keeping the best result. Cross-axis placement uses neighbour-mean targets packed with isotonic regression (`layout/pack.ts`), which gives no overlaps and least-squares alignment. Routing is orthogonal through the gaps between layers: jogs are assigned to tracks by interval colouring, ports spread along each side, and diamonds use their side tips for branches. Each edge label sits in its edge's first gap. Not yet done: obstacle avoidance beyond the layer grid, label collision handling, and containers (a warning is emitted).

**Layout quality, as built in P6.**
- **Measuring.** `layout/metrics.ts` counts crossings, collinear overlaps, edges through nodes or headers, labels on nodes, label pairs and lines through labels. `test/quality-baseline.json` records the counts per fixture, random graphs included. `quality.test.ts` fails if any count rises, and holds edges-through-nodes and labels-on-nodes at zero (URS-LY-006/008). `pnpm quality --update` lowers the baseline after an improvement. From baseline to now: crossings 3452 → 3007, overlaps 7 → 1, labels on nodes 18 → 0, label collisions 3 → 0, lines through labels 121 → 10. Every hand-written fixture has 0 crossings and 0 overlaps.
- **Ordering.** Crossings are counted with a Fenwick tree (O(n log n)). After the barycenter sweeps, a transpose pass swaps adjacent same-lane vertices while that removes crossings. Order hints are re-applied after every sort, and transpose never swaps two hinted vertices (URS-DM-008).
- **Routing.** Jog tracks in each gap are reordered by adjacent swaps, using an exact pairwise crossing cost. Self-loops take part in port spreading, sorted to the corner they turn towards. Rounded sides (terminator ends, circles) spread ports along the arc. Diamonds (`Shape.tips`) get their four tips allocated jointly by brute force (≤ 4 edges): the start tip for arrivals, the end tip for departures, otherwise the side facing the first hop, ties going to the edge whose far end is best aligned. No edge is routed through the diamond; beyond 4 edges the shared-tip fallback applies.
- **Fewer bends (URS-LY-013).** Three steps.
  - Placement ends by *straightening*: blocks of vertices already in line, joined by edges that would run straight (one edge on each facing side, or a diamond tip), move together onto a neighbour's line when that straightens more edges than it bends, within their layer's room.
  - The router keeps every end perpendicular to its side. Diamond side tips are routed like side hints, with a stub straight out of the tip. Tracks keep `clear` (arrowhead + 6 px) from the nodes on both sides of a gap, so the last leg always shows its line past the arrowhead.
  - `layout/polish.ts` is engine-agnostic, after routing. Each edge takes the first clean route with fewer bends: straight, then L, then Z or U, then three bends. "Clean" means a free port, side hints honoured, no node, header, callout or unrelated container border in the way, no line on or hugging another edge, and no extra crossings. Within a bend count it prefers the router's sides, then the shortest. Polish takes about 130 ms of the 170 ms for the 200-node random benchmark.
- **Edge labels (URS-DM-024).** An edge carries a list of labels. Pinned ones (`at`, percent of the polyline's length) sit exactly there; the router reserves gap room for all of an edge's labels side by side.
- **Decorations (URS-DM-025..027).** Badges are drawn only: they straddle the node's top edge and take no layout room. Label icons widen the label box the router reserves. The legend is laid out after styles are attached (`layout/legend.ts`, called from `render.ts`), so it works with any engine. The title block is drawn by the SVG renderer from `GraphIR.meta`.
- **Lifecycle (URS-TYP-009/010).** Everything Vault-specific is in `diagrams/lifecycle/`. It produces only generic IR: verdict edges, badges, `bar` nodes, dashed start edges, main-path styles, state tints, legend items and band groups for role lanes. Layout and render never branch on it.
- **Labels.** `layout/labels.ts` is a generic pass over finished geometry, so both engines' output goes through it. Candidates are the router's spot, five points along each segment, and spots just beside the line; they're scored for collisions using a spatial grid (`layout/grid.ts`).
- **Styling.** Styles live in the IR and are attached to geometry by id in `render/styles.ts`, after layout, so engines never see them. The renderer takes a `Palette` per theme and makes one arrowhead marker per edge colour. Colours must match `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`.
- **Performance.** Two quadratic spots were fixed (an `indexOf` sort key and array copying in the grid). A random 1000-node / 2000-edge graph renders in about 2.3 s; real diagrams are far smaller, and URS-LY-010 holds with margin.
- **Deferred to P7:** port side hints (URS-DM-009). Honouring arbitrary sides needs routing outside the layer gaps.

**Compound layout, as built in P5** (`compound.ts`, used when the IR has containers and no partitions; flat diagrams keep the original path, and their golden SVGs are byte-identical). Hierarchical ports, as in ELK's separate-children mode:
1. Every edge is planned at its lowest common scope. Each container border it crosses gets a zero-size port item.
2. **Top-down**, each scope is ranked with `layering()`: entry ports in a first phase, content in the middle, exit ports in a last phase. The ranking at an edge's lowest common scope decides which side, flow start or flow end, it uses at every border below.
3. **Bottom-up**, each scope runs build → order → place → route with child containers as sized boxes. The router's new `fixed` hook pins a crossing edge to the exact border point the child produced.
4. Containers are sized around their content, with the label and a divider at the top.
5. Edges are stitched from their pieces, innermost on the source side to innermost on the target side. Labels come from the piece at the lowest common scope (self-loops from their own level).

Not supported, with a warning: an edge between a container and its own content; containers inside lanes or phases.

**State type** (`diagrams/state/`): nested source; composite states become IR containers, pseudostates become the `initial`, `final` and `choice` shapes (solid fills via `Shape.solid`, no label via `Shape.unlabelled`); transition labels are `event [guard] / action`. The AI generation schema is flat with `parent` refs (no recursion in structured outputs); `fromGenerated` nests them, and unknown or cyclic parents fall back to the top level.

**Partitions, as built in P2.** Phases are hard column groups: `layering.ts` reverses links that point into an earlier phase, ranks each phase on its own, and offsets the ranks, so every phase owns at least one layer (empty phases included). `main-axis.ts` pads each phase, enforces a minimum length that fits its header label, and puts phase boundaries inside the gaps between layers. Lanes are hard row groups: ordering sorts by lane first, then by barycenter. `place.ts` places each lane on its own (alignment uses only same-lane neighbours), then stacks the lanes as bands, each at least as tall as its header label, with the content centred. Dummy vertices join the lane of their chain's first vertex, so a cross-lane edge stays in its source lane until its last gap. `bands.ts` builds the lane and phase boxes and their header cells in flow coordinates. Lane headers sit at the flow start and phase headers at the cross start, so `LR` gets lanes on the left and phases on top, and `TB` the reverse, from the same code. Lane labels are horizontal and wrap at 140 px.

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

Limits (URS-API-006): 1 MB body (413), 1000 nodes and 2000 edges (413, checked by core `render()` after compiling and before layout), and a **5 s** render time (422 `limit.time`). The planned 2 s was raised after benchmarking: a random 1000-node / 2000-edge graph takes about 2.4 s. Diagnostic shape: `{ severity, code, message, path }`, where `path` is a JSON Pointer.

**As built in P3** (`packages/api`). Routes are declared once as a table (`routes/*.ts`). The server registers them, and `openapi.ts` derives the OpenAPI 3.1 document from the same table, so the two can't drift. Rendering runs in a `RenderPool` of worker threads (`pool.ts`, `render-worker.ts`): one job per worker, and a job past the timeout has its worker terminated and replaced. Validation is cheap and runs on the main thread. The registry is loaded from a configurable module, so tests can register the fixture type in the server and its workers (URS-EXT-002). Only JSON bodies are accepted (`text/plain` parser removed). Fastify request errors map to diagnostics (`errors.ts`). Bodies are never logged. SVG responses carry a `default-src 'none'` CSP. The built web app is served at `/` when present. Node runs the TypeScript sources directly (type stripping, no build step); workspace packages resolve through symlinks, which keeps them outside `node_modules` and so allowed to be stripped. The Docker image relies on the same property.

## 8. Web app
Three resizable, hideable panes (URS-WEB-015): an AI conversation, a CodeMirror editor and an SVG preview with pan and zoom. Rendering happens client-side through `@jtd/core`. The editor fetches its schema from the registry using the document's `type`, so it contains no type-specific code (URS-WEB-010). Export downloads the SVG string that is already rendered (URS-WEB-003). The AI pane calls the API (the key never reaches the browser), loads results into the editor and keeps the source from before each change so it can be stepped back (URS-WEB-011..017). The preview is interactive through the IR's source pointers: cursor ↔ element selection, hover highlights, and in-place label edits written with `jsonc-parser` so formatting is kept (URS-WEB-020).

AI providers (URS-AI-023) implement one `AiClient` interface in `packages/ai`: `anthropicClient` (structured outputs, falling back to instructions) and `copilotClient` (Microsoft Graph Copilot Chat API, instructions only). The API builds a Copilot client per request from the user's delegated Graph token (`X-Graph-Token`); the browser gets that token from Microsoft sign-in (MSAL, loaded on demand, returning to `auth-redirect.html`).

Styles follow CUBE CSS over design tokens (`web/src/styles`): tokens, then global element defaults, compositions (`cluster`, `stack`, `frame`, `measure`), utilities, and one file per block. Variants are data attributes, not new classes.

**As built in P3** (`packages/web`, Vite + React + CodeMirror 6). `useDiagram` re-renders 250 ms after the last edit, client-side, and keeps the last valid SVG. While the render is behind the editor, the status reads "Updating…" and Export is disabled. E2E found that without this, Export could save the previous diagram. `editor/locate.ts` maps each diagnostic's JSON Pointer to a source range with `jsonc-parser` (property → key; array element → opening bracket; missing → nearest ancestor; parse errors → parser offset), shown with `@codemirror/lint`. The preview is an `<img>` of a blob URL, so SVG content can never run script in the app, scaled to fit the pane. Not yet: moving rendering into a Web Worker for very large diagrams. The bundle is about 600 kB minified (React, CodeMirror, Ajv); code-splitting is deferred.

**As built in Sweep E.** The preview is now inline SVG, so it can pan and zoom (a CSS transform on a stage; the user's zoom survives edits), show native `<title>` tooltips (provenance quotes, URS-WEB-014) and map clicks back to source. Inlining is only safe sanitised: `preview/sanitize.ts` parses with `DOMParser` and keeps only the SVG 1.1 elements and attributes the renderer emits (the URS-RN-001 allowlist), with colour, transform, marker and style values pattern-checked so nothing can reference an external resource. Click to source: `render()` now also returns the IR; an element's SVG id (`n-`, `e-`, `c-`, `l-`, `p-` + model id, URS-RN-005) gives its IR `src` pointer, and `locate()` gives the range to select. Autocomplete (`editor/complete.ts`) walks the registered schema of the document's `type` along the `jsonc-parser` path: property names at keys, `enum`/`const` values at values. `persist.ts` keeps the source in localStorage and encodes share links as base64url deflate-raw (`CompressionStream`) in the fragment. The generate client asks for SSE and parses the fetch stream, so stages show as they happen; plain JSON replies still work. PNG export draws the SVG into a canvas at 2×. The registry comes from the `@jtd/registry` alias, set from `REGISTRY_MODULE` at build time (URS-EXT-008).

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

**As built in P4** (`packages/ai`; `DiagramType.ai` in core).
- `client.ts` defines `ClaudeClient` (`complete`, `countTokens`). `anthropic.ts` implements it with the official SDK: `beta.messages.stream(...).finalMessage()`, `output_config: { effort, format: { type: 'json_schema', schema } }`, `max_tokens` 64000, the system prompt marked `cache_control: ephemeral`, and server-side refusal fallbacks (`betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'`, switch with `AI_FALLBACKS`). Thinking is left at Opus 5.5's adaptive default and tuned with effort. SDK errors map to `ai.config`, `ai.rate-limit` and `ai.upstream`. `mock.ts` replays scripted replies for tests.
- `ingest/files.ts` passes PDFs through as base64 `document` blocks. DOCX goes through mammoth, HTML through html-to-text (scripts and images dropped), and TXT/MD are decoded. Every text is wrapped in `<document name=…>`, with any `</document>` inside it neutralised. Limits: file count, size per file, total size (32 MB request cap including base64).
- `prompt.ts` builds a byte-stable system prompt per type (rules + `ai.guide` + few-shot examples) and keeps all material in the user turn. The repair turn lists each diagnostic as `- <pointer> (<code>): <message>`.
- `generate.ts` steps: ingest → (`auto`: a low-effort selection call constrained to the registered type ids) → `count_tokens` against `AI_MAX_INPUT_TOKENS` → generate → `ai.fromGenerated` → the injected `render` (the API passes its worker pool, so generated diagrams get the same time and size limits) → repair until valid or out of attempts. `refusal` and `max_tokens` stop reasons throw before any parsing. Assistant turns are echoed back verbatim, which keeps the history append-only so thinking blocks stay valid.
- API: `POST /v1/generate` takes multipart or JSON. If the client disconnects, the Claude call is aborted. `GET /v1/ai` reports availability. Without credentials the client is never constructed and generate returns 503.
- Web: `GeneratePanel` posts multipart, loads `source` into the editor (also when `valid: false`, with a note), and supports Cancel.
- Known gaps: no PDF page count check (the API's limit applies), no staged progress events, no provenance quotes, and no cost estimate. Diagnostic pointers assume the generation and authoring shapes line up, which holds for flowchart; a nested type such as state must translate pointers. The live smoke check (`pnpm ai:live`, three cases) passes, but output quality is not measured against reference diagrams until the full evaluation suite (URS-AI-018) exists.

## 10. Documentation
- `README.md` contains overview, quick start, API with `curl`, a per-type section (source + rendered image), AI usage and config, architecture and workflow. (URS-DOC-001/002)
- `pnpm docs:images` renders every type's README fixture through core into `docs/img/<type>.svg` and captures the web app (workspace, AI pane) to PNG with Playwright. (URS-DOC-003/005)
- A CI job re-runs the script and fails on any diff, or when a registered type has no fixture. That ties the docs to the registry, so a new type can't ship undocumented. (URS-DOC-004, URS-EXT-010)

### Styling engine (URS-DM-010, DM-014..017)
Styles reach the IR already merged: each type's `toIR` lays the item's `style` over its section default from `styles` (`diagrams/section-styles.ts`). Layout reads only the IR style fields that change geometry: font size and weight through `fontOf`, `width`/`height`, and `label`. Render reads the rest. For `label: callout | auto`, `sized()` keeps the shape's standard size, judged by each shape's `inner(w, h)` text area, and records the callout's size. The vertex reserves room for it (`after` across the flow, `reach` along it), so spacing, lane bands and layer widths include the callout while ports and centres still use the shape. After routing, `placeLabels` starts each callout in its reserved spot and moves it only when something blocks it, then places edge labels around it.

### Object lifecycles (URS-TYP-008, DM-019, DM-020)
`lifecycle` is a plugin, like the other types. States become one partition axis; workflows, plus the optional *Lifecycle actions* band, become the other. States go on the phase axis when `statesAs: columns` meets `direction: LR`, or `rows` meets `TB`, and on the lane axis otherwise. So orientation and flow direction are independent, and the engine never knows which is which.

Stages become **band groups**, a generic IR feature (`partitions.laneGroups` / `phaseGroups`). The layered engine draws them as a header strip just outside the band headers, and adds empty filler cells over ungrouped bands. It widens member bands when a group label needs more room. Entry criteria and actions use the generic **header detail** (`Band.detail`), drawn smaller under the label.

Lifecycle rules report unknown states, bad stages and missing targets in lifecycle terms. `toIR` keeps those references out of the IR, so the common lane/phase rules never repeat them. State changes use the shared `chevron` shape.

## 10a. Distribution
A release is one archive, `jtddiagrammar.tar.gz`. It holds the same files as the Docker image: the TypeScript sources of `core`, `ai` and `api`, the built web app, and the lockfile, plus the launchers. The installers (`install.sh`, `install.ps1`) take the latest or a named GitHub release, using the API asset URLs so private repos work with a token. They verify the SHA-256 and extract into `versions/<tag>`, then run `pnpm install --prod --frozen-lockfile` there through corepack. `current` (a symlink, or a one-line file on Windows) selects the version; the previous version is kept. `config.env` sits outside the version directories, so updates keep it. The `jtddiagrammar` launcher loads it, binds to 127.0.0.1, waits for `/health`, then opens the browser. Installing dependencies on the target avoids shipping pnpm's symlinked `node_modules`, which Windows tar cannot extract reliably. The cost is that the npm registry must be reachable at install time. Windows is the primary target (URS-NF-013). `install.ps1` runs under Windows PowerShell 5.1 and PowerShell 7, installs Node.js LTS with winget when it is missing, and adds Start Menu and desktop shortcuts plus a user PATH entry. It writes a `.cmd` shim that runs the launcher with `-ExecutionPolicy Bypass`. `uninstall` deletes files from a detached `cmd` after exit, because the shim is still open while it runs. (URS-NF-010..013)

## 11. Delivery phases
| Phase | Scope | Key URS |
|-------|-------|---------|
| **P0** Foundations | monorepo, CI, registry, IR, schema composition, common validation, README skeleton + docs-image pipeline | EXT-001..007, EXT-010, IN-001..005, NF-001..004, NF-008, DOC-001, DOC-003/004 |
| **P1** Flowchart | measuring, layered engine, basic router, flowchart shapes, SVG, README example | TYP-001, DM-003..006, LY-001..005, LY-009, RN-001..005, DOC-002 |
| **P2** Cross-functional | partitions constraint, band rendering | TYP-002, DM-001/002/005, LY-002/003, RN-002 |
| **P3** API + Web (thin) | render/validate/types/schema routes, editor, preview, export | API-001..009, API-011, WEB-001..004, WEB-010, DOC-005 |
| **P4** AI generation | `ai` package, ingest, generation schemas, repair loop, generate API, generate panel, mock + eval | AI-001..012, AI-020, EXT-009, API-012/015, WEB-011, NF-009 |
| **P5** State | containers, compound layout, self-loops, state shapes | TYP-003..005, DM-013, LY-011/012 |
| **P6** Layout quality | obstacle avoidance, crossing minimisation, label placement, wrapping, styling | LY-006..008, LY-010, DM-007..010 |
| **P7** Extras (sweeps A–E) | AI refine/provenance/streaming/eval, XML/YAML adapters, hints, notes, org chart, autocomplete, share links, PNG | AI-013..021, API-013/014, WEB-005..009, WEB-012..014, IN-006/007, DM-009/012, TYP-006, RN-007, EXT-008, DOC-006 |

Cross-functional (P2) was moved ahead of the API and web app (P3) at the user's request, so the main target type exists first. AI generation (P4) follows them. P5 then tests the plugin seams, generation included, with a very different type. Each phase updates the README images; CI enforces it.

## 12. Risks
| Risk | Mitigation |
|------|------------|
| The IR is shaped around flowcharts and doesn't fit later types | Build partitions (P2) and containers (P5) before stabilising the IR. Add new engines rather than bending `layered`. |
| Edge routing quality makes or breaks the product | Keep it isolated behind the `route/` interface; maintain a fixture suite of hard cases. |
| Font metrics drift between runtimes | Generated width table for an Arial-compatible font; never measure through the DOM. Residual risk: a viewer with no Arial or Liberation Sans falls back to Helvetica or another sans-serif (small width differences). |
| Schema churn breaks users | `version` field per document, plus adapters from older major versions. |
| Generated diagrams are schema-valid but semantically wrong (missed steps, wrong lane) | Run the eval corpus with recall and lane-accuracy metrics; the user reviews in the editor before export; provenance quotes. |
| The generation schema drifts from the authoring schema | A property test proves that every generated output converts to an authoring-valid source shape (URS-AI-004). |
| Large documents cost money and are slow | `count_tokens` pre-check, a per-request token budget, prompt caching, and configurable effort. |
| Prompt injection via documents | No tools; type and schema fixed by the server; output is data only and escaped. |
