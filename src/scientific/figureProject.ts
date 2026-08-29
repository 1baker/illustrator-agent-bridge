import { createHash } from "node:crypto";
import { ValidationError } from "../core/sceneValidation.js";

export type ScientificFigureProfile = "manuscript" | "proposal";
export type ScientificFigureSizePreset =
  | "manuscript_single_column"
  | "manuscript_double_column"
  | "proposal_half_width"
  | "proposal_full_width"
  | "custom";
export type ScientificFigurePanelType = "schematic" | "plot" | "supplied_image" | "analysis_overlay";
export type ScientificClaimSupport = "evidence" | "supplied_data" | "hypothesis";
export type ScientificFigureLifecycle =
  | "discovered"
  | "researching"
  | "brief_pending"
  | "brief_approved"
  | "rendering_analysis"
  | "final_pending"
  | "final_approved"
  | "inserted";

export interface FigureApproval {
  digest: string;
  reviewer: string;
  reviewedAt: string;
}

export interface ScientificFigurePanel {
  id: string;
  label: string;
  type: ScientificFigurePanelType;
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  title?: string;
  content?: unknown;
  source?: { path: string; sha256: string; page?: number };
  sourcePanelId?: string;
  analysisRequest?: unknown;
  analysisResult?: unknown;
  crop?: { x: number; y: number; width: number; height: number };
  calibration?: unknown;
  evidenceIds: string[];
  claimIds: string[];
  semanticEvidence: Array<{
    targetType: "object" | "relationship" | "quantitative_annotation" | "label" | "hypothesis";
    targetId: string;
    claimId: string;
    support: ScientificClaimSupport;
    evidenceIds: string[];
  }>;
}

export interface ScientificFigureProject {
  schemaVersion: "ScientificFigureProject.v1";
  id: string;
  title: string;
  profile: ScientificFigureProfile;
  size: { preset: ScientificFigureSizePreset; widthMm: number; heightMm: number; dpi: number };
  layout: { rows: number; columns: number; gapMm: number; paddingMm: number };
  panels: ScientificFigurePanel[];
  sharedLegend?: Array<{ id: string; label: string; color?: string; evidenceIds: string[] }>;
  caption: string;
  altText: string;
  claims: Array<{ id: string; text: string; evidenceIds: string[]; support: ScientificClaimSupport; uncertainty?: string }>;
  evidence: Array<{ id: string; citation: string; sourceDigest?: string; approved: boolean; kind: "litscout" | "supplied_data" | "hypothesis"; claimIds: string[] }>;
  provenance: Array<{ kind: string; id: string; digest: string; description?: string }>;
  requestedOutputs: ["svg", "pdf", "png", "semantic_json", "latex", "analysis", "manifest", ...string[]];
  lifecycle: ScientificFigureLifecycle;
  revisionId: string;
  approvals: { brief?: FigureApproval; final?: FigureApproval };
}

const PRESET_DIMENSIONS: Record<Exclude<ScientificFigureSizePreset, "custom">, { profile: ScientificFigureProfile; widthMm: number; heightMm: number }> = {
  manuscript_single_column: { profile: "manuscript", widthMm: 89, heightMm: 70 },
  manuscript_double_column: { profile: "manuscript", widthMm: 183, heightMm: 110 },
  proposal_half_width: { profile: "proposal", widthMm: 82.5, heightMm: 70 },
  proposal_full_width: { profile: "proposal", widthMm: 171.5, heightMm: 105 }
};

