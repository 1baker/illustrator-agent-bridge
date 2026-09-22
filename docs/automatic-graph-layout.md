# Automatic layered graph layout

The automatic layout engine removes coordinates from the scientific authoring contract. A specification can declare only objects, dimensions, and directed relationships; deterministic software assigns positions before labels and routes are calculated.

## Algorithm

`src/core/layeredGraphLayout.ts` treats the scientific scene as a directed graph:

1. Validate node and relationship IDs, dimensions, references, limits, bounds, and spacing.
2. Build a deterministic adjacency list using specification order as the tie breaker.
3. Find strongly connected components with Tarjan's algorithm.
4. Condense every feedback component into one node in an acyclic component graph.
5. Assign each component the longest-path rank from an input component.
6. Place ranks along the primary axis and center their nodes along the secondary axis.
7. Return resolved coordinates, rank IDs, and component IDs to the figure compiler.

Strongly connected components matter for scientific diagrams. Feedback loops are common in regulation, signaling, metabolism, and control systems. Rejecting every cycle would incorrectly treat valid scientific structure as a layout error. Members of a feedback component instead share a rank and are separated within that rank.

## Directions and fit

The engine supports `left_to_right` and `top_to_bottom`. `rankGap` controls separation between layers; `nodeGap` controls separation inside a layer.

The layout is centered in the drawable figure region. It fails with an explicit size diagnostic when either the sequence of ranks or the largest rank cannot fit. It never silently shrink-wraps objects, overlaps them, or pushes them outside the canvas.

## Compiler contract

Set `settings.layoutMode` to `layered`. Objects then omit `x` and `y`, and the specification must not include explicit layout constraints. This keeps automatic and explicit layout contracts unambiguous.

`examples/scientific-auto-layout-spec.json` contains six coordinate-free objects, a branching signaling pathway, an inhibitory input, and a two-protein feedback loop. Run `npm run scientific:auto-layout` to compile it into scene JSON and editable SVG.

After layout, the existing generator stages remain unchanged: symbol recipes expand, labels avoid collisions, relationships route around obstacles, scientific identity is attached, and the entire scene is validated before SVG serialization. Reciprocal relationships use distinct object ports. The primary graph is routed first and reciprocal back-edges second, allowing feedback loops to avoid established upstream and downstream paths. A shared route endpoint is permitted, while interior intersections and overlapping segments still count as crossings.
