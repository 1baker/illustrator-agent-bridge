import { createHash } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { ValidationError } from "../core/sceneValidation.js";
import type { VectorScene } from "../core/vectorScene.js";
import { canonicalJson, finalFigureDigest, normalizeScientificFigureProject, semanticFigureDigest, type ScientificFigureFinalApprovalEvidence } from "../scientific/figureProject.js";

export const PUBLICATION_FIGURE_REGISTRY_POLICY = "publication-figure-registry.v1" as const;

export interface PresentationGrammar {
  schemaVersion: "PresentationGrammar.v1";
  profile: "manuscript" | "proposal";
  intent: "mechanism" | "pathway" | "workflow" | "experimental_setup" | "concept";
  primitiveKinds: Array<"rect" | "ellipse" | "text" | "line" | "polygon" | "path" | "compound_path">;
  topology: { objectCount: number; relationshipCount: number; panelCount: number };
  palette: string[];
  strokeWidths: number[];
  fontSizes: number[];
  paintKinds: Array<"linear_gradient" | "radial_gradient">;
  flowDirection: "left_to_right" | "top_to_bottom";
  spacing: "compact" | "normal" | "open";
  aspectRatio: number;
  density: number;
  /** Content-stripped construction knowledge extracted only after final approval. */
  compositionArchetype?: "material_cross_section" | "cellular_cutaway" | "experimental_system" | "mechanism_landscape";
  depictionOperators?: string[];
  meanPartsPerObject?: number;
}

export interface PublicationFigureRegistryEntry {
  schemaVersion: "ApprovedFigureExample.v1";
  policyVersion: typeof PUBLICATION_FIGURE_REGISTRY_POLICY;
  id: string;
  revision: string;
  status: "active" | "revoked" | "superseded";
  source: { projectId: string; projectRevisionId: string; briefDigest: string; finalApprovalDigest: string };
  artifacts: { scene: string; tikz: string; svg: string; png: string; manifest: string; qa: string; analysis: string };
  grammar: PresentationGrammar;
  promotion: { reviewer: string; reviewedAt: string; reuseScope: "private" | "project" | "personal"; ownership: "owned" | "licensed"; privacy: "public" | "private"; digest: string };
  createdAt: string;
}

export interface RegistryPromotionInput {
  id: string;
  project: unknown;
  finalEvidence: ScientificFigureFinalApprovalEvidence;
  scene: VectorScene;
  tikz: string;
  svg: string;
  png: Buffer;
  manifest: unknown;
  analysis: unknown;
  qa: { ok: boolean; sha256: string; findings?: Array<{ severity?: string }> };
  intent: PresentationGrammar["intent"];
  promotion: Omit<PublicationFigureRegistryEntry["promotion"], "digest">;
}

interface RegistryIndex { schemaVersion: "PublicationFigureRegistryIndex.v1"; policyVersion: typeof PUBLICATION_FIGURE_REGISTRY_POLICY; entries: Array<{ id: string; revision: string; status: PublicationFigureRegistryEntry["status"]; entryDigest: string }>; }

