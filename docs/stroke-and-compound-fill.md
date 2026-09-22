# Stroke and compound-fill foundations

A path is geometry. Stroke and fill are separate rendering operations applied to that geometry. This distinction is fundamental to a software-native scientific image generator.

## Stroke as an expanded region

A stroke is not merely a mathematical line. The renderer expands the path by its stroke width and must decide what to do at endpoints and corners.

Line caps control open endpoints:

- `butt` stops exactly at the endpoint;
- `round` adds a semicircular end; and
- `square` extends a rectangular half-width beyond the endpoint.

Line joins control the corner where two segments meet:

- `miter` extends their outside edges until they intersect;
- `round` inserts a circular arc; and
- `bevel` cuts the corner with a straight edge.

The miter limit bounds extreme spikes at acute angles. Dash arrays alternate painted and empty distances along a path, while dash offset shifts where that repeating pattern begins. These fields are appearance, not topology: they do not change which points are connected.

Scientific conventions can map meaning onto these properties. A solid connector may mean a direct relationship, while a dashed connector may mean proposed, indirect, uncertain, or inferred. The semantic relationship must still remain explicit in the scene graph; the dash pattern is only its visual encoding.

## Compound paths and holes

A simple closed path divides the plane into an inside and an outside. A compound path contains multiple closed subpaths and needs a fill rule to decide which nested regions count as inside.

The `evenodd` rule casts a ray from a point and counts boundary crossings. An odd count is filled; an even count is empty. With one outer boundary and one inner boundary, the result is a ring regardless of their winding direction.

The `nonzero` rule sums signed crossings based on subpath direction. Nested subpaths with the same winding remain filled; reversing the inner winding can create a hole. This is powerful but easier for a generator to misuse, so scientific recipes that require a guaranteed hole should generally request `evenodd` explicitly.

Compound paths are useful for membranes, vessels, pores, annuli, hollow particles, lens outlines, and compartment boundaries. A hole is transparent, not white: objects below it remain visible.

## Scene contract

The vector style now supports `lineCap`, `lineJoin`, `dashArray`, `dashOffset`, and `miterLimit`. A `compound_path` element contains one to 32 closed subpaths and an explicit `nonzero` or `evenodd` fill rule. Validation bounds each subpath and the total point count before rendering.

SVG and software-native PNG rendering support the complete contract. Affine transforms update every anchor and control handle across every subpath. The Illustrator JSX adapter preserves the advanced stroke properties, but currently fails explicitly on `compound_path` rather than flattening or silently dropping its hole semantics.

## Executable lesson

Run `npm run render:stroke-fill-basics`. It writes:

- `var/exports/stroke-fill-basics.svg`, the editable vector source; and
- `var/exports/stroke-fill-basics.png`, the software-rasterized review image.

The lesson compares cap and join rules, renders a rounded dashed scientific relationship, and uses an `evenodd` compound path to create a filled membrane ring with a genuinely empty interior.

The original lesson demonstrates renderer appearance. [stroke-expansion.md](stroke-expansion.md) adds the corresponding geometry compiler: it turns those width, cap, join, miter, and dash rules into canonical filled compound paths with measured area and topology.
