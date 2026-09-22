# Composition basics: groups, drawing order, and clipping

Individual shapes are not yet a figure. A figure needs rules for which objects belong together, which appear in front, and which are constrained inside a boundary.

## Groups encode ownership

A group is a node in the scene graph. Elements reference a group by stable ID, and groups can reference a parent group. This produces a hierarchy such as:

```text
cell-interior
  cell-fluid
    cytoplasm
  organelles
    nucleus
  particles
    particle-1
    particle-2
```

The validator rejects missing parent IDs and cycles. A group cannot eventually contain itself.

## Z-order encodes paint order

The renderer sorts sibling elements and groups by integer `zIndex`:

- Lower values are painted first and appear behind.
- Higher values are painted later and appear in front.
- Equal values preserve deterministic source order.

Explicit order matters because scientific meaning often depends on occlusion. A membrane outline should normally be painted after its contents; an annotation should remain above the object it explains.

## Clipping encodes a visible boundary

A group can declare a closed rectangular, elliptical, polygonal, or path-shaped clip. Descendants still retain their complete geometry, but the renderer only displays the portion inside the clip.

An open path cannot clip because it has no interior. The validator rejects it for the same topological reason that an open path cannot have a meaningful fill.

Clipping is a display constraint, not automatically a scientific claim. The semantic graph separately records relationships such as `nucleus contained_in cell`. Keeping those concepts distinct prevents a visual accident from silently becoming scientific meaning.

## Visibility and opacity

Groups and elements can be hidden without deleting their definitions. Groups can also apply opacity to all descendants. These are presentation properties; they do not remove objects from the semantic model.

## Executable lesson

Run:

```bash
npm run build
npm run geometry:composition-basics
```

The resulting SVG contains two demonstrations:

1. Three overlapping shapes ordered explicitly from back to front.
2. A cell whose cytoplasm, nucleus, and particles are nested inside a clipped interior group, with the membrane painted above them.

The source scene is written alongside the SVG so the rendered hierarchy can be compared with its structured representation.

## Renderer boundary

SVG is currently the reference renderer for this composition contract. The optional Illustrator adapter fails visibly when handed groups, clipping, explicit z-order, or visibility instead of silently discarding them. A future adapter may implement the same semantics with native Illustrator groups and clipping masks.
