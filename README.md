# JTDDiagrammar

Diagrams as structured text. Write JSON and get SVG back, from an API or a web app. You can also let Claude draft the diagram from a document.

The main target is the **cross-functional flowchart** (lanes × phases, as in Visio). The engine is built for multiple diagram types: each type is a plugin, and everything downstream of the plugin is type-agnostic.

## Status

| Phase | Scope | State |
|-------|-------|-------|
| P0 | Monorepo, CI, type registry, Graph IR, schemas, validation, README pipeline | **Done** |
| P1 | Flowchart layout + SVG rendering, README images | **Done** |
| P2 | Cross-functional layout (lanes × phases) | **Done** |
| P3 | REST API + web app (editor, live preview, SVG export) | **Done** |
| P4 | AI generation from documents (Claude) | **Done** |
| P5 | State diagrams (composite states) | **Done** |
| P6 | Layout quality, styling and themes | **Done** |
| P7 | Extras: XML/YAML, hints, notes, org chart, refine, provenance, streaming, autocomplete, share links, PNG | **Done** |

Today you can write **state diagrams** (with composite states), **org charts** and flowcharts, including **cross-functional flowcharts** (lanes × phases, `LR` or `TB`), in a web editor with autocomplete, live preview, pan/zoom, share links and SVG/PNG export, or render them through the REST API. You can also have Claude draft one from documents or notes. Layouts avoid running edges through nodes and keep labels off nodes and each other; colours and a dark theme are available.

## Diagram types

The examples and images below are generated from the registered types (`pnpm docs:build`) by the same renderer the API will use. CI fails if any of them go stale, and each example also has to pass validation.

<!-- BEGIN GENERATED: examples (pnpm docs:build) -->

### Flowchart

`type: flowchart` · A plain flowchart: nodes, each listing the nodes it connects `to`.

![Flowchart](docs/img/flowchart-basic.svg)

<details><summary>Source</summary>

```json
{
  "version": "1",
  "type": "flowchart",
  "title": "Password reset",
  "direction": "TB",
  "nodes": [
    {
      "id": "start",
      "shape": "terminator",
      "label": "Start",
      "to": [
        {
          "node": "request"
        }
      ]
    },
    {
      "id": "request",
      "label": "Request reset link",
      "to": [
        {
          "node": "known"
        }
      ]
    },
    {
      "id": "known",
      "shape": "decision",
      "label": "Email known?",
      "to": [
        {
          "node": "send",
          "label": "Yes"
        },
        {
          "node": "end",
          "label": "No"
        }
      ]
    },
    {
      "id": "send",
      "label": "Send link",
      "to": [
        {
          "node": "end"
        }
      ]
    },
    {
      "id": "end",
      "shape": "terminator",
      "label": "End"
    }
  ]
}
```

</details>

### Cross-functional flowchart

`type: flowchart` · The same flowchart type with `lanes` (functions) and `phases`.

![Cross-functional flowchart](docs/img/flowchart-cross-functional.svg)

<details><summary>Source</summary>

```json
{
  "version": "1",
  "type": "flowchart",
  "title": "Order fulfilment",
  "direction": "LR",
  "lanes": [
    {
      "id": "customer",
      "label": "Customer"
    },
    {
      "id": "sales",
      "label": "Sales"
    },
    {
      "id": "warehouse",
      "label": "Warehouse"
    }
  ],
  "phases": [
    {
      "id": "order",
      "label": "Order"
    },
    {
      "id": "fulfil",
      "label": "Fulfil"
    }
  ],
  "nodes": [
    {
      "id": "start",
      "shape": "terminator",
      "label": "Start",
      "lane": "customer",
      "phase": "order",
      "to": [
        {
          "node": "place"
        }
      ]
    },
    {
      "id": "place",
      "label": "Place order",
      "lane": "customer",
      "phase": "order",
      "to": [
        {
          "node": "stock"
        }
      ]
    },
    {
      "id": "stock",
      "shape": "decision",
      "label": "In stock?",
      "lane": "sales",
      "phase": "order",
      "to": [
        {
          "node": "ship",
          "label": "Yes"
        },
        {
          "node": "notify",
          "label": "No"
        }
      ]
    },
    {
      "id": "ship",
      "label": "Ship order",
      "lane": "warehouse",
      "phase": "fulfil",
      "to": [
        {
          "node": "end"
        }
      ]
    },
    {
      "id": "notify",
      "label": "Notify backorder",
      "lane": "sales",
      "phase": "fulfil",
      "to": [
        {
          "node": "end"
        }
      ]
    },
    {
      "id": "end",
      "shape": "terminator",
      "label": "End",
      "lane": "customer",
      "phase": "fulfil"
    }
  ]
}
```

</details>

### Section styles and callout labels

`type: flowchart` · Defaults per section in `styles` and for every connection in `edgeStyle`, overridden per item. Nodes keep a standard size; labels that do not fit go into callouts (`label: auto`).

![Section styles and callout labels](docs/img/flowchart-styled-callouts.svg)

<details><summary>Source</summary>

