import test from "node:test";
import assert from "node:assert/strict";
import { composeConstraintBasicsScene } from "../src/scientific/constraintBasics.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";

test("builds a scientific scene from resolved layout constraints", () => {
  const scene = composeConstraintBasicsScene();
  const objects = new Map(scene.semantics?.objects.map((object) => [object.id, object]));
  assert.equal(objects.get("reaction-1")?.properties?.resolvedX, 310);
  assert.equal(objects.get("reaction-1")?.properties?.resolvedY, 310);
  assert.equal(objects.get("analysis-1")?.properties?.resolvedX, 520);
  assert.equal(objects.get("nucleus-1")?.properties?.resolvedX, 900);
  assert.equal(objects.get("nucleus-1")?.properties?.resolvedY, 310);
  assert.equal(objects.get("vesicle-1")?.properties?.resolvedX, 1050);
  assert.equal(scene.semantics?.relationships?.filter((relationship) => relationship.predicate === "contained_in").length, 2);
});

test("renders constraint-solved objects, arrows, and clipped cell hierarchy", () => {
  const svg = renderSceneToSvg(composeConstraintBasicsScene());
  assert.match(svg, /id="reaction.box"[^>]*x="310"[^>]*y="310"/);
  assert.match(svg, /id="analysis.box"[^>]*x="520"[^>]*y="320"/);
  assert.match(svg, /id="group-constraint-cell-interior-1"[^>]*clip-path=/);
  assert.match(svg, /data-scientific-relationships="sample-to-reaction"/);
});
