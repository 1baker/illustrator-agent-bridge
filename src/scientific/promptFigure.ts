import { createHash } from "node:crypto";
import { ValidationError } from "../core/sceneValidation.js";
import { canonicalJson } from "./figureProject.js";

export type PromptFigureProfile = "manuscript" | "proposal";
export type PromptFigurePlannerMode = "manual" | "openai" | "auto";

export interface ScientificPromptFigureRequest {
  schemaVersion: "ScientificPromptFigureRequest.v1";
  id: string;
  prompt: string;
  profile: PromptFigureProfile;
  size: { preset: "manuscript_single_column" | "manuscript_double_column" | "proposal_half_width" | "proposal_full_width" | "custom"; widthMm?: number; heightMm?: number; dpi?: number };
  intent: "mechanism" | "pathway" | "workflow" | "experimental_setup" | "concept";
  evidence: Array<{ id: string; title?: string; text: string; citation?: string; sourceDigest: string; approved: boolean }>;
  claimPolicy: "evidence_only" | "allow_explicit_hypotheses";
  planner: PromptFigurePlannerMode;
  presentation: { direction?: "left_to_right" | "top_to_bottom"; spacing?: "compact" | "normal" | "open"; density?: "sparse" | "balanced" | "dense" };
  registry: { mode: "disabled" | "approved_only"; limit: number };
}

export function normalizeScientificPromptFigureRequest(input: unknown): ScientificPromptFigureRequest {
  const value = record(input, "scientific prompt figure request");
  exact(value, ["schemaVersion", "id", "prompt", "profile", "size", "intent", "evidence", "claimPolicy", "planner", "presentation", "registry"], "scientific prompt figure request");
  if (value.schemaVersion !== "ScientificPromptFigureRequest.v1") throw new ValidationError("scientific prompt figure request.schemaVersion must be ScientificPromptFigureRequest.v1");
  const profile = oneOf(value.profile, ["manuscript", "proposal"] as const, "profile");
  const sizeValue = record(value.size, "size");
  exact(sizeValue, ["preset", "widthMm", "heightMm", "dpi"], "size");
  const preset = oneOf(sizeValue.preset, ["manuscript_single_column", "manuscript_double_column", "proposal_half_width", "proposal_full_width", "custom"] as const, "size.preset");
  if ((preset.startsWith("manuscript_") ? "manuscript" : preset.startsWith("proposal_") ? "proposal" : profile) !== profile) throw new ValidationError(`size preset ${preset} is not valid for ${profile}`);
  if (preset === "custom" && (sizeValue.widthMm === undefined || sizeValue.heightMm === undefined)) throw new ValidationError("custom size requires widthMm and heightMm");
  const evidenceValue = array(value.evidence, "evidence", 200);
  const evidence = evidenceValue.map((item, index) => {
    const entry = record(item, `evidence[${index}]`);
    exact(entry, ["id", "title", "text", "citation", "sourceDigest", "approved"], `evidence[${index}]`);
    return {
      id: stableId(entry.id, `evidence[${index}].id`),
      ...(entry.title === undefined ? {} : { title: text(entry.title, `evidence[${index}].title`, 500) }),
      text: text(entry.text, `evidence[${index}].text`, 20_000),
      ...(entry.citation === undefined ? {} : { citation: text(entry.citation, `evidence[${index}].citation`, 2_000) }),
      sourceDigest: digest(entry.sourceDigest, `evidence[${index}].sourceDigest`),
      approved: bool(entry.approved, `evidence[${index}].approved`)
    };
  });
  if (new Set(evidence.map((item) => item.id)).size !== evidence.length) throw new ValidationError("evidence ids must be unique");
  const presentationValue = value.presentation === undefined ? {} : record(value.presentation, "presentation");
  exact(presentationValue, ["direction", "spacing", "density"], "presentation");
  const registryValue = record(value.registry, "registry");
  exact(registryValue, ["mode", "limit"], "registry");
  return {
    schemaVersion: "ScientificPromptFigureRequest.v1",
    id: stableId(value.id, "id"),
    prompt: guardedPrompt(value.prompt),
    profile,
    size: {
      preset,
      ...(sizeValue.widthMm === undefined ? {} : { widthMm: bounded(sizeValue.widthMm, "size.widthMm", 20, 600) }),
      ...(sizeValue.heightMm === undefined ? {} : { heightMm: bounded(sizeValue.heightMm, "size.heightMm", 20, 600) }),
      ...(sizeValue.dpi === undefined ? {} : { dpi: integer(sizeValue.dpi, "size.dpi", 72, 1200) })
    },
    intent: oneOf(value.intent, ["mechanism", "pathway", "workflow", "experimental_setup", "concept"] as const, "intent"),
    evidence,
    claimPolicy: oneOf(value.claimPolicy, ["evidence_only", "allow_explicit_hypotheses"] as const, "claimPolicy"),
    planner: oneOf(value.planner, ["manual", "openai", "auto"] as const, "planner"),
    presentation: {
      ...(presentationValue.direction === undefined ? {} : { direction: oneOf(presentationValue.direction, ["left_to_right", "top_to_bottom"] as const, "presentation.direction") }),
      ...(presentationValue.spacing === undefined ? {} : { spacing: oneOf(presentationValue.spacing, ["compact", "normal", "open"] as const, "presentation.spacing") }),
      ...(presentationValue.density === undefined ? {} : { density: oneOf(presentationValue.density, ["sparse", "balanced", "dense"] as const, "presentation.density") })
    },
    registry: { mode: oneOf(registryValue.mode, ["disabled", "approved_only"] as const, "registry.mode"), limit: integer(registryValue.limit, "registry.limit", 0, 12) }
  };
}

