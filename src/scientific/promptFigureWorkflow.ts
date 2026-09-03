import { createHash } from "node:crypto";
import { ValidationError } from "../core/sceneValidation.js";
import { measureLabel } from "../core/labelPlacement.js";
import type { ScientificBriefPlanner, ScientificBriefPlan } from "../planner/scientificBriefPlanner.js";
import { planScientificBrief } from "../planner/scientificBriefPlanner.js";
import { inspectPromptFigureScene, type PromptFigureQaReport } from "../qa/promptFigureQa.js";
import { renderSceneToPng } from "../render/pngRenderer.js";
import { renderSceneToSvg } from "../render/svgRenderer.js";
import { renderSceneToTikz } from "../render/tikzRenderer.js";
import { searchPublicationFigureRegistry, type PresentationGrammar } from "../registry/publicationFigureRegistry.js";
import { compileScientificFigureBrief } from "./figureBrief.js";
import { canonicalJson, normalizeScientificFigureProject, semanticFigureDigest, type ScientificFigureProject } from "./figureProject.js";
import { generateScientificImage, type ScientificImageGeneration } from "./imageGenerator.js";
import { normalizeScientificPromptFigureRequest, scientificPromptFigureRequestDigest, type ScientificPromptFigureRequest } from "./promptFigure.js";
import { searchPublicationIllustration } from "./publicationIllustration.js";

export interface ScientificPromptFigureWorkflow {
  schemaVersion: "ScientificPromptFigureWorkflow.v1";
  status: "brief_edit_required" | "brief_pending";
  request: ScientificPromptFigureRequest;
  requestDigest: string;
  planner: { id: string; mode: "manual" | "openai"; outputDigest: string; provider?: ScientificBriefPlan["provider"]; notes: string[] };
  presentationRetrieval: { snapshotDigest?: string; selected: Array<{ id: string; revision: string; score: number; grammar: PresentationGrammar }> };
  project?: ScientificFigureProject;
  semanticDigest?: string;
  preview?: ScientificImageGeneration;
  qa?: PromptFigureQaReport;
  nextGate: "edit_semantic_brief" | "human_brief_approval";
}

export interface PromptFigureWorkflowOptions { registryRoot?: string; planner?: ScientificBriefPlanner; }

