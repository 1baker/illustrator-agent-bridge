# Software-native layer compositing

Layer compositing answers a different question from vector drawing. Vector drawing defines objects such as lines, paths, empty shapes, filled shapes, text, and scientific symbols. Compositing defines how complete rendered scenes are stacked to produce final pixels.

The generator now implements both concerns without requiring Photoshop:

`vector scenes -> ordered layers -> visibility + opacity + mask + blend mode -> assembled SVG -> PNG`

The input scenes and assembled SVG remain inspectable vector sources. The PNG is a derived artifact.

## Composition document

A raster composition has one canvas and between one and 64 ordered layers. Every layer has:

- a stable ID and optional human-readable name;
- one validated vector scene with the same canvas dimensions;
- an optional visibility flag;
- opacity from 0 to 100 percent;
- one explicit blend mode; and
- an optional binary vector mask.

Layers are painted in array order. Later layers appear above earlier layers. Invisible layers remain in the composition contract but are omitted from the rendered assembly.

## Opacity, masks, and blend modes

Opacity changes the contribution of a whole layer. At 100 percent, the layer contributes its full rendered color. At 50 percent, its pixels are mixed equally with the result underneath.

A mask determines where the layer is allowed to contribute. The first implementation supports rectangle, ellipse, polygon, and closed-path masks. These are binary vector masks: content inside the mask is visible and content outside is excluded. Grayscale masks and feathered edges are future extensions.

Supported blend modes are `normal`, `multiply`, `screen`, `overlay`, `darken`, and `lighten`. Normal painting places the source over the destination. The other modes combine source and destination color channels mathematically. Tests verify actual output pixels for opacity, masking, and multiply blending.

## Collision-safe assembly

Each vector scene is inserted inline into the assembled SVG so text and system fonts render correctly. Element IDs, clip IDs, and accessibility references are prefixed with the layer ID before assembly. This prevents two independently authored scenes from accidentally referring to each other's SVG definitions.

The compositor rejects duplicate or malformed layer IDs, mismatched canvas dimensions, invalid opacity, unsupported blend modes, invalid masks, empty layer lists, oversized layer lists, and anything rejected by the underlying vector-scene validator.

## Interfaces

CLI:

`npm run render:compositing-basics`

`node dist/src/cli.js render:composite examples/raster-composition-basics.json --output var/exports/raster-composition-basics.png --svg-output var/exports/raster-composition-basics.svg`

HTTP:

`POST /v1/render/composite` accepts a `composition` plus the same optional sizing and background fields as the single-scene PNG renderer. It returns binary PNG data and layer counts in response headers.

MCP:

`compose_vector_scene_layers_png` returns render metadata and an inline PNG image.

## Scientific example

`examples/raster-composition-basics.json` contains four ordered layers: background and title, cell structure, a semi-transparent multiply-blended measurement overlay constrained by an elliptical mask, and annotations. The example demonstrates that compositing can add analytic overlays to a scientific figure while the cell, nucleus, overlay, and labels remain independently authored vector scenes.

This does not reproduce all of Photoshop. Photoshop also provides pixel painting, grayscale and channel masks, adjustment layers, filters, selections, color-management workflows, and manual retouching. Those are optional editing capabilities, not prerequisites for the scientific generator.