```json
{
  "version": "1",
  "type": "flowchart",
  "title": "Expense claims",
  "styles": {
    "nodes": {
      "label": "auto",
      "fill": "#eff6ff",
      "stroke": "#1d4ed8"
    },
    "lanes": {
      "fill": "#f1f5f9"
    }
  },
  "edgeStyle": {
    "stroke": "#475569",
    "arrowhead": "open"
  },
  "lanes": [
    {
      "id": "emp",
      "label": "Employee"
    },
    {
      "id": "mgr",
      "label": "Manager",
      "style": {
        "fill": "#fef3c7"
      }
    },
    {
      "id": "fin",
      "label": "Finance"
    }
  ],
  "nodes": [
    {
      "id": "start",
      "shape": "terminator",
      "label": "Start",
      "lane": "emp",
      "to": [
        {
          "node": "submit"
        }
      ]
    },
    {
      "id": "submit",
      "label": "Submit claim with receipts and a short business justification",
      "lane": "emp",
      "to": [
        {
          "node": "check"
        }
      ]
    },
    {
      "id": "check",
      "shape": "decision",
      "label": "Within policy and budget for this quarter?",
      "lane": "mgr",
      "to": [
        {
          "node": "pay",
          "label": "Yes",
          "style": {
            "stroke": "#15803d",
            "labelFill": "#dcfce7"
          }
        },
        {
          "node": "return",
          "label": "No",
          "style": {
            "stroke": "#b91c1c",
            "dash": "dashed",
            "arrowhead": "diamond"
          }
        }
      ]
    },
    {
      "id": "return",
      "label": "Return for changes",
      "lane": "emp",
      "style": {
        "italic": true
      },
      "to": [
        {
          "node": "submit",
          "style": {
            "opacity": 0.5
          }
        }
      ]
    },
    {
      "id": "pay",
      "label": "Reimburse within five working days",
      "lane": "fin",
      "style": {
        "bold": true,
        "fill": "#dcfce7",
        "stroke": "#15803d"
      },
      "to": [
        {
          "node": "end",
          "style": {
            "arrowhead": "circle",
            "lineWidth": 2
          }
        }
      ]
    },
    {
      "id": "end",
      "shape": "terminator",
      "label": "End",
      "lane": "fin"
    }
  ]
}
```

</details>

### State diagram

`type: state` · States, pseudostates and transitions (each state lists its outgoing ones in `to`), labelled `event [guard] / action`.

![State diagram](docs/img/state-basic.svg)

<details><summary>Source</summary>

```json
{
  "version": "1",
  "type": "state",
  "title": "Support ticket",
  "states": [
    {
      "id": "start",
      "kind": "initial",
      "to": [
        {
          "state": "open"
        }
      ]
    },
    {
      "id": "open",
      "label": "Open",
      "to": [
        {
          "state": "progress",
          "event": "assign"
        }
      ]
    },
    {
      "id": "progress",
      "label": "In progress",
      "to": [
        {
          "state": "waiting",
          "event": "ask",
          "action": "notify customer"
        },
        {
          "state": "closed",
          "event": "resolve",
          "guard": "fix verified"
        }
      ]
    },
    {
      "id": "waiting",
      "label": "Waiting on customer",
      "to": [
        {
          "state": "progress",
          "event": "reply"
        }
      ]
    },
    {
      "id": "closed",
      "label": "Closed",
      "to": [
        {
          "state": "end"
        }
      ]
    },
    {
      "id": "end",
      "kind": "final"
    }
  ]
}
```

</details>

### Composite state diagram

`type: state` · Nested states, a transition out of an inner state, and a self-transition.

![Composite state diagram](docs/img/state-composite.svg)

<details><summary>Source</summary>

```json
{
  "version": "1",
  "type": "state",
  "title": "Media player",
  "states": [
    {
      "id": "init",
      "kind": "initial",
      "to": [
        {
          "state": "stopped"
        }
      ]
    },
    {
      "id": "stopped",
      "label": "Stopped",
      "to": [
        {
          "state": "active",
          "event": "play"
        }
      ]
    },
    {
      "id": "active",
      "label": "Active",
      "states": [
        {
          "id": "a0",
          "kind": "initial",
          "to": [
            {
              "state": "playing"
            }
          ]
        },
        {
          "id": "playing",
          "label": "Playing",
          "to": [
            {
              "state": "paused",
              "event": "pause"
            },
            {
              "state": "playing",
              "event": "tick",
              "action": "advance"
            },
            {
              "state": "error",
              "event": "decode failure"
            }
          ]
        },
        {
          "id": "paused",
          "label": "Paused",
          "to": [
            {
              "state": "playing",
              "event": "resume"
            }
          ]
        }
      ],
      "to": [
        {
          "state": "stopped",
          "event": "stop"
        }
      ]
    },
    {
      "id": "error",
      "label": "Error"
    }
  ]
}
```

</details>

### Org chart

`type: orgchart` · People and reporting lines, top to bottom.

![Org chart](docs/img/orgchart-basic.svg)

<details><summary>Source</summary>

```json
{
  "version": "1",
  "type": "orgchart",
  "title": "Product team",
  "people": [
    {
      "id": "ceo",
      "name": "Avery Chen",
      "title": "CEO"
    },
    {
      "id": "cto",
      "name": "Sam Patel",
      "title": "CTO",
      "manager": "ceo"
    },
    {
      "id": "cpo",
      "name": "Jordan Lee",
      "title": "Head of Product",
      "manager": "ceo"
    },
    {
      "id": "eng1",
      "name": "Riley Kim",
      "title": "Engineer",
      "manager": "cto"
    },
    {
      "id": "eng2",
      "name": "Morgan Diaz",
      "title": "Engineer",
      "manager": "cto"
    },
    {
      "id": "pm",
      "name": "Casey Ford",
      "title": "Product Manager",
      "manager": "cpo"
    }
  ]
}
```

</details>

<!-- END GENERATED: examples -->

## Language

Diagrams are JSON, XML or YAML documents describing the same model. The tables below are generated from the schemas (`pnpm docs:build`), so they always match what the validator accepts.

**Connections live under the node they leave from.** Each node lists its outgoing connections in `to`. Each entry names its target (`node` in flowcharts, `state` in state diagrams) and can carry its own label, side hints and style:

```json
{
  "id": "check",
  "shape": "decision",
  "label": "In stock?",
  "to": [
    { "node": "ship", "label": "Yes" },
    { "node": "notify", "label": "No", "exitSide": "S", "style": { "stroke": "#b91c1c" } }
  ]
}
```

