---
type: frontend
title: Canvas layout, viewport and inspector
description: How a domain model becomes a deterministic picture — context cards, fulfillment columns, orthogonal edges, viewport and ruler maths, one-hop highlighting — and how the right-hand inspector is generated from a declarative field registry.
tags: [canvas, layout, viewport, selection, inspector, renderer]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-f0f06a0981a7ca97c510b44d
    resource: repo://apps/desktop/src/renderer/state/useEditorSession.ts
  - id: openwiki-source-b76ed42804fed7bd39fd9662
    resource: repo://libs/evidence-canvas-interaction/src/layout/graphLayout.spec.ts
  - id: openwiki-source-1449be46136b62420deecb01
    resource: repo://libs/evidence-canvas-interaction/src/layout/graphLayout.ts
  - id: openwiki-source-3b8cee887561dc24e2e125cf
    resource: repo://libs/evidence-canvas-interaction/src/ruler/math.ts
  - id: openwiki-source-e201766d146c1a3d447c7c7a
    resource: repo://libs/evidence-canvas-interaction/src/selection/boxSelection.spec.ts
  - id: openwiki-source-14345600db463199370d00f4
    resource: repo://libs/evidence-canvas-interaction/src/selection/boxSelection.ts
  - id: openwiki-source-24dbd55c2289a899a8324ace
    resource: repo://libs/evidence-canvas-interaction/src/selection/hoverHighlight.spec.ts
  - id: openwiki-source-40ed2cf21089af3de30a0699
    resource: repo://libs/evidence-canvas-interaction/src/selection/hoverHighlight.ts
  - id: openwiki-source-a5eddd49360294b42f7acd4e
    resource: repo://libs/evidence-canvas-interaction/src/viewport/fit.ts
  - id: openwiki-source-3960b31ba0871589784b02e5
    resource: repo://libs/evidence-canvas-interaction/src/viewport/transform.ts
  - id: openwiki-source-43c80155ee77902c7ef83da1
    resource: repo://libs/evidence-canvas-interaction/src/viewport/zoom.ts
  - id: openwiki-source-765a818dd2c076288d6080cc
    resource: repo://libs/evidence-schema/src/inspector/groups.ts
  - id: openwiki-source-f7425e64fedf4f34deb929e7
    resource: repo://libs/evidence-schema/src/inspector/registry.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Canvas layout, viewport and inspector

The editor is split into two halves that never share state directly:

- `libs/evidence-canvas-interaction` — framework-free maths: layout, viewport,
  ruler, selection. It imports the schema and the model graph, never React.
- `apps/desktop/src/renderer` — React components that hold gestures, viewport
  state and the live `ModelSession`, and call the maths.

That division is why the layout can be tested without a DOM and why a canvas
gesture bug is not a modelling bug.

## Layout is deterministic

`createGraphLayout(graph)` is a pure function of the document. Given the same
model it produces the same boxes, in the same order, with no randomness and no
measured text (`repo://libs/evidence-canvas-interaction/src/layout/graphLayout.ts#L88-L100`).

The constants define the grid
(`repo://libs/evidence-canvas-interaction/src/layout/graphLayout.ts#L33-L50`):

| Constant | Value | Role |
| --- | --- | --- |
| `NODE_WIDTH` | 220 | every object card |
| `NODE_BASE_HEIGHT` | 64 | one label line |
| `NODE_LABEL_LINE_HEIGHT` | 18 | extra label line |
| `NODE_ATTRIBUTE_ROW_HEIGHT` | 16 | one attribute row |
| `MAX_MEASURED_ATTRIBUTE_ROWS` | 3 | height cap |
| `COLUMN_GAP` / `ROW_GAP` | 72 / 24 | spacing |
| `CONTEXT_PADDING` / `CONTEXT_TITLE_HEIGHT` | 24 / 36 | context card chrome |
| `FREE_BAND_COLUMNS` | 3 | free-object rows |

`measureNodeHeight` derives height from the label's line count (capped at 2) and
the attribute count (capped at 3). Two objects with the same label length and
attribute count are always the same height, which is what keeps a re-layout from
jumping.

### Contexts own objects; the layout draws the ownership

Entities are bucketed by `contextRef`; entities whose context is missing or
unknown become **free nodes**. Contexts are then nested by `parentContextRef`, and
each subtree is laid out with coordinates relative to its own card before being
shifted into place (`repo://libs/evidence-canvas-interaction/src/layout/graphLayout.ts#L102-L170`).

Inside a context, the layout has two bands:

