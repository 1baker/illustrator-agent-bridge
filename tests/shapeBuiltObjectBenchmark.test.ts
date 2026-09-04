import assert from "node:assert/strict";
import test from "node:test";
import { approveCandidateBLifelikeRefinement, approveShapeBuiltDirection, generateShapeBuiltScientificObjectBenchmark, optimizeCandidateBLifelikeRefinement, optimizeShapeBuiltScientificObject, shapeBuiltLifelikeProgramDigest, shapeBuiltProgramDigest } from "../src/scientific/shapeBuiltObjectBenchmark.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";
import { renderSceneToTikz } from "../src/render/tikzRenderer.js";

test("builds six deterministic scientific-object candidates without a target image", () => {
  const first = generateShapeBuiltScientificObjectBenchmark();
  const second = generateShapeBuiltScientificObjectBenchmark();
  assert.equal(first.targetImageUsed, false);
  assert.equal(first.objective, "semantic_vector_fitness");
  assert.equal(first.candidates.length, 6);
  assert.equal(first.selectedCandidateId, second.selectedCandidateId);
  assert.deepEqual(first.candidates.map((candidate) => candidate.score), second.candidates.map((candidate) => candidate.score));
  assert.equal(first.approval.status, "pending");
});

test("each candidate carries morphology through editable geometry and semantics", () => {
  const benchmark = generateShapeBuiltScientificObjectBenchmark();
  for (const candidate of benchmark.candidates) {
    const ids = candidate.scene.elements.map((element) => element.id ?? "");
    const kinds = new Set(candidate.scene.semantics?.objects.map((object) => object.kind));
    assert.ok(ids.includes("film-body"));
    assert.ok(ids.some((id) => id.includes("folded-chain")));
    assert.ok(ids.some((id) => id.startsWith("amorphous.chain-")));
    assert.ok(ids.some((id) => id.startsWith("tie-molecule-")));
    assert.ok(ids.some((id) => id.includes("acetal-ring")));
    assert.ok(kinds.has("crystalline_lamellae"));
    assert.ok(kinds.has("amorphous_polymer_network"));
    assert.ok(kinds.has("interlamellar_tie_molecules"));
    assert.ok((candidate.scene.semantics?.relationships?.length ?? 0) >= 4);
    assert.equal(candidate.scene.elements.some((element) => element.type === "ellipse"), false);
    assert.match(renderSceneToSvg(candidate.scene), /clipPath/);
    assert.match(renderSceneToTikz(candidate.scene).latex, /tikzpicture/);
  }
});

test("binds Candidate B direction approval to its program digest", () => {
  const approval = approveShapeBuiltDirection("candidate-b-ordered", "user", "2026-09-03T23:55:00Z");
  const candidate = generateShapeBuiltScientificObjectBenchmark().candidates.find((item) => item.program.id === approval.candidateId)!;
  assert.equal(approval.scope, "visual_direction_only");
  assert.equal(approval.programDigest, shapeBuiltProgramDigest(candidate.program));
  assert.throws(() => optimizeShapeBuiltScientificObject({ ...approval, programDigest: "0".repeat(64) }), /digest is stale/);
});

test("autonomous loop accepts only improving mutations and preserves final human gate", () => {
  const approval = approveShapeBuiltDirection("candidate-b-ordered", "user", "2026-09-03T23:55:00Z");
  const run = optimizeShapeBuiltScientificObject(approval, 3);
  assert.equal(run.steps.length, 3);
  assert.ok(run.steps.every((step) => step.evaluated.length === 7));
  assert.ok(run.steps.every((step) => step.evaluated.filter((item) => item.accepted).length <= 1));
  assert.ok(run.steps.every((step, index) => step.winner.score >= (index === 0 ? run.baseline.score : run.steps[index - 1]!.winner.score)));
  assert.ok(run.final.score > run.baseline.score);
  assert.deepEqual(run.steps.map((step) => step.acceptedMutation), ["soften-lamella-fill", "open-film-fill", "increase-chain-curvature"]);
  assert.equal(run.finalApproval.status, "pending");
});

test("binds lifelike refinement to the exact approved Candidate B generation-three program", () => {
  const approval = approveCandidateBLifelikeRefinement("user", "2026-09-03T23:58:00Z");
  const run = optimizeCandidateBLifelikeRefinement(approval, 1);
  assert.equal(approval.baselineProgramDigest, shapeBuiltProgramDigest(run.baseline.program.baseProgram));
  assert.equal(shapeBuiltLifelikeProgramDigest(run.baseline.program).length, 64);
  assert.throws(() => optimizeCandidateBLifelikeRefinement({ ...approval, baselineProgramDigest: "0".repeat(64) }), /digest is stale/);
});

test("autonomous lifelike loop adds editable dimensional cues without tracing a target image", () => {
  const approval = approveCandidateBLifelikeRefinement("user", "2026-09-03T23:58:00Z");
  const run = optimizeCandidateBLifelikeRefinement(approval, 7);
  assert.equal(run.referencePolicy, "public_examples_general_traits_only_no_tracing");
  assert.deepEqual(run.steps.map((step) => step.acceptedMutation), [
    "add-slab-perspective",
    "extrude-crystalline-lamellae",
    "add-contact-occlusion",
    "add-specular-highlights",
    "differentiate-material-faces",
    "add-restrained-surface-texture",
    "add-rim-light"
  ]);
  assert.ok(run.final.score > run.baseline.score + 80);
  assert.equal(run.finalApproval.status, "pending");
  const ids = new Set(run.final.scene.elements.map((element) => element.id));
  assert.ok(ids.has("film-extrusion.front-face"));
  assert.ok(ids.has("lamella-1.extrusion-front"));
  assert.ok(ids.has("lamella-1.contact-shadow"));
  assert.ok(ids.has("specular-highlight.primary"));
  assert.ok(ids.has("film-rim-light"));
  assert.ok(run.final.scene.elements.some((element) => element.id?.startsWith("surface-microtexture-")));
  assert.equal(run.final.scene.elements.some((element) => element.type === "ellipse"), false);
  const frontFace = run.final.scene.elements.find((element) => element.id === "film-extrusion.front-face");
  assert.equal(frontFace?.type, "path");
  if (frontFace?.type === "path") {
    assert.ok(frontFace.points.every((point) => point.x < 1100 && point.y < 650));
  }
  const objectLabel = run.final.scene.elements.find((element) => element.id === "object-label");
  assert.equal(objectLabel?.type, "text");
  if (objectLabel?.type === "text") assert.ok(objectLabel.y > 650);
  assert.equal(run.final.scene.elements.some((element) => element.type === "text" && element.text.toLowerCase().includes("semicrystalline polymer morphology")), false);
  assert.match(renderSceneToSvg(run.final.scene), /film-front-depth/);
  assert.match(renderSceneToTikz(run.final.scene).latex, /shading/);
});