export function normalizeScientificFigureProject(input: unknown): ScientificFigureProject {
  const value = object(input, "scientific figure project");
  exactKeys(value, ["schemaVersion", "id", "title", "profile", "size", "layout", "panels", "sharedLegend", "caption", "altText", "claims", "evidence", "provenance", "requestedOutputs", "lifecycle", "revisionId", "approvals"], "scientific figure project");
  if (value.schemaVersion !== "ScientificFigureProject.v1") throw new ValidationError("scientific figure project.schemaVersion must be ScientificFigureProject.v1");
  const id = stableId(value.id, "scientific figure project.id");
  const title = text(value.title, "scientific figure project.title", 240);
  const profile = oneOf(value.profile, ["manuscript", "proposal"] as const, "scientific figure project.profile");
  const size = normalizeSize(value.size, profile);
  const layout = normalizeLayout(value.layout);
  if (!Array.isArray(value.panels) || value.panels.length < 1 || value.panels.length > 24) throw new ValidationError("scientific figure project.panels must contain 1 to 24 panels");
  const panels = value.panels.map((item, index) => normalizePanel(item, index, layout));
  unique(panels.map((panel) => panel.id), "panel id");
  validatePanelGrid(panels, layout);
  const evidence = normalizeEvidence(value.evidence);
  unique(evidence.map((item) => item.id), "evidence id");
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const claims = normalizeClaims(value.claims, evidenceIds);
  unique(claims.map((item) => item.id), "claim id");
  const claimIds = new Set(claims.map((item) => item.id));
  for (const item of evidence) {
    for (const claimId of item.claimIds) if (!claimIds.has(claimId)) throw new ValidationError(`evidence ${item.id} references unknown claim id: ${claimId}`);
    if (item.kind !== "hypothesis" && !item.sourceDigest) throw new ValidationError(`evidence ${item.id} requires a reviewed sourceDigest`);
  }
  for (const panel of panels) {
    for (const evidenceId of panel.evidenceIds) if (!evidenceIds.has(evidenceId)) throw new ValidationError(`panel ${panel.id} references unknown evidence id: ${evidenceId}`);
    for (const claimId of panel.claimIds) if (!claimIds.has(claimId)) throw new ValidationError(`panel ${panel.id} references unknown claim id: ${claimId}`);
    for (const binding of panel.semanticEvidence) {
      if (!claimIds.has(binding.claimId) || !panel.claimIds.includes(binding.claimId)) throw new ValidationError(`panel ${panel.id} semantic target ${binding.targetId} references an unbound claim: ${binding.claimId}`);
      for (const evidenceId of binding.evidenceIds) if (!evidenceIds.has(evidenceId) || !panel.evidenceIds.includes(evidenceId)) throw new ValidationError(`panel ${panel.id} semantic target ${binding.targetId} references evidence outside the panel: ${evidenceId}`);
    }
    if (panel.type === "analysis_overlay" && !panels.some((candidate) => candidate.id === panel.sourcePanelId && candidate.type === "supplied_image")) {
      throw new ValidationError(`analysis overlay ${panel.id} must reference a supplied_image panel`);
    }
  }
  const requestedOutputs = normalizeOutputs(value.requestedOutputs);
  const project: ScientificFigureProject = {
    schemaVersion: "ScientificFigureProject.v1",
    id,
    title,
    profile,
    size,
    layout,
    panels,
    ...(value.sharedLegend === undefined ? {} : { sharedLegend: normalizeLegend(value.sharedLegend, evidenceIds) }),
    caption: text(value.caption, "scientific figure project.caption", 4000),
    altText: text(value.altText, "scientific figure project.altText", 4000),
    claims,
    evidence,
    provenance: normalizeProvenance(value.provenance),
    requestedOutputs,
    lifecycle: oneOf(value.lifecycle, ["discovered", "researching", "brief_pending", "brief_approved", "rendering_analysis", "final_pending", "final_approved", "inserted"] as const, "scientific figure project.lifecycle"),
    revisionId: stableId(value.revisionId, "scientific figure project.revisionId"),
    approvals: normalizeApprovals(value.approvals)
  };
  assertApprovalState(project);
  return project;
}

export const SCIENTIFIC_FIGURE_APPROVAL_POLICY_VERSION = "scientific-figure-approval-preimage.v2";

export function scientificFigureBriefPreimage(input: unknown): Record<string, unknown> {
  const project = normalizeScientificFigureProject(input);
  return { policyVersion: SCIENTIFIC_FIGURE_APPROVAL_POLICY_VERSION, decisionInputs: { ...project, lifecycle: undefined, revisionId: undefined, approvals: undefined } };
}

export function semanticFigureDigest(input: unknown): string { return sha256(canonicalJson(scientificFigureBriefPreimage(input))); }

export interface ScientificFigureFinalApprovalEvidence { artifactDigests: Record<string, string>; manifestDigest: string; qaDigest: string; analysisDigest: string; }

export function scientificFigureFinalPreimage(input: unknown, evidence: ScientificFigureFinalApprovalEvidence): Record<string, unknown> {
  return { policyVersion: SCIENTIFIC_FIGURE_APPROVAL_POLICY_VERSION, semanticDigest: semanticFigureDigest(input), artifactDigests: digestRecord(evidence.artifactDigests, "final approval artifactDigests"), manifestDigest: digestText(evidence.manifestDigest, "final approval manifestDigest"), qaDigest: digestText(evidence.qaDigest, "final approval qaDigest"), analysisDigest: digestText(evidence.analysisDigest, "final approval analysisDigest") };
}