export async function promotePublicationFigure(rootInput: string, input: RegistryPromotionInput): Promise<PublicationFigureRegistryEntry> {
  const root = safeRegistryRoot(rootInput);
  const project = normalizeScientificFigureProject(input.project);
  if (project.lifecycle !== "final_approved") throw new ValidationError("registry promotion requires final_approved lifecycle");
  if (project.approvals.brief?.digest !== semanticFigureDigest(project)) throw new ValidationError("registry promotion requires a current brief approval");
  if (project.approvals.final?.digest !== finalFigureDigest(project, input.finalEvidence)) throw new ValidationError("registry promotion requires a current final approval digest");
  if (!input.qa.ok || input.qa.findings?.some((item) => item.severity === "error")) throw new ValidationError("registry promotion requires passing publication QA");
  if (input.qa.sha256 !== input.finalEvidence.qaDigest) throw new ValidationError("registry promotion QA digest does not match final approval evidence");
  validatePromotion(input.promotion);
  if (!input.tikz.includes("\\begin{tikzpicture}")) throw new ValidationError("registry promotion requires an editable TikZ artifact");
  if (/<(?:script|image)\b/i.test(input.svg)) throw new ValidationError("registry promotion refuses active or raster-backed generated schematic SVG");
  const artifactBytes = {
    scene: Buffer.from(`${JSON.stringify(input.scene, null, 2)}\n`), tikz: Buffer.from(input.tikz), svg: Buffer.from(input.svg), png: input.png,
    manifest: Buffer.from(`${JSON.stringify(input.manifest, null, 2)}\n`), qa: Buffer.from(`${JSON.stringify(input.qa, null, 2)}\n`), analysis: Buffer.from(`${JSON.stringify(input.analysis, null, 2)}\n`)
  };
  const artifacts = Object.fromEntries(Object.entries(artifactBytes).map(([key, value]) => [key, sha256(value)])) as PublicationFigureRegistryEntry["artifacts"];
  for (const [key, approvedDigest] of Object.entries(input.finalEvidence.artifactDigests)) {
    const actual = artifacts[key as keyof typeof artifacts];
    if (actual !== undefined && actual !== approvedDigest) throw new ValidationError(`registry artifact ${key} does not match final approval evidence`);
  }
  if (artifacts.manifest !== input.finalEvidence.manifestDigest) throw new ValidationError("registry manifest does not match final approval evidence");
  if (artifacts.analysis !== input.finalEvidence.analysisDigest) throw new ValidationError("registry analysis does not match final approval evidence");
  const grammar = extractPresentationGrammar(input.scene, project.profile, project.panels.length, input.intent);
  const revision = sha256(canonicalJson({ source: { projectId: project.id, projectRevisionId: project.revisionId, briefDigest: project.approvals.brief.digest, finalApprovalDigest: project.approvals.final.digest }, artifacts, grammar }));
  const promotionPreimage = { id: stableId(input.id), revision, ...input.promotion, policyVersion: PUBLICATION_FIGURE_REGISTRY_POLICY };
  const entry: PublicationFigureRegistryEntry = {
    schemaVersion: "ApprovedFigureExample.v1", policyVersion: PUBLICATION_FIGURE_REGISTRY_POLICY, id: stableId(input.id), revision, status: "active",
    source: { projectId: project.id, projectRevisionId: project.revisionId, briefDigest: project.approvals.brief.digest, finalApprovalDigest: project.approvals.final.digest },
    artifacts, grammar, promotion: { ...input.promotion, digest: sha256(canonicalJson(promotionPreimage)) }, createdAt: input.promotion.reviewedAt
  };
  await withRegistryLock(root, async () => {
    await mkdir(join(root, "entries"), { recursive: true }); await mkdir(join(root, "blobs"), { recursive: true });
    for (const [kind, bytes] of Object.entries(artifactBytes)) await writeImmutable(join(root, "blobs", `${artifacts[kind as keyof typeof artifacts]}.${extension(kind)}`), bytes);
    const entryDigest = sha256(canonicalJson(entry));
    await writeImmutable(join(root, "entries", `${entryDigest}.json`), Buffer.from(`${JSON.stringify(entry, null, 2)}\n`));
    const index = await loadIndex(root);
    const existing = index.entries.find((item) => item.id === entry.id && item.status === "active");
    if (existing && existing.revision !== entry.revision) throw new ValidationError(`active registry id ${entry.id} already has a different revision`);
    if (!existing) index.entries.push({ id: entry.id, revision: entry.revision, status: entry.status, entryDigest });
    index.entries.sort((a, b) => a.id.localeCompare(b.id) || a.revision.localeCompare(b.revision));
    await atomicJson(join(root, "index.json"), index);
    await appendFile(join(root, "events.jsonl"), `${JSON.stringify({ event: "promoted", id: entry.id, revision, entryDigest, at: entry.createdAt, promotionDigest: entry.promotion.digest })}\n`, { encoding: "utf8", flag: "a" });
  });
  return entry;
}

