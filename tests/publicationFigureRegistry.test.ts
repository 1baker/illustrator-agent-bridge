import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promotePublicationFigure, searchPublicationFigureRegistry } from "../src/registry/publicationFigureRegistry.js";
import { approveScientificFigureBrief, approveScientificFigureFinal, canonicalJson } from "../src/scientific/figureProject.js";
import { renderSceneToTikz } from "../src/render/tikzRenderer.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";
import { planScientificPromptFigure } from "../src/scientific/promptFigureWorkflow.js";

const scene = {
  document: { width: 320, height: 180 },
  paints: [{ id: "wash", type: "linear_gradient" as const, x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: "#DCEEFF" }, { offset: 100, color: "#FFFFFF" }] }],
  elements: [
    { id: "private-label", type: "text" as const, x: 24, y: 24, text: "Confidential latent diol identity", size: 18, style: { fill: "#111111" } },
    { id: "film", type: "rect" as const, x: 20, y: 60, width: 280, height: 80, style: { fillPaint: "wash", stroke: "#1F4E79", strokeWidth: 2 } }
  ],
  semantics: { objects: [{ id: "secret-object", kind: "protected-polymer", label: "Secret sample", elementIds: ["film"], properties: { compiler: "figure_program_v1", depictionOperator: "material_cross_section" } }] }
};

function sha(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }

function approvedProject(evidence: { artifactDigests: Record<string, string>; manifestDigest: string; qaDigest: string; analysisDigest: string }): unknown {
  const draft = {
    schemaVersion: "ScientificFigureProject.v1", id: "registry_fixture", title: "Registry fixture", profile: "proposal",
    size: { preset: "proposal_full_width", dpi: 300 }, layout: { rows: 1, columns: 1, gapMm: 2, paddingMm: 3 },
    panels: [{ id: "panel", label: "A", type: "schematic", row: 1, column: 1, content: { schemaVersion: 1, kind: "story", content: { schemaVersion: 1, document: { title: "Fixture" }, entities: [{ id: "sample", type: "generic", label: "Sample" }], interactions: [] } }, evidenceIds: [], claimIds: ["hypothesis"], semanticEvidence: [{ targetType: "object", targetId: "sample", claimId: "hypothesis", support: "hypothesis", evidenceIds: [] }] }],
    caption: "Explicitly hypothetical concept figure.", altText: "A proposal schematic showing one explicitly hypothetical sample concept.",
    claims: [{ id: "hypothesis", text: "The sample may change.", evidenceIds: [], support: "hypothesis", uncertainty: "Not experimentally established." }], evidence: [], provenance: [],
    requestedOutputs: ["svg", "pdf", "png", "semantic_json", "latex", "analysis", "manifest"], lifecycle: "brief_pending", revisionId: "rev1", approvals: {}
  };
  const brief = approveScientificFigureBrief(draft, "Reviewer", "2026-09-01T12:00:00Z");
  return approveScientificFigureFinal({ ...brief, lifecycle: "final_pending" }, evidence, "Reviewer", "2026-09-01T12:05:00Z");
}

