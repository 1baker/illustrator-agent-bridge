import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ScientificBriefPlanner } from "../src/planner/scientificBriefPlanner.js";
import { planScientificPromptFigure } from "../src/scientific/promptFigureWorkflow.js";
import { compilePublicationIllustration, searchPublicationIllustration } from "../src/scientific/publicationIllustration.js";

const request = {
  schemaVersion: "ScientificPromptFigureRequest.v1", id: "reference-free-mechanism",
  prompt: "Show a protected polymer region converting to a diol-rich region after an acid trigger. Treat the mechanism as a hypothesis.",
  profile: "proposal", size: { preset: "proposal_full_width", dpi: 300 }, intent: "mechanism", evidence: [], claimPolicy: "allow_explicit_hypotheses", planner: "auto",
  presentation: { direction: "left_to_right", spacing: "open", density: "balanced" }, registry: { mode: "disabled", limit: 0 }
};

const brief = {
  schemaVersion: 1, source: { mode: "text", description: request.prompt, notes: [] },
  brief: { title: "Hypothesized latent-diol activation", audience: "presentation", intent: "mechanism", width: 1, height: 1, direction: "left_to_right", spacing: "open" },
  components: [{ id: "protected", type: "molecule", label: "Protected region" }, { id: "diol", type: "molecule", label: "Diol-rich region", emphasis: "primary" }],
  relationships: [{ id: "activation", sourceId: "protected", type: "converts_to", targetId: "diol", label: "acid trigger" }], refinements: [],
  claims: [{ id: "mechanism_hypothesis", text: "An acid trigger may produce a diol-rich region.", evidenceIds: [], support: "hypothesis", uncertainty: "Conceptual mechanism; not established by supplied experimental evidence.", targetIds: ["protected", "diol", "activation"] }]
};

test("turns one prompt into a deterministic mutable candidate and stops at brief approval", async () => {
  const planner: ScientificBriefPlanner = { id: "fixture-planner.v1", async plan() { return { mode: "openai", brief, provider: { name: "openai", model: "fixture" }, notes: ["fixture"] }; } };
  const result = await planScientificPromptFigure(request, { planner });
  assert.equal(result.status, "brief_pending"); assert.equal(result.nextGate, "human_brief_approval"); assert.equal(result.project?.lifecycle, "brief_pending"); assert.equal(result.project?.approvals.brief, undefined);
  assert.equal(result.preview?.manifest.sourceOfTruth, "semantic_vector_scene"); assert.match(result.preview?.latex ?? "", /tikzpicture/); assert.match(result.preview?.svg ?? "", /scientific-semantics/);
  assert.match(result.preview?.svg ?? "", /width="171\.5mm" height="105mm"/); assert.equal(result.preview?.png.width, 2026); assert.match(result.preview?.latex ?? "", /transform shape/);
  assert.equal(result.project?.claims[0]?.support, "hypothesis"); assert.match(result.project?.claims[0]?.uncertainty ?? "", /not established/i);
  assert.equal(result.project?.provenance.some((item) => item.kind === "prompt_request"), true);
  assert.equal(result.qa?.checks.textFitsFrames, true);
  assert.equal(result.preview?.scene.elements.filter((element) => element.id?.endsWith(".label-background")).every((element) => (element.style?.strokeWidth ?? 0) <= 1.25), true);
});

test("manual/provider fallback remains editable and cannot silently render or approve", async () => {
  const planner: ScientificBriefPlanner = { id: "manual-fixture.v1", async plan() { return { mode: "manual", brief: {}, notes: ["edit required"] }; } };
  const result = await planScientificPromptFigure(request, { planner });
  assert.equal(result.status, "brief_edit_required"); assert.equal(result.project, undefined); assert.equal(result.preview, undefined); assert.equal(result.nextGate, "edit_semantic_brief");
});

test("rejects planner attempts to smuggle coordinates into semantic components", async () => {
  const poisoned = structuredClone(brief) as any; poisoned.components[0].x = 999;
  const planner: ScientificBriefPlanner = { id: "poisoned.v1", async plan() { return { mode: "openai", brief: poisoned, notes: [] }; } };
  await assert.rejects(planScientificPromptFigure(request, { planner }), /forbidden or unsupported field.*x/);
});

