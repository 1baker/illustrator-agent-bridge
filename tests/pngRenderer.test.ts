import test from "node:test";
import assert from "node:assert/strict";
import { analyzePngPixels, decodePng } from "../src/qa/pngPixels.js";
import { rasterizeSvgToPng, renderSceneToPng } from "../src/render/pngRenderer.js";

const scene = {
  document: { width: 320, height: 220, background: "#F8FAFC" },
  elements: [
    { id: "line", type: "line", x: 20, y: 30, x2: 300, y2: 30, style: { fill: null, stroke: "#2563EB", strokeWidth: 4 } },
    { id: "empty", type: "polygon", x: 0, y: 0, points: [{ x: 30, y: 70 }, { x: 130, y: 70 }, { x: 80, y: 180 }], style: { fill: null, stroke: "#0F766E", strokeWidth: 4 } },
    { id: "filled", type: "polygon", x: 0, y: 0, points: [{ x: 180, y: 70 }, { x: 290, y: 70 }, { x: 235, y: 180 }], style: { fill: "#BFDBFE", stroke: "#2563EB", strokeWidth: 4 } }
  ]
};

test("rasterizes lines plus empty and filled shapes into a deterministic PNG", () => {
  const first = renderSceneToPng(scene);
  const second = renderSceneToPng(scene);
  assert.equal(first.renderer, "resvg-js-2.6.2");
  assert.equal(first.width, 320);
  assert.equal(first.height, 220);
  assert.deepEqual(first.png, second.png);
  const analysis = analyzePngPixels(first.png);
  assert.equal(analysis.width, 320);
  assert.equal(analysis.height, 220);
  assert.ok(analysis.nonBackgroundRatio > 0.05);
  assert.equal(analysis.touchesCanvasEdge, false);
});

test("supports aspect-preserving resize and transparent pixel canvases", () => {
  const resized = renderSceneToPng(scene, { width: 640, background: "transparent" });
  assert.equal(resized.width, 640);
  assert.equal(resized.height, 440);
  assert.equal(resized.fit, "width");
  assert.equal(resized.background, "transparent");
  const decoded = decodePng(resized.png);
  assert.equal(decoded.pixels[3], 0);
});

test("renders numeric-only scientific labels with the default font policy", () => {
  const rendered = renderSceneToPng({
    document: { width: 160, height: 80, background: "#FFFFFF" },
    elements: [
      { id: "numeric-tick", type: "text", x: 20, y: 20, text: "20", size: 24, style: { fill: "#000000", stroke: null } }
    ]
  });
  const decoded = decodePng(rendered.png);
  let darkPixels = 0;
  for (let index = 0; index < decoded.pixels.length; index += 4) {
    if (decoded.pixels[index] < 80 && decoded.pixels[index + 1] < 80 && decoded.pixels[index + 2] < 80 && decoded.pixels[index + 3] > 0) {
      darkPixels += 1;
    }
  }
  assert.ok(darkPixels > 25, `expected numeric glyph pixels, found ${darkPixels}`);
});

test("fails closed on unsafe SVG and conflicting raster options", () => {
  assert.throws(() => renderSceneToPng(scene, { width: 500, scale: 2 }), /only one of width, height, or scale/);
  assert.throws(() => renderSceneToPng(scene, { background: "white" }), /background must be/);
  assert.throws(() => rasterizeSvgToPng('<svg width="10" height="10"><script>alert(1)</script></svg>'), /cannot contain/);
  assert.throws(() => rasterizeSvgToPng('<svg width="10" height="10"><image href="https:\/\/example.com\/x.png"/></svg>'), /external resources/);
  assert.throws(() => rasterizeSvgToPng("not svg"), /SVG root/);
});