export async function planScientificPromptFigure(input: unknown, options: PromptFigureWorkflowOptions = {}): Promise<ScientificPromptFigureWorkflow> {
  const request = normalizeScientificPromptFigureRequest(input); const requestDigest = scientificPromptFigureRequestDigest(request);
  const dimensions = physicalSize(request); const designDimensions = sceneDimensions(request, dimensions);
  const plannerRequest = { prompt: request.prompt, evidence: request.evidence.map((item) => ({ id: item.id, ...(item.title ? { title: item.title } : {}), text: item.text, ...(item.citation ? { citation: item.citation } : {}) })), profile: request.profile, dimensions: designDimensions };
  const plan = options.planner ? await options.planner.plan(plannerRequest) : await planScientificBrief(plannerRequest, request.planner);
  const retrieval = request.registry.mode === "approved_only" && options.registryRoot
    ? await searchPublicationFigureRegistry(options.registryRoot, { profile: request.profile, intent: request.intent, depictionOperators: requestedDepictionOperators(plan.brief), limit: request.registry.limit })
    : { matches: [] as Array<{ id: string; revision: string; score: number; grammar: PresentationGrammar }>, snapshotDigest: undefined };
  const base = {
    schemaVersion: "ScientificPromptFigureWorkflow.v1" as const, request, requestDigest,
    planner: { id: options.planner?.id ?? (plan.mode === "openai" ? "openai-responses-structured-output.v1" : "manual-form.v1"), mode: plan.mode, outputDigest: sha256(canonicalJson(plan.brief)), ...(plan.provider ? { provider: plan.provider } : {}), notes: plan.notes },
    presentationRetrieval: { ...(retrieval.snapshotDigest ? { snapshotDigest: retrieval.snapshotDigest } : {}), selected: retrieval.matches }
  };
  if (plan.mode === "manual") return { ...base, status: "brief_edit_required", nextGate: "edit_semantic_brief" };
  const brief = authoritativeBrief(plan.brief, request, designDimensions, retrieval.matches[0]?.grammar);
  const compilation = compileScientificFigureBrief(brief);
  const interactions = compilation.story.interactions ?? [];
  const claims = normalizeClaims(plan.brief, request, [...compilation.story.entities.map((item) => item.id), ...interactions.map((item) => item.id)]);
  const coverage = new Map<string, typeof claims[number]>(); for (const claim of claims) for (const target of claim.targetIds) { if (coverage.has(target)) throw new ValidationError(`semantic target ${target} is bound to more than one claim`); coverage.set(target, claim); }
  for (const target of [...compilation.story.entities.map((item) => item.id), ...interactions.map((item) => item.id)]) if (!coverage.has(target)) throw new ValidationError(`semantic target ${target} lacks an evidence or hypothesis claim`);
  const approvedEvidence = request.evidence.filter((item) => item.approved);
  const claimIdsByEvidence = new Map(approvedEvidence.map((item) => [item.id, claims.filter((claim) => claim.evidenceIds.includes(item.id)).map((claim) => claim.id)]));
  const project = normalizeScientificFigureProject({
    schemaVersion: "ScientificFigureProject.v1", id: request.id, title: compilation.story.document.title, profile: request.profile,
    size: { preset: request.size.preset, ...(request.size.widthMm === undefined ? {} : { widthMm: request.size.widthMm }), ...(request.size.heightMm === undefined ? {} : { heightMm: request.size.heightMm }), dpi: request.size.dpi ?? 300 },
    layout: { rows: 1, columns: 1, gapMm: 2.5, paddingMm: 3 },
    panels: [{ id: "main", label: "A", type: "schematic", row: 1, column: 1, content: { schemaVersion: 1, kind: "brief", content: brief }, evidenceIds: [...new Set(claims.flatMap((claim) => claim.evidenceIds))], claimIds: claims.map((claim) => claim.id), semanticEvidence: claims.flatMap((claim) => claim.targetIds.map((targetId) => ({ targetType: compilation.story.entities.some((item) => item.id === targetId) ? "object" : "relationship", targetId, claimId: claim.id, support: claim.support, evidenceIds: claim.evidenceIds }))) }],
    caption: captionFor(compilation.story.document.title, claims), altText: altTextFor(compilation.story.entities.map((item) => item.label), interactions.length, claims.some((claim) => claim.support === "hypothesis")),
    claims: claims.map(({ targetIds: _targetIds, ...claim }) => claim), evidence: approvedEvidence.map((item) => ({ id: item.id, citation: item.citation ?? item.title ?? `Reviewed evidence ${item.id}`, sourceDigest: item.sourceDigest, approved: true, kind: "litscout", claimIds: claimIdsByEvidence.get(item.id) ?? [] })),
    provenance: [
      { kind: "prompt_request", id: request.id, digest: requestDigest },
      { kind: "planner_output", id: "semantic_plan", digest: sha256(canonicalJson(brief)) },
      ...(retrieval.snapshotDigest ? [{ kind: "presentation_registry_snapshot", id: "registry_snapshot", digest: retrieval.snapshotDigest }] : []),
      ...retrieval.matches.map((match) => ({ kind: "presentation_grammar", id: match.id, digest: match.revision, description: `Presentation-only registry score ${match.score}` }))
    ],
    requestedOutputs: ["svg", "pdf", "png", "semantic_json", "latex", "analysis", "manifest"], lifecycle: "brief_pending", revisionId: `prompt-${requestDigest.slice(0, 12)}`, approvals: {}
  });
  const programSearch = searchPublicationIllustration(brief, { prior: retrieval.matches[0]?.grammar });
  const illustrated = programSearch.scene
    ? generateProgramImage(brief, programSearch.scene, programSearch.audit, compilation.story)
    : generateScientificImage({ schemaVersion: 1, kind: "brief", content: brief });
  const preview = applyProfileTypography(illustrated, request.profile, dimensions, request.size.dpi ?? 300);
  const qa = inspectPromptFigureScene(preview.scene, request.profile, dimensions);
  return { ...base, status: "brief_pending", project, semanticDigest: semanticFigureDigest(project), preview, qa, nextGate: "human_brief_approval" };
}

