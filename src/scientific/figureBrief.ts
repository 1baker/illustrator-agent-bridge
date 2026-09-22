import { ValidationError } from "../core/sceneValidation.js";
import type { ScientificFigureSpec } from "./figureCompiler.js";
import { planScientificStory, type ScientificStorySpec } from "./storyPlanner.js";

export type FigureBriefSourceMode = "text" | "sketch_notes" | "reference_notes";
export type FigureBriefAudience = "journal" | "presentation";
export type FigureBriefIntent = "mechanism" | "pathway" | "workflow" | "experimental_setup";

export interface ScientificFigureBriefCompilation {
  story: ScientificStorySpec;
  figure: ScientificFigureSpec;
  audit: {
    sourceMode: FigureBriefSourceMode;
    audience: FigureBriefAudience;
    intent: FigureBriefIntent;
    appliedRefinements: Array<{ index: number; operation: string; targetId?: string }>;
    profile?: "manuscript" | "proposal";
    claims: Array<{ id: string; text: string; evidenceIds: string[]; uncertainty?: string }>;
    evidence: Array<{ id: string; citation: string }>;
    panels: Array<Record<string, unknown>>;
    requestedAnalysis: Array<Record<string, unknown>>;
  };
}

/**
 * Turn a reviewed, provider-neutral figure brief into the typed story contract.
 * A model may prepare the brief, but deterministic validation and compilation
 * remain the authority for geometry, semantics, and editable exports.
 */
export function compileScientificFigureBrief(input: unknown): ScientificFigureBriefCompilation {
  const value = record(input, "scientific figure brief");
  exactKeys(value, ["schemaVersion", "source", "brief", "components", "relationships", "refinements", "profile", "dimensions", "claims", "evidence", "panels", "requestedAnalysis"], "scientific figure brief");
  if (value.schemaVersion !== 1) throw new ValidationError("scientific figure brief.schemaVersion must be 1");

  const source = normalizeSource(value.source);
  const brief = normalizeBrief(value.brief);
  if (!Array.isArray(value.components) || value.components.length === 0 || value.components.length > 24) {
    throw new ValidationError("scientific figure brief.components must contain 1 to 24 components");
  }
  const components = value.components.map((item, index) => ({ ...record(item, `scientific figure brief.components[${index}]`) }));
  const relationships = value.relationships === undefined
    ? []
    : array(value.relationships, "scientific figure brief.relationships", 60).map((item, index) => ({ ...record(item, `scientific figure brief.relationships[${index}]`) }));
  const refinements = value.refinements === undefined ? [] : array(value.refinements, "scientific figure brief.refinements", 24);
  const evidence = value.evidence === undefined ? [] : array(value.evidence, "scientific figure brief.evidence", 200).map((item, index) => {
    const entry = record(item, `scientific figure brief.evidence[${index}]`);
    return { id: stableId(entry.id, `scientific figure brief.evidence[${index}].id`), citation: text(entry.citation, `scientific figure brief.evidence[${index}].citation`, 2000) };
  });
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const claims = value.claims === undefined ? [] : array(value.claims, "scientific figure brief.claims", 200).map((item, index) => {
    const entry = record(item, `scientific figure brief.claims[${index}]`);
    const ids = array(entry.evidenceIds, `scientific figure brief.claims[${index}].evidenceIds`, 100).map((id, idIndex) => stableId(id, `scientific figure brief.claims[${index}].evidenceIds[${idIndex}]`));
    for (const id of ids) if (!evidenceIds.has(id)) throw new ValidationError(`scientific figure brief claim references unknown evidence: ${id}`);
    return { id: stableId(entry.id, `scientific figure brief.claims[${index}].id`), text: text(entry.text, `scientific figure brief.claims[${index}].text`, 2000), evidenceIds: ids, ...(entry.uncertainty === undefined ? {} : { uncertainty: text(entry.uncertainty, `scientific figure brief.claims[${index}].uncertainty`, 1000) }) };
  });
  const panels = value.panels === undefined ? [] : array(value.panels, "scientific figure brief.panels", 24).map((item, index) => ({ ...record(item, `scientific figure brief.panels[${index}]`) }));
  const requestedAnalysis = value.requestedAnalysis === undefined ? [] : array(value.requestedAnalysis, "scientific figure brief.requestedAnalysis", 24).map((item, index) => ({ ...record(item, `scientific figure brief.requestedAnalysis[${index}]`) }));
  const presentation: Record<string, unknown> = { direction: brief.direction, spacing: brief.spacing };
  const appliedRefinements: Array<{ index: number; operation: string; targetId?: string }> = [];

  refinements.forEach((item, index) => {
    const refinement = record(item, `scientific figure brief.refinements[${index}]`);
    const operation = text(refinement.operation, `scientific figure brief.refinements[${index}].operation`, 40);
    if (operation === "rename_component") {
      exactKeys(refinement, ["operation", "componentId", "label"], `scientific figure brief.refinements[${index}]`);
      const componentId = stableId(refinement.componentId, `scientific figure brief.refinements[${index}].componentId`);
      findById(components, componentId, "component").label = text(refinement.label, `scientific figure brief.refinements[${index}].label`, 160);
      appliedRefinements.push({ index, operation, targetId: componentId });
      return;
    }
    if (operation === "set_emphasis") {
      exactKeys(refinement, ["operation", "componentId", "emphasis"], `scientific figure brief.refinements[${index}]`);
      const componentId = stableId(refinement.componentId, `scientific figure brief.refinements[${index}].componentId`);
      findById(components, componentId, "component").emphasis = oneOf(refinement.emphasis, ["primary", "secondary"], `scientific figure brief.refinements[${index}].emphasis`);
      appliedRefinements.push({ index, operation, targetId: componentId });
      return;
    }
    if (operation === "rename_relationship") {
      exactKeys(refinement, ["operation", "relationshipId", "label"], `scientific figure brief.refinements[${index}]`);
      const relationshipId = stableId(refinement.relationshipId, `scientific figure brief.refinements[${index}].relationshipId`);
      findById(relationships, relationshipId, "relationship").label = text(refinement.label, `scientific figure brief.refinements[${index}].label`, 160);
      appliedRefinements.push({ index, operation, targetId: relationshipId });
      return;
    }
    if (operation === "set_layout") {
      exactKeys(refinement, ["operation", "direction", "spacing"], `scientific figure brief.refinements[${index}]`);
      if (refinement.direction === undefined && refinement.spacing === undefined) {
        throw new ValidationError(`scientific figure brief.refinements[${index}] must set direction or spacing`);
      }
      if (refinement.direction !== undefined) presentation.direction = oneOf(refinement.direction, ["left_to_right", "top_to_bottom"], `scientific figure brief.refinements[${index}].direction`);
      if (refinement.spacing !== undefined) presentation.spacing = oneOf(refinement.spacing, ["compact", "normal", "open"], `scientific figure brief.refinements[${index}].spacing`);
      appliedRefinements.push({ index, operation });
      return;
    }
    throw new ValidationError(`scientific figure brief.refinements[${index}].operation must be rename_component, set_emphasis, rename_relationship, or set_layout`);
  });

  const story: ScientificStorySpec = {
    schemaVersion: 1,
    document: {
      title: brief.title,
      ...(brief.subtitle === undefined ? {} : { subtitle: brief.subtitle }),
      ...(brief.width === undefined ? {} : { width: brief.width }),
      ...(brief.height === undefined ? {} : { height: brief.height })
    },
    entities: components as unknown as ScientificStorySpec["entities"],
    interactions: relationships as unknown as ScientificStorySpec["interactions"],
    presentation: presentation as ScientificStorySpec["presentation"]
  };
  const figure = planScientificStory(story);
  return {
    story,
    figure,
    audit: {
      sourceMode: source.mode,
      audience: brief.audience,
      intent: brief.intent,
      appliedRefinements,
      ...(value.profile === undefined ? {} : { profile: oneOf(value.profile, ["manuscript", "proposal"], "scientific figure brief.profile") as "manuscript" | "proposal" }),
      claims, evidence, panels, requestedAnalysis
    }
  };
}

