# Contributing to JTDDiagrammar

For developers. Using the app: [README](README.md). Installing and running it for others: [administrator guide](docs/ADMIN.md).

## Run from source

You need Node 22.18 or later and pnpm 10.

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

Configuration is through environment variables; see [`.env.example`](.env.example) and the [administrator guide](docs/ADMIN.md#configure).

## How the code is organised

```
packages/core/src       pure TypeScript: no DOM, no Node built-ins
  registry/             DiagramType + LayoutEngine contracts, Registry
  diagrams/<type>/      one folder per diagram type: the only type-specific code
  ir/                   shared Graph IR
  schema/, validate/    shared schema fragments; envelope, JSON Schema (Ajv), common IR rules
  adapters/             JSON, XML and YAML sources
  measure/              text metrics from a generated font table
  shapes/, layout/      shape library; layered and timeline engines
  render/svg/           geometry → SVG string
  diff/                 diagram comparison by element identity
packages/documents/src  pure, no dependencies: Markdown, CSV, diff, zip, xlsx and PDF engines
packages/ai/src         Claude and Copilot clients (with a mock), ingest, prompts, generate + repair loop
packages/api/src        Fastify server: route table → routes + OpenAPI, worker-thread render pool
packages/web/src        Vite + React + CodeMirror: workspace, editor, preview, viewers, compare, export
scripts/docs/           README generation and checks
scripts/release/        installers, launcher, release packing and end-to-end tests
```

Pipeline: `parse → envelope → type schema → type rules + IR + common rules → layout engine → geometry → SVG`.

Boundaries, enforced by lint and tests:
- `core` and `documents` have no DOM and no Node built-ins, so they run in the browser and on the server.
- `layout/` and `render/` never import diagram types, and the web app never names one.
- Only `packages/ai` imports AI SDKs, and the web app never imports AI code.

Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Requirements: [docs/URS.md](docs/URS.md).

## Workflow

Requirements come first. Before a change, find the URS IDs it touches; new behaviour gets a requirement before code. Every commit body carries the impact assessment of [URS §5](docs/URS.md), and the traceability matrix and requirement status are updated with the change.

| Script | Does |
|--------|------|
| `pnpm check` | Lint, typecheck, tests and docs check (what CI runs) |
| `pnpm test` | Vitest: unit tests, layout invariants, golden SVGs |
| `pnpm test -u` | Accept changed golden SVGs. Review the diff first. |
| `pnpm test:budget` | Timing budgets, alone and without coverage; `pnpm test` runs it first |
| `pnpm e2e` | Playwright: the built web app against the real API, and every generated SVG opened in Chromium and Firefox (`playwright install firefox` once) |
| `pnpm licences` | Production dependency licences against the permissive allowlist |
| `pnpm docs:build` | Regenerate the README's examples and language reference, and `docs/img/*.svg` |
| `pnpm docs:screens` | Regenerate the web app screenshots (`docs/img/*.png`) |
| `pnpm quality` | Layout quality table (crossings, overlaps, label collisions, timing) over all fixtures; `--update` lowers the baseline CI enforces |
| `pnpm ai:eval` | Accuracy evaluation over a 6-document corpus. Needs `ANTHROPIC_API_KEY`; writes `.live/eval.json` |
| `pnpm ai:live` | Live check of AI generation against the real API. Needs `ANTHROPIC_API_KEY`, costs a few cents, never runs in CI |
| `pnpm fonts:metrics` | Regenerate `measure/font-metrics.ts` from Liberation Sans |

README images are generated, never made by hand: run `pnpm docs:build` (and `pnpm docs:screens` for the screenshots) after any change to rendering, a diagram type or the web app's look. CI tests AI generation against a deterministic mock and never calls a live API.

Every merge to `main` publishes the next patch release; see the [administrator guide](docs/ADMIN.md#updates-and-releases).

## Adding a diagram type

1. Create `packages/core/src/diagrams/<type>/` with a schema (unique `$id`), model, `toIR`, optional `validate`, at least one example, and AI assets: a generation schema in the structured-outputs subset, `fromGenerated`, a guide and few-shot examples.
2. Register it in `packages/core/src/builtins.ts`.
3. Run `pnpm docs:build`.

Nothing else changes. The test-only `checklist` type (`packages/core/test/fixture-type.ts`) proves it.

To ship types from a separate package instead, point `REGISTRY_MODULE` at a module that exports `createRegistry()`. The API reads it at startup; the web app reads it when built (`REGISTRY_MODULE=@acme/diagrams pnpm --filter @jtd/web build`).