function authoritativeBrief(input: unknown, request: ScientificPromptFigureRequest, dimensions: { width: number; height: number }, grammar?: PresentationGrammar): unknown {
  const value = record(input, "planner brief"), briefValue = record(value.brief, "planner brief.brief");
  const components = array(value.components, "planner brief.components", 24).map((item, index) => { const component = record(item, `components[${index}]`); exact(component, ["id", "type", "kind", "label", "emphasis"], `components[${index}]`); return component; });
  const relationships = array(value.relationships ?? [], "planner brief.relationships", 60).map((item, index) => { const relationship = record(item, `relationships[${index}]`); exact(relationship, ["id", "sourceId", "type", "targetId", "label"], `relationships[${index}]`); const { label, ...semantic } = relationship; return request.presentation.spacing === "compact" ? semantic : { ...semantic, ...(typeof label === "string" && label.trim() ? { label } : {}) }; });
  return {
    schemaVersion: 1, source: { mode: "text", description: request.prompt, notes: ["Scientific semantics proposed from the prompt; geometry remains deterministic."] },
    brief: { title: string(briefValue.title, "brief.title", 160), ...(typeof briefValue.subtitle === "string" && briefValue.subtitle.trim() ? { subtitle: briefValue.subtitle } : {}), audience: request.profile === "manuscript" ? "journal" : "presentation", intent: request.intent === "concept" ? "mechanism" : request.intent, width: dimensions.width, height: dimensions.height, direction: request.presentation.direction ?? grammar?.flowDirection ?? briefValue.direction ?? "left_to_right", spacing: request.presentation.spacing ?? grammar?.spacing ?? briefValue.spacing ?? "normal" },
    components, relationships, refinements: [], profile: request.profile, dimensions, claims: [], evidence: [], panels: [], requestedAnalysis: []
  };
}

function normalizeClaims(input: unknown, request: ScientificPromptFigureRequest, targetIds: string[]): Array<{ id: string; text: string; evidenceIds: string[]; support: "evidence" | "hypothesis"; uncertainty?: string; targetIds: string[] }> {
  const value = record(input, "planner brief"); const rawClaims = value.claims === undefined ? [] : array(value.claims, "planner brief.claims", 200);
  if (rawClaims.length === 0) {
    if (request.claimPolicy === "evidence_only") throw new ValidationError("evidence_only prompt requires planner claims with exact target and evidence bindings");
    return [{ id: "prompt_hypothesis", text: request.prompt, evidenceIds: [], support: "hypothesis", uncertainty: "Prompt-derived concept; not established by supplied evidence.", targetIds }];
  }
  const knownTargets = new Set(targetIds), approvedEvidence = new Set(request.evidence.filter((item) => item.approved).map((item) => item.id));
  return rawClaims.map((item, index) => {
    const claim = record(item, `planner brief.claims[${index}]`); exact(claim, ["id", "text", "evidenceIds", "support", "uncertainty", "targetIds"], `planner brief.claims[${index}]`);
    const evidenceIds = array(claim.evidenceIds ?? [], `claims[${index}].evidenceIds`, 100).map((id) => stableId(id, `claims[${index}].evidenceIds`));
    const support = claim.support === undefined ? (evidenceIds.length ? "evidence" : "hypothesis") : oneOf(claim.support, ["evidence", "hypothesis"] as const, `claims[${index}].support`);
    if (support === "evidence" && (evidenceIds.length === 0 || evidenceIds.some((id) => !approvedEvidence.has(id)))) throw new ValidationError(`claims[${index}] requires exact approved evidence ids`);
    if (support === "hypothesis" && request.claimPolicy !== "allow_explicit_hypotheses") throw new ValidationError("prompt claim policy forbids hypotheses");
    const targets = array(claim.targetIds, `claims[${index}].targetIds`, 100).map((id) => stableId(id, `claims[${index}].targetIds`));
    if (targets.length === 0 || targets.some((id) => !knownTargets.has(id))) throw new ValidationError(`claims[${index}] must bind only known semantic targets`);
    const uncertainty = claim.uncertainty === undefined ? undefined : string(claim.uncertainty, `claims[${index}].uncertainty`, 1000);
    if (support === "hypothesis" && !uncertainty) throw new ValidationError(`claims[${index}] hypothesis requires uncertainty`);
    return { id: stableId(claim.id, `claims[${index}].id`), text: string(claim.text, `claims[${index}].text`, 2000), evidenceIds, support, ...(uncertainty ? { uncertainty } : {}), targetIds: targets };
  });
}

