# Automatic labels and scientific style roles

Labels and appearance are core software services. They are resolved and validated before SVG, Illustrator, or any other renderer receives the scene.

## Label placement

`src/core/labelPlacement.ts` accepts a target box, label text, a font size, and an ordered list of candidate positions. For each candidate it:

1. estimates the label box with a deterministic text metric;
2. keeps the box inside the requested canvas bounds;
3. rejects overlap with scientific objects and reserved regions;
4. rejects overlap with labels already placed in the same pass; and
5. emits the selected box, text baseline, score, and optional leader line.

Candidate order is the primary preference. Distance and displacement provide deterministic tie-breaking. If no candidate is legal, placement fails with a diagnostic instead of silently covering figure content.

The built-in text metric is deliberately renderer-independent. A future typography adapter can replace it with exact font shaping while preserving the same placement contract and tests.

## Scientific visual roles

`src/core/scientificTheme.ts` maps semantic roles to visual tokens. Roles include background, title, body text, annotation text, label background and border, primary and secondary objects, compartments, activation, and inhibition.

Tokens own color, stroke width, opacity, font family, and font size. Theme validation requires every role, checks numeric ranges and color syntax, and enforces minimum contrast for text and scientific state colors. Recipes request roles; they do not hard-code renderer-specific styling.

## Run the lesson

Run `npm run geometry:label-style-basics`. It writes a validated scene JSON file and editable SVG under `var/exports/`. The left example proves that a blocked preferred position falls back to the next legal position. The right example applies coordinated labels and theme roles to a small scientific composition.

Illustrator is not involved. It can later import the SVG or consume the same scene through an adapter, but it does not decide label geometry or scientific appearance.
