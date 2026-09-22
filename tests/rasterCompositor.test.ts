import assert from "node:assert/strict";
import test from "node:test";
import { decodePng } from "../src/qa/pngPixels.js";
import { composeRasterLayersToPng, normalizeRasterComposition, renderRasterCompositionToSvg } from "../src/render/rasterCompositor.js";

function solidScene(color: string) {
  return {
    document: { width: 100, height: 80 },
    elements: [{ id: `solid-${color.slice(1)}`, type: "rect", x: 0, y: 0, width: 100, height: 80, style: { fill: color, stroke: null } }]
  };
}

test("stacks scenes as ordered layers with opacity and a binary vector mask", () => {
  const result = composeRasterLayersToPng({
    document: { width: 100, height: 80, title: "Layer test" },
    layers: [
      { id: "base", scene: solidScene("#FFFFFF") },
      { id: "masked-blue", scene: solidScene("#0000FF"), opacity: 50, mask: { type: "rect", x: 0, y: 0, width: 50, height: 80 } }
    ]
  }, { background: "transparent" });
  const decoded = decodePng(result.png);
  const left = (40 * decoded.width + 25) * 4;
  const right = (40 * decoded.width + 75) * 4;
  assert.deepEqual([...decoded.pixels.subarray(left, left + 4)], [128, 128, 255, 255]);
  assert.deepEqual([...decoded.pixels.subarray(right, right + 4)], [255, 255, 255, 255]);
  assert.equal(result.layerCount, 2);
  assert.equal(result.visibleLayerCount, 2);
  assert.match(result.compositionSvg, /clip-path="url\(#layer-mask-masked-blue\)"/);
});

test("applies multiply blend mode through the software renderer", () => {
  const normal = composeRasterLayersToPng({
    document: { width: 100, height: 80 },
    layers: [{ id: "red", scene: solidScene("#FF0000") }, { id: "blue", scene: solidScene("#0000FF") }]
  });
  const multiplied = composeRasterLayersToPng({
    document: { width: 100, height: 80 },
    layers: [{ id: "red", scene: solidScene("#FF0000") }, { id: "blue", scene: solidScene("#0000FF"), blendMode: "multiply" }]
  });
  const normalPixel = decodePng(normal.png).pixels.subarray(4 * (40 * 100 + 50), 4 * (40 * 100 + 50) + 4);
  const multiplyPixel = decodePng(multiplied.png).pixels.subarray(4 * (40 * 100 + 50), 4 * (40 * 100 + 50) + 4);
  assert.deepEqual([...normalPixel], [0, 0, 255, 255]);
  assert.deepEqual([...multiplyPixel], [0, 0, 0, 255]);
});

test("preserves text and namespaces nested scene identifiers", () => {
  const result = composeRasterLayersToPng({
    document: { width: 100, height: 80 },
    layers: [{
      id: "labels",
      scene: {
        document: { width: 100, height: 80, title: "Text layer" },
        elements: [
          { id: "background", type: "rect", x: 0, y: 0, width: 100, height: 80, style: { fill: "#FFFFFF", stroke: null } },
          { id: "label", type: "text", x: 10, y: 10, text: "RNA", size: 30, style: { fill: "#000000", stroke: null } }
        ]
      }
    }]
  });
  assert.match(result.compositionSvg, /id="scene-labels-label"/);
  assert.match(result.compositionSvg, /aria-labelledby="scene-labels-scene-title"/);
  assert.doesNotMatch(result.compositionSvg, /data:image\/svg\+xml/);
  const pixels = decodePng(result.png).pixels;
  let darkPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] < 100 && pixels[index + 1] < 100 && pixels[index + 2] < 100 && pixels[index + 3] > 0) darkPixels += 1;
  }
  assert.ok(darkPixels > 50);
});

test("normalizes visibility and rejects invalid layer contracts", () => {
  const normalized = normalizeRasterComposition({
    document: { width: 100, height: 80 },
    layers: [{ id: "hidden", scene: solidScene("#FF0000"), visible: false }]
  });
  assert.equal(normalized.layers[0].opacity, 100);
  assert.equal(normalized.layers[0].blendMode, "normal");
  assert.doesNotMatch(renderRasterCompositionToSvg(normalized), /data-layer-id="hidden"/);
  assert.throws(() => normalizeRasterComposition({ document: { width: 100, height: 80 }, layers: [] }), /1 to 64/);
  assert.throws(() => normalizeRasterComposition({ document: { width: 100, height: 80 }, layers: [{ id: "bad", scene: solidScene("#FFFFFF"), opacity: 101 }] }), /between 0 and 100/);
  assert.throws(() => normalizeRasterComposition({ document: { width: 100, height: 80 }, layers: [{ id: "bad", scene: { document: { width: 90, height: 80 }, elements: [{ type: "rect", x: 0, y: 0, width: 1, height: 1 }] } }] }), /must match composition/);
  assert.throws(() => normalizeRasterComposition({ document: { width: 100, height: 80 }, layers: [{ id: "bad", scene: solidScene("#FFFFFF"), blendMode: "erase" }] }), /blendMode/);
});

test("produces byte-stable output for the same composition on one host", () => {
  const composition = {
    document: { width: 100, height: 80 },
    layers: [
      { id: "base", scene: solidScene("#FFFFFF") },
      { id: "overlay", scene: solidScene("#0F766E"), opacity: 35, blendMode: "multiply" as const }
    ]
  };
  assert.deepEqual(composeRasterLayersToPng(composition).png, composeRasterLayersToPng(composition).png);
});