export function finalFigureDigest(input: unknown, evidence: ScientificFigureFinalApprovalEvidence): string { return sha256(canonicalJson(scientificFigureFinalPreimage(input, evidence))); }

export function approveScientificFigureBrief(input: unknown, reviewer: string, reviewedAt: string): ScientificFigureProject {
  const project = normalizeScientificFigureProject(input);
  if (!["brief_pending", "brief_approved"].includes(project.lifecycle)) throw new ValidationError("brief approval requires brief_pending lifecycle");
  return { ...project, lifecycle: "brief_approved", approvals: { brief: approval(semanticFigureDigest(project), reviewer, reviewedAt) } };
}

export function approveScientificFigureFinal(input: unknown, evidence: ScientificFigureFinalApprovalEvidence, reviewer: string, reviewedAt: string): ScientificFigureProject {
  const project = normalizeScientificFigureProject(input);
  if (project.lifecycle !== "final_pending") throw new ValidationError("final approval requires final_pending lifecycle");
  if (project.approvals.brief?.digest !== semanticFigureDigest(project)) throw new ValidationError("final approval requires a current brief approval digest");
  return { ...project, lifecycle: "final_approved", approvals: { ...project.approvals, final: approval(finalFigureDigest(project, evidence), reviewer, reviewedAt) } };
}

export function invalidateScientificFigureApprovals(input: unknown): ScientificFigureProject {
  const project = normalizeScientificFigureProject(input);
  const briefCurrent = project.approvals.brief?.digest === semanticFigureDigest(project);
  return briefCurrent ? project : { ...project, lifecycle: "brief_pending", approvals: {} };
}

function normalizeSize(input: unknown, profile: ScientificFigureProfile): ScientificFigureProject["size"] {
  const value = object(input, "scientific figure project.size");
  exactKeys(value, ["preset", "widthMm", "heightMm", "dpi"], "scientific figure project.size");
  const preset = oneOf(value.preset, ["manuscript_single_column", "manuscript_double_column", "proposal_half_width", "proposal_full_width", "custom"] as const, "scientific figure project.size.preset");
  const expected = preset === "custom" ? undefined : PRESET_DIMENSIONS[preset];
  if (expected && expected.profile !== profile) throw new ValidationError(`size preset ${preset} is not valid for ${profile} profile`);
  const widthMm = expected?.widthMm ?? bounded(value.widthMm, "scientific figure project.size.widthMm", 20, 600);
  const heightMm = expected?.heightMm ?? bounded(value.heightMm, "scientific figure project.size.heightMm", 20, 600);
  if (expected && ((value.widthMm !== undefined && value.widthMm !== expected.widthMm) || (value.heightMm !== undefined && value.heightMm !== expected.heightMm))) throw new ValidationError("preset figure sizes cannot override widthMm or heightMm");
  return { preset, widthMm, heightMm, dpi: value.dpi === undefined ? 300 : integer(value.dpi, "scientific figure project.size.dpi", 72, 1200) };
}

function normalizeLayout(input: unknown): ScientificFigureProject["layout"] {
  const value = object(input, "scientific figure project.layout");
  exactKeys(value, ["rows", "columns", "gapMm", "paddingMm"], "scientific figure project.layout");
  return { rows: integer(value.rows, "layout.rows", 1, 8), columns: integer(value.columns, "layout.columns", 1, 8), gapMm: bounded(value.gapMm ?? 2.5, "layout.gapMm", 0, 30), paddingMm: bounded(value.paddingMm ?? 3, "layout.paddingMm", 0, 30) };
}