export async function searchPublicationFigureRegistry(rootInput: string, query: { profile: "manuscript" | "proposal"; intent: PresentationGrammar["intent"]; primitiveKinds?: PresentationGrammar["primitiveKinds"]; depictionOperators?: string[]; limit?: number }): Promise<{ snapshotDigest: string; matches: Array<{ id: string; revision: string; score: number; grammar: PresentationGrammar }> }> {
  const root = safeRegistryRoot(rootInput);
  const index = await loadIndex(root);
  const matches: Array<{ id: string; revision: string; score: number; grammar: PresentationGrammar }> = [];
  for (const item of index.entries.filter((entry) => entry.status === "active")) {
    const path = join(root, "entries", `${item.entryDigest}.json`);
    const raw = await readFile(path, "utf8");
    if (sha256(canonicalJson(JSON.parse(raw))) !== item.entryDigest) throw new ValidationError(`registry entry ${item.id} digest mismatch`);
    const entry = JSON.parse(raw) as PublicationFigureRegistryEntry;
    if (entry.revision !== item.revision || entry.status !== "active") throw new ValidationError(`registry entry ${item.id} index mismatch`);
    if (entry.grammar.profile !== query.profile) continue;
    const requested = new Set(query.primitiveKinds ?? []);
    const common = entry.grammar.primitiveKinds.filter((kind) => requested.has(kind)).length;
    const requestedOperators = new Set((query.depictionOperators ?? []).map(safeGrammarToken));
    const commonOperators = (entry.grammar.depictionOperators ?? []).filter((operator) => requestedOperators.has(operator)).length;
    const score = (entry.grammar.intent === query.intent ? 100 : 20) + common * 5 + commonOperators * 8;
    matches.push({ id: entry.id, revision: entry.revision, score, grammar: entry.grammar });
  }
  matches.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id) || a.revision.localeCompare(b.revision));
  return { snapshotDigest: sha256(canonicalJson(index)), matches: matches.slice(0, Math.max(0, Math.min(query.limit ?? 5, 12))) };
}

export async function rebuildPublicationFigureRegistry(rootInput: string): Promise<{ entries: number; snapshotDigest: string }> {
  const root = safeRegistryRoot(rootInput);
  const entriesDir = join(root, "entries"); await mkdir(entriesDir, { recursive: true });
  const { readdir } = await import("node:fs/promises");
  const entries: RegistryIndex["entries"] = [];
  for (const name of (await readdir(entriesDir)).filter((value) => /^[0-9a-f]{64}\.json$/.test(value)).sort()) {
    const raw = await readFile(join(entriesDir, name), "utf8"); const entry = JSON.parse(raw) as PublicationFigureRegistryEntry;
    if (sha256(canonicalJson(entry)) !== name.slice(0, 64)) throw new ValidationError(`registry entry ${name} digest mismatch`);
    entries.push({ id: entry.id, revision: entry.revision, status: entry.status, entryDigest: name.slice(0, 64) });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id) || a.revision.localeCompare(b.revision));
  const index: RegistryIndex = { schemaVersion: "PublicationFigureRegistryIndex.v1", policyVersion: PUBLICATION_FIGURE_REGISTRY_POLICY, entries };
  await atomicJson(join(root, "index.json"), index);
  return { entries: entries.length, snapshotDigest: sha256(canonicalJson(index)) };
}

export function extractPresentationGrammar(scene: VectorScene, profile: "manuscript" | "proposal", panelCount: number, intent: PresentationGrammar["intent"]): PresentationGrammar {
  const colors = new Set<string>(); const strokes = new Set<number>(); const fonts = new Set<number>();
  for (const element of scene.elements) {
    for (const color of [element.style?.fill, element.style?.stroke]) if (typeof color === "string") colors.add(color.toUpperCase());
    if (element.style?.strokeWidth !== undefined) strokes.add(element.style.strokeWidth);
    if (element.type === "text") fonts.add(element.size ?? 18);
  }
  for (const paint of scene.paints ?? []) for (const stop of paint.stops) colors.add(stop.color.toUpperCase());
  const width = scene.document?.width ?? 720, height = scene.document?.height ?? 480;
  const semanticObjects = scene.semantics?.objects ?? [];
  const depictionOperators = [...new Set(semanticObjects.map((object) => object.properties?.depictionOperator).filter((value): value is string => typeof value === "string").map(safeGrammarToken))].sort();
  const meanPartsPerObject = semanticObjects.length ? Number((semanticObjects.reduce((sum, object) => sum + object.elementIds.length, 0) / semanticObjects.length).toFixed(3)) : 0;
  return {
    schemaVersion: "PresentationGrammar.v1", profile, intent,
    primitiveKinds: [...new Set(scene.elements.map((element) => element.type))].sort() as PresentationGrammar["primitiveKinds"],
    topology: { objectCount: scene.semantics?.objects.length ?? 0, relationshipCount: scene.semantics?.relationships?.length ?? 0, panelCount },
    palette: [...colors].sort(), strokeWidths: [...strokes].sort((a, b) => a - b), fontSizes: [...fonts].sort((a, b) => a - b),
    paintKinds: [...new Set((scene.paints ?? []).map((paint) => paint.type))].sort() as PresentationGrammar["paintKinds"],
    flowDirection: inferFlow(scene), spacing: scene.elements.length / Math.max(1, width * height) * 100_000 > 8 ? "compact" : scene.elements.length / Math.max(1, width * height) * 100_000 < 3 ? "open" : "normal",
    aspectRatio: Number((width / height).toFixed(6)), density: Number((scene.elements.length / Math.max(1, width * height) * 100_000).toFixed(6)),
    compositionArchetype: inferCompositionArchetype(depictionOperators), depictionOperators, meanPartsPerObject
  };
}