1. **Fulfillment rows.** Each `fulfillment_request` becomes one row: request in
   column 0, its confirmations in column 1, its proofs in column 2. The three
   columns are enclosed by one `FulfillmentLayoutGroup`, so a request and the
   evidence that closes it read as one object
   (`repo://libs/evidence-canvas-interaction/src/layout/graphLayout.ts#L192-L262`).
2. **Free band.** Remaining objects fill rows of up to three, with the row height
   taken from the tallest card.

Child contexts are laid out after the parent's band and shifted below it. An
**empty context is not drawn at all**: its id is recorded in
`omittedContextIds` instead of producing an empty card
(`repo://libs/evidence-canvas-interaction/src/layout/graphLayout.ts#L294-L306`).

### Edges and responsibility links

Formal relationships become orthogonal three-segment routes. The direction is
chosen from the relative box positions, so parallel edges inside one Context do
not overlap their labels
(`repo://libs/evidence-canvas-interaction/src/layout/graphLayout.ts#L441-L475`,
`repo://libs/evidence-canvas-interaction/src/layout/graphLayout.ts#L548-L597`).

Each edge carries its rendering semantics:

- `dashed` when the endpoints are in different contexts **or** the kind is
  `plays_role`;
- `arrow` only for `plays_role`;
- `crossContext` recorded so a panel can explain it.

A relationship whose endpoint is not laid out is **skipped**, not drawn to a
missing box. Responsibility lines are separate from relationships and come only
from explicit fields: `roleRefs` produce `contract_party` links and
`responsibleRoleRef` produces a `responsibility` link
(`repo://libs/evidence-canvas-interaction/src/layout/graphLayout.ts#L477-L504`).

Bounds are the union of every node and context box
(`repo://libs/evidence-canvas-interaction/src/layout/graphLayout.ts#L506-L523`).

## Viewport maths

The transform is `world * zoom + pan`, always measured from the stage origin (the
ruler origin), never the window
(`repo://libs/evidence-canvas-interaction/src/viewport/transform.ts#L1-L30`).

`transform.ts` provides `screenToWorld`, `worldToScreen`, screen-delta scaling,
panning, rectangle conversion, visibility testing and `revealWorldRect` for
centring a selection.

Zoom is clamped to `0.25–4` and has twelve discrete stops, with a 1.25 fallback
for values produced by a trackpad pinch. `zoomAtPoint` keeps the world point under
the pointer on the same pixel, which is what makes wheel zoom feel anchored
(`repo://libs/evidence-canvas-interaction/src/viewport/zoom.ts#L5-L69`).

`calculateZoomToFit` centres content with 64 px padding and falls back to
`DEFAULT_VIEWPORT` for empty or degenerate content, so a cold start never produces
`Infinity`/`NaN`
(`repo://libs/evidence-canvas-interaction/src/viewport/fit.ts#L12-L60`).

## Ruler

The ruler uses a 1-2-5 ladder (`1, 2, 5, 10, …`). `pickRulerStep` chooses the
smallest step whose on-screen width clears `minMajorStepPx` (80 by default),
extending the ladder by whole multiples when a caller asks for an unusually large
minimum. Ticks are aligned to the world grid, so panning moves them without
changing their labels
(`repo://libs/evidence-canvas-interaction/src/ruler/math.ts#L1-L84`).

## Selection and highlighting

Hover/focus highlighting is strictly **one hop**, documented at the function:

- a node highlights itself, its formal neighbours, the edges touching it, its
  context and that context's ancestors, plus any responsibility badge pointing at
  it or from it;
- an edge highlights the line and both endpoints' context chains;
- a context highlights its subtree, every object it owns and only the edges with
  both endpoints inside.

Anything unknown returns the empty, undimmed result rather than throwing
(`repo://libs/evidence-canvas-interaction/src/selection/hoverHighlight.ts#L50-L196`).
`isNodeDimmed`, `isEdgeDimmed` and `isContextDimmed` compute the mask from the
same result, so every surface agrees about what is faded.

Marquee selection intersects boxes, skips a marquee below `minimumSize`, orders
intersecting contexts outermost first, and hit-tests objects before context
backgrounds (`repo://libs/evidence-canvas-interaction/src/selection/boxSelection.ts#L12-L77`).

## The React side

`useEditorSession` owns exactly one `ModelSession` per editor window, created from
the opened document. Every edit path goes through `session.dispatch`, so undo and
the picture cannot drift; the hook subscribes to `document-changed` and forces a
render.

