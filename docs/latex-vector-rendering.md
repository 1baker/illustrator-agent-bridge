# TikZ and PGFPlots rendering

LaTeX is a software execution target for the scientific graphics system. The semantic scene is the source of truth; TikZ and SVG are independent renderings of it. Illustrator is not required to create, compile, inspect, or publish these figures.

## Renderer boundary

Two renderers preserve two different kinds of source material:

- `renderSceneToTikz(scene)` converts a validated vector scene into standalone TikZ. It preserves flat-color rectangles, ellipses, lines, polygons, open or closed paths, cubic Bézier handles, compound paths, z-order, groups, group opacity, clipping, text, and semantic comments.
- `renderScientificPlotToPgfplots(plot)` validates the original numerical plot specification and writes PGFPlots directly. It preserves quantitative coordinates, axis domains, deterministic ticks and labels, line/scatter/bar mark types, legends, and explicit x/y errors.

This separation is important. A scientific diagram is naturally a scene graph. A scientific plot is naturally data plus scales. Rendering a plot by translating its already-flattened SVG geometry back into PGFPlots would discard the higher-level numerical model.

## Syntax learned from the official manuals

The implementation follows the current PGF/TikZ and PGFPlots manuals stored for review under `var/references/latex/`:

- TikZ paths connect coordinates with `--`, close filled topology with `cycle`, and express cubic curves with `.. controls ... and ... ..`.
- A single `\path[...]` command can carry independent `draw`, `fill`, line width, cap, join, dash, and opacity options.
- Text is placed with `\node[...] at (...) {...}`.
- PGFPlots is loaded with `\usepackage{pgfplots}` and a pinned `\pgfplotsset{compat=1.18}`. The manual discourages an unpinned `newest` compatibility setting.
- Numerical series use `\addplot+ ... coordinates {...}`. Scatter uses `only marks`, bars use `ybar`, and uncertainty uses the explicit `+- (xError,yError)` coordinate form with the corresponding error-bar directions enabled.

The reviewed documents are:

- `pgfmanual.pdf`, SHA-256 `32cef61a3161754763a6368ea9ed67d07127dd37b7576db7c2cbefa56faf087c`.
- `pgfplots.pdf`, revision 1.18.3 dated 2026-08-26, SHA-256 `c51b8d5ec61e9777c0fc9d66514b1d39d01d55cc33a1044694373de1c0089f9f`.

## Safety and fidelity

All labels are treated as text and escape TeX control characters, including backslash, braces, percent, hash, ampersand, underscore, dollar, caret, and tilde. Common scientific degree and plus/minus symbols are mapped to explicit TeX forms. Color command names are generated internally from validated `#RRGGBB` values, so user-controlled names do not become commands.

The TikZ renderer currently rejects gradient paint definitions and paint references rather than silently flattening or approximating them. SVG and PNG retain gradient support. This is an explicit fidelity boundary, not a TeX limitation claim; a later renderer revision can add reviewed TikZ shading mappings.

## Compile gate and conformance atlas

Requesting a PDF turns LaTeX compilation into a fail-closed release gate. The CLI invokes the repository-local Tectonic engine, requires a successful exit, verifies the `%PDF-` signature and a nonempty result, and returns the byte count and SHA-256 digest. Invalid TeX surfaces the compiler log and does not produce the requested PDF.

`examples/tikz-conformance-atlas.scene.json` is the executable renderer vocabulary. It covers rectangles, ellipses, polygons, cubic paths, compound paths with even-odd holes, open paths, polylines, cap and join styles, dash phase, independent fill/stroke states, element opacity from 100% through 0%, group opacity, and all supported clipping geometries. The atlas must compile and pass visual inspection whenever the renderer changes.

## Interfaces

- CLI scene: `node dist/src/cli.js render:tikz SCENE.json --output figure.tex --pdf-output figure.pdf`
- CLI plot: `node dist/src/cli.js scientific:pgfplots PLOT.json --output plot.tex --pdf-output plot.pdf`
- Unified CLI: `node dist/src/cli.js scientific:image REQUEST.json --latex-output image.tex --latex-pdf-output image.pdf`
- HTTP: `POST /v1/render/tikz`, `POST /v1/scientific/pgfplots`, or `POST /v1/scientific/image`
- MCP: `render_vector_scene_tikz`, `generate_scientific_pgfplots`, or `generate_scientific_image`

The generated files are standalone documents. They can be compiled with a normal LaTeX installation containing TikZ/PGFPlots or with Tectonic. Repository tests check source contracts, compile valid examples with the local engine, and prove invalid source fails. Release verification compiles both the conformance atlas and the intended figure, then inspects their PDFs.
