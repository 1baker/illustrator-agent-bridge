# Scientific symbol recipe registry

A scientific generator should not treat every object as a generic rectangle. The symbol registry maps semantic object kinds to reusable, renderer-independent vector recipes.

## Contract

`src/scientific/symbolRegistry.ts` receives:

- a stable object ID and semantic kind;
- a layout box already solved by the compiler;
- a visual role and optional generic shape;
- an optional explicit recipe selection; and
- a validated scientific theme.

It returns a recipe ID, the main vector element ID, and a list of named vector elements. Every element stays inside the object's routing and layout box. The compiler associates all returned element IDs with the same scientific object.

This separates responsibilities cleanly:

- layout decides where an object belongs and how much space it owns;
- the registry decides which vector parts represent that kind of object;
- themes decide appearance;
- routing uses the stable outer box and does not depend on recipe internals; and
- SVG or another renderer serializes the finished elements.

## Recipe vocabulary

- `generic`: one rectangle or ellipse for unknown kinds;
- `cell`: cytoplasm plus a distinct membrane boundary;
- `nucleus`: a compartment ellipse plus curved chromatin paths;
- `receptor`: membrane segment, stem, and binding-pocket path;
- `molecule`: three atoms connected by two bonds;
- `protein`: a closed curved protein body; and
- `process`: a six-sided process glyph;
- `dna`: two open curved strands connected by base-pair lines;
- `rna`: one open curved strand with filled nucleotide markers;
- `membrane`: a filled bilayer band with explicit lipid heads and tails;
- `organelle`: a filled outer boundary, empty inner membrane, and curved internal folds;
- `particle`: filled outer and core regions plus surface sites; and
- `apparatus`: a closed flask outline, independently filled liquid region, and rim.

Recipe inference tokenizes semantic kinds instead of searching arbitrary substrings. For example, `gene_expression_process` resolves to `process`; it cannot accidentally match the letters `ion` inside `expression`. A specification can set `recipe` explicitly when scientific intent is more specific than the kind name.

## Why this is software-native

The recipes are data-producing functions. They do not call Illustrator, Photoshop, a browser, or a drawing API. Their outputs pass through the same scene validator and can be rendered by any adapter.

Adding a scientific symbol means adding a bounded recipe and tests, not teaching an automation agent where to click in a desktop application.

`examples/scientific-symbol-vocabulary.json` combines all six expanded recipes in one coordinate-free story. Run `npm run scientific:symbol-vocabulary` to inspect the inferred figure, resolved scene, and SVG under `var/exports/`.