function normalizePanel(input: unknown, index: number, layout: ScientificFigureProject["layout"]): ScientificFigurePanel {
  const value = object(input, `panels[${index}]`);
  exactKeys(value, ["id", "label", "type", "row", "column", "rowSpan", "columnSpan", "title", "content", "source", "sourcePanelId", "analysisRequest", "analysisResult", "crop", "calibration", "evidenceIds", "claimIds", "semanticEvidence"], `panels[${index}]`);
  const type = oneOf(value.type, ["schematic", "plot", "supplied_image", "analysis_overlay"] as const, `panels[${index}].type`);
  const source = value.source === undefined ? undefined : normalizeSource(value.source, index);
  if ((type === "schematic" || type === "plot") && value.content === undefined) throw new ValidationError(`panels[${index}].content is required for ${type}`);
  if (type === "supplied_image" && source === undefined) throw new ValidationError(`panels[${index}].source is required for supplied_image`);
  if (type === "analysis_overlay" && typeof value.sourcePanelId !== "string") throw new ValidationError(`panels[${index}].sourcePanelId is required for analysis_overlay`);
  return {
    id: stableId(value.id, `panels[${index}].id`), label: text(value.label, `panels[${index}].label`, 12), type,
    row: integer(value.row, `panels[${index}].row`, 1, layout.rows), column: integer(value.column, `panels[${index}].column`, 1, layout.columns),
    rowSpan: value.rowSpan === undefined ? 1 : integer(value.rowSpan, `panels[${index}].rowSpan`, 1, layout.rows),
    columnSpan: value.columnSpan === undefined ? 1 : integer(value.columnSpan, `panels[${index}].columnSpan`, 1, layout.columns),
    ...(value.title === undefined ? {} : { title: text(value.title, `panels[${index}].title`, 200) }),
    ...(value.content === undefined ? {} : { content: value.content }), ...(source ? { source } : {}),
    ...(value.sourcePanelId === undefined ? {} : { sourcePanelId: stableId(value.sourcePanelId, `panels[${index}].sourcePanelId`) }),
    ...(value.analysisRequest === undefined ? {} : { analysisRequest: value.analysisRequest }), ...(value.analysisResult === undefined ? {} : { analysisResult: value.analysisResult }),
    ...(value.crop === undefined ? {} : { crop: normalizeCrop(value.crop, index) }), ...(value.calibration === undefined ? {} : { calibration: value.calibration }),
    evidenceIds: stringArray(value.evidenceIds, `panels[${index}].evidenceIds`, 100), claimIds: stringArray(value.claimIds, `panels[${index}].claimIds`, 100), semanticEvidence: normalizeSemanticEvidence(value.semanticEvidence ?? [], index)
  };
}