test("evidence-only policy fails closed without exact planner claim bindings", async () => {
  const planner: ScientificBriefPlanner = { id: "no-claims.v1", async plan() { const value = structuredClone(brief) as any; delete value.claims; return { mode: "openai", brief: value, notes: [] }; } };
  await assert.rejects(planScientificPromptFigure({ ...request, claimPolicy: "evidence_only" }, { planner }), /requires planner claims/);
});

test("compiles a prompt-only material mechanism as a rich editable figure program", async () => {
  const fixtureRequest = JSON.parse(await readFile(resolve("examples/prompt-only-latent-diol-interphase.request.json"), "utf8"));
  fixtureRequest.registry = { mode: "disabled", limit: 0 };
  const fixtureBrief = JSON.parse(await readFile(resolve("examples/prompt-only-latent-diol-interphase.semantics.json"), "utf8"));
  const planner: ScientificBriefPlanner = { id: "material-program-fixture.v1", async plan() { return { mode: "openai", brief: fixtureBrief, notes: [] }; } };
  const result = await planScientificPromptFigure(fixtureRequest, { planner });
  const ids = result.preview?.scene.elements.map((element) => element.id) ?? [];
  assert.equal(result.qa?.ok, true);
  assert.ok(result.preview?.manifest.stages.includes("compile_figure_program_v1"));
  assert.ok(ids.includes("protected_film.chain-1"));
  assert.ok(ids.includes("protected_film.protected-ring-bond-1-1"));
  assert.ok(ids.includes("protected_film.protected-attachment-1"));
  assert.ok(ids.includes("protected_film.diol-carbon-bond-1") === false);
  assert.ok(ids.includes("conversion_zone.acid-1"));
  assert.ok(ids.includes("diol_interphase.zone"));
  assert.ok(ids.includes("silica_surface.slab"));
  assert.ok(ids.includes("silica_surface.silanol-1"));
  assert.equal(ids.some((id) => id?.includes("top-head") || id?.endsWith(".liquid")), false);
  const sceneElements = result.preview?.scene.elements ?? [];
  const protectedOxygen = sceneElements.find((element) => element.id === "protected_film.protected-oxygen-a-1");
  const convertedDiol = sceneElements.find((element) => element.id === "conversion_zone.diol-a-1");
  assert.equal(protectedOxygen?.type, "text");
  assert.equal(protectedOxygen?.text, "O");
  assert.equal(convertedDiol?.type, "text");
  assert.equal(convertedDiol?.text, "HO");
  assert.ok(ids.includes("conversion_zone.diol-carbon-bond-1"));
  assert.equal(sceneElements.some((element) => element.id?.includes(".diol-a-") && element.type === "ellipse"), false);
  assert.match(result.preview?.svg ?? "", /linearGradient/);
  assert.match(result.preview?.latex ?? "", /tikzpicture/);
  assert.equal(result.qa?.metrics.depictionOperatorCoverage, 1);
  assert.ok((result.qa?.metrics.scientificBodyAreaRatio ?? 0) >= 0.25);
  const search = result.preview?.intermediate.figureProgram && (result.preview.intermediate.figureProgram as any).search;
  assert.equal(search.mode, "reference_free_program_search.v2");
  assert.equal(search.targetImageUsed, false);
  assert.deepEqual(search.mutableProperties, ["vector_density", "stroke_hierarchy", "palette", "layer_depth"]);
  assert.equal(search.candidates.length, 9);
  assert.equal(search.learningPriorUsed, false);
  assert.deepEqual(search.learningSignals, []);
  assert.ok(search.candidates.every((candidate: any) => candidate.scoreBreakdown && Number.isFinite(candidate.scoreBreakdown.elementEconomy)));
  assert.equal(new Set(search.candidates.map((candidate: any) => candidate.colorway)).size, 3);
  assert.equal(new Set(search.candidates.map((candidate: any) => candidate.strokeScale)).size, 3);
  assert.ok(search.selectedProgram);
});

