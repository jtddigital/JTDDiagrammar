# Architecture & Plan — JTDDiagrammar

## 1. Principle
Diagram types are plugins. Everything downstream of a type plugin (layout, routing, shapes, SVG, API, web app) is type-agnostic and works only on a shared **Graph IR**. A cross-functional flowchart is a flowchart with partitions. A state diagram is a graph with containers. Neither gets special code outside its own plugin. (URS-EXT-001..006)

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
| types/* | its own source model, the IR | layout internals, SVG |
| layout/* | IR, geometry, text metrics | types |
| render/svg | geometry, shape registry | types, layout |

Enforced with `no-restricted-imports` (URS-EXT-004, URS-NF-001).

## 3. Core contracts
```ts
interface DiagramType<M = unknown> {
  id: string;                          // "flowchart" | "state" | …
  schema: JSONSchema;                  // validates M (URS-EXT-006)
  shapes: string[];                    // allowed shape ids (URS-DM-004)
  engine: string;                      // "layered" (URS-EXT-005)
  validate?(m: M): Diagnostic[];       // semantic hook (URS-EXT-007)
  toIR(m: M): GraphIR;
}

interface GraphIR {
  direction: 'LR' | 'TB';
  nodes: { id: string; shape: string; label: string; parent?: string; order?: number; style?: Style }[];
  edges: { id: string; from: string; to: string; label?: string; ports?: Ports; marker?: string; style?: Style }[];
  containers: { id: string; label?: string; parent?: string; style?: Style }[];          // URS-DM-013
  partitions?: { lanes: Band[]; phases?: Band[]; assign: Record<string, { lane: string; phase?: string }> }; // URS-DM-001/002
}

interface LayoutEngine { id: string; layout(ir: GraphIR, m: Measurer): Geometry }
interface Shape { id: string; textBox(w, h): Box; outline(w, h): PathData; ports(w, h): PortMap }
```
`Geometry` = positioned nodes, containers, bands, edge polylines and label boxes. The renderer turns it into SVG with no type knowledge.

## 4. Repo layout (pnpm workspaces, TypeScript strict)
```
packages/
  core/src/
    registry.ts               types + engines + shapes
    ir/                       types.ts
    adapters/                 json.ts, xml.ts*
    validate/                 schema.ts (Ajv), common.ts (ids, refs)
    types/
      flowchart/              schema.json, model.ts, to-ir.ts, validate.ts, index.ts
      state/                  schema.json, model.ts, to-ir.ts, validate.ts, index.ts
    shapes/                   registry.ts, process.ts, decision.ts, terminator.ts, state.ts, initial.ts, final.ts, …
    measure/                  font-metrics.ts (generated), text.ts
    layout/
      layered/                cycles.ts, rank.ts, order.ts, place.ts, index.ts
      constraints/            partitions.ts, containers.ts
      route/                  channels.ts, astar.ts, self-loop.ts, ports.ts
      labels.ts
    render/svg/               document.ts, nodes.ts, edges.ts, bands.ts, containers.ts, markers.ts, escape.ts
    index.ts                  render(src) → { svg, diagnostics }
  api/src/routes/             render.ts, validate.ts, schema.ts, types.ts, health.ts
  web/src/                    editor/, preview/, export/, examples/<type>/
fixtures/<type>/              samples + golden SVGs
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

**Text measurement** (URS-LY-009): bundle one OFL font, generate a table of its character widths at build time, and embed a subset of the font in the SVG. The result is deterministic in Node and in every browser.

## 7. API (Fastify)
| Method | Path | Out |
|--------|------|-----|
| POST | `/v1/render` | `image/svg+xml`, or 400 with diagnostics |
| POST | `/v1/validate` | `{ valid, diagnostics[] }` |
| GET  | `/v1/types` | registered types |
| GET  | `/v1/schema[/{type}]` | JSON Schema |
| GET  | `/v1/openapi.json` | OpenAPI |
| GET  | `/health` | 200 |

Limits: 1 MB body, 1000 nodes, 2000 edges, 2 s render time (URS-API-006). Diagnostic shape: `{ severity, code, message, path }`, where `path` is a JSON Pointer.

## 8. Web app
Split pane: a CodeMirror editor next to an SVG preview with pan and zoom. Rendering happens client-side through `@jtd/core`. The editor fetches its schema from the registry using the document's `type`, so it contains no type-specific code (URS-WEB-010). Export downloads the SVG string that is already rendered (URS-WEB-003).

## 9. Delivery phases
| Phase | Scope | Key URS |
|-------|-------|---------|
| **P0** Foundations | monorepo, CI, registry, IR, schema composition, common validation | EXT-001..007, IN-001..005, NF-001..004 |
| **P1** Flowchart | measuring, layered engine, basic router, flowchart shapes, SVG | TYP-001, DM-003..006, LY-001..005, LY-009, RN-001..005 |
| **P2** API + Web (thin) | render/validate/types/schema routes, editor, preview, export | API-001..009, API-011, WEB-001..004, WEB-010 |
| **P3** Cross-functional | partitions constraint, band rendering | TYP-002, DM-001/002/005, LY-002/003, RN-002 |
| **P4** State | containers, compound layout, self-loops, state shapes | TYP-003..005, DM-013, LY-011/012 |
| **P5** Layout quality | obstacle avoidance, crossing minimisation, label placement, wrapping, styling | LY-006..008, LY-010, DM-007..010 |
| **P6** Extras | XML/YAML adapters, autocomplete, examples, share links, PNG/PDF | IN-006..008, WEB-005..009, RN-007 |

P1 → P2 gets a working end-to-end slice early. P3 and P4 then validate the plugin seams with two quite different types.

## 10. Risks
| Risk | Mitigation |
|------|------------|
| The IR is shaped around flowcharts and doesn't fit later types | Build P3 (partitions) and P4 (containers) before stabilising the IR. Add new engines rather than bending `layered`. |
| Edge routing quality makes or breaks the product | Keep it isolated behind the `route/` interface; maintain a fixture suite of hard cases. |
| Font metrics drift between runtimes | Use a single bundled font and a generated width table; never measure through the DOM. |
| Schema churn breaks users | `version` field per document, plus adapters from older major versions. |