function physicalSize(request: ScientificPromptFigureRequest): { widthMm: number; heightMm: number } { const presets = { manuscript_single_column: [89, 70], manuscript_double_column: [183, 110], proposal_half_width: [82.5, 70], proposal_full_width: [171.5, 105] } as const; if (request.size.preset === "custom") return { widthMm: request.size.widthMm!, heightMm: request.size.heightMm! }; const pair = presets[request.size.preset]; return { widthMm: pair[0], heightMm: pair[1] }; }
function sceneDimensions(request: ScientificPromptFigureRequest, physical: { widthMm: number; heightMm: number }): { width: number; height: number } { const width = request.size.preset === "manuscript_single_column" || request.size.preset === "proposal_half_width" ? 720 : 1240; return { width, height: Math.round(width * physical.heightMm / physical.widthMm) }; }
function captionFor(title: string, claims: Array<{ support: string }>): string { return `${title}. ${claims.some((claim) => claim.support === "hypothesis") ? "Hypothesized relationships are conceptual and require experimental validation." : "All rendered claims are bound to reviewed evidence."}`; }
function altTextFor(labels: string[], relationships: number, hypothesis: boolean): string { return `Scientific schematic showing ${labels.join(", ")} connected by ${relationships} relationship${relationships === 1 ? "" : "s"}.${hypothesis ? " The mechanism is explicitly presented as a hypothesis." : ""}`; }
function applyProfileTypography(generated: ScientificImageGeneration, profile: "manuscript" | "proposal", physical: { widthMm: number; heightMm: number }, dpi: number): ScientificImageGeneration {
  const scene = structuredClone(generated.scene); const width = scene.document?.width ?? 720, height = scene.document?.height ?? 480;
  const scalePt = Math.min(physical.widthMm / 25.4 * 72 / width, physical.heightMm / 25.4 * 72 / height); const minimumUnits = (profile === "manuscript" ? 7 : 8) / scalePt;
  let changed = false; for (const element of scene.elements) if (element.type === "text" && (element.size ?? 18) < minimumUnits) { element.size = Number(minimumUnits.toFixed(3)); changed = true; }
  if (fitLabelFrames(scene)) changed = true;
  for (const element of scene.elements) {
    if (!element.id?.endsWith(".label-background") && !element.id?.endsWith(".label-leader")) continue;
    if ((element.style?.strokeWidth ?? 0) > 1.25) {
      element.style = { ...element.style, strokeWidth: 1.25 };
      changed = true;
    }
  }
  const elements = new Map(scene.elements.map((element) => [element.id, element])); const paints = [...(scene.paints ?? [])];
  for (const object of scene.semantics?.objects ?? []) {
    const body = object.elementIds.map((id) => elements.get(id)).find((element) => element?.id?.endsWith(".body") && typeof element.style?.fill === "string" && element.style.fill.toUpperCase() !== "#FFFFFF");
    if (!body || typeof body.style?.fill !== "string") continue;
    const id = `prompt-wash-${object.id}`, baseFill = body.style.fill; paints.push({ id, type: "linear_gradient", x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: baseFill }, { offset: 100, color: lighten(baseFill, 0.62) }] }); delete body.style.fill; body.style.fillPaint = id; changed = true;
  }
  if (paints.length) scene.paints = paints;
  const tikzScale = Math.min(physical.widthMm / 25.4 * 72.27 / width, physical.heightMm / 25.4 * 72.27 / height);
  const sceneJson = `${JSON.stringify(scene, null, 2)}\n`, rawSvg = renderSceneToSvg(scene), svg = physicalSvg(rawSvg, physical), rawTikz = renderSceneToTikz(scene), tikz = { ...rawTikz, latex: physicalTikz(rawTikz.latex, tikzScale) }, png = renderSceneToPng(scene, { width: Math.round(physical.widthMm / 25.4 * dpi) });
  const descriptor = (mimeType: string, value: string | Buffer, dimensions?: { width: number; height: number }) => ({ mimeType, bytes: Buffer.byteLength(value), sha256: sha256(value), ...(dimensions ?? {}) });
  return { ...generated, scene, sceneJson, svg, latex: tikz.latex, png, manifest: { ...generated.manifest, stages: [...generated.manifest.stages, ...(changed ? ["apply_profile_typography"] : []), "apply_physical_output_profile"], counts: { elements: scene.elements.length, objects: scene.semantics?.objects.length ?? 0, relationships: scene.semantics?.relationships?.length ?? 0 }, artifacts: { scene: descriptor("application/json", sceneJson), svg: descriptor("image/svg+xml", svg), latex: descriptor("application/x-tex", tikz.latex), png: descriptor("image/png", png.png, { width: png.width, height: png.height }) }, latex: { renderer: tikz.renderer, requiredPackages: [...tikz.requiredPackages] } } };
}

