import assert from "node:assert/strict";
import test from "node:test";
import type { VectorScene } from "../src/core/vectorScene.js";
import {
  applyGenericDepictionGrammar,
  applyPresentationMutation,
  assertSemanticStateUnchanged,
  createImmutableApprovalPreimage,
  digestValue,
  evaluateVisualQuality,
  semanticStateFromScene,
  validateDepictionGrammar,
  verifyImmutableApprovalPreimage,
  type GenericDepictionPrimitive,
  type ScientificPresentationState
} from "../src/scientific/vectorRefinementEngine.js";

const presentation: ScientificPresentationState = {
  schemaVersion: "ScientificPresentationState.v1",
  camera: { projection: "oblique", depth: 18, framing: 0.82 },
  light: { directionDegrees: 58, elevationDegrees: 42, intensity: 0.8 },
  material: { faceContrast: 0.55, highlightOpacity: 34, shadowOpacity: 16, textureOpacity: 7 },
  labels: { minimumClearance: 12, anchors: {} }
};

function sceneFor(id: string, kind: string, label = "sample"): VectorScene {
  return {
    document: { width: 640, height: 420, title: label },
    elements: [
      { id: "background", name: "background", type: "rect", x: 0, y: 0, width: 640, height: 420, zIndex: -10, style: { fill: "#FFFFFF", stroke: null } },
      { id: `${id}.body`, name: `${id}.body`, type: "rect", x: 150, y: 120, width: 260, height: 150, zIndex: 10, style: { fill: "#C7DCE4", stroke: "#38576A", strokeWidth: 3 } },
      { id: `${id}.detail`, name: `${id}.detail`, type: "line", x: 180, y: 205, x2: 370, y2: 175, zIndex: 12, style: { fill: null, stroke: "#8D4D36", strokeWidth: 4 } },
      { id: `${id}.label`, name: `${id}.label`, type: "text", x: 230, y: 310, text: label, size: 16, zIndex: 30, style: { fill: "#263746", stroke: null } }
    ],
    semantics: { objects: [{ id, kind, label, elementIds: [`${id}.body`, `${id}.detail`] }], relationships: [] }
  };
}

test("generic depiction grammar applies editable vector cues across five scientific domains", () => {
  const cases: Array<[string, string, GenericDepictionPrimitive["kind"], GenericDepictionPrimitive["materialRole"]]> = [
    ["cell", "cellular_cutaway", "shell", "soft_tissue"],
    ["reactor", "laboratory_apparatus", "vessel", "glass"],
    ["assembly", "supramolecular_assembly", "particle_population", "polymer"],
    ["interface", "layered_material_interface", "interface", "mineral"],
    ["pathway", "scientific_process", "filament", "generic"]
  ];
  for (const [id, objectKind, primitiveKind, materialRole] of cases) {
    const scene = sceneFor(id, objectKind, id);
    const grammar = { schemaVersion: "ScientificDepictionGrammar.v1" as const, subjectAdapter: `${id}.adapter.v1`, primitives: [{ kind: primitiveKind, componentId: id, materialRole, geometryElementIds: [`${id}.body`, `${id}.detail`] }] };
    validateDepictionGrammar(grammar, scene);
    const before = semanticStateFromScene(scene, { briefDigest: "brief", evidenceDigests: ["evidence"], sourceDataDigests: [] });
    const rendered = applyGenericDepictionGrammar(scene, grammar, presentation);
    const after = semanticStateFromScene(rendered, { briefDigest: "brief", evidenceDigests: ["evidence"], sourceDataDigests: [] });
    assertSemanticStateUnchanged(before, after);
    assert.ok(rendered.elements.some((element) => element.id === `${id}.body.generic-shadow`));
    assert.ok(rendered.elements.some((element) => element.id === `${id}.detail.generic-highlight`));
    assert.equal(rendered.elements.some((element) => element.id?.includes("polymer-film")), false);
  }
});

