import test from "node:test";
import assert from "node:assert/strict";
import { composeRoutingBasicsScene } from "../src/scientific/routingBasics.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";

test("builds two obstacle-aware scientific relationship routes", () => {
  const scene = composeRoutingBasicsScene();
  const relationships = new Map(scene.semantics?.relationships?.map((relationship) => [relationship.id, relationship]));
  assert.equal(relationships.get("activation-route")?.properties?.router, "orthogonal_visibility_v1");
  assert.equal(relationships.get("inhibition-route")?.properties?.crossings, 0);
  assert.ok(Number(relationships.get("activation-route")?.properties?.bends) >= 2);
  assert.ok(scene.elements.some((element) => element.id === "activation-route.path" && element.type === "path"));
});

test("renders routed paths and associates them with semantic relationships", () => {
  const svg = renderSceneToSvg(composeRoutingBasicsScene());
  assert.match(svg, /id="activation-route.path"[^>]*data-scientific-relationships="activation-route"/);
  assert.match(svg, /id="inhibition-route.path"[^>]*data-scientific-relationships="inhibition-route"/);
  assert.match(svg, /data-name="activation-route routed path"[^>]*d="M [^"]+"/);
});
