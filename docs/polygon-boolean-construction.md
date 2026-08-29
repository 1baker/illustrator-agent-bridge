# Polygon boolean construction

Illustrator exposes these ideas through Pathfinder commands. From a software-engineering standpoint, they are set operations over two-dimensional regions:

- union computes points contained in A or B;
- intersection computes points contained in both A and B;
- difference computes points contained in A but not B; and
- exclusive-or computes points contained in exactly one operand.

The generator now owns these operations. Illustrator is not required to calculate or render the result.

## Input and output contracts

Each operand is a region. Its first ring or closed path is the exterior boundary and later entries are holes. Straight rings contain finite `(x, y)` points and are implicitly closed. Cubic paths contain anchors and optional control handles; a request containing paths must declare `curveTolerance` before the paths are adaptively flattened. The service accepts between two and 16 operands, with bounded rings, paths, points, coordinates, recursion, and output complexity.

Results are normalized as one optional `compound_path` element using the `evenodd` fill rule. One element can therefore represent a simple polygon, multiple disconnected polygons, or polygons containing holes. An empty set is returned explicitly with `empty: true` and no drawable element.

The result also records polygon, ring, and point counts; measured area; bounds; operand count; operation; and the pinned geometry-engine version. Commutative operations canonicalize polygon and ring ordering so swapping equivalent operands produces the same scene element.

## Geometry engine boundary

The bounded service wraps `polygon-clipping` 0.15.7, which implements union, intersection, difference, and XOR over polygon and multipolygon geometry using the Martinez-Rueda-Feito algorithm. The package is isolated behind `src/core/polygonBoolean.ts`; generator callers do not consume its raw coordinate arrays or module API.

The wrapper adds application-specific validation, coordinate limits, complexity limits, stable identifiers, style validation, canonical ring starts, measured topology, compound-path conversion, and explicit empty-result handling.

Curved Bézier paths are now accepted through the explicit contract in [bezier-curve-flattening.md](bezier-curve-flattening.md). Silent flattening remains forbidden: requests containing curves must provide `curveTolerance`, and results report the applied tolerance and aggregate subdivision metadata.

## Scientific uses

Boolean construction supports merged compartments, shared spatial domains, exclusion regions, cutouts, pores, segmented phases, masks, overlapping populations, and composite symbol recipes. The geometric operation does not itself assign scientific meaning. The result remains linked to a semantic object whose properties record the operation and measured topology.

## Interfaces

CLI:

`npm run geometry:boolean` processes `examples/polygon-boolean-request.json` and writes `var/exports/polygon-boolean-result.json`.

`npm run geometry:boolean-basics` writes the complete lesson as scene JSON, editable SVG, and derived PNG.

HTTP:

`POST /v1/geometry/boolean` accepts the boolean request and returns the normalized result.

MCP:

`construct_polygon_boolean` exposes the same bounded operation and returns a canonical compound-path element suitable for insertion into a validated vector scene.
