# Reusable scientific symbol recipes

The recipe layer acts like a small compiler.

```text
declarative scientific specification
  -> validated symbol requests
  -> port dependency resolution and collision checks
  -> reusable geometry recipes
  -> semantic objects and relationships
  -> validated scene graph
  -> primary SVG output
  -> optional editor adapters
```

Instead of manually specifying every ellipse and line, a caller requests a scientific symbol with a stable ID, kind, placement, size, and label.

## Symbol specification

The initial vocabulary contains three kinds:

- `cell`
- `membrane_receptor`
- `ligand`

A cell request expands into cytoplasm, membrane, nucleus, and label elements. Each part gets a deterministic ID derived from the object ID, such as `cell-1.membrane`. The generated scientific object lists those parts and records the recipe version.

The receptor recipe creates a transmembrane stem, binding pocket, and label. The ligand recipe creates a molecule body and label.

## Relationship compilation

A relationship specification identifies source object, predicate, and target object. The composer calculates each object's bounding box and places the connecting line from one boundary to the other. It then calculates an oriented arrowhead from the relationship vector.

The resulting arrow line, arrowhead, and label receive stable IDs and are listed in the semantic relationship's `visualElementIds`.

For example:

```text
source: ligand-1
predicate: binds_to
target: receptor-1
```

becomes both a semantic assertion and a visible directed arrow.

## Current layout constraints

The composer rejects specifications when:

- A symbol kind is unsupported
- A symbol is smaller than its recipe's readable minimum
- A symbol or its automatic label would leave the canvas
- A symbol overlaps the title band
- Symbol or relationship IDs are duplicated
- A relationship references an unknown object
- A relationship connects an object to itself
- An anchor references an unknown object or creates a dependency cycle
- Two objects overlap without a direct anchor relationship

Absolute `x` and `y` coordinates place a root object. Dependent objects can instead attach an object-local port to a target object's `left`, `right`, `top`, or `bottom` port. Optional fractions select a point along either side, and `gap` controls separation or intentional overlap. The resolver supports forward references and records its resolved coordinates in semantic properties.

These checks are basic constraint solving. Later versions can add automatic collision avoidance, alignment groups, compartments, relationship routing, and publication-specific spacing rules without changing the rendering primitives.

## Executable example

[`examples/scientific-symbol-composition.json`](../examples/scientific-symbol-composition.json) contains only the document, three symbol requests, and one relationship request.

Compile it into a complete scene graph and SVG:

```bash
npm run build
npm run scientific:compose
```

The outputs are:

- `var/exports/scientific-symbol-composition.scene.json`
- `var/exports/scientific-symbol-composition.svg`

SVG is the primary software-native output. The generated scene JSON can optionally be sent to Illustrator with the existing `jsx:cartoon` adapter.

## Next engineering layer

The next useful addition is automatic layout around the implemented ports: collision avoidance, compartment containment, alignment groups, and relationship routing. Those remain constraint and graph problems, not Adobe automation problems.
