import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScene } from "../src/core/sceneValidation.js";
import { decodePng } from "../src/qa/pngPixels.js";
import { renderSceneToPng } from "../src/render/pngRenderer.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";
import { composeVectorPaintBasicsScene } from "../src/scientific/vectorPaintBasics.js";

test("builds a validated paint lesson with reusable semantic paints", () => {
  const scene = composeVectorPaintBasicsScene();
  assert.doesNotThrow(() => normalizeScene(scene));
  assert.equal(scene.document?.width, 1180);
  assert.equal(scene.paints?.length, 3);
  assert.equal(scene.semantics?.objects.length, 5);
  assert.equal(scene.elements.find((element) => element.id === "empty-compartment")?.style?.fill, null);
  assert.equal(scene.elements.find((element) => element.id === "concentration-channel")?.style?.fillPaint, "concentration-ramp");
  assert.equal(scene.elements.find((element) => element.id === "energy-path")?.style?.strokePaint, "energy-flow");
});

test("renders fill and stroke paint references with scientific annotations", () => {
  const svg = renderSceneToSvg(normalizeScene(composeVectorPaintBasicsScene()));
  assert.match(svg, /<linearGradient id="concentration-ramp"/);
  assert.match(svg, /<radialGradient id="particle-depth"/);
  assert.match(svg, /id="concentration-channel"[^>]*data-scientific-objects="concentration-field"[^>]*fill="url\(#concentration-ramp\)"/);
  assert.match(svg, /id="energy-path"[^>]*stroke="url\(#energy-flow\)"/);
});

test("raster proof distinguishes empty, flat, linear, radial, and stroke paint", () => {
  const png = decodePng(renderSceneToPng(composeVectorPaintBasicsScene()).png);
  const rgb = (x: number, y: number) => {
    const offset = (y * png.width + x) * 4;
    return Array.from(png.pixels.subarray(offset, offset + 3));
  };
  assert.deepEqual(rgb(160, 270), [255, 255, 255], "empty polygon shows white panel interior");
  assert.notDeepEqual(rgb(160, 465), [255, 255, 255], "solid polygon has a painted interior");
  assert.notDeepEqual(rgb(375, 260), rgb(520, 260), "linear gradient changes across the channel");
  assert.notDeepEqual(rgb(705, 260), rgb(790, 335), "radial gradient changes away from its focus");
  assert.notDeepEqual(rgb(1020, 237), [255, 255, 255], "curved boundary has a painted gradient stroke");
});
