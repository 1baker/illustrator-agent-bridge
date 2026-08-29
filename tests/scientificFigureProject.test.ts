import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { approveScientificFigureBrief, finalFigureDigest, invalidateScientificFigureApprovals, normalizeScientificFigureProject, semanticFigureDigest } from "../src/scientific/figureProject.js";
import { generateScientificFigureProject, sanitizeSuppliedSvg } from "../src/scientific/figureProjectGenerator.js";

test("validates physical profiles, panel grids, evidence, and digest invalidation", () => {
  const project = fixtureProject("0".repeat(64));
  const normalized = normalizeScientificFigureProject(project);
  assert.equal(normalized.size.widthMm, 60);
  assert.throws(() => normalizeScientificFigureProject({ ...project, panels: [...project.panels, { ...project.panels[0], id: "duplicate" }] }), /overlaps/);
  const approved = approveScientificFigureBrief(project, "reviewer", "2026-08-29T12:00:00Z");
  assert.equal(approved.approvals.brief?.digest, semanticFigureDigest(approved));
  const changed = { ...approved, caption: "Changed caption invalidates approval." };
  assert.equal(invalidateScientificFigureApprovals(changed).lifecycle, "brief_pending");
});

test("generates a deterministic multi-panel artifact family and preserves supplied bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "figure-project-"));
  const source = join(root, "micrograph.tiff");
  const sourceBytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#DCE6EA" } }).tiff().toBuffer();
  await writeFile(source, sourceBytes);
  const digest = sha(sourceBytes);
  const approved = approveScientificFigureBrief(fixtureProject(digest), "reviewer", "2026-08-29T12:00:00Z");
  const generated = await generateScientificFigureProject(approved, { assetRoot: root });
  assert.match(generated.svg, /data-panel-id="mechanism"/);
  assert.match(generated.svg, /data-panel-id="micrograph"/);
  assert.equal(generated.pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.equal(generated.png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal((generated.manifest as { inputs: Array<{ panelId: string; sha256: string }> }).inputs.find((item) => item.panelId === "micrograph")?.sha256, digest);
  assert.equal(generated.qa.ok, true);
  assert.equal(sha(await import("node:fs/promises").then((module) => module.readFile(source))), digest);
});

test("rejects malicious supplied-image paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "figure-project-path-"));
  const project = fixtureProject("0".repeat(64));
  project.panels[1]!.source!.path = "../escape.png";
  const approved = approveScientificFigureBrief(project, "reviewer", "2026-08-29T12:00:00Z");
  await assert.rejects(() => generateScientificFigureProject(approved, { assetRoot: root }), /escapes asset root/);
});

