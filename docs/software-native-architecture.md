# Software-native scientific image architecture

The scientific image generator is a software system. It does not require Illustrator or Photoshop to decide what a figure means, how its objects relate, or where its vector geometry belongs.

## Ownership boundaries

```text
scientific specification
  -> controlled-text parser or typed story contract
  -> semantic scene graph
  -> symbol recipes and constraint-based layout
  -> renderer-independent vector scene
  -> editable SVG renderer
  -> editable TikZ renderer (scene figures)
  -> editable PGFPlots renderer (numerical plots)
  -> optional software-native PNG renderer
  -> optional ordered-layer compositor

optional adapters
  -> Illustrator: edit/import/export native vector artwork
  -> Photoshop: rasterize, composite, or retouch pixels
```

The structured scene and its validation rules are the source of truth. SVG is the first execution format because it is open, deterministic, browser-viewable, and testable without desktop automation.

Illustrator is one possible consumer of that scene. Its JSX adapter translates generic vector elements into Illustrator page items and preserves semantic IDs as metadata. That adapter must not own the scientific model.

Photoshop is a still later consumer. It can rasterize or composite a vector result, but pixel editing cannot replace the structured semantic and vector sources.

## Current modules

- `src/core/vectorScene.ts` defines generic vector and scientific-semantic types.
- Vector appearance includes caps, joins, miter limits, dash patterns, and compound paths with explicit fill rules; see [stroke-and-compound-fill.md](stroke-and-compound-fill.md).
- Named linear and radial paints separate reusable appearance from geometry and support fill or stroke references; see [vector-paints.md](vector-paints.md).
- `src/core/sceneValidation.ts` validates renderer-independent geometry and semantic references.
- `src/core/scientificPlot.ts` compiles bounded numerical series into deterministic scales, axes, marks, uncertainty geometry, legends, and semantic vector objects.
- `src/core/polygonBoolean.ts` performs bounded union, intersection, difference, and XOR and converts normalized polygon topology into compound paths.
- `src/core/affineTransform.ts` composes matrices and flattens reusable local geometry into world coordinates.
- Core scene groups encode hierarchy, z-order, visibility, opacity, and closed clipping geometry.
- `src/core/layoutConstraints.ts` resolves alignment, exact gaps, and box containment before rendering.
- `src/core/layeredGraphLayout.ts` assigns coordinates to semantic graphs using cycle-aware component condensation and deterministic ranks.
- `src/core/orthogonalRouter.ts` converts semantic relationships into obstacle-aware paths with bend and crossing costs.
- `src/core/labelPlacement.ts` selects bounded, collision-free label boxes and leader lines with deterministic scoring.
- `src/core/scientificTheme.ts` validates role-based scientific style tokens and minimum contrast.
- `src/scientific/diagramComposer.ts` expands scientific symbols, resolves port-based placement dependencies, checks collisions, and emits a vector scene.
- `src/scientific/figureCompiler.ts` compiles one declarative figure specification through layout, recipes, routing, labels, styles, semantics, and final scene validation.
- `src/scientific/textStoryParser.ts` converts a small fail-closed text grammar into the typed scientific story contract with a line-level audit trace.
- `src/scientific/figureBrief.ts` applies bounded stable-ID refinements to reviewed text, sketch-note, or reference-note inputs before typed story planning.
- `src/scientific/imageGenerator.ts` routes reviewed-brief, figure, story, controlled-text, and plot content through one request envelope and emits a common scene/SVG/LaTeX/PNG artifact family with stage provenance and digests.
- `src/scientific/symbolRegistry.ts` maps semantic kinds to reusable, multi-element scientific vector recipes with a generic fallback.
- `src/render/svgRenderer.ts` executes that scene as SVG.
- `src/render/tikzRenderer.ts` maps flat-color scene paths, shapes, text, groups, opacity, z-order, and clipping into standalone TikZ while escaping untrusted labels.
- `src/render/pgfplotsRenderer.ts` maps the validated numerical specification directly into standalone PGFPlots with explicit compatibility, axes, ticks, marks, legends, and uncertainty.
- `src/render/pngRenderer.ts` derives a bounded PNG from the validated scene and SVG without launching Adobe software.
- `src/render/rasterCompositor.ts` stacks validated scenes with visibility, opacity, binary vector masks, and blend modes before software-native PNG rendering.
- `src/bridge/jsxGenerator.ts` is an optional Illustrator adapter.

The existing repository name reflects its starting point, not the ownership boundary of the generator core.

## Layout model