test("approved presentation grammar measurably changes reference-free program selection", async () => {
  const fixtureBrief = JSON.parse(await readFile(resolve("examples/prompt-only-latent-diol-interphase.semantics.json"), "utf8"));
  const withoutPrior = searchPublicationIllustration(fixtureBrief);
  const coolPrior = {
    schemaVersion: "PresentationGrammar.v1", profile: "proposal", intent: "mechanism", primitiveKinds: [],
    topology: { objectCount: 4, relationshipCount: 3, panelCount: 1 },
    palette: ["#DB2777", "#BE185D", "#9D174D", "#831843", "#FCE7F3", "#FDF2F8", "#FFF7FB"],
    strokeWidths: [1.88], fontSizes: [], paintKinds: [], flowDirection: "left_to_right", spacing: "normal", aspectRatio: 1.6, density: 5, meanPartsPerObject: 25
  } as any;
  const learned = searchPublicationIllustration(fixtureBrief, { prior: coolPrior });
  assert.equal(withoutPrior.audit.selectedProgram?.colorway, "balanced");
  assert.equal(learned.audit.selectedProgram?.colorway, "cool");
  assert.equal(learned.audit.learningPriorUsed, true);
  assert.deepEqual(learned.audit.learningSignals, ["mean_parts_per_object", "palette", "stroke_widths"]);
  const selected = learned.audit.candidates.find((candidate) => candidate.colorway === "cool" && candidate.detailLevel === learned.audit.selectedProgram?.detailLevel && candidate.strokeScale === learned.audit.selectedProgram?.strokeScale);
  assert.ok((selected?.scoreBreakdown.learnedPalette ?? 0) > 0);

  const shallow = compilePublicationIllustration(fixtureBrief, { detailLevel: 2, strokeScale: 1, colorway: "balanced", depthScale: 0.85 });
  const deep = compilePublicationIllustration(fixtureBrief, { detailLevel: 2, strokeScale: 1, colorway: "balanced", depthScale: 1.15 });
  assert.notEqual(shallow?.paints?.[0]?.stops[0]?.color, deep?.paints?.[0]?.stops[0]?.color);
});

test("generalizes the figure program to a cellular signaling cutaway without a reference", async () => {
  const cellularBrief = {
    schemaVersion: 1, source: { mode: "text", description: "Cellular signaling", notes: [] },
    brief: { title: "Receptor-mediated signaling", subtitle: "Coordinate-free prompt composition", audience: "presentation", intent: "pathway", width: 1, height: 1, direction: "left_to_right", spacing: "open" },
    components: [
      { id: "ligand", type: "molecule", kind: "signaling_ligand", label: "Ligand", emphasis: "primary" },
      { id: "receptor", type: "receptor", kind: "transmembrane_receptor", label: "Membrane receptor", emphasis: "primary" },
      { id: "kinase", type: "protein", kind: "signaling_kinase", label: "Kinase cascade", emphasis: "primary" },
      { id: "nucleus", type: "nucleus", kind: "gene_regulatory_nucleus", label: "Gene response", emphasis: "primary" }
    ],
    relationships: [
      { id: "binds", sourceId: "ligand", type: "binds_to", targetId: "receptor" },
      { id: "activates", sourceId: "receptor", type: "activates", targetId: "kinase" },
      { id: "regulates", sourceId: "kinase", type: "regulates", targetId: "nucleus" }
    ], refinements: [],
    claims: [{ id: "cellular_hypothesis", text: "The ligand may trigger a receptor-to-nucleus response.", evidenceIds: [], support: "hypothesis", uncertainty: "Conceptual pathway requiring experimental validation.", targetIds: ["ligand", "receptor", "kinase", "nucleus", "binds", "activates", "regulates"] }]
  };
  const planner: ScientificBriefPlanner = { id: "cellular-program-fixture.v1", async plan() { return { mode: "openai", brief: cellularBrief, notes: [] }; } };
  const result = await planScientificPromptFigure({ ...request, id: "cellular-reference-free", prompt: "Illustrate a ligand activating a membrane receptor, kinase cascade, and nuclear gene response." }, { planner });
  const ids = result.preview?.scene.elements.map((element) => element.id) ?? [];
  assert.equal(result.qa?.ok, true);
  assert.ok(ids.includes("receptor.membrane"));
  assert.ok(ids.includes("kinase.fold"));
  assert.ok(ids.includes("nucleus.envelope"));
  assert.equal(result.preview?.intermediate.figureProgram && (result.preview.intermediate.figureProgram as any).search.targetImageUsed, false);
  assert.equal(result.qa?.metrics.genericObjectCount, 0);
});

