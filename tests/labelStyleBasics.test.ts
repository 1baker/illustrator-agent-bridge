import test from "node:test";
import assert from "node:assert/strict";
import { composeLabelStyleBasicsScene } from "../src/scientific/labelStyleBasics.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";

test("builds collision-free labels with semantic theme metadata", () => {
  const scene = composeLabelStyleBasicsScene();
  const objects = new Map(scene.semantics?.objects.map((object) => [object.id, object]));
  assert.equal(objects.get("specimen-object")?.properties?.labelPosition, "right");
  assert.equal(objects.get("cell-object")?.properties?.labelPosition, "bottom");
  assert.equal(objects.get("nucleus-object")?.properties?.styleTheme, "scientific-light-v1");
  assert.ok(scene.elements.filter((element) => element.id?.endsWith(".label-background")).length === 4);
});

test("renders styled label boxes, leader lines, and font roles", () => {
  const svg = renderSceneToSvg(composeLabelStyleBasicsScene());
  assert.match(svg, /id="specimen-label\.leader"/);
  assert.match(svg, /id="specimen-label\.label-background"[^>]*fill="#FFFFFF"[^>]*stroke="#64748B"/);
  assert.match(svg, /id="specimen-label\.label-text"[^>]*font-size="15"[^>]*font-family="Arial"/);
  assert.match(svg, /data-scientific-objects="specimen-object"/);
});
