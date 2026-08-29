# Software-native path markers

`src/core/pathMarkers.ts` constructs scientific path terminators without Illustrator. A request supplies one validated line or cubic path plus marker specifications. The service returns ordinary ellipse or polygon elements and auditable placement metadata.

## Geometry contract

Markers can be placed at `start`, every interior `mid` vertex, or `end`. The supported kinds are `arrowhead`, `bar`, `circle`, and `diamond`.

- Straight-line orientation is the normalized endpoint vector.
- Cubic endpoint orientation comes from the nearest non-coincident Bezier control handle, with the anchor chord as a fallback.
- An interior marker follows the normalized sum of its incoming and outgoing unit tangents: the vertex-angle bisector.
- `reverse: true` flips the resolved direction by 180 degrees.
- An exact 180-degree interior reversal is ambiguous and fails validation.
- Marker size and optional bar thickness are explicit document-space measurements.

The returned placement records preserve the source anchor index, anchor coordinates, unit tangent, angle in degrees, marker kind, and generated element ID. Output IDs are validated for uniqueness with the rest of the vector-scene contract.

## Scientific connector use

The figure compiler routes a relationship first, then sends that path to this service. Activation, transport, and conversion receive an end arrowhead. Inhibition receives a perpendicular filled bar. Association receives no terminator. The semantic predicate remains independent of this visual encoding.

Because markers are normal scene elements, SVG and PNG renderers consume the same geometry. Illustrator may open the resulting SVG for optional manual editing or specialized export, but it is not involved in tangent calculation or marker construction.

## Interfaces

Run the request example and visual lesson:

```bash
npm run geometry:path-markers
npm run geometry:path-marker-basics
```

The same operation is available as HTTP `POST /v1/geometry/path-markers` and MCP tool `place_path_markers`. All three surfaces call the identical core implementation and do not launch Adobe software.

The lesson output explains straight endpoint direction, cubic endpoint handles, interior angle bisectors, and scientific arrow/bar conventions. It writes validated scene JSON, editable SVG, and a derived PNG under `var/exports/`.