The derived state is rebuilt on every session event and includes a fresh graph
and **a fresh layout**:
`layout: createGraphLayout(graph)`
(`repo://apps/desktop/src/renderer/state/useEditorSession.ts#L51-L80`,
`repo://apps/desktop/src/renderer/state/useEditorSession.ts#L123-L130`). Saving
sends the document to the main process; `reloadFromDisk` and `adoptDocument` both
replace the document and reset history, because a checkout or reload invalidates
the previous undo steps.

`CanvasViewport` holds the viewport, hover, drag and marquee state. It fits once on
the first layout, fits again on request, pans on wheel, zooms multiplicatively when
Ctrl/Cmd or a pinch is detected, and translates screen gestures through the
library (`repo://apps/desktop/src/renderer/components/canvas/CanvasViewport.tsx#L90-L230`).

`CanvasStage` renders the result: context cards, fulfillment group rectangles, SVG
polylines with dash/arrow semantics, hover labels, cardinality chips in
`standard` view mode, and the branch overlay (marks and ghosts) described in
[Interview branches and lineage](./branches-and-lineage.md)
(`repo://apps/desktop/src/renderer/components/canvas/CanvasStage.tsx#L53-L220`).

## The inspector is declarative

The right-hand panel is generated from `evidence-schema`, not hand-built per
entity kind. The registry declares five group ids — `general`, `responsibility`,
`attributes`, `fulfillment`, `rules` — with Chinese labels
(`repo://libs/evidence-schema/src/inspector/groups.ts#L1-L18`).

Each property names a field, an editor kind, optional select options, an optional
reference constraint and a business helper string
(`repo://libs/evidence-schema/src/inspector/registry.ts#L16-L60`):

| Editor kind | Used for |
| --- | --- |
| `readonly-id` | stable id, never editable |
| `text` | label, notes, description |
| `select` | category kinds |
| `boolean` | flags such as `required` / `keyData` |
| `attribute-table` | the entity's attribute rows |
| `cel-editor` | rule expression |
| `key-data-provenance` | the provider decision for a key data item |
| `reference-picker` / `reference-list` | context, role and root references |

Reference constraints are the interesting part: `contextPicker` scopes by
category, while responsibility fields declare `{categories: ['role'], kinds:
['party'], sameContext: true}`, so the picker cannot offer a role from another
contract. `getInspectorGroups(category)` and `getReferenceConstraint(category,
field)` are the only lookup APIs, which keeps the renderer free of field tables
(`repo://libs/evidence-schema/src/inspector/registry.ts#L307-L334`).

Attribute, rule and key-data field tables are exported separately for the panels
that edit them (`INSPECTOR_ATTRIBUTE_FIELDS`, `INSPECTOR_RULE_FIELDS`,
`INSPECTOR_KEY_DATA_PROVENANCE_PROPERTY`).

## Edge cases worth knowing

| Situation | Behaviour |
| --- | --- |
| empty context | not drawn; id goes to `omittedContextIds` |
| entity with a missing/unknown `contextRef` | free node above the context cards |
| relationship with an unlaid endpoint | edge skipped silently |
| label with attribute rows | height capped at 3 rows; extra rows are not measured |
| empty model | bounds `0×0`, fit falls back to the default viewport |
| radius/zoom input `0` or negative | treated as `1` by the ruler |
| unknown highlight id | empty, undimmed result |

## Tests that protect this contract

- `graphLayout.spec.ts` asserts determinism, height measurement, every entity
  placed once, free participants outside cards, child nesting, one fulfillment
  group per request, dashed/cross-context/arrow rules, responsibility links from
  explicit fields only, refusal to draw an empty context shell, bounds, and three
  routing shapes
  (`repo://libs/evidence-canvas-interaction/src/layout/graphLayout.spec.ts#L15-L210`).
- `transform.spec.ts`, `zoom.spec.ts` and `fit.spec.ts` pin projection order,
  round trips, anchor-preserving zoom, clamping, discrete stops and the
  empty-content fallback.
- `math.spec.ts` pins ladder selection, aligned ticks, pan stability and invalid
  ranges.
- `hoverHighlight.spec.ts` and `boxSelection.spec.ts` pin one-hop expansion, edge
  endpoints, context subtrees, graceful unknown ids, marquee intersection,
  outermost-first ordering and object-over-background hit testing.
- `registry.spec.ts` pins the group and field tables the renderer consumes.

## Related pages

- [Commands, guards and the model session](../model/commands-and-session.md) — the
  transitions that trigger a re-layout.
- [The Fulfillment Modeling DSL (FM v5)](../language/fm-dsl.md) — the categories
  and fields the inspector edits.
- [Interview branches and lineage](./branches-and-lineage.md) — marks and ghosts.
- [Desktop app shell and IPC surface](./app-shell.md) — how the document reaches
  the window.