test("presentation mutations are explicit, reversible, and cannot touch semantics", () => {
  const proposal = { id: "deepen-camera", family: "camera" as const, changes: [{ path: "camera.depth", before: 18, after: 24 }], inverseChanges: [{ path: "camera.depth", before: 24, after: 18 }] };
  const changed = applyPresentationMutation(presentation, proposal);
  assert.equal(changed.camera.depth, 24);
  assert.equal(applyPresentationMutation(changed, { ...proposal, changes: proposal.inverseChanges, inverseChanges: proposal.changes }).camera.depth, 18);
  assert.throws(() => applyPresentationMutation(presentation, { ...proposal, changes: [{ path: "semantic.components", before: "a", after: "b" }] }), /cannot change/);
  assert.throws(() => applyPresentationMutation(presentation, { ...proposal, changes: [{ path: "camera.depth", before: 4, after: 24 }] }), /stale before value/);
});

test("immutable approval preimage fails on every bound revision", () => {
  const preimage = createImmutableApprovalPreimage({ semanticStateDigest: "a", presentationStateDigest: "b", semanticSceneDigest: "c", svgDigest: "d", tikzDigest: "e", pngDigest: "f", generatorVersion: "g", rendererVersion: "h", mutationPolicyDigest: "i", fontPolicyDigest: "j", runtimeManifestDigest: "k" });
  const approvedDigest = digestValue(preimage);
  verifyImmutableApprovalPreimage(approvedDigest, preimage);
  for (const field of ["semanticStateDigest", "presentationStateDigest", "semanticSceneDigest", "svgDigest", "tikzDigest", "pngDigest", "generatorVersion", "rendererVersion", "mutationPolicyDigest", "fontPolicyDigest", "runtimeManifestDigest"] as const) {
    assert.throws(() => verifyImmutableApprovalPreimage(approvedDigest, { ...preimage, [field]: `${preimage[field]}-changed` }), /preimage is stale/);
  }
});

test("scene-measured quality rejects invisible, clipped, off-canvas, detached, and semantically unrendered content", () => {
  const hidden = sceneFor("cell", "cell");
  hidden.elements.find((element) => element.id === "cell.body")!.style!.opacity = 0;
  hidden.elements.find((element) => element.id === "cell.detail")!.style!.opacity = 0;
  assert.match(evaluateVisualQuality(hidden).hardFailures.join("\n"), /required semantic object/);

  const offCanvas = sceneFor("cell", "cell");
  offCanvas.elements.find((element) => element.id === "cell.body")!.x = -40;
  assert.match(evaluateVisualQuality(offCanvas).hardFailures.join("\n"), /beyond the canvas/);

  const clipped = sceneFor("cell", "cell");
  clipped.groups = [{ id: "hidden-clip", clip: { type: "rect", x: 500, y: 350, width: 20, height: 20 } }];
  clipped.elements.filter((element) => element.id?.startsWith("cell.") && element.type !== "text").forEach((element) => { element.groupId = "hidden-clip"; });
  assert.match(evaluateVisualQuality(clipped).hardFailures.join("\n"), /required semantic object/);

  const detached = sceneFor("cell", "cell");
  detached.elements.push({ id: "cell.contact-shadow", name: "cell.contact-shadow", type: "rect", x: 500, y: 350, width: 30, height: 20, zIndex: 2, style: { fill: "#222222", stroke: null, opacity: 20 } });
  assert.match(evaluateVisualQuality(detached).hardFailures.join("\n"), /contact shadow/);

  const relationship = sceneFor("cell", "cell");
  relationship.semantics!.relationships = [{ id: "missing-link", sourceObjectId: "cell", predicate: "activates", targetObjectId: "cell", visualElementIds: ["missing.geometry"] }];
  assert.match(evaluateVisualQuality(relationship).hardFailures.join("\n"), /relationships lack visible geometry/);
});

test("visible wording cannot game scene-measured quality", () => {
  const left = sceneFor("cell", "cell", "cell");
  const right = sceneFor("cell", "cell", "unit");
  assert.equal(evaluateVisualQuality(left).score, evaluateVisualQuality(right).score);
});