function normalizeSource(input: unknown, index: number): NonNullable<ScientificFigurePanel["source"]> {
  const value = object(input, `panels[${index}].source`); exactKeys(value, ["path", "sha256", "page"], `panels[${index}].source`);
  const hash = text(value.sha256, `panels[${index}].source.sha256`, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new ValidationError(`panels[${index}].source.sha256 must be a SHA-256 digest`);
  return { path: text(value.path, `panels[${index}].source.path`, 1000), sha256: hash, ...(value.page === undefined ? {} : { page: integer(value.page, `panels[${index}].source.page`, 1, 10000) }) };
}

function normalizeCrop(input: unknown, index: number): NonNullable<ScientificFigurePanel["crop"]> { const value = object(input, `panels[${index}].crop`); exactKeys(value, ["x", "y", "width", "height"], `panels[${index}].crop`); return { x: bounded(value.x, "crop.x", 0, 1), y: bounded(value.y, "crop.y", 0, 1), width: bounded(value.width, "crop.width", 0.0001, 1), height: bounded(value.height, "crop.height", 0.0001, 1) }; }

function normalizeEvidence(input: unknown): ScientificFigureProject["evidence"] { if (!Array.isArray(input) || input.length > 500) throw new ValidationError("evidence must be an array of at most 500 items"); return input.map((raw, index) => { const value = object(raw, `evidence[${index}]`); exactKeys(value, ["id", "citation", "sourceDigest", "approved", "kind", "claimIds"], `evidence[${index}]`); return { id: stableId(value.id, `evidence[${index}].id`), citation: text(value.citation, `evidence[${index}].citation`, 2000), ...(value.sourceDigest === undefined ? {} : { sourceDigest: digestText(value.sourceDigest, `evidence[${index}].sourceDigest`) }), approved: boolean(value.approved, `evidence[${index}].approved`), kind: oneOf(value.kind, ["litscout", "supplied_data", "hypothesis"] as const, `evidence[${index}].kind`), claimIds: stringArray(value.claimIds, `evidence[${index}].claimIds`, 100) }; }); }
function normalizeClaims(input: unknown, evidenceIds: Set<string>): ScientificFigureProject["claims"] { if (!Array.isArray(input) || input.length > 500) throw new ValidationError("claims must be an array of at most 500 items"); return input.map((raw, index) => { const value = object(raw, `claims[${index}]`); exactKeys(value, ["id", "text", "evidenceIds", "support", "uncertainty"], `claims[${index}]`); const ids = stringArray(value.evidenceIds, `claims[${index}].evidenceIds`, 100); for (const id of ids) if (!evidenceIds.has(id)) throw new ValidationError(`claim references unknown evidence id: ${id}`); const support = oneOf(value.support, ["evidence", "supplied_data", "hypothesis"] as const, `claims[${index}].support`); if (support !== "hypothesis" && ids.length === 0) throw new ValidationError(`claims[${index}] requires exact evidenceIds`); if (support === "hypothesis" && value.uncertainty === undefined) throw new ValidationError(`claims[${index}] hypothesis requires uncertainty`); return { id: stableId(value.id, `claims[${index}].id`), text: text(value.text, `claims[${index}].text`, 2000), evidenceIds: ids, support, ...(value.uncertainty === undefined ? {} : { uncertainty: text(value.uncertainty, `claims[${index}].uncertainty`, 1000) }) }; }); }
function normalizeSemanticEvidence(input: unknown, panelIndex: number): ScientificFigurePanel["semanticEvidence"] { if (!Array.isArray(input) || input.length > 500) throw new ValidationError(`panels[${panelIndex}].semanticEvidence must be an array of at most 500 items`); return input.map((raw, index) => { const value = object(raw, `panels[${panelIndex}].semanticEvidence[${index}]`); exactKeys(value, ["targetType", "targetId", "claimId", "support", "evidenceIds"], `panels[${panelIndex}].semanticEvidence[${index}]`); return { targetType: oneOf(value.targetType, ["object", "relationship", "quantitative_annotation", "label", "hypothesis"] as const, `panels[${panelIndex}].semanticEvidence[${index}].targetType`), targetId: stableId(value.targetId, `panels[${panelIndex}].semanticEvidence[${index}].targetId`), claimId: stableId(value.claimId, `panels[${panelIndex}].semanticEvidence[${index}].claimId`), support: oneOf(value.support, ["evidence", "supplied_data", "hypothesis"] as const, `panels[${panelIndex}].semanticEvidence[${index}].support`), evidenceIds: stringArray(value.evidenceIds, `panels[${panelIndex}].semanticEvidence[${index}].evidenceIds`, 100) }; }); }
function normalizeProvenance(input: unknown): ScientificFigureProject["provenance"] { if (!Array.isArray(input) || input.length > 500) throw new ValidationError("provenance must be an array of at most 500 items"); return input.map((raw, index) => { const value = object(raw, `provenance[${index}]`); exactKeys(value, ["kind", "id", "digest", "description"], `provenance[${index}]`); return { kind: text(value.kind, `provenance[${index}].kind`, 80), id: stableId(value.id, `provenance[${index}].id`), digest: digestText(value.digest, `provenance[${index}].digest`), ...(value.description === undefined ? {} : { description: text(value.description, `provenance[${index}].description`, 1000) }) }; }); }
function normalizeLegend(input: unknown, evidenceIds: Set<string>): NonNullable<ScientificFigureProject["sharedLegend"]> { if (!Array.isArray(input) || input.length > 64) throw new ValidationError("sharedLegend must be an array of at most 64 items"); return input.map((raw, index) => { const value = object(raw, `sharedLegend[${index}]`); exactKeys(value, ["id", "label", "color", "evidenceIds"], `sharedLegend[${index}]`); const ids = stringArray(value.evidenceIds, `sharedLegend[${index}].evidenceIds`, 100); for (const id of ids) if (!evidenceIds.has(id)) throw new ValidationError(`legend item references unknown evidence id: ${id}`); const color = value.color === undefined ? undefined : text(value.color, `sharedLegend[${index}].color`, 9); if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new ValidationError("legend color must be #RRGGBB"); return { id: stableId(value.id, `sharedLegend[${index}].id`), label: text(value.label, `sharedLegend[${index}].label`, 200), ...(color ? { color } : {}), evidenceIds: ids }; }); }

function normalizeOutputs(input: unknown): ScientificFigureProject["requestedOutputs"] { const required = ["svg", "pdf", "png", "semantic_json", "latex", "analysis", "manifest"]; if (!Array.isArray(input) || input.some((item) => typeof item !== "string")) throw new ValidationError("requestedOutputs must be an array of strings"); for (const item of required) if (!input.includes(item)) throw new ValidationError(`requestedOutputs must include ${item}`); return [...input] as ScientificFigureProject["requestedOutputs"]; }
function normalizeApprovals(input: unknown): ScientificFigureProject["approvals"] { const value = input === undefined ? {} : object(input, "approvals"); exactKeys(value, ["brief", "final"], "approvals"); return { ...(value.brief === undefined ? {} : { brief: normalizeApproval(value.brief, "approvals.brief") }), ...(value.final === undefined ? {} : { final: normalizeApproval(value.final, "approvals.final") }) }; }
function normalizeApproval(input: unknown, path: string): FigureApproval { const value = object(input, path); exactKeys(value, ["digest", "reviewer", "reviewedAt"], path); return { digest: digestText(value.digest, `${path}.digest`), reviewer: text(value.reviewer, `${path}.reviewer`, 200), reviewedAt: text(value.reviewedAt, `${path}.reviewedAt`, 100) }; }
function approval(digest: string, reviewer: string, reviewedAt: string): FigureApproval { return normalizeApproval({ digest, reviewer, reviewedAt }, "approval"); }
function assertApprovalState(project: ScientificFigureProject): void { if (["brief_approved", "rendering_analysis", "final_pending", "final_approved", "inserted"].includes(project.lifecycle) && !project.approvals.brief) throw new ValidationError(`${project.lifecycle} lifecycle requires brief approval`); if (["final_approved", "inserted"].includes(project.lifecycle) && !project.approvals.final) throw new ValidationError(`${project.lifecycle} lifecycle requires final approval`); }
function validatePanelGrid(panels: ScientificFigurePanel[], layout: ScientificFigureProject["layout"]): void { const occupied = new Map<string, string>(); for (const panel of panels) { if (panel.row + panel.rowSpan - 1 > layout.rows || panel.column + panel.columnSpan - 1 > layout.columns) throw new ValidationError(`panel ${panel.id} exceeds the layout grid`); for (let row = panel.row; row < panel.row + panel.rowSpan; row += 1) for (let column = panel.column; column < panel.column + panel.columnSpan; column += 1) { const key = `${row}:${column}`; if (occupied.has(key)) throw new ValidationError(`panel ${panel.id} overlaps panel ${occupied.get(key)}`); occupied.set(key, panel.id); } } }
function object(input: unknown, path: string): Record<string, unknown> { if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError(`${path} must be an object`); return input as Record<string, unknown>; }
function exactKeys(input: Record<string, unknown>, allowed: string[], path: string): void { const extras = Object.keys(input).filter((key) => !allowed.includes(key)); if (extras.length) throw new ValidationError(`${path} contains unsupported field(s): ${extras.join(", ")}`); }
function oneOf<T extends string>(input: unknown, values: readonly T[], path: string): T { if (typeof input !== "string" || !values.includes(input as T)) throw new ValidationError(`${path} must be ${values.join(", ")}`); return input as T; }
function text(input: unknown, path: string, max: number): string { if (typeof input !== "string" || input.trim().length < 1 || input.length > max) throw new ValidationError(`${path} must be a non-empty string of at most ${max} characters`); return input; }
function stableId(input: unknown, path: string): string { const value = text(input, path, 120); if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) throw new ValidationError(`${path} must be a stable identifier`); return value; }
function digestText(input: unknown, path: string): string { const value = text(input, path, 64).toLowerCase(); if (!/^[0-9a-f]{64}$/.test(value)) throw new ValidationError(`${path} must be a SHA-256 digest`); return value; }
function integer(input: unknown, path: string, min: number, max: number): number { if (!Number.isInteger(input) || (input as number) < min || (input as number) > max) throw new ValidationError(`${path} must be an integer from ${min} to ${max}`); return input as number; }
function bounded(input: unknown, path: string, min: number, max: number): number { if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) throw new ValidationError(`${path} must be from ${min} to ${max}`); return input; }
function boolean(input: unknown, path: string): boolean { if (typeof input !== "boolean") throw new ValidationError(`${path} must be a boolean`); return input; }
function stringArray(input: unknown, path: string, max: number): string[] { if (!Array.isArray(input) || input.length > max) throw new ValidationError(`${path} must be an array of at most ${max} ids`); return input.map((item, index) => stableId(item, `${path}[${index}]`)); }
function unique(values: string[], label: string): void { const seen = new Set<string>(); for (const value of values) { if (seen.has(value)) throw new ValidationError(`duplicate ${label}: ${value}`); seen.add(value); } }
function sha256(input: string | Buffer): string { return createHash("sha256").update(input).digest("hex"); }
function digestRecord(input: Record<string, string>, path: string): Record<string, string> { const result: Record<string, string> = {}; for (const [key, value] of Object.entries(input).sort(([a], [b]) => a.localeCompare(b))) result[stableId(key, `${path} key`)] = digestText(value, `${path}.${key}`); return result; }
export function canonicalJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (value && typeof value === "object") { const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)); return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`; } return JSON.stringify(value) ?? "null"; }
