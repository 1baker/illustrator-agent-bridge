# Unified scientific image generator

The unified generator is the main software entrypoint for scientific graphics. A caller selects an input kind and supplies content; the generator validates that content, compiles one semantic vector scene, and derives editable SVG, editable LaTeX, and PNG without launching Illustrator or Photoshop. Reviewed-brief, figure, story, and controlled-text requests use TikZ. Numerical plots use PGFPlots so the data, axes, ticks, legends, marks, and error bars remain plot semantics rather than flattened geometry.

## Request envelope

Every request has the same outer shape:

```json
{
  "schemaVersion": 1,
  "kind": "brief | figure | story | text | plot",
  "content": {},
  "output": {
    "png": {
      "width": 1200,
      "background": "#FFFFFF"
    }
  }
}
```

`content` is validated by the selected compiler:

- `figure` accepts a declarative object, relationship, layout, and style specification.
- `story` accepts typed scientific entities and interactions and infers figure recipes and layout.
- `text` accepts the bounded controlled-text grammar and records a statement-level parse trace.
- `brief` accepts provider-neutral source notes, typed components and relationships, and stable-ID refinements; it records the applied-refinement audit plus the exact story and figure plan.
- `plot` accepts numerical line, scatter, and bar series with quantitative axes and optional uncertainty.

The envelope and PNG option objects reject unsupported fields. PNG resize options are mutually exclusive. The selected compiler retains all of its existing bounds, ambiguity checks, collision checks, clipping checks, and semantic-reference validation.

## Common result

All input kinds produce the same artifact family:

1. An intermediate planning record appropriate to the selected kind.
2. A validated semantic vector scene. It is the source of truth for figures, stories, and controlled text; the validated numerical plot specification is the source of truth for plots.
3. An editable SVG derived from that scene.
4. A standalone editable `.tex` document: TikZ for scene graphics or PGFPlots for numerical plots.
5. A PNG derived from the same scene.
6. A manifest containing the compiler stages, object/relationship/element counts, exact artifact byte counts, SHA-256 digests, raster dimensions, LaTeX renderer identity, and `adobeUsed: false`.

This is the key software boundary: meaning, layout, geometry, fill/stroke state, and export derivation are owned by tested code. Illustrator may optionally edit the SVG later. Photoshop may optionally retouch the PNG later. Neither application participates in generation.

## Interfaces

- TypeScript: `generateScientificImage(request)` in `src/scientific/imageGenerator.ts`.
- CLI: `npm run scientific:image` or `node dist/src/cli.js scientific:image REQUEST.json`.
- HTTP: `POST /v1/scientific/image`.
- MCP: `generate_scientific_image`.

The CLI writes `.manifest.json`, `.intermediate.json`, `.scene.json`, `.svg`, `.tex`, and `.png` files. HTTP returns the manifest, intermediate record, scene, SVG, LaTeX, and base64 PNG. MCP returns the structured text result, including LaTeX, plus a native PNG image content block.

The standalone renderers are also available directly:

- TypeScript: `renderSceneToTikz(scene)` and `renderScientificPlotToPgfplots(plot)`.
- CLI: `render:tikz` and `scientific:pgfplots`.
- HTTP: `POST /v1/render/tikz` and `POST /v1/scientific/pgfplots`.
- MCP: `render_vector_scene_tikz` and `generate_scientific_pgfplots`.

See [latex-vector-rendering.md](latex-vector-rendering.md) for the renderer mapping, supported syntax, safety boundary, and compilation verification.

## Examples

- `examples/scientific-image-story.json` demonstrates meaning-to-diagram compilation for receptor signaling.
- `examples/scientific-image-plot.json` demonstrates the same outer API for bars, a model line, measured points, and standard-deviation error bars.

The specialized story, text, figure, and plot APIs remain available for consumers that need their narrower response contracts. New general-purpose callers should prefer the unified generator.