`exitSide` and `entrySide` (N, E, S, W) choose which side of the box the line leaves and enters by. State diagrams do the same with `"to": [{ "state": "paid", "event": "pay" }]` on each state, including composite and nested ones. Org charts link people through `manager`.

<!-- BEGIN GENERATED: reference (pnpm docs:build) -->

Fields every diagram has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | string |  | Optional schema URL for editor tooling. |
| `version` | string | yes | Schema version; major 1 (e.g. "1", "1.2"). |
| `type` | `flowchart` \| `state` \| `orgchart` | yes | Diagram type. |
| `title` | string |  | Title shown above the diagram. |
| `theme` | `default` \| `dark` |  | Colour theme; element styles override it. |

### `flowchart`

Flowcharts. Add lanes (and optional phases) for a cross-functional flowchart.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `direction` | `LR` \| `TB` |  | Flow direction: left to right (default) or top to bottom. |
| `styles` | object |  | Default style per section; each item’s own `style` overrides it field by field. |
| `styles.lanes` | object |  | Default style for every item in `lanes`. |
| `styles.lanes.fill` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.lanes.stroke` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.lanes.text` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.lanes.dash` | `solid` \| `dashed` \| `dotted` |  | Line style. |
| `styles.lanes.lineWidth` | number |  | Line thickness in pixels, 0.5 to 8. |
| `styles.lanes.fontSize` | number |  | Text size in pixels, 8 to 32. |
| `styles.lanes.bold` | boolean |  | Bold text. |
| `styles.lanes.italic` | boolean |  | Italic text. |
| `styles.lanes.opacity` | number |  | Whole-element opacity, 0.1 to 1. |
| `styles.lanes.arrowhead` | `triangle` \| `open` \| `diamond` \| `circle` \| `none` |  | Edges: arrowhead shape (default `triangle`). |
| `styles.lanes.labelFill` | string |  | Background of edge labels and callouts. |
| `styles.lanes.label` | `inside` \| `callout` \| `auto` |  | Nodes: `inside` (default; the node grows to fit), `callout` (fixed-size node, label in a callout beside it) or `auto` (callout only when the label does not fit). |
| `styles.lanes.width` | number |  | Nodes: fixed width in pixels. |
| `styles.lanes.height` | number |  | Nodes: fixed height in pixels. |
| `styles.phases` | object |  | Default style for every item in `phases`. |
| `styles.phases.fill` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.phases.stroke` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.phases.text` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.phases.dash` | `solid` \| `dashed` \| `dotted` |  | Line style. |
| `styles.phases.lineWidth` | number |  | Line thickness in pixels, 0.5 to 8. |
| `styles.phases.fontSize` | number |  | Text size in pixels, 8 to 32. |
| `styles.phases.bold` | boolean |  | Bold text. |
| `styles.phases.italic` | boolean |  | Italic text. |
| `styles.phases.opacity` | number |  | Whole-element opacity, 0.1 to 1. |
| `styles.phases.arrowhead` | `triangle` \| `open` \| `diamond` \| `circle` \| `none` |  | Edges: arrowhead shape (default `triangle`). |
| `styles.phases.labelFill` | string |  | Background of edge labels and callouts. |
| `styles.phases.label` | `inside` \| `callout` \| `auto` |  | Nodes: `inside` (default; the node grows to fit), `callout` (fixed-size node, label in a callout beside it) or `auto` (callout only when the label does not fit). |
| `styles.phases.width` | number |  | Nodes: fixed width in pixels. |
| `styles.phases.height` | number |  | Nodes: fixed height in pixels. |
| `styles.nodes` | object |  | Default style for every item in `nodes`. |
| `styles.nodes.fill` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.nodes.stroke` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.nodes.text` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.nodes.dash` | `solid` \| `dashed` \| `dotted` |  | Line style. |
| `styles.nodes.lineWidth` | number |  | Line thickness in pixels, 0.5 to 8. |
| `styles.nodes.fontSize` | number |  | Text size in pixels, 8 to 32. |
| `styles.nodes.bold` | boolean |  | Bold text. |
| `styles.nodes.italic` | boolean |  | Italic text. |
| `styles.nodes.opacity` | number |  | Whole-element opacity, 0.1 to 1. |
| `styles.nodes.arrowhead` | `triangle` \| `open` \| `diamond` \| `circle` \| `none` |  | Edges: arrowhead shape (default `triangle`). |
| `styles.nodes.labelFill` | string |  | Background of edge labels and callouts. |
| `styles.nodes.label` | `inside` \| `callout` \| `auto` |  | Nodes: `inside` (default; the node grows to fit), `callout` (fixed-size node, label in a callout beside it) or `auto` (callout only when the label does not fit). |
| `styles.nodes.width` | number |  | Nodes: fixed width in pixels. |
| `styles.nodes.height` | number |  | Nodes: fixed height in pixels. |
| `styles.notes` | object |  | Default style for every item in `notes`. |
| `styles.notes.fill` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.notes.stroke` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.notes.text` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.notes.dash` | `solid` \| `dashed` \| `dotted` |  | Line style. |
| `styles.notes.lineWidth` | number |  | Line thickness in pixels, 0.5 to 8. |
| `styles.notes.fontSize` | number |  | Text size in pixels, 8 to 32. |
| `styles.notes.bold` | boolean |  | Bold text. |
| `styles.notes.italic` | boolean |  | Italic text. |
| `styles.notes.opacity` | number |  | Whole-element opacity, 0.1 to 1. |
| `styles.notes.arrowhead` | `triangle` \| `open` \| `diamond` \| `circle` \| `none` |  | Edges: arrowhead shape (default `triangle`). |
| `styles.notes.labelFill` | string |  | Background of edge labels and callouts. |
| `styles.notes.label` | `inside` \| `callout` \| `auto` |  | Nodes: `inside` (default; the node grows to fit), `callout` (fixed-size node, label in a callout beside it) or `auto` (callout only when the label does not fit). |
| `styles.notes.width` | number |  | Nodes: fixed width in pixels. |
| `styles.notes.height` | number |  | Nodes: fixed height in pixels. |
| `edgeStyle` | object |  | Default style for every connection; each one’s own `style` overrides it field by field. |
| `edgeStyle.fill` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `edgeStyle.stroke` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `edgeStyle.text` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `edgeStyle.dash` | `solid` \| `dashed` \| `dotted` |  | Line style. |
| `edgeStyle.lineWidth` | number |  | Line thickness in pixels, 0.5 to 8. |
| `edgeStyle.fontSize` | number |  | Text size in pixels, 8 to 32. |
| `edgeStyle.bold` | boolean |  | Bold text. |
| `edgeStyle.italic` | boolean |  | Italic text. |
| `edgeStyle.opacity` | number |  | Whole-element opacity, 0.1 to 1. |
| `edgeStyle.arrowhead` | `triangle` \| `open` \| `diamond` \| `circle` \| `none` |  | Edges: arrowhead shape (default `triangle`). |
| `edgeStyle.labelFill` | string |  | Background of edge labels and callouts. |
| `edgeStyle.label` | `inside` \| `callout` \| `auto` |  | Nodes: `inside` (default; the node grows to fit), `callout` (fixed-size node, label in a callout beside it) or `auto` (callout only when the label does not fit). |
| `edgeStyle.width` | number |  | Nodes: fixed width in pixels. |
| `edgeStyle.height` | number |  | Nodes: fixed height in pixels. |
| `lanes` | list of objects |  | Functional bands (rows for `LR`). Present → cross-functional flowchart. |
| `lanes[].id` | string | yes | Unique id: a letter or `_`, then letters, digits, `_`, `.` or `-`. |
| `lanes[].label` | string | yes | Header text. |
| `lanes[].style` | object |  | Colours, lines, text and node sizing (see Styling). |
| `phases` | list of objects |  | Stages across the lanes. Require lanes. |
| `phases[].id` | string | yes | Unique id: a letter or `_`, then letters, digits, `_`, `.` or `-`. |
| `phases[].label` | string | yes | Header text. |
| `phases[].style` | object |  | Colours, lines, text and node sizing (see Styling). |
| `nodes` | list of objects | yes | Steps, decisions and other shapes. |
| `nodes[].id` | string | yes | Unique id: a letter or `_`, then letters, digits, `_`, `.` or `-`. |
| `nodes[].shape` | `process` \| `decision` \| `terminator` \| `document` \| `data` \| `subprocess` \| `connector` |  | Default `process`. |
| `nodes[].label` | string |  | Defaults to the id. `\n` breaks lines; long text wraps. |
| `nodes[].lane` | string |  | Lane id; required when the diagram has lanes. |
| `nodes[].phase` | string |  | Phase id; required when the diagram has phases. |
| `nodes[].order` | integer |  | Hint: nodes in the same column and lane are placed in ascending order. |
| `nodes[].quote` | string |  | Supporting excerpt from the source material; shown as a tooltip. |
| `nodes[].style` | object |  | Colours, lines, text and node sizing (see Styling). |
| `nodes[].to` | list of objects |  | Outgoing connections, each to one target node. |
| `nodes[].to[].node` | string | yes | Target node id. |
| `nodes[].to[].label` | string |  | Text on the connection. |
| `nodes[].to[].exitSide` | `N` \| `E` \| `S` \| `W` |  | Side of this node the line leaves by (N, E, S, W); default follows the flow. |
| `nodes[].to[].entrySide` | `N` \| `E` \| `S` \| `W` |  | Side of the target the line enters by; default follows the flow. |
| `nodes[].to[].id` | string |  | Optional; generated when absent. |
| `nodes[].to[].quote` | string |  | Supporting excerpt from the source material; shown as a tooltip. |
| `nodes[].to[].style` | object |  | Overrides `edgeStyle` field by field. |
| `notes` | list of objects |  | Annotations, drawn as folded-corner notes. |
| `notes[].id` | string |  | Optional; generated when absent. |
| `notes[].text` | string | yes | Note text; `\n` breaks lines. |
| `notes[].for` | string |  | Node the note is attached to (dotted line, no arrow). |
| `notes[].lane` | string |  | Lane, for a free-standing note in a cross-functional flowchart; attached notes use their node’s. |
| `notes[].phase` | string |  | Phase, likewise. |
| `notes[].style` | object |  | Colours, lines, text and node sizing (see Styling). |