A root symbol may use absolute `x` and `y` coordinates. A dependent symbol can instead anchor one of its local ports to a port on another scientific object. Ports are `left`, `right`, `top`, and `bottom`; an optional fraction selects a point along a side, and `gap` controls separation or intentional attachment.

The resolver supports forward references, walks the dependency graph, and rejects cycles or missing targets. A separate collision pass rejects overlaps unless the two objects have a direct anchor relationship.

This makes placement a graph problem rather than a series of hard-coded drawing coordinates.

The next lower-level mechanism is documented in [coordinate-transforms.md](coordinate-transforms.md): a symbol can be defined once around a local origin and instantiated through translation, rotation, and scaling before any renderer sees it.

The next composition mechanism is documented in [composition-basics.md](composition-basics.md): groups express ownership, z-order expresses paint order, and clips constrain visible contents without changing their underlying geometry or scientific semantics.

[constraint-layout.md](constraint-layout.md) adds the first automatic layout engine. It converts declarative spatial relationships into resolved boxes and rejects cycles, underconstraint, overconstraint, and containment violations.

[automatic-graph-layout.md](automatic-graph-layout.md) adds coordinate-free authoring for directed scientific networks. Feedback loops become strongly connected layout components, and the condensed graph receives deterministic layers.

[relationship-routing.md](relationship-routing.md) adds port-based path planning over a rectilinear visibility graph. Relationship geometry is calculated in the core and attached back to semantic relationship IDs before rendering.

[label-placement-and-styles.md](label-placement-and-styles.md) adds automatic annotation placement and semantic visual roles. Label geometry and appearance are resolved before rendering, so SVG and optional Adobe adapters receive the same checked result.

[scientific-figure-compiler.md](scientific-figure-compiler.md) joins those independent services into the first end-to-end generator. The declarative specification and compiled semantic scene are authoritative; SVG is the primary execution format.

[scientific-symbol-registry.md](scientific-symbol-registry.md) makes scientific appearance extensible without coupling layout or semantics to a renderer. Known kinds expand into named vector parts; unknown kinds retain a validated generic fallback.

[scientific-controlled-text.md](scientific-controlled-text.md) adds a deterministic plain-text boundary. It accepts only explicit typed entities and six relationship phrases, then delegates to the same validated story and compiler stages. Unrestricted language-model interpretation remains an optional proposal layer, not a geometry or scientific-truth dependency.

[scientific-plots.md](scientific-plots.md) adds the numerical visualization boundary. It turns explicit quantitative series into auditable linear scales and semantic vector marks, with SVG and PNG execution entirely outside Adobe applications.

[scientific-image-generator.md](scientific-image-generator.md) joins the public authoring paths behind one common software contract. The manifest proves which compiler stages ran, which artifact bytes were emitted, and that no Adobe adapter participated.

[latex-vector-rendering.md](latex-vector-rendering.md) defines the TikZ/PGFPlots execution path. TikZ is a renderer for semantic scene geometry; PGFPlots is a renderer for validated quantitative data. Neither renderer changes the scientific source of truth.

[software-native-rasterization.md](software-native-rasterization.md) adds local PNG export. It defines the boundary between deterministic rasterization and the broader layer, mask, filter, and retouching features of an optional Photoshop workflow.

[software-native-compositing.md](software-native-compositing.md) adds ordered scene layers, whole-layer opacity, binary vector masks, and six explicit blend modes. It preserves an inspectable SVG assembly before PNG derivation and keeps advanced pixel editing outside the generator core.

[polygon-boolean-construction.md](polygon-boolean-construction.md) replaces Pathfinder-style region construction with a software-native service. It returns canonical compound paths from straight or explicitly flattened curved boundaries.

[bezier-curve-flattening.md](bezier-curve-flattening.md) defines cubic path data, bounded De Casteljau subdivision, the flatness guarantee, provenance metadata, and the curve-to-boolean compiler boundary.

[stroke-expansion.md](stroke-expansion.md) compiles centerline appearance into filled topology. Width, caps, joins, miter fallback, and dash intervals become canonical polygon geometry rather than renderer-only state.

[path-markers.md](path-markers.md) derives line, cubic endpoint, and vertex-bisector tangents and constructs arrowheads, inhibition bars, circles, and diamonds as validated scene elements. The scientific figure compiler consumes this service directly.

[vector-paints.md](vector-paints.md) adds reusable linear and radial paint definitions, strict stop/reference validation, and matching SVG/PNG execution while keeping Adobe applications optional.
