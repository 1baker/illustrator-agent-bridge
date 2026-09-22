# Software-native stroke expansion

A centerline has length but no area. A rendered stroke adds width, endpoint rules, corner rules, and optional painted/gap intervals. Stroke expansion compiles those appearance rules into explicit filled geometry.

This is the software equivalent of Illustrator's **Outline Stroke** operation. The resulting compound path is renderer-independent and can be measured, clipped, masked, intersected, or combined like any other region. Illustrator is not required.

## Input contract

`expandStroke` accepts one validated `line` or `path`, plus an explicit geometric tolerance. It reads these existing style fields:

- `strokeWidth`, defaulting to the scene renderer's value of 2 but required to be greater than zero;
- `lineCap`: `butt`, `round`, or `square`;
- `lineJoin`: `miter`, `round`, or `bevel`;
- `miterLimit`, defaulting to 4;
- `dashArray`, including SVG's odd-list repetition rule; and
- `dashOffset`, including positive and negative SVG phase semantics.

A null stroke is rejected because there is no painted geometry to expand. Cubic centerlines are first flattened using the same declared tolerance and bounded De Casteljau compiler described in [bezier-curve-flattening.md](bezier-curve-flattening.md).

## Construction algorithm

For stroke width `w`, the compiler uses half-width `h = w / 2`.

1. Each straight centerline segment creates a rectangle between its two `+h` and `-h` parallel offsets.
2. An open butt cap adds nothing. A square cap adds a width-by-half-width rectangle. A round cap adds a tolerance-bounded circular component.
3. At a bevel join, the outside corner is the triangle between the vertex and the two outside offset points.
4. At a miter join, the two outside offset lines are intersected. The bevel triangle plus the outer miter triangle forms the sharp corner. If `1 / sin(theta / 2)` exceeds `miterLimit`, the join falls back to bevel.
5. At a round join, the segment bodies are united with a tolerance-bounded disk centered at the vertex, producing the required outside circular sector.
6. Dash positions are measured along the flattened centerline. Every painted interval becomes an open subpath and receives its own selected caps and interior joins.
7. All component polygons are united by the bounded polygon engine and canonicalized as one `evenodd` compound path.

These cap, join, miter, and dash conventions follow the [SVG 2 painting and stroke-shape specification](https://www.w3.org/TR/SVG2/painting.html#StrokeShape).

## Output and provenance

The result includes:

- the canonical filled compound path;
- measured area, bounds, polygon count, ring count, and point count;
- source and flattened centerline complexity;
- selected width, cap, join, miter, dash, and tolerance values;
- painted dash-subpath and component counts;
- generated cap and join counts;
- miter-to-bevel fallback count; and
- curve-flattening metadata when the source contains cubic handles.

A closed undashed centerline receives joins but no caps. Its expanded result can contain a real transparent hole, such as a membrane or vessel wall.

## Bounded subset

The compiler supports the scene contract's constant-width strokes. It intentionally rejects exact 180-degree reversals and excessive arc or dash complexity. SVG 2's `miter-clip` and `arcs` joins, variable-width brushes, pressure profiles, inside/outside stroke alignment, markers, and paint-server gradients are not part of this first geometry contract.

Round cap and join circles are polygonal approximations. Their segment count is derived from the declared tolerance, rounded to a multiple of four so all cardinal extrema remain exact, and capped at 512 segments. A tolerance too small for that bound fails instead of silently reducing precision.

Dash distances are measured on the tolerance-flattened centerline. Consequently, tolerance is provenance for both curve shape and dash placement.

## Scientific uses

Expanded strokes support measurable membranes, vessel walls, conduits, fibers, reaction arrows, transport paths, uncertainty conventions, dashed hypothetical relationships, and mask boundaries. The source centerline should remain in the semantic scene when editability matters; the expanded outline is a derived geometric representation.

## Interfaces

CLI:

- `npm run geometry:expand-stroke` processes `examples/stroke-expansion-request.json`.
- `npm run geometry:stroke-expansion-basics` writes the lesson as scene JSON, editable SVG, and derived PNG.

HTTP:

- `POST /v1/geometry/expand-stroke` returns the expanded outline and provenance.

MCP:

- `expand_vector_stroke` exposes the identical bounded compiler operation.

No Adobe application participates in curve flattening, dash placement, cap or join construction, polygon union, SVG rendering, or PNG derivation.