### `state`

States and the transitions between them, with composite (nested) states. For lifecycles and modes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `direction` | `LR` \| `TB` |  | Flow direction: left to right (default) or top to bottom. |
| `styles` | object |  | Default style per section; each item’s own `style` overrides it field by field. |
| `styles.states` | object |  | Default style for every item in `states`. |
| `styles.states.fill` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.states.stroke` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.states.text` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.states.dash` | `solid` \| `dashed` \| `dotted` |  | Line style. |
| `styles.states.lineWidth` | number |  | Line thickness in pixels, 0.5 to 8. |
| `styles.states.fontSize` | number |  | Text size in pixels, 8 to 32. |
| `styles.states.bold` | boolean |  | Bold text. |
| `styles.states.italic` | boolean |  | Italic text. |
| `styles.states.opacity` | number |  | Whole-element opacity, 0.1 to 1. |
| `styles.states.arrowhead` | `triangle` \| `open` \| `diamond` \| `circle` \| `none` |  | Edges: arrowhead shape (default `triangle`). |
| `styles.states.labelFill` | string |  | Background of edge labels and callouts. |
| `styles.states.label` | `inside` \| `callout` \| `auto` |  | Nodes: `inside` (default; the node grows to fit), `callout` (fixed-size node, label in a callout beside it) or `auto` (callout only when the label does not fit). |
| `styles.states.width` | number |  | Nodes: fixed width in pixels. |
| `styles.states.height` | number |  | Nodes: fixed height in pixels. |
| `states` | list of objects | yes | Top-level states. |
| `states[].id` | string | yes | Unique id: a letter or `_`, then letters, digits, `_`, `.` or `-`. |
| `states[].kind` | `state` \| `initial` \| `final` \| `choice` |  | `state` (default) or a pseudostate; pseudostates draw no label and cannot contain states. |
| `states[].label` | string |  | Defaults to the id for ordinary states. |
| `states[].states` | list of objects |  | Nested states make this a composite state. Same fields as `states[]`. |
| `states[].quote` | string |  | Supporting excerpt from the source material; shown as a tooltip. |
| `states[].style` | object |  | Colours, lines, text and node sizing (see Styling). |
| `states[].to` | list of objects |  | Outgoing transitions; targets may be any state, composite or nested. |
| `states[].to[].state` | string | yes | Target state id. |
| `states[].to[].event` | string |  | Trigger. |
| `states[].to[].guard` | string |  | Condition, shown in brackets. |
| `states[].to[].action` | string |  | Effect, shown after a slash. |
| `states[].to[].id` | string |  | Optional; generated when absent. |
| `states[].to[].quote` | string |  | Supporting excerpt from the source material; shown as a tooltip. |
| `states[].to[].style` | object |  | Overrides `transitionStyle` field by field. |
| `transitionStyle` | object |  | Default style for every transition; each one’s own `style` overrides it field by field. |
| `transitionStyle.fill` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `transitionStyle.stroke` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `transitionStyle.text` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `transitionStyle.dash` | `solid` \| `dashed` \| `dotted` |  | Line style. |
| `transitionStyle.lineWidth` | number |  | Line thickness in pixels, 0.5 to 8. |
| `transitionStyle.fontSize` | number |  | Text size in pixels, 8 to 32. |
| `transitionStyle.bold` | boolean |  | Bold text. |
| `transitionStyle.italic` | boolean |  | Italic text. |
| `transitionStyle.opacity` | number |  | Whole-element opacity, 0.1 to 1. |
| `transitionStyle.arrowhead` | `triangle` \| `open` \| `diamond` \| `circle` \| `none` |  | Edges: arrowhead shape (default `triangle`). |
| `transitionStyle.labelFill` | string |  | Background of edge labels and callouts. |
| `transitionStyle.label` | `inside` \| `callout` \| `auto` |  | Nodes: `inside` (default; the node grows to fit), `callout` (fixed-size node, label in a callout beside it) or `auto` (callout only when the label does not fit). |
| `transitionStyle.width` | number |  | Nodes: fixed width in pixels. |
| `transitionStyle.height` | number |  | Nodes: fixed height in pixels. |

### `orgchart`

People and who they report to. For teams and organisations.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `direction` | `TB` \| `LR` |  | Top to bottom (default) or left to right. |
| `styles` | object |  | Default style per section; each item’s own `style` overrides it field by field. |
| `styles.people` | object |  | Default style for every item in `people`. |
| `styles.people.fill` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.people.stroke` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.people.text` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.people.dash` | `solid` \| `dashed` \| `dotted` |  | Line style. |
| `styles.people.lineWidth` | number |  | Line thickness in pixels, 0.5 to 8. |
| `styles.people.fontSize` | number |  | Text size in pixels, 8 to 32. |
| `styles.people.bold` | boolean |  | Bold text. |
| `styles.people.italic` | boolean |  | Italic text. |
| `styles.people.opacity` | number |  | Whole-element opacity, 0.1 to 1. |
| `styles.people.arrowhead` | `triangle` \| `open` \| `diamond` \| `circle` \| `none` |  | Edges: arrowhead shape (default `triangle`). |
| `styles.people.labelFill` | string |  | Background of edge labels and callouts. |
| `styles.people.label` | `inside` \| `callout` \| `auto` |  | Nodes: `inside` (default; the node grows to fit), `callout` (fixed-size node, label in a callout beside it) or `auto` (callout only when the label does not fit). |
| `styles.people.width` | number |  | Nodes: fixed width in pixels. |
| `styles.people.height` | number |  | Nodes: fixed height in pixels. |
| `styles.lines` | object |  | Default style for every item in `lines`. |
| `styles.lines.fill` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.lines.stroke` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.lines.text` | string |  | Hex colour, `#rgb` or `#rrggbb`. |
| `styles.lines.dash` | `solid` \| `dashed` \| `dotted` |  | Line style. |
| `styles.lines.lineWidth` | number |  | Line thickness in pixels, 0.5 to 8. |
| `styles.lines.fontSize` | number |  | Text size in pixels, 8 to 32. |
| `styles.lines.bold` | boolean |  | Bold text. |
| `styles.lines.italic` | boolean |  | Italic text. |
| `styles.lines.opacity` | number |  | Whole-element opacity, 0.1 to 1. |
| `styles.lines.arrowhead` | `triangle` \| `open` \| `diamond` \| `circle` \| `none` |  | Edges: arrowhead shape (default `triangle`). |
| `styles.lines.labelFill` | string |  | Background of edge labels and callouts. |
| `styles.lines.label` | `inside` \| `callout` \| `auto` |  | Nodes: `inside` (default; the node grows to fit), `callout` (fixed-size node, label in a callout beside it) or `auto` (callout only when the label does not fit). |
| `styles.lines.width` | number |  | Nodes: fixed width in pixels. |
| `styles.lines.height` | number |  | Nodes: fixed height in pixels. |
| `people` | list of objects | yes | Everyone in the chart. |
| `people[].id` | string | yes | Unique id: a letter or `_`, then letters, digits, `_`, `.` or `-`. |
| `people[].name` | string | yes | Shown first, on its own line. |
| `people[].title` | string |  | Role, shown under the name. |
| `people[].manager` | string |  | Id of the person this person reports to; omit at the top. |
| `people[].quote` | string |  | Supporting excerpt from the source material; shown as a tooltip. |
| `people[].style` | object |  | Colours, lines, text and node sizing (see Styling). |

