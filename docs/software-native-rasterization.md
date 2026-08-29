# Software-native rasterization

The generator now exports PNG directly from its validated vector scene. Neither Photoshop nor Illustrator is required. The scene JSON and SVG remain authoritative; PNG is a derived, pixel-based delivery format.

## Software ownership

Illustrator is a mature vector editor. Its relevant concepts are paths, anchor points, strokes, fills, transforms, groups, clipping paths, text, and vector export. Those concepts belong in the generator's renderer-independent scene model, not in Illustrator automation. Illustrator remains useful when a person wants to make a final manual vector edit or produce an Adobe-native deliverable.

Photoshop is a mature raster editor. Its relevant concepts include pixel grids, alpha transparency, layers and masks, compositing and blend modes, filters, color correction, and retouching. The current renderer replaces only the deterministic rasterization step: it converts the validated SVG representation into a PNG. It does not yet attempt to reproduce Photoshop's layer-based editing, filters, or retouching tools.

## Rendering contract

`src/render/pngRenderer.ts` performs the following steps:

1. validates a vector scene and renders it through the primary SVG renderer;
2. rejects active or externally loaded SVG content;
3. rasterizes locally with the pinned `@resvg/resvg-js` renderer;
4. returns the PNG bytes plus source dimensions, output dimensions, fit mode, background, font policy, and renderer version.

The default output uses the scene's native dimensions and an opaque white background. A caller may request exactly one of `width`, `height`, or `scale`, and may select a hexadecimal background color or `transparent`. Dimension and scale limits prevent accidental oversized allocations.

The renderer uses installed system fonts. Identical input is byte-stable on the verified host, but strict cross-machine byte identity requires a future bundled font set. The vector scene and SVG are the portable sources of truth.

## Interfaces

CLI:

`node dist/src/cli.js render:png examples/geometry-basics-scene.json --output var/exports/geometry-basics.png`

The convenience command is `npm run render:raster-basics`. Options include `--width`, `--height`, `--scale`, and `--background`.

HTTP:

`POST /v1/render/png` accepts `{ "scene": ..., "width": ..., "background": ... }` and returns binary `image/png` data with render metadata in response headers.

MCP:

`render_vector_scene_png` accepts a validated scene and optional sizing/background parameters, then returns render metadata and an inline PNG image.

The `scientific:text` command also writes `scientific-controlled-text.png` alongside the parse trace, figure specification, resolved scene, and editable SVG. This proves the complete software-only path from controlled language to both vector and raster output.

For multi-layer assembly, see [software-native-compositing.md](software-native-compositing.md). That layer stacks complete vector scenes with opacity, masks, and blend modes before calling this renderer.

## Verification examples

`examples/geometry-basics-scene.json` exercises the smallest useful progression: a line segment, an open connected path, a closed empty triangle, and the same closed topology with a fill. `examples/scientific-controlled-text.txt` exercises a larger scientific figure with DNA, RNA, a membrane, a particle, an apparatus, an organelle, labeled interactions, and automatic layout.
