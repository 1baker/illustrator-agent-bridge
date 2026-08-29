import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScene } from "../src/core/sceneValidation.js";
import { decodePng } from "../src/qa/pngPixels.js";
import { renderSceneToPng } from "../src/render/pngRenderer.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";
import { composeStrokeExpansionBasicsScene } from "../src/scientific/strokeExpansionBasics.js";

test("builds semantic expanded geometry for width, caps, joins, dashes, and a closed ring", () => {
  const scene = composeStrokeExpansionBasicsScene();
  assert.doesNotThrow(() => normalizeScene(scene));
  assert.equal(scene.document?.width, 1180);
  assert.equal(scene.semantics?.objects.length, 9);
  const outlines = scene.elements.filter((element) => element.id?.endsWith("-outline"));
  assert.equal(outlines.length, 9);
  assert.ok(outlines.every((element) => element.type === "compound_path"));
  const ring = scene.elements.find((element) => element.id === "closed-stroke-outline");
  assert.equal(ring?.type, "compound_path");
  if (ring?.type !== "compound_path") throw new Error("expected compound ring");
  assert.equal(ring.subpaths.length, 2);
  assert.equal(scene.semantics?.objects.find((object) => object.id === "width-region")?.properties?.area, 5640);
});

test("renders expanded outlines and their editable centerlines into SVG", () => {
  const svg = renderSceneToSvg(composeStrokeExpansionBasicsScene());
  assert.match(svg, /id="base-outline"[^>]*fill="#BFDBFE"/);
  assert.match(svg, /id="base-centerline"[^>]*stroke-dasharray="7 5"/);
  assert.match(svg, /id="dashed-curve-outline"[^>]*data-scientific-objects="dash-regions"/);
  assert.match(svg, /id="closed-stroke-outline"[^>]*d="M [^"]+ Z M [^"]+ Z"/);
});

test("raster proof distinguishes cap extension and a transparent closed-stroke hole", () => {
  const png = decodePng(renderSceneToPng(composeStrokeExpansionBasicsScene()).png);
  const isPanelWhite = (x: number, y: number) => {
    const index = (y * png.width + x) * 4;
    return png.pixels[index] > 245 && png.pixels[index + 1] > 245 && png.pixels[index + 2] > 245;
  };
  assert.equal(isPanelWhite(365, 242), true, "butt cap does not extend before its anchor");
  assert.equal(isPanelWhite(365, 350), false, "round cap extends before its anchor");
  assert.equal(isPanelWhite(365, 458), false, "square cap extends before its anchor");
  assert.equal(isPanelWhite(1028, 460), true, "closed expanded stroke preserves a transparent hole");
  assert.equal(isPanelWhite(965, 460), false, "closed expanded stroke boundary is filled");
});