<!-- END GENERATED: reference -->

**XML** uses attributes for scalars and child elements for objects and lists, with any item name:

```xml
<diagram version="1" type="flowchart" title="Refunds">
  <lanes><lane id="cs" label="Support"/></lanes>
  <nodes>
    <node id="ask" shape="terminator" label="Request" lane="cs">
      <style fill="#dbeafe"/>
      <to><link node="pay" label="approved"/></to>
    </node>
    <node id="pay" label="Pay" lane="cs"/>
  </nodes>
</diagram>
```

**YAML** is the JSON structure written as YAML.

Flowchart rules: with lanes, every node needs a `lane`; with phases, every node also needs a `phase`. State rules: at most one `initial` per region (the top level or a composite), with no incoming transitions; `final` states have no outgoing transitions; pseudostates cannot contain states. Ids are unique across all levels.

### Styling

Every node, edge, lane, phase, note, state, transition and person can take a `style`:

```json
{ "fill": "#dcfce7", "stroke": "#14532d", "text": "#14532d", "dash": "dashed", "lineWidth": 2, "fontSize": 13, "bold": true }
```

| Field | Values | Applies to |
|-------|--------|------------|
| `fill`, `stroke`, `text` | hex colour (`#rgb` or `#rrggbb`) | all; `fill` colours lane and phase headers |
| `dash` | `solid`, `dashed`, `dotted` | outlines and lines |
| `lineWidth` | 0.5–8 px (default 1.5; 1 for lane and phase borders) | outlines and lines; arrowheads grow with thicker lines |
| `fontSize` | 8–32 px | text; nodes and headers resize to fit |
| `bold`, `italic` | `true` / `false` | text |
| `opacity` | 0.1–1 | the whole element |
| `arrowhead` | `triangle` (default), `open`, `diamond`, `circle`, `none` | edges |
| `labelFill` | hex colour | edge label and callout backgrounds |
| `label` | `inside` (default), `callout`, `auto` | nodes, see below |
| `width`, `height` | px | nodes: a fixed size |