function generateProgramImage(brief: unknown, scene: ScientificImageGeneration["scene"], searchAudit: unknown, story: unknown): ScientificImageGeneration {
  const request = { schemaVersion: 1 as const, kind: "brief" as const, content: brief };
  const sceneJson = `${JSON.stringify(scene, null, 2)}\n`;
  const svg = renderSceneToSvg(scene), tikz = renderSceneToTikz(scene), png = renderSceneToPng(scene);
  const descriptor = (mimeType: string, value: string | Buffer, dimensions?: { width: number; height: number }) => ({ mimeType, bytes: Buffer.byteLength(value), sha256: sha256(value), ...(dimensions ?? {}) });
  return {
    request, scene, sceneJson, svg, latex: tikz.latex, png,
    intermediate: { story, figureProgram: { schemaVersion: "FigureProgram.v1", compiler: "compile_figure_program_v1", source: "coordinate_free_depiction_roles", search: searchAudit } },
    manifest: {
      schemaVersion: "scientific-image-manifest.v1", kind: "brief", engine: "software-scientific-image.v1", sourceSha256: sha256(canonicalJson(request)), sourceOfTruth: "semantic_vector_scene", adobeUsed: false,
      stages: ["validate_brief", "compile_figure_program_v1", "validate_semantic_scene", "render_tikz_latex", "render_editable_svg", "derive_png"],
      counts: { elements: scene.elements.length, objects: scene.semantics?.objects.length ?? 0, relationships: scene.semantics?.relationships?.length ?? 0 },
      artifacts: { scene: descriptor("application/json", sceneJson), svg: descriptor("image/svg+xml", svg), latex: descriptor("application/x-tex", tikz.latex), png: descriptor("image/png", png.png, { width: png.width, height: png.height }) },
      latex: { renderer: tikz.renderer, requiredPackages: [...tikz.requiredPackages] }, png: { background: png.background, fit: png.fit, fontPolicy: png.fontPolicy, renderer: png.renderer }
    }
  };
}