test("generalizes the figure program to an experimental system composition", async () => {
  const experimentalBrief = {
    schemaVersion: 1, source: { mode: "text", description: "Experimental system", notes: [] },
    brief: { title: "Stimulus-driven surface experiment", audience: "presentation", intent: "experimental_setup", width: 1, height: 1, direction: "left_to_right", spacing: "open" },
    components: [
      { id: "stimulus", type: "stimulus", kind: "external_light_field", label: "Applied stimulus", emphasis: "primary" },
      { id: "chamber", type: "apparatus", kind: "flow_chamber", label: "Flow chamber", emphasis: "primary" },
      { id: "surface", type: "surface", kind: "functional_sensor_surface", label: "Sensor surface", emphasis: "primary" },
      { id: "analyte", type: "particle", kind: "target_analyte", label: "Target analyte", emphasis: "secondary" }
    ],
    relationships: [
      { id: "illuminates", sourceId: "stimulus", type: "illuminates", targetId: "chamber" },
      { id: "contains", sourceId: "chamber", type: "contains", targetId: "surface" },
      { id: "captures", sourceId: "surface", type: "captures", targetId: "analyte" }
    ], refinements: [],
    claims: [{ id: "setup_hypothesis", text: "The applied stimulus may enable surface capture in the chamber.", evidenceIds: [], support: "hypothesis", uncertainty: "Conceptual setup; dimensions and performance are unspecified.", targetIds: ["stimulus", "chamber", "surface", "analyte", "illuminates", "contains", "captures"] }]
  };
  const planner: ScientificBriefPlanner = { id: "experimental-program-fixture.v1", async plan() { return { mode: "openai", brief: experimentalBrief, notes: [] }; } };
  const result = await planScientificPromptFigure({ ...request, id: "experimental-reference-free", prompt: "Show light driving a flow chamber experiment with a functional sensor surface and target analyte.", intent: "experimental_setup" }, { planner });
  const ids = result.preview?.scene.elements.map((element) => element.id) ?? [];
  assert.equal(result.qa?.ok, true);
  assert.ok(ids.includes("stimulus.source"));
  assert.ok(ids.includes("chamber.body"));
  assert.ok(ids.includes("surface.slab"));
  assert.equal(result.qa?.metrics.depictionOperatorCoverage, 1);
});

test("material illustration preserves arbitrary planner components and relationship endpoints", () => {
  const expanded = {
    schemaVersion: 1,
    brief: { title: "Expanded material mechanism", audience: "journal", intent: "mechanism", width: 1240, height: 759, direction: "left_to_right", spacing: "compact" },
    components: [
      { id: "protected_film", type: "material", kind: "protected_semicrystalline_polymer_film", label: "Protected film" },
      { id: "acid_source", type: "stimulus", kind: "acid_exposure", label: "Acid source" },
      { id: "semicrystalline_domains", type: "material", kind: "semicrystalline_domains", label: "Semicrystalline domains" },
      { id: "deprotection_gradient", type: "transformation", kind: "depth_dependent_deprotection", label: "Deprotection gradient" },
      { id: "diol_interphase", type: "interface", kind: "diol_rich_interphase", label: "Diol-rich interphase" },
      { id: "silica_surface", type: "surface", kind: "hydroxylated_silica", label: "Hydroxylated silica" }
    ],
    relationships: [
      { id: "acid_enters", sourceId: "acid_source", type: "transports_to", targetId: "protected_film" },
      { id: "film_contains_domains", sourceId: "protected_film", type: "contains", targetId: "semicrystalline_domains" },
      { id: "acid_enables_conversion", sourceId: "acid_source", type: "activates", targetId: "deprotection_gradient" },
      { id: "conversion_forms_interphase", sourceId: "deprotection_gradient", type: "flows_to", targetId: "diol_interphase" },
      { id: "interphase_contacts_silica", sourceId: "diol_interphase", type: "associates_with", targetId: "silica_surface" }
    ]
  };
  const scene = compilePublicationIllustration(expanded);
  const sceneObjects = scene?.semantics?.objects ?? [];
  const sceneRelationships = scene?.semantics?.relationships ?? [];
  assert.deepEqual(new Set(sceneObjects.map((item) => item.id)), new Set(expanded.components.map((item) => item.id)));
  assert.deepEqual(new Set(sceneRelationships.map((item) => item.id)), new Set(expanded.relationships.map((item) => item.id)));
  assert.ok(sceneRelationships.every((item) => (item.visualElementIds?.length ?? 0) > 0));
});
