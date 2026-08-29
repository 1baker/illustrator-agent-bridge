import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScene } from "../src/core/sceneValidation.js";
import { decodePng } from "../src/qa/pngPixels.js";
import { renderSceneToPng } from "../src/render/pngRenderer.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";
import { composePathMarkerBasicsScene } from "../src/scientific/pathMarkerBasics.js";

test("builds a validated semantic lesson from the path marker service", () => {
  const scene = composePathMarkerBasicsScene();
  assert.doesNotThrow(() => normalizeScene(scene));
  assert.equal(scene.document?.width, 1180);
  assert.equal(scene.document?.height, 720);
  assert.equal(scene.semantics?.objects.length, 5);
  assert.equal(scene.semantics?.relationships?.length, 2);
  assert.equal(scene.elements.find((element) => element.id === "curve-start")?.type, "ellipse");
  assert.equal(scene.elements.find((element) => element.id === "corner-checkpoint.1")?.type, "polygon");
  assert.equal(scene.elements.find((element) => element.id === "inhibition-bar")?.type, "polygon");
});

test("renders marker identity and semantic bindings into editable SVG", () => {
  const svg = renderSceneToSvg(composePathMarkerBasicsScene());
  assert.match(svg, /id="straight-arrow"[^>]*data-scientific-objects="line-end-marker"/);
  assert.match(svg, /id="curve-path"[^>]*C /);
  assert.match(svg, /id="corner-checkpoint\.1"/);
  assert.match(svg, /id="inhibition-bar"[^>]*data-scientific-objects="inhibition-connector"/);
});

test("raster proof contains the arrow tip and inhibition bar at their anchors", () => {
  const png = decodePng(renderSceneToPng(composePathMarkerBasicsScene()).png);
  const pixel = (x: number, y: number) => {
    const offset = (y * png.width + x) * 4;
    return Array.from(png.pixels.subarray(offset, offset + 4));
  };
  assert.notDeepEqual(pixel(250, 275), [255, 255, 255, 255], "sample inside the arrowhead rather than its anti-aliased tip boundary");
  assert.notDeepEqual(pixel(1109, 365), [255, 255, 255, 255], "sample inside the inhibition bar rather than its boundary");
});
