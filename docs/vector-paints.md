# Software-native vector paints

Geometry and paint are separate parts of the scientific scene model. A closed path creates an interior. Its style then chooses whether that interior is transparent, a flat color, or a reference to a reusable paint definition.

This distinction matters because changing appearance must not change scientific geometry or identity.

## Paint model

`VectorScene.paints` contains named linear or radial gradients. Elements reference those definitions through `style.fillPaint` or `style.strokePaint`.

Each gradient defines:

- a stable paint ID;
- object-bounding-box or user-space coordinates;
- pad, reflect, or repeat spreading;
- two to thirty-two strictly ordered color stops;
- optional stop opacity;
- an optional six-number affine transform.

Stops must begin at 0 percent and end at 100 percent. Colors remain explicit `#RRGGBB` values. A style cannot specify both `fill` and `fillPaint`, or both `stroke` and `strokePaint`. Every reference must resolve to a scene paint, and paint IDs cannot collide with element IDs.

These rules prevent silent defaults, dangling references, ambiguous appearance, and renderer-specific state.

## Scientific use

A linear gradient can encode a declared quantitative direction such as low-to-high concentration, but the semantic object must record that mapping. A radial gradient can suggest the depth of a particle or sphere without claiming to represent a measurement. The distinction between quantitative encoding and illustrative appearance stays explicit in semantic metadata.

The same paint ID can be reused by a figure region and its legend. This makes the visual mapping structurally consistent rather than relying on manually matched colors.

## Renderer boundary

The SVG renderer writes standard `linearGradient` and `radialGradient` definitions and stable `url(#paint-id)` references. The software PNG renderer rasterizes that SVG directly. The raster compositor namespaces paint IDs when scenes are layered, so references remain isolated.

The legacy JSX adapter currently fails visibly when a scene contains reusable paints. It never replaces a gradient with a flat color. Illustrator can still open the authoritative SVG if native Adobe editing is desired. Photoshop may consume the derived PNG for optional pixel work, but neither application owns the paint definition.

## Executable lesson

```bash
npm run render:paint-basics
```

The command writes validated scene JSON, editable SVG, and derived PNG under `var/exports/`. The lesson compares empty and flat-filled regions, a reusable quantitative linear ramp, radial particle depth, and a gradient-painted path boundary.

`examples/vector-paint-scene.json` is a smaller hand-authored scene showing the authoritative JSON contract and an explicit low-to-high scientific mapping.
