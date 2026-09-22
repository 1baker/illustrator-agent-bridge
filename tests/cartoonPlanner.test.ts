import test from "node:test";
import assert from "node:assert/strict";
import { planCartoonScene } from "../src/planner/cartoonPlanner.js";
import { reviewArtworkQuality } from "../src/qa/artworkReviewGuard.js";
import type { SemanticItem } from "../src/semantic/types.js";

const corpus: SemanticItem[] = [
  {
    id: "object.round-flask.cartoon",
    kind: "object_semantics",
    title: "Round flask",
    text: "A round flask reads well with a narrow neck and bubbles.",
    tags: ["flask", "lab"]
  },
  {
    id: "style.publication-cartoon-vector",
    kind: "style_reference",
    title: "Publication vector cartoon",
    text: "Use consistent strokes, named layers, and high contrast.",
    tags: ["publication", "cartoon"]
  },
  {
    id: "object.urban-transit-system",
    kind: "object_semantics",
    title: "Urban transit system",
    text: "Urban transit illustrations read well with skyline buildings, rail routes, station nodes, a river or green corridor, trains, platforms, and data overlays.",
    tags: ["urban", "transit", "city", "train", "skyline", "river"]
  },
  {
    id: "metaphor.layered-city-system",
    kind: "visual_metaphor",
    title: "Layered city system",
    text: "Use a layered city map with infrastructure, environment, people, and data overlays as separate named vector groups.",
    tags: ["city", "system", "map", "data", "layers"]
  }
];

test("planCartoonScene retrieves evidence and produces a valid lab scene", () => {
  const plan = planCartoonScene("cartoon lab scientist with flask", corpus);

  assert.equal(plan.scene.document?.colorMode, "RGB");
  assert.ok(plan.evidence.some((result) => result.item.id === "object.round-flask.cartoon"));
  assert.ok(plan.scene.elements.some((element) => element.name === "round reaction flask"));
  assert.equal(plan.qa.ok, true);
  assert.ok(plan.recommendedExports.includes("pdf"));
});

test("planCartoonScene creates a rich editable city/transit scene for broad prompts", () => {
  const plan = planCartoonScene("urban transit system with skyline river solar rooftops and data overlay", corpus, {
    width: 720,
    height: 480
  });

  assert.equal(plan.scene.document?.colorMode, "RGB");
  assert.ok(plan.evidence.some((result) => result.item.id === "object.urban-transit-system"));
  assert.ok(plan.evidence.some((result) => result.item.id === "metaphor.layered-city-system"));
  assert.ok(plan.scene.elements.some((element) => element.name === "main train car"));
  assert.ok(plan.scene.elements.some((element) => element.name === "blue transit route east segment"));
  assert.ok(plan.scene.elements.some((element) => element.name === "solar office roof panel 1"));
  assert.ok(plan.scene.elements.some((element) => element.name === "data overlay link"));
  assert.ok(plan.scene.elements.length > 55);
  assert.equal(plan.qa.ok, true);

  const review = reviewArtworkQuality({
    prompt: plan.prompt,
    scene: plan.scene,
    exportQa: {
      ok: true,
      path: "urban-transit.svg",
      format: "svg",
      bytes: 120_000,
      dimensions: {
        width: 720,
        height: 480
      },
      checks: [],
      details: {
        vectorElementCount: plan.scene.elements.length
      }
    }
  });

  assert.equal(review.ok, true);
  assert.equal(review.nextGoalPrompt, null);
});
