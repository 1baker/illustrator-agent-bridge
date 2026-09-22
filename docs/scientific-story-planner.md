# Scientific story planner

The scientific story planner is the content-to-figure boundary of the software-native generator. It accepts scientific entities and interactions, then produces a coordinate-free figure specification for the existing compiler. The story author does not choose vector primitives, symbol recipes, object dimensions, style tokens, positions, connector ports, or route geometry.

## Input contract

A story contains:

- document title, optional subtitle, and optional canvas dimensions;
- one to twenty-four entities;
- zero to sixty directed interactions; and
- optional reading direction and spacing density.

Each entity supplies a stable ID, display label, and one visual type: `molecule`, `receptor`, `protein`, `process`, `cell`, `nucleus`, `dna`, `rna`, `membrane`, `organelle`, `particle`, `apparatus`, or `generic`. An optional semantic `kind` preserves a more specific scientific identity such as `protein_kinase` without changing the visual contract.

Each interaction supplies a stable ID, source, target, and one relationship type: `activates`, `inhibits`, `binds_to`, `transports_to`, `converts_to`, or `associates_with`.

## Deterministic inference

`src/scientific/storyPlanner.ts` maps entity types to reusable symbol recipes and publication-sized default boxes. It enlarges boxes for longer internal labels, infers primary, secondary, or compartment styling, and maps each interaction to the connector grammar: activation arrow, inhibition bar, neutral association line, teal transport arrow, or violet conversion arrow. Precise predicates remain in semantic metadata even when they share a visual role.

The output always requests layered layout. The downstream compiler assigns coordinates, condenses feedback cycles, places labels, chooses ports, routes relationships, attaches scientific identity, validates the scene, and renders editable SVG.

This separation is intentional:

1. The story states what the scientific explanation contains.
2. The planner chooses a stable visual grammar.
3. The compiler resolves geometry and composition.
4. The SVG renderer serializes the validated scene.
5. Illustrator, if desired, opens the result as an optional editor.

## Fail-closed behavior

The planner rejects duplicate or unsafe IDs, unknown entity or interaction types, dangling relationships, self-links, invalid canvas dimensions, and excessive graph sizes. The compiler then independently validates the planned figure. Invalid content cannot silently disappear or degrade into an unlabeled generic drawing.

## Example

`examples/scientific-story.json` declares six entities and six interactions, including inhibition and a two-protein feedback loop. It contains no recipes, dimensions, coordinates, ports, or route points.

Run `npm run scientific:story`. The command writes three inspectable stages:

- `var/exports/scientific-story.figure.json`: inferred coordinate-free compiler input;
- `var/exports/scientific-story.scene.json`: resolved semantic vector scene; and
- `var/exports/scientific-story.svg`: editable final vector figure.

Agents can call the same pipeline through the MCP tool `generate_scientific_story` or `POST /v1/scientific/story`. Both return the inferred figure, resolved scene, and SVG in one response and do not create or launch an Adobe job.

Authors who prefer line-oriented text can use the controlled parser documented in [scientific-controlled-text.md](scientific-controlled-text.md). That parser produces this exact story contract before any visual inference occurs.
