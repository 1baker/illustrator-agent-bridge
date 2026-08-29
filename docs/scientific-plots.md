# Software-native scientific plots

The plot compiler treats charting as a deterministic software pipeline. Numerical data are the input; the compiler derives domains, linear scales, ticks, labels, clipped marks, uncertainty geometry, legends, and scientific semantics. Illustrator and Photoshop are not involved.

## Compiler pipeline

```text
validated numerical series
  -> data and uncertainty extents
  -> explicit or deterministic nice domains
  -> data-to-pixel linear scales
  -> tick values and formatted labels
  -> axes, grid, line/scatter/bar marks, and error bars
  -> clipped semantic vector scene
  -> editable SVG and derived PNG
```

The normalized specification and returned scale metadata make the numerical mapping auditable. The scene keeps axes and every series as stable semantic objects, while the SVG annotates their visual elements. Input order is preserved for line trajectories rather than silently sorting data.

## Supported contract

- `schemaVersion` is `1`.
- `document` requires a title and may set a subtitle, width, and height.
- `xAxis` and `yAxis` require labels and may set a two-number domain, tick count, numeric format, and grid visibility.
- A series requires a stable ID, label, `line`, `scatter`, or `bar` mark, and numerical `{x, y}` data.
- A datum may include nonnegative `xError` and `yError`; each becomes a stem and two caps.
- Series may set colors, stroke width, point radius, point visibility, and opacity.
- The legend is `right` by default or can be `none`.

Only numerical linear axes are supported in version 1. Logarithmic, categorical, date/time, faceted, and dual-axis plots are intentionally outside this contract.

## Fail-closed behavior

The compiler rejects malformed IDs, colors, domains, sizes, ambiguous duplicate bar positions, one-point line series, negative uncertainty, explicit domains that clip data or uncertainty, bar domains that omit zero, and requests that would exceed the 1,000-element scene limit. Bar endpoint padding is included when the automatic x domain is derived.

## Interfaces and outputs

Run `npm run scientific:plot` to compile `examples/scientific-plot.json`. It writes the normalized result, authoritative scene, editable SVG, and derived PNG under `var/exports/`.

The same operation is available as:

- HTTP: `POST /v1/scientific/plot` with the plot specification as the request body.
- MCP: `generate_scientific_plot` with `{ "plot": <specification> }`.
- TypeScript: `compileScientificPlot(input)` from `src/core/scientificPlot.ts`.

SVG uses an explicit cross-platform font fallback and PNG uses DejaVu Sans as its deterministic default, preventing numeric-only tick labels from disappearing in headless WSL/Linux rendering.

## Adobe boundary

SVG is already an editable vector artifact and PNG is already a publication/review derivative. Illustrator can optionally open or refine the SVG, and Photoshop can optionally retouch the PNG, but neither application owns the data mapping, chart semantics, or geometry.
