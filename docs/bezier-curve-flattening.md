# Bézier curve flattening

A vector curve is not a row of pixels. In this generator, a path is a sequence of anchors. Each segment may also use an outgoing handle on its first anchor and an incoming handle on its second anchor. Those four points define a cubic Bézier segment.

For anchors `P0` and `P3` with controls `P1` and `P2`, the continuous curve is:

`B(t) = (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t)t^2 P2 + t^3 P3`, for `0 <= t <= 1`.

SVG can render that equation directly. Polygon algorithms cannot: they operate on straight-edged rings. Curve flattening is therefore a compiler step between the editable path model and polygonal computational geometry.

## Explicit tolerance contract

`flattenBezierPath` requires a positive tolerance. For each cubic segment it measures both control points against the finite anchor-to-anchor chord. If either control point lies farther than the tolerance, the segment is split at `t = 0.5` with De Casteljau subdivision and checked again.

The process stops only when every accepted sub-curve's control hull is within the requested distance of its straight chord. A cubic Bézier lies inside its control hull, so this is a conservative and auditable flatness criterion. It also handles collinear controls that extend beyond the chord endpoints; measuring against an infinite line would incorrectly accept those overshooting curves.

The result records:

- requested tolerance and maximum recursion depth;
- deepest subdivision actually used;
- source, curved, and straight segment counts;
- output point and segment counts; and
- output bounds.

The returned path contains anchors only. It retains safe scene metadata and appearance, but no curve handles. A smaller tolerance normally produces more line segments and a closer approximation.

## Bounds and failures

The service accepts at most 500 source anchors, 10,000 output points, coordinates already bounded by the scene contract, tolerance from `0.000001` through `100000`, and recursion depth from 1 through 24. Incomplete handle pairs, unsafe scene values, impossible depth limits, and excessive output complexity fail explicitly.

Closed paths remain closed and omit a duplicated closing point. Open paths remain open. Straight source segments pass through without subdivision.

## Boolean integration

Polygon boolean operands may now contain `paths` in addition to existing `rings`. Every such path must be closed, and the request must declare `curveTolerance`. The boolean result records aggregate flattening provenance: tolerance, curved-path count, curved-segment count, flattened input-point count, and maximum depth used.

The order is deliberate:

1. validate anchors and handles;
2. flatten each curve at the declared tolerance;
3. reject zero-area or excessive rings;
4. apply union, intersection, difference, or XOR; and
5. return a canonical compound path with area and topology metadata.

This makes measurements reproducible. Two figures using different tolerances are not silently treated as identical geometry.

## Interfaces

CLI:

- `npm run geometry:flatten-curve` reads `examples/bezier-flatten-request.json` and writes `var/exports/bezier-flatten-result.json`.
- `npm run geometry:curve-basics` writes the visual lesson as scene JSON, editable SVG, and derived PNG.
- `npm run geometry:boolean-curves` processes two closed cubic regions and writes their tolerance-controlled intersection.
- `npm run geometry:boolean` accepts mixed straight-ring and curved-path operands.

HTTP:

- `POST /v1/geometry/flatten-curve` returns the flattened path and provenance.
- `POST /v1/geometry/boolean` accepts closed curves when `curveTolerance` is present.

MCP:

- `flatten_bezier_path` exposes the direct approximation service.
- `construct_polygon_boolean` exposes the integrated curve-to-region pipeline.

No Adobe application participates in validation, subdivision, boolean construction, SVG rendering, or PNG derivation.
