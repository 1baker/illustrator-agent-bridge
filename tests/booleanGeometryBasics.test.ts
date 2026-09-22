import assert from "node:assert/strict";
import test from "node:test";
import { decodePng } from "../src/qa/pngPixels.js";
import { renderSceneToPng } from "../src/render/pngRenderer.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";
import { composeBooleanGeometryBasicsScene } from "../src/scientific/booleanGeometryBasics.js";

test("builds four semantic boolean construction results", () => {
  const scene = composeBooleanGeometryBasicsScene();
  const results = scene.elements.filter((element) => element.id?.endsWith("-result"));
  assert.equal(results.length, 4);
  assert.ok(results.every((element) => element.type === "compound_path"));
  assert.equal(scene.semantics?.objects.length, 4);
  assert.deepEqual(scene.semantics?.objects.map((object) => object.properties?.operation), ["union", "intersection", "difference", "xor"]);
  const xor = results.find((element) => element.id === "xor-result");
  assert.equal(xor?.type, "compound_path");
  if (xor?.type !== "compound_path") throw new Error("expected xor compound path");
  assert.equal(xor.subpaths.length, 2);
});

test("renders boolean results with embedded semantic identity", () => {
  const svg = renderSceneToSvg(composeBooleanGeometryBasicsScene());
  assert.match(svg, /data-format="scientific-image-generator\.scene-semantics\.v1"/);
  assert.match(svg, /id="union-result"[^>]*data-scientific-objects="union-region"/);
  assert.match(svg, /id="xor-result"[^>]*d="M [^"]+ Z M [^"]+ Z"/);
});

test("raster proof distinguishes kept overlap from removed overlap", () => {
  const png = decodePng(renderSceneToPng(composeBooleanGeometryBasicsScene()).png);
  const isWhite = (x: number, y: number) => {
    const index = (y * png.width + x) * 4;
    return png.pixels[index] > 245 && png.pixels[index + 1] > 245 && png.pixels[index + 2] > 245;
  };
  assert.equal(isWhite(155, 325), false, "union keeps the overlap");
  assert.equal(isWhite(445, 325), false, "intersection keeps the overlap");
  assert.equal(isWhite(735, 325), true, "difference removes B from the overlap");
  assert.equal(isWhite(1025, 325), true, "xor removes the shared overlap");
  assert.equal(isWhite(675, 325), false, "difference keeps A-only area");
  assert.equal(isWhite(965, 325), false, "xor keeps one-sided area");
});
