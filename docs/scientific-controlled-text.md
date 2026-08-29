# Controlled scientific text

Controlled scientific text is the first plain-language authoring layer for the software-native image generator. It is deliberately narrower than unrestricted natural language: every accepted sentence has one deterministic interpretation, and unsupported language fails with a line-specific error.

## Why a controlled grammar

An unconstrained language model can be useful later as a proposal generator, but it must not silently become the source of scientific truth. This parser performs no model call and invents no entities or relationships. It converts a small audited grammar into the existing `ScientificStorySpec`; the story planner and figure compiler then perform the same validation, layout, routing, and rendering used for hand-authored JSON.

The stages are:

1. controlled text;
2. parsed statements and typed scientific story;
3. coordinate-free figure specification;
4. resolved semantic vector scene;
5. editable SVG;
6. derived PNG.

Each intermediate artifact can be inspected independently.

## Grammar

Directives occupy one line each:

- `Title: ...`
- `Subtitle: ...`
- `Canvas: WIDTHxHEIGHT`
- `Direction: left-to-right` or `top-to-bottom`
- `Spacing: compact`, `normal`, or `open`

An isolated entity uses `Entity: Label [type].`

A relationship uses `Source [type] interaction Target [type].` The first occurrence of every entity must carry its type. Later references may omit the annotation. Labels can be wrapped in double quotes when leading or trailing punctuation would otherwise be unclear.

Supported entity types are `molecule`, `receptor`, `protein`, `process`, `cell`, `nucleus`, `dna`, `rna`, `membrane`, `organelle`, `particle`, `apparatus`, and `generic`.

Supported interactions are `activates`, `inhibits`, `binds to`, `transports to`, `converts to`, and `associates with`.

## Example

`examples/scientific-controlled-text.txt` describes DNA-to-RNA conversion and particle delivery. Run `npm run scientific:text` to produce:

- `scientific-controlled-text.parse.json`, including line-level parse trace and the typed story;
- `scientific-controlled-text.figure.json`, the inferred coordinate-free compiler input;
- `scientific-controlled-text.scene.json`, resolved geometry plus scientific semantics; and
- `scientific-controlled-text.svg`, the editable rendered figure; and
- `scientific-controlled-text.png`, the software-rasterized delivery image.

The same vector pipeline is available through `POST /v1/scientific/text` and MCP tool `generate_scientific_figure_from_text`. Direct binary PNG rendering is available through `POST /v1/render/png` and MCP tool `render_vector_scene_png`. None of these paths launches Illustrator or Photoshop.

## Failure rules

The parser rejects unknown first-use references, missing or unsupported type annotations, conflicting redeclarations, duplicate relationships, duplicate directives, unsupported verbs, self-links, malformed canvas values, excessive input, and anything rejected by the downstream story contract. The original line number is included whenever the error comes from a statement.

An optional future language-model adapter should emit this controlled format or the typed story contract, preserve its proposed-versus-validated status, and pass through these deterministic gates before geometry is generated.