export function scientificPromptFigureRequestDigest(input: unknown): string {
  return createHash("sha256").update(canonicalJson(normalizeScientificPromptFigureRequest(input))).digest("hex");
}

function guardedPrompt(input: unknown): string {
  const value = text(input, "prompt", 12_000);
  if (/\b(?:fabricate|invent|make up)\b[^.]{0,80}\b(?:data|results?|measurements?|conversion|yield)\b/i.test(value)) throw new ValidationError("prompt requests fabricated scientific data or results");
  return value;
}
function record(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${path} must be an object`); return value as Record<string, unknown>; }
function exact(value: Record<string, unknown>, allowed: string[], path: string): void { const extras = Object.keys(value).filter((key) => !allowed.includes(key)); if (extras.length) throw new ValidationError(`${path} contains unsupported field(s): ${extras.join(", ")}`); }
function array(value: unknown, path: string, maximum: number): unknown[] { if (!Array.isArray(value) || value.length > maximum) throw new ValidationError(`${path} must be an array of at most ${maximum} items`); return value; }
function text(value: unknown, path: string, maximum: number): string { if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new ValidationError(`${path} must be a non-empty string of at most ${maximum} characters`); return value; }
function stableId(value: unknown, path: string): string { const result = text(value, path, 120); if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(result)) throw new ValidationError(`${path} must be a stable identifier`); return result; }
function digest(value: unknown, path: string): string { const result = text(value, path, 64).toLowerCase(); if (!/^[0-9a-f]{64}$/.test(result)) throw new ValidationError(`${path} must be a SHA-256 digest`); return result; }
function bool(value: unknown, path: string): boolean { if (typeof value !== "boolean") throw new ValidationError(`${path} must be a boolean`); return value; }
function bounded(value: unknown, path: string, minimum: number, maximum: number): number { if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new ValidationError(`${path} must be between ${minimum} and ${maximum}`); return value; }
function integer(value: unknown, path: string, minimum: number, maximum: number): number { if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new ValidationError(`${path} must be an integer between ${minimum} and ${maximum}`); return value as number; }
function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T { if (typeof value !== "string" || !allowed.includes(value as T)) throw new ValidationError(`${path} must be one of ${allowed.join(", ")}`); return value as T; }