function requestedDepictionOperators(input: unknown): string[] {
  const value = record(input, "planner brief");
  const components = array(value.components ?? [], "planner brief.components", 24);
  const operators = new Set<string>();
  for (const item of components) {
    const component = record(item, "planner brief component");
    const words = new Set(`${component.type ?? ""} ${component.kind ?? ""} ${component.label ?? ""}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const has = (...values: string[]) => values.some((word) => words.has(word));
    if (has("polymer", "film", "material", "coating")) operators.add("material_cross_section");
    if (has("interface", "interphase")) operators.add("functional_interphase");
    if (has("receptor")) operators.add("transmembrane_receptor");
    if (has("nucleus", "dna", "rna", "gene")) operators.add("nucleic_acid_compartment");
    if (has("protein", "enzyme", "kinase")) operators.add("protein_domain_cartoon");
    if (has("apparatus", "instrument", "reactor", "chamber", "sensor")) operators.add("instrument_cross_section");
    if (has("surface", "substrate", "silica", "mineral")) operators.add("functional_surface_lattice");
    if (has("stimulus", "light", "heat", "acid", "trigger", "field")) operators.add("external_stimulus_field");
    if (has("molecule", "ligand", "analyte", "particle")) operators.add("molecular_scaffold");
  }
  return [...operators].sort();
}
function lighten(hex: string, amount: number): string { if (!/^#[0-9a-f]{6}$/i.test(hex)) return "#FFFFFF"; const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)); return `#${channels.map((value) => Math.round(value + (255 - value) * amount).toString(16).padStart(2, "0")).join("")}`.toUpperCase(); }
function physicalSvg(svg: string, physical: { widthMm: number; heightMm: number }): string { return svg.replace(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[^"]+" height="[^"]+"/, `<svg xmlns="http://www.w3.org/2000/svg" width="${physical.widthMm}mm" height="${physical.heightMm}mm"`); }
function physicalTikz(latex: string, scale: number): string { return latex.replace("\\begin{tikzpicture}[x=1pt,y=-1pt]", `\\begin{tikzpicture}[x=1pt,y=-1pt,scale=${Number(scale.toFixed(8))},transform shape]`); }
function fitLabelFrames(scene: ScientificImageGeneration["scene"]): boolean {
  const elements = new Map(scene.elements.map((element) => [element.id, element]));
  let changed = false;
  for (const label of scene.elements) {
    if (label.type !== "text" || !label.id?.endsWith(".label-text")) continue;
    const prefix = label.id.slice(0, -".label-text".length);
    const background = elements.get(`${prefix}.label-background`);
    if (background?.type !== "rect") continue;
    const padding = 6;
    const required = measureLabel(label.text, label.size ?? 18, padding);
    if (background.width + 1e-6 >= required.width && background.height + 1e-6 >= required.height) continue;
    const centerX = background.x + background.width / 2;
    const centerY = background.y + background.height / 2;
    background.width = Math.max(background.width, required.width);
    background.height = Math.max(background.height, required.height);
    background.x = centerX - background.width / 2;
    background.y = centerY - background.height / 2;
    label.x = background.x + padding;
    label.y = background.y + padding;
    const leader = elements.get(`${prefix}.label-leader`);
    if (leader?.type === "line") {
      const end = boxBoundaryToward(background, { x: leader.x, y: leader.y });
      leader.x2 = end.x;
      leader.y2 = end.y;
    }
    changed = true;
  }
  return changed;
}
function boxBoundaryToward(box: { x: number; y: number; width: number; height: number }, toward: { x: number; y: number }): { x: number; y: number } {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const dx = toward.x - center.x, dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}
function record(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${path} must be an object`); return value as Record<string, unknown>; }
function array(value: unknown, path: string, maximum: number): unknown[] { if (!Array.isArray(value) || value.length > maximum) throw new ValidationError(`${path} must be an array of at most ${maximum} items`); return value; }
function exact(value: Record<string, unknown>, allowed: string[], path: string): void { const extras = Object.keys(value).filter((key) => !allowed.includes(key)); if (extras.length) throw new ValidationError(`${path} contains forbidden or unsupported field(s): ${extras.join(", ")}`); }
function string(value: unknown, path: string, maximum: number): string { if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new ValidationError(`${path} must be non-empty text of at most ${maximum} characters`); return value; }
function stableId(value: unknown, path: string): string { const result = string(value, path, 120); if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(result)) throw new ValidationError(`${path} must be a stable identifier`); return result; }
function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T { if (typeof value !== "string" || !allowed.includes(value as T)) throw new ValidationError(`${path} must be ${allowed.join(" or ")}`); return value as T; }
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
