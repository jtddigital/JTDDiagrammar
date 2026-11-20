# JTDDiagrammar administrator guide

This guide is for the people who install, run and configure JTDDiagrammar for others. Using the app is covered in the [README](../README.md); working on the code in [CONTRIBUTING.md](../CONTRIBUTING.md).

**Contents:** [How it runs](#how-it-runs) · [Install](#install) · [Run](#run) · [Configure](#configure) · [Updates and releases](#updates-and-releases) · [AI providers](#ai-providers) · [HTTP API](#http-api) · [Library](#library) · [Security and data](#security-and-data) · [Troubleshooting](#troubleshooting)

## How it runs

One Node.js process serves both the web app and the HTTP API (`/v1/…`). Diagrams are drawn in the browser and, for API calls, on the server, by the same core library. Each user's files, folders and version history live in **their own browser** (IndexedDB, per browser profile), not on the server: the server stores nothing. Users back up or move their work with **Export workspace** (a `.zip`). Clearing the browser's site data deletes it.

AI requests go from the server to Anthropic (Claude) or, on the user's behalf, to Microsoft Graph (Copilot). Nothing else leaves the machine.

## Install

### Windows (per user, no admin rights)

```powershell
irm https://github.com/jtddigital/JTDDiagrammar/releases/latest/download/install.ps1 | iex
```

If Node.js 22.18+ is missing, the installer first installs the current Node.js LTS with `winget`. It then downloads the latest release, checks its SHA-256, installs it to `%LOCALAPPDATA%\jtddiagrammar`, and adds **JTDDiagrammar** shortcuts (Start Menu, desktop) and a `jtddiagrammar` command to the user's PATH. Installing needs access to github.com and to the npm registry, because dependencies are installed from the release's lockfile.

**Private repository:** the link above needs a signed-in browser. Download `install.ps1` from the [releases page](https://github.com/jtddigital/JTDDiagrammar/releases/latest) and run it with a token that can read the repository (or after `gh auth login`):

```powershell
$env:GITHUB_TOKEN = '<token>'; powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### Linux and macOS

Needs Node.js 22.18+.

```bash
curl -fsSL https://github.com/jtddigital/JTDDiagrammar/releases/latest/download/install.sh | bash
```

The app goes to `${XDG_DATA_HOME:-~/.local/share}/jtddiagrammar`, the `jtddiagrammar` command to `~/.local/bin`; `JTD_HOME` and `JTD_BIN` override both. On Linux a desktop entry is added. A private repository needs `GITHUB_TOKEN` (or `gh auth login`) as on Windows.

### Docker (a shared server)

From a checkout of the repository:

```bash
docker build -t jtd .
```

```bash
docker run -p 8080:8080 --env-file config.env jtd
```

The image serves the web app and the API on port 8080 and listens on all interfaces. Put it behind your reverse proxy for TLS and sign-in: the app has no user accounts of its own. A server container does not update itself; rebuild it from a newer release.

### From source

See [CONTRIBUTING.md](../CONTRIBUTING.md#run-from-source): `pnpm install`, `pnpm --filter @jtd/web build`, `pnpm dev:api`.

## Run

| Command | Does |
|---------|------|
| `jtddiagrammar` | Start the app (http://localhost:8080) and open the browser |
| `jtddiagrammar --port 9000 --no-open` | Another port; don't open the browser |
| `jtddiagrammar update` | Install the latest release (or `update v1.2.3`) |
| `jtddiagrammar restart` | Stop the running app and start it again, e.g. after changing `config.env` |
| `jtddiagrammar stop` | Stop the running app |
| `jtddiagrammar version` | Show the installed version |
| `jtddiagrammar uninstall` | Windows: remove the app, its shortcuts and PATH entry (`--keep-config` keeps the settings) |

An installed copy listens on **127.0.0.1 only**, so only that computer can reach it. To serve others, set `HOST=0.0.0.0` in `config.env` (and put a reverse proxy with TLS in front), or use Docker.

If the app is already running, `jtddiagrammar` reuses it, unless it is an older version or `config.env` has changed since it started: then it restarts it. A server started by a release before v1.0.13 can't be restarted this way; close its window (or press Ctrl+C there) and run `jtddiagrammar` again.

## Configure

Settings are environment variables. An installed copy reads them from **`config.env` in the install folder** (one `NAME=value` per line), and updates keep the file. Docker takes them with `--env-file` or `-e`. Every setting is optional; [`.env.example`](../.env.example) lists them all with their defaults.

**Server and limits**

| Setting | Default | Does |
|---------|---------|------|
| `HOST` | `0.0.0.0` (installed copies: `127.0.0.1`) | Interface to listen on |
| `PORT` | `8080` | Port |
| `BODY_LIMIT` | `1048576` | Largest request body, in bytes (413 above it) |
| `MAX_NODES`, `MAX_EDGES` | `1000`, `2000` | Largest diagram the API renders (413 above) |
| `RENDER_TIMEOUT_MS` | `5000` | A render taking longer is stopped (422) |
| `RENDER_WORKERS` | CPUs − 1, 1–4 | Worker threads for rendering |
| `WEB_DIST` | `packages/web/dist` | Built web app to serve at `/` |
| `REGISTRY_MODULE` | `@jtd/core` | A module exporting `createRegistry()`, to add diagram types without forking (see [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-diagram-type)) |

**Claude**

| Setting | Default | Does |
|---------|---------|------|
| `ANTHROPIC_API_KEY` | none | Turns Claude on |
| `AI_MODEL` | `claude-opus-5-5` | Model |
| `AI_EFFORT` | `high` | `low`, `medium`, `high`, `xhigh` or `max` |
| `AI_FALLBACKS` | `on` | Server-side refusal fallbacks; `off` to disable |
| `AI_MAX_REPAIRS` | `2` | Correction rounds after the first attempt |
| `AI_RATE_LIMIT` | `10` | AI requests per client IP per minute; `0` disables the limit |
| `AI_MAX_FILES`, `AI_MAX_FILE_BYTES`, `AI_MAX_TOTAL_BYTES` | `5`, 20 MB, 20 MB | Attachment limits |
| `AI_MAX_PDF_PAGES`, `AI_MAX_INPUT_TOKENS`, `AI_MAX_OUTPUT_TOKENS` | `600`, `200000`, `64000` | Size limits, checked by token counting before any spend |
| `AI_PRICES` | published prices | JSON prices per million tokens, for the cost estimate |

**Microsoft 365 Copilot**

| Setting | Default | Does |
|---------|---------|------|
| `COPILOT` | on | `off` turns Copilot off |
| `COPILOT_TENANT_ID` | `organizations` | Your tenant id or domain (default: any work or school account) |
| `COPILOT_CLIENT_ID` | Microsoft Graph Command Line Tools | An app registration of your own instead (see [Copilot](#microsoft-365-copilot)) |
| `COPILOT_SIGNIN` | `device` for Microsoft's app, `browser` for your own | Sign-in flow |
| `COPILOT_GRAPH_URL`, `COPILOT_SCOPES`, `COPILOT_LOGIN_URL` | Microsoft's current values | Overrides, if Microsoft changes them |

**Updates**

| Setting | Default | Does |
|---------|---------|------|
| `GITHUB_TOKEN` | none | Needed to see releases of a private repository |
| `UPDATES` | on | `off` hides **Update** in the app |

After changing `config.env`, run `jtddiagrammar restart`.

## Updates and releases

**Updating an installed copy.** When a newer release is out, the toolbar shows **Update to vX.Y.Z**. It installs the release the same way `jtddiagrammar update` does, restarts the app and reloads the page; users' work stays in their browsers. It needs the same access as the command, so a private repository needs `GITHUB_TOKEN` in `config.env`. If the install fails, the app keeps running and shows why; the full output is in `update.log` in the install folder. Only installed copies update themselves (not Docker or a source checkout), and only from the computer running the app.

**Publishing a release.** Every merge to `main` publishes the next patch version automatically (v1.0.5 → v1.0.6), with release notes from the merged pull requests. Put `[skip release]` in a pull request's title to merge without releasing. For a minor or major version, push a tag such as `v1.1.0`, or create the release on the releases page. Either way the `Release` workflow runs the checks, then attaches the bundle, its checksum and both installers. **Actions → Release → Run workflow** with a version such as `v1.2.3` does the same by hand: a new tag is created on the branch you run it from; an existing one has its files rebuilt and re-attached. GitHub's own "Source code" archives are not the app bundle. On every push, CI installs, launches, updates and uninstalls a packed release on Windows (Windows PowerShell 5.1 and PowerShell 7) and Linux.

## AI providers

Users draft and change diagrams from the AI pane (see the [README](../README.md#drafting-with-ai)). Two providers are supported; either or both can be on.

### Claude

Set `ANTHROPIC_API_KEY`. Without it, Claude is unavailable (the API answers `503`) and Copilot remains. Claude reads text, PDF, Word, HTML and Markdown files, and pictures (PNG, JPEG, GIF, WebP).

**How results stay correct:**
1. Claude's reply is constrained to the diagram type's generation schema (structured outputs).
2. The reply then passes the same validation as hand-written source: schema, references, lanes and phases, and a real layout.
3. If anything fails, the problems go back to Claude for correction, up to `AI_MAX_REPAIRS` times.
4. If it still fails, the user gets the best attempt marked as not valid, with its problems. A failed attempt is never presented as valid.

Responses report token use and an estimated cost (`usage.costUsd`).

### Microsoft 365 Copilot

On by default, with nothing to set and no app registration. Each user signs in with their Microsoft work account from the AI pane, with a code, the way `Connect-MgGraph -UseDeviceCode` works. The server then calls the Microsoft Graph Copilot Chat API with that user's token.

- Each user needs a Microsoft 365 Copilot licence.
- The first sign-in asks for consent to the seven Graph permissions the Copilot Chat API needs: `Sites.Read.All`, `Mail.Read`, `People.Read.All`, `OnlineMeetingTranscript.Read.All`, `Chat.Read`, `ChannelMessage.Read.All`, `ExternalItem.Read.All`. Where your tenant requires it, an admin consents instead.
- Sign-in goes through *Microsoft Graph Command Line Tools*, Microsoft's own public app, so it shows under that name in your sign-in logs and your policies for it apply. To use your own registration, set `COPILOT_CLIENT_ID`: a single-page app (redirect URI `https://<your host>/auth-redirect.html`, the seven delegated permissions) signs in with a popup; for a public client app also set `COPILOT_SIGNIN=device`.
- The token stays in the user's browser tab and is refreshed as needed. The server relays the sign-in requests (Microsoft refuses them from a browser for this kind of app) and keeps nothing.
- Copilot has no structured outputs, so the schema goes in the instructions and every reply is checked and repaired as Claude's are. It reads text only, and it reports no token use.

**Status:** tested against a stand-in for Graph, not yet against a live tenant. The Copilot Chat API is a Microsoft preview (beta) API and may change.

## HTTP API

| Method | Path | Returns |
|--------|------|---------|
| POST | `/v1/render` | `image/svg+xml`, or `{ svg, diagnostics }` with `Accept: application/json`. Body as JSON, XML (`application/xml`) or YAML (`application/yaml`) |
| GET | `/v1/render?src=…` | SVG for `<img>` embedding; `src` is the JSON document, base64url-encoded |
| POST | `/v1/validate` | `{ valid, diagnostics }`; JSON, XML or YAML |
| POST | `/v1/export/{format}` | Another format a type offers, such as `bpmn` |
| GET | `/v1/types` | Registered diagram types and their examples |
| GET | `/v1/schema`, `/v1/schema/{type}` | JSON Schema (2020-12), combined or per type |
| POST | `/v1/generate` | Diagram source drafted from text and/or files |
| POST | `/v1/refine` | An existing diagram changed by an instruction |
| GET | `/v1/ai` | `{ enabled, model? }`: whether AI is configured |
| GET | `/v1/version` | The running version, and the latest release when updates are on |
| GET | `/v1/openapi.json` | OpenAPI 3.1, generated from the route table |
| GET | `/health` | `{ status: "ok" }` |

```bash
curl -X POST localhost:8080/v1/render -H 'content-type: application/json' --data @diagram.json -o diagram.svg
```

```bash
curl -X POST localhost:8080/v1/generate -F type=auto -F files=@procedure.pdf -F 'text=Focus on the approval steps'
```

```bash
curl -X POST localhost:8080/v1/refine -H 'content-type: application/json' --data '{"source": {...}, "instruction": "Add a manager approval step before payment"}'
```

`/v1/generate` and `/v1/refine` return `{ type, reason?, source, valid, diagnostics, attempts, usage, svg? }`. Send `Accept: text/event-stream` for `progress` events (`ingest`, `select`, `generate`, `validate`, `repair`), then one `result` or `error` event. For Copilot, send `"provider": "copilot"` (a form field for multipart requests) and the user's Graph token in `X-Graph-Token`. Closing the request stops the AI call.

Errors come back as `{ diagnostics: [...] }`, each with a JSON Pointer `path` to the problem:

| Status | When |
|--------|------|
| 400 | Invalid JSON or invalid diagram |
| 413 | Body over `BODY_LIMIT`, or more than `MAX_NODES` / `MAX_EDGES` |
| 415 | Unsupported content type |
| 422 | Rendering took longer than `RENDER_TIMEOUT_MS` |
| 429 | Over `AI_RATE_LIMIT`; see `Retry-After` |
| 502 | The AI provider failed |
| 503 | The AI provider asked for is not configured, or is over its own rate limit |

## Library

The core library renders in Node and in browsers, with no DOM:

```ts
import { createRegistry, parseJson, render } from '@jtd/core';

const { value } = parseJson(text);
const { svg, diagnostics } = render(value, createRegistry()); // svg is undefined if there are errors
```

Output is standalone SVG 1.1. Text uses `Arial, Liberation Sans, Helvetica, sans-serif`; the first two have identical metrics, so text fits its boxes without embedding a font. Elements carry ids and classes for styling and scripting: `n-<id>` / `jtd-node jtd-shape-<shape>` for nodes, and `e-<id>` / `jtd-edge` for edges.

## Security and data

- **Users' files** stay in their browsers (IndexedDB). The server never receives them unless a user renders through the API or sends material to the AI. **Share links** carry the diagram in the URL's `#fragment`, which browsers do not send to the server.
- **Rendering** runs in worker threads with a time limit, so one slow diagram can't stall the server. Request bodies are never logged. SVG responses carry `Content-Security-Policy: default-src 'none'`. Markdown renders as elements, never as raw HTML, with a short allow-list of tags and links limited to `http`, `https`, `mailto` and relative paths.
- **The Anthropic key** is read only on the server and never reaches a browser; lint rules keep AI code out of the web app. Material sent to the AI is wrapped as data, Claude gets no tools, and the server fixes the type and schema. AI material and results are neither logged nor stored.
- **Copilot tokens** stay in the user's browser session and go only to this app's API, for the request they belong to; the server never stores or logs them.
- **Exposure:** installed copies listen on 127.0.0.1. When you serve the app to others, put it behind a reverse proxy with TLS and your sign-in, and set `AI_RATE_LIMIT` to suit.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| The installer stops at Node.js | Install Node.js 22.18+ yourself (`winget install OpenJS.NodeJS.LTS`, or from nodejs.org) and run it again |
| `jtddiagrammar` says the port is in use | Another program has 8080: `jtddiagrammar --port 9000` |
| Others can't reach the app | Installed copies listen on 127.0.0.1; set `HOST=0.0.0.0` and restart, or use Docker |
| **Update** fails | See `update.log` in the install folder; a private repository needs `GITHUB_TOKEN` in `config.env` |
| The AI pane says AI is unavailable | Set `ANTHROPIC_API_KEY` for Claude, or check `COPILOT` is not `off`; then `jtddiagrammar restart` |
| Copilot sign-in is refused | Your tenant may need admin consent for the seven permissions above, or blocks Microsoft Graph Command Line Tools: register your own app (`COPILOT_CLIENT_ID`) |
| A user lost their files | Files live in the browser profile they were made in; clearing site data deletes them. Restore from an exported workspace `.zip` (Import) |
| The browser storage is full | The app says so and keeps the unsaved text; free space by emptying the trash or exporting and deleting old files |
