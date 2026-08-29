import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScene } from "../src/core/sceneValidation.js";
import { decodePng } from "../src/qa/pngPixels.js";
import { renderSceneToPng } from "../src/render/pngRenderer.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";
import { composeCurveGeometryBasicsScene } from "../src/scientific/curveGeometryBasics.js";

test("builds an auditable four-stage curve geometry lesson", () => {
  const scene = composeCurveGeometryBasicsScene();
  assert.doesNotThrow(() => normalizeScene(scene));
  assert.equal(scene.document?.width, 1180);
  assert.equal(scene.document?.height, 680);
  assert.equal(scene.semantics?.objects.length, 4);
  const coarse = scene.elements.find((element) => element.id === "coarse-flattening");
  const fine = scene.elements.find((element) => element.id === "fine-flattening");
  assert.equal(coarse?.type, "path");
  assert.equal(fine?.type, "path");
  if (coarse?.type !== "path" || fine?.type !== "path") throw new Error("expected flattened paths");
  assert.ok(fine.points.length > coarse.points.length);
  assert.ok(fine.points.every((point) => point.leftX === undefined && point.rightX === undefined));
  const intersection = scene.elements.find((element) => element.id === "curved-intersection");
  assert.equal(intersection?.type, "compound_path");
});

test("renders curve provenance and semantic identity into SVG", () => {
  const svg = renderSceneToSvg(composeCurveGeometryBasicsScene());
  assert.match(svg, /id="definition-curve"[^>]*C /);
  assert.match(svg, /id="fine-flattening"[^>]*d="M [^"]+ L /);
  assert.match(svg, /id="curved-intersection"[^>]*data-scientific-objects="shared-domain"/);
  assert.match(svg, /&quot;tolerance&quot;:1\.5/);
});

test("raster proof contains the filled curved region and computed overlap", () => {
  const png = decodePng(renderSceneToPng(composeCurveGeometryBasicsScene()).png);
  const pixel = (x: number, y: number) => {
    const index = (y * png.width + x) * 4;
    return [png.pixels[index], png.pixels[index + 1], png.pixels[index + 2]];
  };
  const membraneCenter = pixel(733, 312);
  const overlapCenter = pixel(1027, 315);
  assert.ok(membraneCenter[1]! > membraneCenter[0]!, "membrane center is teal-filled");
  assert.ok(overlapCenter[2]! > overlapCenter[1]!, "intersection center is violet-filled");
});
