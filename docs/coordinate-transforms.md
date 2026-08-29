# Coordinate transforms: defining once, placing many times

The first geometry lesson connected points into open and closed paths. The next software concept is reuse: define a shape once in its own local coordinate system, then place copies into the figure with transformations.

## Local space and world space

A local triangle can be stored around its own origin:

```text
(-60, 50) -> (0, -50) -> (60, 50) -> close
```

Those points describe the shape, not its final page location. A transform converts them into world-space coordinates on the canvas.

The core uses the standard two-dimensional affine equation:

```text
x' = a*x + c*y + e
y' = b*x + d*y + f
```

The six values represent a matrix that can express translation, rotation, scaling, reflection, and shear. Matrix multiplication composes several operations into one deterministic transform.

## Why this matters for scientific figures

A membrane receptor, molecule, arrowhead, or instrument symbol should not need a separate hard-coded point list every time it appears. Software can retain one canonical local definition and instantiate it at different positions, orientations, and sizes.

The transform layer deliberately separates geometry from style:

- Geometry determines coordinates and topology.
- Style determines stroke, fill, opacity, and similar appearance.
- Scaling geometry does not automatically scale stroke width.

That last rule is useful for publication figures, where repeated objects can vary in size while their visible line weights remain consistent.

## Flattening for renderers

`src/core/affineTransform.ts` converts local elements into ordinary world-space geometry:

- Lines remain lines.
- Polygons and paths receive transformed points.
- Rectangles become four-point polygons when rotated.
- Ellipses become four-segment cubic Bezier paths so rotation and non-uniform scaling remain representable.

The result contains no renderer-specific transform state. SVG and the optional Illustrator adapter can therefore consume the same flattened scene.

## Executable lesson

Run:

```bash
npm run build
npm run geometry:transform-basics
```

This writes:

- `var/exports/transform-basics.scene.json`
- `var/exports/transform-basics.svg`

The SVG shows one local triangle instantiated through translation, rotation, and scaling. The scene metadata records each instance's six matrix values and whether its interior is filled or empty.