**Defaults.** A top-level `styles` object sets a default for a whole section. Connections, which live inside their nodes, get their own top-level default: `edgeStyle` for flowcharts and `transitionStyle` for state diagrams. An item's own `style` overrides any default field by field:

```json
"styles": {
  "nodes": { "fill": "#eff6ff", "stroke": "#1d4ed8", "label": "auto" },
  "lanes": { "fill": "#f1f5f9" }
},
"edgeStyle": { "stroke": "#475569", "arrowhead": "open" }
```

Sections are `lanes`, `phases`, `nodes` and `notes` for flowcharts; `states` for state diagrams; `people` and `lines` (reporting lines) for org charts.

**Standard-size nodes and callouts.** By default a node grows to fit its label. To keep nodes the same size, set `label`:

- `callout`: the node keeps its shape's standard size (or `width`/`height`), and the label sits in a callout beside it, joined by a short leader line.
- `auto`: the label goes inside if it fits the standard size, otherwise into a callout.

The layout reserves room for each callout, below the node in `LR` diagrams and beside it in `TB` diagrams, within the node's lane, phase and composite state. If that spot is blocked, the callout moves to the clearest nearby spot. `inside` with a fixed `width`/`height` wraps the label to fit. Initial, final and choice pseudostates always keep their own size.

Set `"theme": "dark"` on the diagram for the dark palette; styles override either theme.

### Diagnostics

Validation reports **every** problem, not only the first. Each one carries a JSON Pointer to its location in the source:

```json
{ "severity": "error", "code": "ref.lane", "message": "node 'ship' references unknown lane 'wh'", "path": "/nodes/3" }
```

## Install

### Windows

In PowerShell (no admin rights needed):

```powershell
irm https://github.com/jtddigital/JTDDiagrammar/releases/latest/download/install.ps1 | iex
```

If Node.js 22.18+ is missing, the installer installs the current Node.js LTS with `winget` first. Then it downloads the latest release, checks its SHA-256 and installs it to `%LOCALAPPDATA%\jtddiagrammar`. It also adds **JTDDiagrammar** shortcuts to the Start Menu and the desktop, and a `jtddiagrammar` command to your PATH.

**To start:** double-click the **JTDDiagrammar** shortcut. A console window starts the app on http://localhost:8080 (local only) and opens your browser. Close the window to stop it.