test("sanitizes supplied SVG into a separately digested inert derivative", async () => {
  const root = await mkdtemp(join(tmpdir(), "figure-project-svg-safe-"));
  const source = Buffer.from(`<?xml version="1.0"?><!--review note--><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"><rect width="40" height="30" fill="#ddeeff"/><image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/></svg>`);
  await writeFile(join(root, "source.svg"), source);
  const project = fixtureProject(sha(source)); project.panels[1]!.source = { path: "source.svg", sha256: sha(source) };
  const generated = await generateScientificFigureProject(approveScientificFigureBrief(project, "reviewer", "2026-08-29T12:00:00Z"), { assetRoot: root });
  const input = (generated.manifest as any).inputs.find((item: any) => item.panelId === "micrograph");
  assert.equal(input.sha256, sha(source));
  assert.equal(input.sanitizedRenderingSha256, sha(Buffer.from(sanitizeSuppliedSvg(source.toString("utf8")))));
  assert.notEqual(input.sanitizedRenderingSha256, input.sha256);
  assert.doesNotMatch(generated.svg, /review note|<script|foreignObject|evil\.test|file:\/\//i);
  assert.equal(generated.png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(generated.pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.equal(sha(await import("node:fs/promises").then((module) => module.readFile(join(root, "source.svg")))), sha(source));
});

test("rejects active SVG, event handlers, entities, unsafe CSS, and external resources before rendering", async () => {
  const fixtures = [
    `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="https://evil.test"/></foreignObject></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/pixel.png"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" values="#safe;https://evil.test/x"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil.test/x)"/></svg>`,
    `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>`
  ];
  for (const source of fixtures) assert.throws(() => sanitizeSuppliedSvg(source), /active content|external, file, or unsafe data resource|unsupported or external content/);
});

test("approval preimages invalidate every decision-relevant field class", () => {
  const base = fixtureProject("0".repeat(64));
  base.provenance = [{ kind: "litscout_research", id: "fixture_research", digest: "b".repeat(64), description: "Reviewed packet" }];
  base.panels[1].analysisRequest = { adapter: { id: "adapter1", commandSha256: "1".repeat(64), entrypoint: { sha256: "2".repeat(64) }, runtime: { sha256: "3".repeat(64) }, environment: { MODE: "reviewed" } }, weights: { sha256: "4".repeat(64) }, parameters: { threshold: 0.5 }, prompts: [{ kind: "point", value: { x: 10, y: 10 } }], rois: [{ id: "roi1", x: 0, y: 0, width: 1, height: 1 }] };
  base.panels[1].analysisResult = { outputDigests: { mask: "5".repeat(64) }, candidateAnnotations: true };
  const digest = semanticFigureDigest(base);
  const mutations: Array<[string, (value: any) => void]> = [
    ["research packet", (v) => { v.provenance[0].digest = "c".repeat(64); }],
    ["research citation", (v) => { v.evidence[0].citation = "Different source"; }],
    ["claim map", (v) => { v.evidence[0].claimIds = []; }],
    ["source bytes", (v) => { v.panels[1].source.sha256 = "1".repeat(64); }],
    ["PDF page", (v) => { v.panels[1].source.page = 2; }],
    ["analysis adapter", (v) => { v.panels[1].analysisRequest.adapter.commandSha256 = "6".repeat(64); }],
    ["analysis entrypoint", (v) => { v.panels[1].analysisRequest.adapter.entrypoint.sha256 = "6".repeat(64); }],
    ["analysis runtime", (v) => { v.panels[1].analysisRequest.adapter.runtime.sha256 = "6".repeat(64); }],
    ["analysis environment", (v) => { v.panels[1].analysisRequest.adapter.environment.MODE = "changed"; }],
    ["analysis weights", (v) => { v.panels[1].analysisRequest.weights.sha256 = "6".repeat(64); }],
    ["analysis parameters", (v) => { v.panels[1].analysisRequest.parameters.threshold = 0.9; }],
    ["analysis prompt", (v) => { v.panels[1].analysisRequest.prompts[0].value.x = 11; }],
    ["analysis ROI", (v) => { v.panels[1].analysisRequest.rois[0].width = 0.5; }],
    ["candidate analysis output", (v) => { v.panels[1].analysisResult.outputDigests.mask = "6".repeat(64); }],
    ["calibration", (v) => { v.panels[1].calibration = { status: "pixel_only" }; }],
    ["layout", (v) => { v.layout.gapMm = 3; }],
    ["publication profile", (v) => { v.profile = "proposal"; }],
    ["QA size policy input", (v) => { v.size.dpi = 200; }]
  ];
  for (const [name, mutate] of mutations) { const value = structuredClone(base); mutate(value); assert.notEqual(semanticFigureDigest(value), digest, name); }
  const evidence = { artifactDigests: { svg: "1".repeat(64), pdf: "2".repeat(64), png: "3".repeat(64), semantic_json: "4".repeat(64), latex: "5".repeat(64), analysis: "6".repeat(64) }, manifestDigest: "7".repeat(64), qaDigest: "8".repeat(64), analysisDigest: "6".repeat(64) };
  const finalDigest = finalFigureDigest(base, evidence);
  for (const key of ["manifestDigest", "qaDigest", "analysisDigest"] as const) assert.notEqual(finalFigureDigest(base, { ...evidence, [key]: "9".repeat(64) }), finalDigest, key);
  assert.notEqual(finalFigureDigest(base, { ...evidence, artifactDigests: { ...evidence.artifactDigests, png: "9".repeat(64) } }), finalDigest, "artifact bytes");
});

test("fails orphaned, irrelevant, and unsupported planner claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "figure-project-grounding-"));
  const source = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#DCE6EA" } }).tiff().toBuffer(); await writeFile(join(root, "micrograph.tiff"), source);
  const irrelevant = fixtureProject(sha(source)); irrelevant.evidence[0].claimIds = [];
  await assert.rejects(() => generateScientificFigureProject(approveScientificFigureBrief(irrelevant, "reviewer", "2026-08-29T12:00:00Z"), { assetRoot: root }), /claim_evidence|semantic_grounding/);
  const unsupported = fixtureProject(sha(source)); unsupported.panels[0].content.content.interactions.push({ id: "invented_mechanism", sourceId: "response", type: "activates", targetId: "input" });
  await assert.rejects(() => generateScientificFigureProject(approveScientificFigureBrief(unsupported, "reviewer", "2026-08-29T12:00:00Z"), { assetRoot: root }), /semantic_grounding/);
});

test("renders a selected supplied PDF page without altering the PDF", async () => {
  const root = await mkdtemp(join(tmpdir(), "figure-project-pdf-"));
  const document = await PDFDocument.create(); const font = await document.embedFont(StandardFonts.Helvetica);
  document.addPage([120, 80]).drawText("Page one", { x: 10, y: 35, size: 12, font, color: rgb(0, 0, 0) });
  document.addPage([120, 80]).drawText("Selected page two", { x: 10, y: 35, size: 12, font, color: rgb(0, 0, 0) });
  const bytes = Buffer.from(await document.save()); await writeFile(join(root, "source.pdf"), bytes);
  const value = fixtureProject(sha(bytes)); value.panels[1]!.source = { path: "source.pdf", sha256: sha(bytes), page: 2 };
  const generated = await generateScientificFigureProject(approveScientificFigureBrief(value, "reviewer", "2026-08-29T12:00:00Z"), { assetRoot: root });
  assert.equal(generated.qa.ok, true); assert.equal(sha(await import("node:fs/promises").then((module) => module.readFile(join(root, "source.pdf")))), sha(bytes));
});

test("renders editable candidate analysis overlays and blocks uncalibrated physical claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "figure-project-overlay-"));
  const source = await sharp({ create: { width: 100, height: 80, channels: 3, background: "#E8EEF2" } }).png().toBuffer(); await writeFile(join(root, "image.png"), source);
  const inputDigest = sha(source), weightDigest = "1".repeat(64);
  const result: any = { schemaVersion: "scientific-analysis-result.v1", requestId: "request1", inputSha256: inputDigest, adapter: { id: "detector", version: "1", commandSha256: "2".repeat(64), entrypointSha256: "3".repeat(64), runtimeSha256: "4".repeat(64), environmentSha256: "5".repeat(64) }, weightSha256: weightDigest, environment: { runtime: "fixture" }, parameters: { threshold: 0.5 }, prompts: [], rois: [], calibration: { status: "pixel_only", source: "none", evidence: "No calibration." }, runtimeMs: 1, annotations: [{ id: "box1", type: "bounding_box", classLabel: "candidate", confidence: 0.9, box: { x: 10, y: 10, width: 40, height: 30 } }], outputDigests: {}, candidateAnnotations: true };
  const project: any = { schemaVersion: "ScientificFigureProject.v1", id: "overlay", title: "Candidate overlay", profile: "proposal", size: { preset: "custom", widthMm: 60, heightMm: 35, dpi: 100 }, layout: { rows: 1, columns: 2, gapMm: 2, paddingMm: 2 }, panels: [{ id: "source", label: "A", type: "supplied_image", row: 1, column: 1, source: { path: "image.png", sha256: inputDigest }, evidenceIds: [], claimIds: [] }, { id: "overlay_panel", label: "B", type: "analysis_overlay", row: 1, column: 2, sourcePanelId: "source", analysisResult: result, evidenceIds: [], claimIds: [] }], caption: "Candidate detection overlay.", altText: "A source image and an editable candidate detection bounding box.", claims: [], evidence: [], provenance: [], requestedOutputs: ["svg", "pdf", "png", "semantic_json", "latex", "analysis", "manifest"], lifecycle: "brief_pending", revisionId: "rev1", approvals: {} };
  const generated = await generateScientificFigureProject(approveScientificFigureBrief(project, "reviewer", "2026-08-29T12:00:00Z"), { assetRoot: root });
  assert.match(generated.svg, /data-candidate="true"/); assert.equal(generated.analysis.overlay_panel.candidateAnnotations, true);
  result.annotations[0].physicalValue = 20; result.annotations[0].physicalUnit = "um";
  await assert.rejects(() => generateScientificFigureProject(approveScientificFigureBrief(project, "reviewer", "2026-08-29T12:00:00Z"), { assetRoot: root }), /physical measurements without verified calibration/);
});

test("golden manuscript and proposal composites preserve semantics, framing, dimensions, hashes, and nonblank exports", async () => {
  for (const name of ["golden-manuscript-figure-project.json", "golden-proposal-figure-project.json"]) {
    const value = JSON.parse(await import("node:fs/promises").then((module) => module.readFile(join(process.cwd(), "examples", name), "utf8")));
    const first = await generateScientificFigureProject(value, { assetRoot: join(process.cwd(), "examples") });
    const second = await generateScientificFigureProject(value, { assetRoot: join(process.cwd(), "examples") });
    assert.equal(first.qa.ok, true);
    assert.equal(first.png.length > 1000, true);
    assert.equal((first.manifest as any).artifacts.svg, (second.manifest as any).artifacts.svg);
    assert.equal((first.manifest as any).artifacts.png, (second.manifest as any).artifacts.png);
    assert.equal((first.manifest as any).artifacts.pdf, (second.manifest as any).artifacts.pdf);
    assert.match(first.semanticJson, /scientific-figure-semantic\.v1/);
    assert.match(first.svg, /data-panel-id=/);
    assert.doesNotMatch(first.svg, /viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet"><metadata/);
  }
});

function fixtureProject(sourceDigest: string) {
  return {
    schemaVersion: "ScientificFigureProject.v1", id: "fixture", title: "Scientific Figure Studio fixture", profile: "manuscript", size: { preset: "custom", widthMm: 60, heightMm: 35, dpi: 100 },
    layout: { rows: 1, columns: 2, gapMm: 2, paddingMm: 2 },
    panels: [
      { id: "mechanism", label: "A", type: "schematic", row: 1, column: 1, content: { schemaVersion: 1, kind: "story", content: { schemaVersion: 1, document: { title: "Mechanism", width: 800, height: 520 }, entities: [{ id: "input", type: "molecule", label: "Input" }, { id: "response", type: "process", label: "Response" }], interactions: [{ id: "activation", sourceId: "input", type: "activates", targetId: "response" }] } }, evidenceIds: ["ev1"], claimIds: ["claim1"], semanticEvidence: [{ targetType: "object", targetId: "input", claimId: "claim1", support: "evidence", evidenceIds: ["ev1"] }, { targetType: "object", targetId: "response", claimId: "claim1", support: "evidence", evidenceIds: ["ev1"] }, { targetType: "relationship", targetId: "activation", claimId: "claim1", support: "evidence", evidenceIds: ["ev1"] }] },
      { id: "micrograph", label: "B", type: "supplied_image", row: 1, column: 2, source: { path: "micrograph.tiff", sha256: sourceDigest }, evidenceIds: [], claimIds: [] }
    ],
    sharedLegend: [{ id: "input_legend", label: "Input", color: "#2B6CB0", evidenceIds: ["ev1"] }], caption: "A reviewed mechanism beside an immutable supplied image.", altText: "Two panels show a molecular mechanism and a supplied microscopy image.",
    claims: [{ id: "claim1", text: "Input activates response.", evidenceIds: ["ev1"], support: "evidence", uncertainty: "Conceptual relationship." }], evidence: [{ id: "ev1", citation: "Representative reviewed evidence.", sourceDigest: "a".repeat(64), approved: true, kind: "litscout", claimIds: ["claim1"] }], provenance: [],
    requestedOutputs: ["svg", "pdf", "png", "semantic_json", "latex", "analysis", "manifest"], lifecycle: "brief_pending", revisionId: "rev1", approvals: {}
  } as any;
}

function sha(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