function normalizeSource(input: unknown): { mode: FigureBriefSourceMode; description: string; notes: string[] } {
  const value = record(input, "scientific figure brief.source");
  exactKeys(value, ["mode", "description", "notes"], "scientific figure brief.source");
  const notes = value.notes === undefined ? [] : array(value.notes, "scientific figure brief.source.notes", 20).map((item, index) => text(item, `scientific figure brief.source.notes[${index}]`, 300));
  return {
    mode: oneOf(value.mode, ["text", "sketch_notes", "reference_notes"], "scientific figure brief.source.mode") as FigureBriefSourceMode,
    description: text(value.description, "scientific figure brief.source.description", 1000),
    notes
  };
}

function normalizeBrief(input: unknown): {
  title: string; subtitle?: string; audience: FigureBriefAudience; intent: FigureBriefIntent;
  width?: number; height?: number; direction: "left_to_right" | "top_to_bottom"; spacing: "compact" | "normal" | "open";
} {
  const value = record(input, "scientific figure brief.brief");
  exactKeys(value, ["title", "subtitle", "audience", "intent", "width", "height", "direction", "spacing"], "scientific figure brief.brief");
  return {
    title: text(value.title, "scientific figure brief.brief.title", 160),
    ...(value.subtitle === undefined ? {} : { subtitle: text(value.subtitle, "scientific figure brief.brief.subtitle", 300) }),
    audience: oneOf(value.audience, ["journal", "presentation"], "scientific figure brief.brief.audience") as FigureBriefAudience,
    intent: oneOf(value.intent, ["mechanism", "pathway", "workflow", "experimental_setup"], "scientific figure brief.brief.intent") as FigureBriefIntent,
    ...(value.width === undefined ? {} : { width: dimension(value.width, "scientific figure brief.brief.width", 500) }),
    ...(value.height === undefined ? {} : { height: dimension(value.height, "scientific figure brief.brief.height", 400) }),
    direction: oneOf(value.direction, ["left_to_right", "top_to_bottom"], "scientific figure brief.brief.direction", "left_to_right") as "left_to_right" | "top_to_bottom",
    spacing: oneOf(value.spacing, ["compact", "normal", "open"], "scientific figure brief.brief.spacing", "normal") as "compact" | "normal" | "open"
  };
}

function findById(items: Array<Record<string, unknown>>, id: string, kind: string): Record<string, unknown> {
  const found = items.find((item) => item.id === id);
  if (!found) throw new ValidationError(`scientific figure brief refinement references unknown ${kind}: ${id}`);
  return found;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new ValidationError(`${path} must be an array of at most ${maximum} items`);
  return value;
}
function exactKeys(value: Record<string, unknown>, allowed: string[], path: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new ValidationError(`${path} contains unsupported field(s): ${extras.join(", ")}`);
}
function text(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) throw new ValidationError(`${path} must be a non-empty string of at most ${maximum} characters`);
  return value;
}
function stableId(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) throw new ValidationError(`${path} must be a stable identifier`);
  return value;
}
function dimension(value: unknown, path: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > 14400) throw new ValidationError(`${path} must be between ${minimum} and 14400`);
  return value;
}
function oneOf<T extends string>(value: unknown, choices: readonly T[], path: string, fallback?: T): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !choices.includes(value as T)) throw new ValidationError(`${path} must be one of ${choices.join(", ")}`);
  return value as T;
}
