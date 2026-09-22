import test from "node:test";
import assert from "node:assert/strict";
import { planGenericObjectScene } from "../src/planner/genericObjectPlanner.js";
import { reviewArtworkQuality } from "../src/qa/artworkReviewGuard.js";
import type { SemanticItem } from "../src/semantic/types.js";

const corpus: SemanticItem[] = [
  {
    id: "object.microscope.vector-grammar",
    kind: "object_semantics",
    title: "Microscope vector grammar",
    text: "A microscope needs an eyepiece, angled optical tube, objective turret, stage with slide, focus knobs, illumination path, and heavy base.",
    tags: ["microscope", "eyepiece", "objective", "stage", "focus", "instrument"]
  },
  {
    id: "shape.instrument-callouts",
    kind: "shape_combination",
    title: "Instrument callout composition",
    text: "Complex instruments read well with a dominant silhouette, named subassemblies, leader lines, and a small number of labels tied to concrete parts.",
    tags: ["instrument", "callout", "shape", "combination"]
  },
  {
    id: "style.publication-vector",
    kind: "style_reference",
    title: "Publication vector style",
    text: "Use consistent strokes, high contrast, editable named objects, and avoid details that only work at full zoom.",
    tags: ["publication", "vector", "editable"]
  },
  {
    id: "requirement.object-readability",
    kind: "publication_requirement",
    title: "Object readability",
    text: "Objects should be recognizable from silhouette and components before relying on text labels.",
    tags: ["object", "readability", "silhouette"]
  }
];

test("planGenericObjectScene builds semantic microscope object scenes", () => {
  const plan = planGenericObjectScene("complex microscope object with objective lenses and calibration controls", corpus, {
    width: 1000,
    height: 700
  });

  assert.equal(plan.planner, "generic-object-deterministic");
  assert.equal(plan.archetype, "microscope");
  assert.equal(plan.qa.ok, true);
  assert.ok(plan.evidence.some((result) => result.item.id === "object.microscope.vector-grammar"));
  assert.ok(plan.evidence.some((result) => result.item.id === "shape.instrument-callouts"));
  assert.ok(plan.scene.elements.some((element) => element.name === "eyepiece rim"));
  assert.ok(plan.scene.elements.some((element) => element.name === "objective turret"));
  assert.ok(plan.scene.elements.some((element) => element.name === "stage callout label"));
  assert.ok(plan.scene.elements.length > 40);
  assert.ok(plan.recommendedExports.includes("svg"));
});

test("planGenericObjectScene output passes artwork review when export QA is clean", () => {
  const plan = planGenericObjectScene("complex microscope object with objective lenses and calibration controls", corpus, {
    width: 1000,
    height: 700
  });
  const review = reviewArtworkQuality({
    prompt: plan.prompt,
    scene: plan.scene,
    exportQa: {
      ok: true,
      path: "microscope.svg",
      format: "svg",
      bytes: 120_000,
      dimensions: {
        width: 1000,
        height: 700
      },
      checks: [],
      details: {
        vectorElementCount: plan.scene.elements.length
      }
    }
  });

  assert.equal(review.ok, true);
  assert.equal(review.nextGoalPrompt, null);
  assert.deepEqual(
    review.checks.filter((check) => check.status !== "pass"),
    []
  );
});
