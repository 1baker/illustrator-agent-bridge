# FigureLabs-inspired, software-native TikZ workflow

## Evidence boundary

FigureLabs publicly presents a generate, edit, vectorize, and export workflow. Its public pages describe text/PDF-to-figure, sketch/photo-to-figure, reference-to-figure, localized text and region edits, editable SVG/PPTX, a built-in vector canvas, and high-resolution raster export. The public material reviewed on 2026-08-29 did not identify a foundation model, training corpus, model weights, or a complete internal architecture.

This implementation therefore copies no proprietary model or visual assets. It reproduces the useful workflow boundary with an independent, inspectable software contract:

1. A human or upstream model prepares a reviewed figure brief.
2. The brief records whether its evidence came from text, sketch notes, or reference notes.
3. Components and relationships use stable semantic identifiers.
4. Local refinements rename or emphasize one component, relabel one relationship, or revise layout without regenerating unrelated content.
5. Deterministic software validates and compiles the result into one semantic vector scene.
6. The same scene produces editable TikZ and SVG plus a derived PNG and digest manifest.

The model boundary is intentionally provider-neutral. An LLM or vision model may suggest a brief, but it never owns geometry or silently writes the final figure. Unsupported fields, unknown refinement targets, invalid entity types, missing relationship targets, collisions, and impossible layouts fail closed.

## Request shape

Use unified scientific-image generation with `kind: "brief"`. The content contains:

- `source`: `text`, `sketch_notes`, or `reference_notes`, with a description and optional reviewed notes.
- `brief`: title, audience, intent, canvas, direction, and spacing.
- `components`: typed scientific entities with stable IDs.
- `relationships`: typed scientific interactions with stable IDs.
- `refinements`: bounded operations keyed to those IDs.

Supported refinements are `rename_component`, `set_emphasis`, `rename_relationship`, and `set_layout`. The intermediate JSON preserves the applied-refinement audit and the exact typed story and figure plan used for compilation.

Run `npm run scientific:brief` to generate the RAFT-PISA example as TikZ, compiled PDF, SVG, PNG, semantic scene JSON, intermediate plan, and digest manifest. Adobe software is not launched or required.