test("promotes only final-approved TikZ and retrieves claim-stripped presentation grammar", async () => {
  const root = await mkdtemp(join(tmpdir(), "figure-registry-test-"));
  try {
    const tikz = renderSceneToTikz(scene).latex, svg = renderSceneToSvg(scene), png = Buffer.from("PNG-registry-fixture");
    const qa = { ok: true, sha256: "a".repeat(64), findings: [] }, manifest = { schemaVersion: "fixture.v1" }, analysis = { schemaVersion: "analysis-fixture.v1", results: {} };
    const finalEvidence = { artifactDigests: { scene: sha(Buffer.from(`${JSON.stringify(scene, null, 2)}\n`)), tikz: sha(tikz), svg: sha(svg), png: sha(png) }, manifestDigest: sha(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)), qaDigest: qa.sha256, analysisDigest: sha(Buffer.from(`${JSON.stringify(analysis, null, 2)}\n`)) };
    const project = approvedProject(finalEvidence);
    const entry = await promotePublicationFigure(root, { id: "approved-layout", project, finalEvidence, scene, tikz, svg, png, manifest, analysis, qa, intent: "concept", promotion: { reviewer: "Owner", reviewedAt: "2026-09-01T12:10:00Z", reuseScope: "personal", ownership: "owned", privacy: "private" } });
    assert.equal(entry.status, "active");
    const result = await searchPublicationFigureRegistry(root, { profile: "proposal", intent: "concept", primitiveKinds: ["rect", "text"] });
    assert.equal(result.matches.length, 1); assert.equal(result.matches[0]?.score, 110);
    assert.deepEqual(result.matches[0]?.grammar.depictionOperators, ["material_cross_section"]);
    assert.equal(result.matches[0]?.grammar.compositionArchetype, "material_cross_section");
    const learned = await searchPublicationFigureRegistry(root, { profile: "proposal", intent: "concept", depictionOperators: ["material_cross_section"] });
    assert.equal(learned.matches[0]?.score, 108);
    const searchable = JSON.stringify(result);
    assert.doesNotMatch(searchable, /latent diol|Confidential|Secret sample|protected-polymer|hypothesis/i);
    assert.match(await readFile(join(root, "events.jsonl"), "utf8"), /"promoted"/);
    const secondBrief = { schemaVersion: 1, source: { mode: "text", description: "A new unrelated workflow", notes: [] }, brief: { title: "Unrelated workflow", audience: "presentation", intent: "mechanism", width: 1, height: 1, direction: "top_to_bottom", spacing: "normal" }, components: [{ id: "new_input", type: "generic", label: "New input" }, { id: "new_output", type: "generic", label: "New output" }], relationships: [{ id: "new_flow", sourceId: "new_input", type: "activates", targetId: "new_output", label: "flow" }], refinements: [], claims: [{ id: "new_hypothesis", text: "A new input may affect a new output.", evidenceIds: [], support: "hypothesis", uncertainty: "Unverified new concept.", targetIds: ["new_input", "new_output", "new_flow"] }] };
    const second = await planScientificPromptFigure({ schemaVersion: "ScientificPromptFigureRequest.v1", id: "unrelated-workflow", prompt: "Show an unrelated input affecting an output as an explicit hypothesis.", profile: "proposal", size: { preset: "proposal_full_width", dpi: 300 }, intent: "concept", evidence: [], claimPolicy: "allow_explicit_hypotheses", planner: "auto", presentation: {}, registry: { mode: "approved_only", limit: 1 } }, { registryRoot: root, planner: { id: "second-fixture.v1", async plan() { return { mode: "openai", brief: secondBrief, notes: [] }; } } });
    assert.equal(second.presentationRetrieval.selected[0]?.id, "approved-layout"); assert.equal((second.preview?.intermediate.story as any).presentation.direction, "left_to_right");
    assert.doesNotMatch(JSON.stringify(second.presentationRetrieval), /latent diol|Confidential|Secret sample|protected-polymer/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects candidates without current final approval or passing QA", async () => {
  const root = await mkdtemp(join(tmpdir(), "figure-registry-reject-"));
  try {
    const tikz = renderSceneToTikz(scene).latex, svg = renderSceneToSvg(scene), png = Buffer.from("PNG"), qa = { ok: false, sha256: "a".repeat(64), findings: [{ severity: "error" }] }, manifest = {}, analysis = {};
    const finalEvidence = { artifactDigests: {}, manifestDigest: sha(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)), qaDigest: qa.sha256, analysisDigest: sha(Buffer.from(`${JSON.stringify(analysis, null, 2)}\n`)) };
    const project = approvedProject(finalEvidence);
    await assert.rejects(promotePublicationFigure(root, { id: "rejected", project, finalEvidence, scene, tikz, svg, png, manifest, analysis, qa, intent: "concept", promotion: { reviewer: "Owner", reviewedAt: "2026-09-01T12:10:00Z", reuseScope: "personal", ownership: "owned", privacy: "private" } }), /passing publication QA/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
