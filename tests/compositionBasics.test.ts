import test from "node:test";
import assert from "node:assert/strict";
import { composeCompositionBasicsScene } from "../src/scientific/compositionBasics.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";

test("builds a nested scientific containment scene", () => {
  const scene = composeCompositionBasicsScene();
  assert.equal(scene.groups?.length, 4);
  assert.equal(scene.groups?.find((group) => group.id === "organelles")?.parentId, "cell-interior");
  assert.equal(scene.semantics?.relationships?.filter((relationship) => relationship.predicate === "contained_in").length, 2);
  assert.equal(scene.elements.find((element) => element.id === "particle.clipped")?.groupId, "particles");
});

test("renders the cell contents inside a nested clipped group", () => {
  const svg = renderSceneToSvg(composeCompositionBasicsScene());
  const interiorStart = svg.indexOf('id="group-cell-interior-1"');
  const particlesStart = svg.indexOf('id="group-particles-1"');
  const particle = svg.indexOf('id="particle.clipped"');
  const membrane = svg.indexOf('id="cell.membrane"');
  assert.ok(interiorStart >= 0);
  assert.ok(particlesStart > interiorStart);
  assert.ok(particle > particlesStart);
  assert.ok(membrane > particle, "membrane must be painted after the clipped contents");
  assert.match(svg, /clip-path="url\(#clip-cell-interior-1\)"/);
});
