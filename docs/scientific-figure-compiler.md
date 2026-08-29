# Scientific figure specification compiler

The scientific figure compiler is the first complete generator layer. A user or upstream model describes the figure as data; deterministic software turns that data into a validated semantic scene and editable SVG.

## Compilation pipeline

`src/scientific/figureCompiler.ts` performs one ordered pass:

1. Validate the specification, stable IDs, references, sizes, roles, ports, and limits.
2. Solve explicit constraints or automatically rank and place a coordinate-free semantic graph.
3. Reject objects outside the drawable area or overlapping without declared containment.
4. Select and expand reusable multi-part scientific symbol recipes and semantic visual roles.
5. Place object labels without colliding with other objects or earlier labels.
6. Route visible relationships between named or inferred object ports while avoiding obstacles and earlier routes.
7. Apply the scientific connector grammar—activation, inhibition, association, transport, or conversion—and place relationship labels.
8. Attach stable scientific object and relationship identity to every relevant vector element.
9. Validate the complete renderer-independent scene.
10. Serialize that scene to editable SVG.

No Adobe application participates in compilation. Illustrator can import the SVG later, but it does not decide what the objects mean or where they belong.

## Specification surface

The root requires `schemaVersion`, `document`, and `objects`. Optional `constraints`, `relationships`, and `settings` describe composition.

Each object has a stable ID, semantic kind, visible label, dimensions, and either explicit coordinates or enough constraints to solve both coordinates. Shape, style role, and multi-part symbol recipe can be explicit or inferred from the semantic kind. See [scientific-symbol-registry.md](scientific-symbol-registry.md).

Constraints use the same core contracts as the layout solver:

- `align` aligns start, center, or end on one axis;
- `gap` positions one object left, right, above, or below another; and
- `contain` centers and verifies a child inside a container with optional padding.

Alternatively, `settings.layoutMode: "layered"` invokes [automatic-graph-layout.md](automatic-graph-layout.md). Objects then omit coordinates and constraints. Directed relationships determine ranks, while strongly connected components keep scientific feedback loops together instead of rejecting them.

Each relationship identifies source, predicate, and target. Visible relationships can specify source and target ports and use activation, inhibition, association, transport, or conversion roles. `semantic_only` relationships remain in the scientific graph without inventing a connector, which is appropriate for facts such as containment already expressed visually. See [scientific-connector-grammar.md](scientific-connector-grammar.md).

## Executable example

`examples/scientific-figure-spec.json` describes ligand binding, receptor activation, kinase signaling, and a gene response inside a nucleus. It deliberately mixes explicit coordinates, derived layout, multi-part molecule/receptor/protein/nucleus/process recipes, routed relationships, automatic labels, visual relationships, and semantic-only containment.

Run `npm run scientific:generate`. The command writes `var/exports/scientific-figure.scene.json` and `var/exports/scientific-figure.svg`.

The scene JSON is the source-of-truth compilation result. SVG is one renderer output and can be replaced or supplemented by PDF, Canvas, WebGL, Illustrator, or another adapter without changing the scientific specification.