**Private repository:** the link above needs a signed-in browser. Download `install.ps1` from the [releases page](https://github.com/jtddigital/JTDDiagrammar/releases/latest) and run it with a token that can read the repository (or after `gh auth login`):

```powershell
$env:GITHUB_TOKEN = '<token>'; powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### Linux and macOS

Needs Node.js 22.18+.

```bash
curl -fsSL https://github.com/jtddigital/JTDDiagrammar/releases/latest/download/install.sh | bash
```

Then run `jtddiagrammar` to start the app and open your browser; Ctrl+C stops it. On Linux there's also a desktop entry.

### Commands

| Command | Does |
|---------|------|
| `jtddiagrammar` | Start the app and open the browser |
| `jtddiagrammar --port 9000 --no-open` | Another port; don't open the browser |
| `jtddiagrammar update` | Install the latest release (or `update v1.2.3`) |
| `jtddiagrammar version` | Show the installed version |
| `jtddiagrammar uninstall` | Windows: remove the app, its shortcuts and PATH entry (`--keep-config` keeps your settings) |

**Settings**, including `ANTHROPIC_API_KEY` for AI generation, go in `config.env` in the install folder. Updates keep it. Installing also needs access to the npm registry, because dependencies are installed from the release's lockfile.

**Publishing a release:** push a tag such as `v1.0.0`, or create the release on the releases page. Either way the `Release` workflow runs the checks, then attaches the bundle, its checksum and both installers. If those files are missing from a release, open **Actions → Release → Run workflow** and enter the tag. GitHub's own "Source code" archives are not the app bundle. On every push, CI installs, launches, updates and uninstalls a packed release on Windows (Windows PowerShell 5.1 and PowerShell 7) and Linux (`pnpm release:e2e`).

## Quick start

To work on the code instead, you need Node ≥ 22.18 and pnpm 10.

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

Or run everything in one container:

```bash
docker build -t jtd .
```

```bash
docker run -p 8080:8080 jtd
```

Configuration is through environment variables; see [`.env.example`](.env.example).

### Web app

![Web app: JSON editor with inline diagnostics, live SVG preview, export](docs/img/web-app.png)

Edit JSON on the left, and the preview updates as you type. Rendering happens in the browser with the same core library the API uses.

- **Autocomplete** (Ctrl+Space) offers the fields and allowed values of the document's `type`.
- **Errors** are underlined in the editor and listed below it, with their JSON Pointer. The preview keeps the last valid diagram until they are fixed.
- **Preview:** scroll to zoom, drag to pan, or use **Fit** and **1:1**. Click a node, edge, lane or container to select its source. Hover a generated element to see the quote it came from.
- **Export SVG** downloads exactly what the API would return for the same source. **Export PNG** rasterises it at 2× in the browser.
- **Share link** copies a URL that carries the source itself (compressed into the `#fragment`, never sent to the server). The editor also restores your last session.
- The example picker loads every registered example.

### Library

```ts
import { createRegistry, parseJson, render } from '@jtd/core';

const { value } = parseJson(text);
const { svg, diagnostics } = render(value, createRegistry()); // svg is undefined if there are errors
```

Output is standalone SVG 1.1. Text uses `Arial, Liberation Sans, Helvetica, sans-serif`; the first two have identical metrics, so text fits its boxes without embedding a font. Elements carry ids and classes for styling and scripting: `n-<id>` / `jtd-node jtd-shape-<shape>` for nodes, and `e-<id>` / `jtd-edge` for edges.

## API

| Method | Path | Returns |
|--------|------|---------|
| POST | `/v1/render` | `image/svg+xml`, or `{ svg, diagnostics }` with `Accept: application/json`. Body as JSON, XML (`application/xml`) or YAML (`application/yaml`) |
| GET | `/v1/render?src=…` | SVG for `<img>` embedding; `src` is the JSON document, base64url-encoded |
| POST | `/v1/validate` | `{ valid, diagnostics }`; JSON, XML or YAML |
| GET | `/v1/types` | Registered diagram types and their examples |
| GET | `/v1/schema`, `/v1/schema/{type}` | JSON Schema (2020-12), combined or per type |
| POST | `/v1/refine` | Changes an existing diagram from an instruction (see [AI generation](#ai-generation)) |
| POST | `/v1/generate` | Diagram source generated by Claude from text and/or documents (see [AI generation](#ai-generation)) |
| GET | `/v1/ai` | `{ enabled, model? }`: whether AI generation is configured |
| GET | `/v1/openapi.json` | OpenAPI 3.1, generated from the route table |
| GET | `/health` | `{ status: "ok" }` |

```bash
curl -X POST localhost:8080/v1/render -H 'content-type: application/json' --data @diagram.json -o diagram.svg
```

Errors come back as `{ diagnostics: [...] }` (shape as in [Diagnostics](#diagnostics)):

| Status | When |
|--------|------|
| 400 | Invalid JSON or invalid diagram |
| 413 | Body over `BODY_LIMIT`, or more than `MAX_NODES` / `MAX_EDGES` |
| 415 | Body is not `application/json` |
| 422 | Rendering took longer than `RENDER_TIMEOUT_MS`, so the render was stopped |

Rendering runs in worker threads, so one slow diagram can't stall the server. Request bodies are never logged. SVG responses carry `Content-Security-Policy: default-src 'none'`.

## AI generation

Give it a process description, meeting notes or a procedure, as pasted text or as PDF, DOCX, HTML, TXT or MD files. Claude drafts the diagram source, and you review and edit it like anything else.

![Generate panel: paste text or attach documents, pick a type or auto-detect](docs/img/web-generate.png)

```bash
curl -X POST localhost:8080/v1/generate -F type=auto -F files=@procedure.pdf -F 'text=Focus on the approval steps'
```

Images (PNG, JPEG, GIF, WebP: whiteboard photos, screenshots of old diagrams) work too.

The response is `{ type, reason?, source, valid, diagnostics, attempts, usage, svg? }`. `usage` includes token counts and an estimated `costUsd` (published prices; override with `AI_PRICES`).

**Refine** an existing diagram with a plain-language instruction. Styles, hints, notes and ids are kept:

```bash
curl -X POST localhost:8080/v1/refine -H 'content-type: application/json' --data '{"source": {...}, "instruction": "Add a manager approval step before payment"}'
```

**Progress:** send `Accept: text/event-stream` to either endpoint for `progress` events (`ingest`, `select`, `generate`, `validate`, `repair`), then one `result` or `error` event.

**Provenance:** generated nodes and edges carry a short `quote` from the material; it shows as a tooltip when you hover the element in the SVG.

**How it stays correct:**
1. Claude's reply is constrained to the diagram type's generation schema (structured outputs).
2. The reply then passes the **same validation as hand-written source**: schema, references, lanes and phases, and a real layout.
3. If anything fails, the diagnostics go back to Claude for correction, up to `AI_MAX_REPAIRS` times (default 2).
4. If it still fails, you get the best attempt with `valid: false` and its diagnostics. A failed attempt is never presented as valid.

**Setup:**
- Set `ANTHROPIC_API_KEY` on the server. Without it, generation returns `503` and the web panel says it's unavailable.
- The default model is `claude-opus-5-5` (`AI_MODEL`), at effort `high` (`AI_EFFORT`).
- Each client IP gets `AI_RATE_LIMIT` AI requests per minute (default 10); then `429` with `Retry-After`.
- Server-side refusal fallbacks are on; set `AI_FALLBACKS=off` to disable them.
- Limits on file count, file size, total size and input tokens are in [`.env.example`](.env.example). Input is checked with token counting *before* any generation spend.

**Safety:**
- The key is read only by the SDK on the server. The browser never sees it, and lint rules stop the web app from importing AI code.
- Uploaded material is treated as data. It's wrapped and can't close its own wrapper, Claude gets no tools, and the server fixes the type and schema. Any text that ends up in the diagram is escaped when rendered.
- Material and results are not logged or stored.
- Closing the request (or **Cancel** in the web app) aborts the Claude call.

In the web app, the generate panel shows each stage as it happens, and its **Refine** box applies an instruction to whatever is in the editor.

**Status:** CI tests generation end to end against a deterministic mock, never the live API. `pnpm ai:live` runs three real cases (cross-functional, plain, prompt injection) with pass/fail checks; its first run (2026-11-11, `claude-opus-5-5`) passed all three, each valid on the first attempt, with the cached prefix read on repeat calls. A full accuracy evaluation with reference diagrams (URS-AI-018) is still to do.

## Architecture

```
packages/core/src
  registry/     DiagramType + LayoutEngine contracts, Registry
  diagrams/     one folder per diagram type (the only type-specific code)
  ir/           shared Graph IR
  schema/       shared schema fragments, combined schema
  validate/     envelope, JSON Schema (Ajv), common IR rules
  adapters/     source formats (JSON)
  measure/      text metrics from a generated font table (no DOM)
  shapes/       shape library: size, outline, ports
  layout/       layered engine: cycles → rank → order → place → route
  render/svg/   geometry → SVG string
packages/ai/src    Claude client (SDK + mock), ingest, prompts, generate + repair loop
packages/api/src   Fastify server: route table → routes + OpenAPI, worker-thread render pool
packages/web/src   Vite + React + CodeMirror: editor, live preview, export
scripts/docs/   README generation + checks
scripts/fonts/  font metrics generator
```

Pipeline: `parse → envelope → type schema → type rules + IR + common rules → layout engine → geometry → SVG`.

Enforced boundaries (lint + tests):
- `core` has no DOM and no Node built-ins, so it runs in the browser and on the server.
- `layout/` and `render/` never import diagram types.
- Only `packages/ai` imports the Anthropic SDK, and the web app never imports AI code.

Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Requirements: [docs/URS.md](docs/URS.md).

## Development

| Script | Does |
|--------|------|
| `pnpm check` | lint + typecheck + tests + docs check (what CI runs) |
| `pnpm test` | Vitest (unit, layout invariants, golden SVGs) |
| `pnpm test -u` | Accept changed golden SVGs. Review the diff first. |
| `pnpm e2e` | Playwright tests: built web app against the real API, and every generated SVG opened in Chromium and Firefox (`playwright install firefox` once) |
| `pnpm licences` | Production dependency licences against the permissive allowlist |
| `pnpm docs:build` | Regenerate README examples and `docs/img/*.svg` |
| `pnpm docs:screens` | Regenerate web app screenshots (`docs/img/*.png`) |
| `pnpm quality` | Layout quality table (crossings, overlaps, label collisions, timing) over all fixtures; `--update` lowers the baseline that CI enforces |
| `pnpm ai:eval` | Accuracy evaluation over a 6-document corpus (valid rate, node/edge recall, lane accuracy). Needs `ANTHROPIC_API_KEY`; writes `.live/eval.json` |
| `pnpm ai:live` | Live check of AI generation against the real API. Needs `ANTHROPIC_API_KEY`, costs a few cents, never runs in CI; outputs go to `.live/` |
| `pnpm fonts:metrics` | Regenerate `measure/font-metrics.ts` from Liberation Sans |

Every change cites URS IDs and includes an impact assessment in the commit body ([URS §5](docs/URS.md)).

### Adding a diagram type

1. Create `packages/core/src/diagrams/<type>/` with a schema (unique `$id`), model, `toIR`, optional `validate`, ≥ 1 example, and AI assets: a generation schema in the structured-outputs subset, `fromGenerated`, a guide and few-shot examples.
2. Register it in `packages/core/src/builtins.ts`.
3. Run `pnpm docs:build`.

Nothing else changes. The test-only `checklist` type (`packages/core/test/fixture-type.ts`) proves it.

To ship types from a separate package instead, point `REGISTRY_MODULE` at a module that exports `createRegistry()`. The API reads it at startup; the web app reads it when built (`REGISTRY_MODULE=@acme/diagrams pnpm --filter @jtd/web build`).

## Licence

[MIT](LICENSE). Font metrics are derived from Liberation Sans (SIL Open Font License 1.1); no font files are distributed.
