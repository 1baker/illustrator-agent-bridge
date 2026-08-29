# From shapes to a scientific scene graph

Geometry answers where and how something is drawn. Semantics answers what it represents.

A generic renderer sees an ellipse, two paths, and a line. A scientific image generator should be able to see a cell, a receptor, a ligand, and a binding relationship. The system therefore uses two connected graphs.

## Rendering graph

The rendering graph contains visible elements. Every element can have a stable machine-readable `id` in addition to its human-readable `name`.

```text
element id: cell-membrane
type: ellipse
geometry: x, y, width, height
style: transparent fill, blue stroke
```

The ID is the durable reference used by software. The name is presentation text for people and editors.

## Semantic graph

The semantic graph groups rendering elements into scientific objects:

```text
object cell-1
  kind: cell
  parts:
    cell-cytoplasm
    cell-membrane
    cell-nucleus
```

Relationships connect those objects:

```text
ligand-1 --binds_to--> receptor-1
receptor-1 --embedded_in--> cell-1
```

A relationship can reference visual elements such as an arrow and its label. This makes the visible arrow an expression of a machine-readable scientific assertion rather than an unexplained decoration.

## Validation rules

The scene validator rejects:

- Duplicate element, object, or relationship IDs
- Object parts that reference missing elements
- Relationships that reference missing objects
- Relationship arrows that reference missing visual elements
- Invalid semantic property values

This is referential integrity, the same principle used by relational databases and typed application models. It prevents a generator from silently producing a figure whose visible pieces no longer match its scientific description.

## Renderer preservation

The primary SVG renderer stores the complete semantic graph in a `<metadata>` element and annotates individual vector elements with their object and relationship IDs. The optional Illustrator adapter writes element/object identity into each page item's `note` field.

Photoshop remains a raster consumer. When an SVG is opened in Photoshop, its pixels can be composited and adjusted, but object semantics are not the primary editable model. The structured scene JSON and vector SVG remain the source of truth.

## Executable example

[`examples/scientific-object-basics-scene.json`](../examples/scientific-object-basics-scene.json) shows a ligand moving toward a membrane receptor on a cell.

Render it directly to SVG:

```bash
npm run build
npm run render:scientific-object-basics
```

Optionally generate native Illustrator instructions from the same scene:

```bash
node dist/src/cli.js jsx:cartoon examples/scientific-object-basics-scene.json
```

The next architectural layer—reusable scientific symbol recipes—is implemented in [scientific-symbol-recipes.md](scientific-symbol-recipes.md). A `cell` request now generates its parts and constraints automatically while the semantic scene graph retains their identity and relationships.