function inferCompositionArchetype(operators: string[]): NonNullable<PresentationGrammar["compositionArchetype"]> {
  if (operators.some((value) => /material|interphase|surface_lattice|depth_dependent/.test(value))) return "material_cross_section";
  if (operators.some((value) => /cellular|receptor|nucleic|bilayer|protein/.test(value))) return "cellular_cutaway";
  if (operators.some((value) => /instrument|stimulus/.test(value))) return "experimental_system";
  return "mechanism_landscape";
}

function safeGrammarToken(value: string): string { const normalized = value.trim().toLowerCase(); if (!/^[a-z][a-z0-9_:-]{0,79}$/.test(normalized)) throw new ValidationError("presentation grammar contains an invalid depiction operator"); return normalized; }

function inferFlow(scene: VectorScene): "left_to_right" | "top_to_bottom" { const elements = new Map(scene.elements.map((element) => [element.id, element])); let horizontal = 0, vertical = 0; for (const relation of scene.semantics?.relationships ?? []) for (const id of relation.visualElementIds ?? []) { const element = elements.get(id); if (element?.type === "line") { horizontal += Math.abs(element.x2 - element.x); vertical += Math.abs(element.y2 - element.y); } } return vertical > horizontal ? "top_to_bottom" : "left_to_right"; }

function validatePromotion(value: RegistryPromotionInput["promotion"]): void { text(value.reviewer, "promotion.reviewer", 200); text(value.reviewedAt, "promotion.reviewedAt", 100); if (!Number.isFinite(Date.parse(value.reviewedAt))) throw new ValidationError("promotion.reviewedAt must be an ISO date-time"); if (!["private", "project", "personal"].includes(value.reuseScope)) throw new ValidationError("invalid promotion reuseScope"); if (!["owned", "licensed"].includes(value.ownership)) throw new ValidationError("registry promotion requires owned or licensed artwork"); if (!["public", "private"].includes(value.privacy)) throw new ValidationError("invalid promotion privacy"); }
function safeRegistryRoot(value: string): string { if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new ValidationError("registry root is required"); const result = resolve(value); if (result === "/" || result === resolve("/home") || basename(result) === "..") throw new ValidationError("registry root is too broad"); return result; }
async function loadIndex(root: string): Promise<RegistryIndex> { try { const value = JSON.parse(await readFile(join(root, "index.json"), "utf8")) as RegistryIndex; if (value.schemaVersion !== "PublicationFigureRegistryIndex.v1" || value.policyVersion !== PUBLICATION_FIGURE_REGISTRY_POLICY || !Array.isArray(value.entries)) throw new ValidationError("registry index has an unsupported schema"); return value; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: "PublicationFigureRegistryIndex.v1", policyVersion: PUBLICATION_FIGURE_REGISTRY_POLICY, entries: [] }; throw error; } }
async function atomicJson(path: string, value: unknown): Promise<void> { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); await rename(temporary, path); }
async function writeImmutable(path: string, value: Buffer): Promise<void> { try { await writeFile(path, value, { flag: "wx" }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; const current = await readFile(path); if (!current.equals(value)) throw new ValidationError(`content-addressed registry collision at ${basename(path)}`); } }
async function withRegistryLock<T>(root: string, operation: () => Promise<T>): Promise<T> { await mkdir(root, { recursive: true }); const lockPath = join(root, ".promotion.lock"); let handle; try { handle = await open(lockPath, "wx"); return await operation(); } catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ValidationError("registry is locked by another promotion"); throw error; } finally { await handle?.close(); await rm(lockPath, { force: true }); } }
function extension(kind: string): string { return kind === "scene" || kind === "manifest" || kind === "qa" || kind === "analysis" ? "json" : kind === "tikz" ? "tex" : kind; }
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function stableId(value: unknown): string { const result = text(value, "registry id", 120); if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(result)) throw new ValidationError("registry id must be stable"); return result; }
function text(value: unknown, path: string, maximum: number): string { if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new ValidationError(`${path} must be a non-empty string of at most ${maximum} characters`); return value; }
