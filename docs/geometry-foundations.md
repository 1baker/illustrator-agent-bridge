# Geometry foundations for a scientific image generator

The generator's source of truth is a structured scene, not pixels and not an Illustrator document. The generator runs without Adobe. Adobe applications are optional downstream tools:

- Illustrator edits and renders vector objects.
- Photoshop edits and composites pixel grids.
- The core scene model preserves scientific meaning and geometry before either adapter is involved.

## The first object model

A point is a coordinate `(x, y)`. Two points define a finite line segment. An ordered sequence of points defines a path. A path becomes a shape boundary when it is closed.

Geometry and appearance are separate:

```text
Path
  points: ordered coordinates
  closed: true or false
  style:
    stroke: outline color or null
    strokeWidth: outline thickness
    fill: interior color or null
    opacity: 0 through 100
```

`fill: null` means the interior is transparent. It does not mean white. A white fill is opaque white and can hide objects below it.

Stroke width is only the beginning of stroke appearance. Endpoint caps, corner joins, miter limits, and dash patterns define the visible region generated around the path. A compound path combines multiple closed boundaries, while its fill rule decides whether nested boundaries create holes. See [stroke-and-compound-fill.md](stroke-and-compound-fill.md).

## Why closure matters

An open path has no mathematically bounded interior, so it is normally stroked but not filled. A closed path connects its final point back to its first point. That creates an inside region that a renderer can fill.

Closure is topology: it describes connectivity. Point coordinates are geometry. Stroke and fill are style. Keeping these concerns separate lets a later scientific object retain the same structure while changing position, scale, or visual theme.

## The executable example

[`examples/geometry-basics-scene.json`](../examples/geometry-basics-scene.json) contains four stages:

1. Two endpoints rendered as a line segment.
2. Several connected segments rendered as an open path.
3. A closed triangular path with a transparent interior.
4. The same kind of closed path with a colored fill.

Render it without Adobe:

```bash
npm run build
npm run render:geometry-basics
```

The result is `var/exports/geometry-basics.svg`. The SVG is browser-viewable, scalable, and editable in Illustrator. The same scene JSON can also be converted to an Illustrator JSX job:

```bash
node dist/src/cli.js jsx:cartoon examples/geometry-basics-scene.json
```

This creates a generated job under `var/jobs/`. Running that job through the bridge creates native Illustrator path items from the same points, connections, closure flags, strokes, and fills.

## Architectural direction

The next layers should build on this core rather than bypassing it:

```text
scientific concept
  -> semantic object (cell, molecule, arrow, membrane)
  -> geometric primitives
  -> validated scene graph
  -> primary SVG renderer
  -> optional Illustrator vector adapter
  -> optional Photoshop raster/compositing pass
```

The semantic object layer is what distinguishes a scientific image generator from a generic drawing program. A circle can eventually carry the meaning `cell membrane`, while its visible geometry remains an ellipse or path.

That next layer is implemented in [scientific-scene-graph.md](scientific-scene-graph.md).
