import { ValidationError } from "../core/sceneValidation.js";
import type { ScientificFigureObjectSpec, ScientificFigureRelationshipSpec, ScientificFigureSpec } from "./figureCompiler.js";
import type { ScientificSymbolRecipeId } from "./symbolRegistry.js";

export type ScientificEntityType =
  | "molecule" | "receptor" | "protein" | "process" | "cell" | "nucleus" | "generic"
  | "dna" | "rna" | "membrane" | "organelle" | "particle" | "apparatus"
  | "material" | "transformation" | "interface" | "surface" | "stimulus" | "inset";
export type ScientificInteractionType = "activates" | "inhibits" | "binds_to" | "transports_to" | "converts_to" | "associates_with" | "regulates" | "contains" | "measures" | "flows_to" | "illuminates" | "captures";
export type ScientificStorySpacing = "compact" | "normal" | "open";

export interface ScientificStoryEntity {
  id: string;
  type: ScientificEntityType;
  label: string;
  kind?: string;
  emphasis?: "primary" | "secondary";
}

export interface ScientificStoryInteraction {
  id: string;
  sourceId: string;
  type: ScientificInteractionType;
  targetId: string;
  label?: string;
}

export interface ScientificStorySpec {
  schemaVersion: 1;
  document: {
    title: string;
    subtitle?: string;
    width?: number;
    height?: number;
  };
  entities: ScientificStoryEntity[];
  interactions?: ScientificStoryInteraction[];
  presentation?: {
    direction?: "left_to_right" | "top_to_bottom";
    spacing?: ScientificStorySpacing;
  };
}

const ENTITY_VISUALS: Record<ScientificEntityType, { recipe: ScientificSymbolRecipeId; width: number; height: number }> = {
  molecule: { recipe: "molecule", width: 110, height: 76 },
  receptor: { recipe: "receptor", width: 150, height: 110 },
  protein: { recipe: "protein", width: 140, height: 90 },
  process: { recipe: "process", width: 160, height: 80 },
  cell: { recipe: "cell", width: 220, height: 150 },
  nucleus: { recipe: "nucleus", width: 170, height: 125 },
  generic: { recipe: "generic", width: 140, height: 84 },
  dna: { recipe: "dna", width: 190, height: 105 },
  rna: { recipe: "rna", width: 180, height: 95 },
  membrane: { recipe: "membrane", width: 220, height: 105 },
  organelle: { recipe: "organelle", width: 190, height: 125 },
  particle: { recipe: "particle", width: 135, height: 115 },
  apparatus: { recipe: "apparatus", width: 165, height: 155 },
  material: { recipe: "material", width: 180, height: 150 },
  transformation: { recipe: "transformation", width: 150, height: 145 },
  interface: { recipe: "interface", width: 190, height: 150 },
  surface: { recipe: "surface", width: 160, height: 145 },
  stimulus: { recipe: "stimulus", width: 140, height: 110 },
  inset: { recipe: "inset", width: 190, height: 170 }
};

const SPACING: Record<ScientificStorySpacing, { rankGap: number; nodeGap: number; routeClearance: number }> = {
  compact: { rankGap: 110, nodeGap: 54, routeClearance: 14 },
  normal: { rankGap: 150, nodeGap: 82, routeClearance: 18 },
  open: { rankGap: 190, nodeGap: 110, routeClearance: 24 }
};

/** Convert scientific content intent into a coordinate-free compiler specification. */
export function planScientificStory(input: unknown): ScientificFigureSpec {
  const story = normalizeStory(input);
  const spacing = SPACING[story.presentation.spacing];
  return {
    schemaVersion: 1,
    document: {
      title: story.document.title,
      ...(story.document.subtitle === undefined ? {} : { subtitle: story.document.subtitle }),
      width: story.document.width ?? 1400,
      height: story.document.height ?? 800
    },
    objects: story.entities.map(planEntity),
    relationships: story.interactions.map(planInteraction),
    settings: {
      layoutMode: "layered",
      layoutDirection: story.presentation.direction,
      rankGap: spacing.rankGap,
      nodeGap: spacing.nodeGap,
      routeClearance: spacing.routeClearance
    }
  };
}

interface NormalizedStory {
  document: { title: string; subtitle?: string; width?: number; height?: number };
  entities: ScientificStoryEntity[];
  interactions: ScientificStoryInteraction[];
  presentation: { direction: "left_to_right" | "top_to_bottom"; spacing: ScientificStorySpacing };
}

function planEntity(entity: ScientificStoryEntity): ScientificFigureObjectSpec {
  const visual = ENTITY_VISUALS[entity.type];
  const depictionRole = entity.type === "material" || entity.type === "transformation" || entity.type === "interface" || entity.type === "surface" || entity.type === "stimulus" || entity.type === "inset";
  const labelWidth = entity.type === "molecule" || depictionRole ? visual.width : Math.min(280, entity.label.length * 9 + 30);
  const compartment = entity.type === "cell" || entity.type === "nucleus";
  const secondaryByDefault = entity.type === "receptor" || entity.type === "protein" || entity.type === "membrane" || entity.type === "organelle" || entity.type === "apparatus";
  const externalLabel = entity.type === "dna" || entity.type === "rna" || entity.type === "membrane" || entity.type === "organelle" || entity.type === "particle" || entity.type === "apparatus" || entity.type === "material" || entity.type === "transformation" || entity.type === "interface" || entity.type === "surface" || entity.type === "stimulus" || entity.type === "inset";
  return {
    id: entity.id,
    kind: entity.kind ?? entity.type,
    label: entity.label,
    width: Math.max(visual.width, labelWidth),
    height: visual.height,
    recipe: visual.recipe,
    shape: entity.type === "molecule" || entity.type === "organelle" || entity.type === "particle" || compartment ? "ellipse" : "rect",
    styleRole: compartment ? "compartment" : entity.emphasis === "secondary" || (entity.emphasis === undefined && secondaryByDefault) ? "secondary_object" : "primary_object",
    ...(externalLabel ? { labelPositions: ["bottom", "top", "right", "left"] } : {})
  };
}

function planInteraction(interaction: ScientificStoryInteraction): ScientificFigureRelationshipSpec {
  return {
    id: interaction.id,
    sourceObjectId: interaction.sourceId,
    predicate: interaction.type,
    targetObjectId: interaction.targetId,
    ...(interaction.label === undefined ? {} : { label: interaction.label }),
    role: interactionRole(interaction.type)
  };
}

function interactionRole(type: ScientificInteractionType): ScientificFigureRelationshipSpec["role"] {
  if (type === "inhibits") return "inhibition";
  if (type === "binds_to" || type === "associates_with") return "association";
  if (type === "transports_to" || type === "flows_to" || type === "contains") return "transport";
  if (type === "converts_to") return "conversion";
  if (type === "measures" || type === "captures") return "association";
  return "activation";
}

function normalizeStory(input: unknown): NormalizedStory {
  const value = record(input, "scientific story");
  if (value.schemaVersion !== 1) throw new ValidationError("scientific story.schemaVersion must be 1");
  const document = record(value.document, "scientific story.document");
  if (!Array.isArray(value.entities) || value.entities.length === 0 || value.entities.length > 24) {
    throw new ValidationError("scientific story.entities must contain 1 to 24 entities");
  }
  const entities = value.entities.map((item, index) => normalizeEntity(item, `scientific story.entities[${index}]`));
  unique(entities, "scientific story entity");
  const entityIds = new Set(entities.map((entity) => entity.id));
  const interactions = value.interactions === undefined ? [] : normalizeInteractions(value.interactions, entityIds);
  const presentation = value.presentation === undefined ? {} : record(value.presentation, "scientific story.presentation");
  return {
    document: {
      title: textValue(document.title, "scientific story.document.title", 160),
      ...(document.subtitle === undefined ? {} : { subtitle: textValue(document.subtitle, "scientific story.document.subtitle", 300) }),
      ...(document.width === undefined ? {} : { width: dimension(document.width, "scientific story.document.width", 500) }),
      ...(document.height === undefined ? {} : { height: dimension(document.height, "scientific story.document.height", 400) })
    },
    entities,
    interactions,
    presentation: {
      direction: enumValue(presentation.direction, ["left_to_right", "top_to_bottom"], "scientific story.presentation.direction", "left_to_right"),
      spacing: enumValue(presentation.spacing, ["compact", "normal", "open"], "scientific story.presentation.spacing", "normal")
    }
  };
}

function normalizeEntity(input: unknown, path: string): ScientificStoryEntity {
  const value = record(input, path);
  return {
    id: stableId(value.id, `${path}.id`),
    type: enumValue(value.type, ["molecule", "receptor", "protein", "process", "cell", "nucleus", "generic", "dna", "rna", "membrane", "organelle", "particle", "apparatus", "material", "transformation", "interface", "surface", "stimulus", "inset"], `${path}.type`) as ScientificEntityType,
    label: textValue(value.label, `${path}.label`, 160),
    ...(value.kind === undefined ? {} : { kind: semanticTerm(value.kind, `${path}.kind`) }),
    ...(value.emphasis === undefined ? {} : { emphasis: enumValue(value.emphasis, ["primary", "secondary"], `${path}.emphasis`) as "primary" | "secondary" })
  };
}

function normalizeInteractions(input: unknown, entityIds: Set<string>): ScientificStoryInteraction[] {
  if (!Array.isArray(input) || input.length > 60) throw new ValidationError("scientific story.interactions must be an array of at most 60 interactions");
  const interactions = input.map((item, index) => {
    const path = `scientific story.interactions[${index}]`;
    const value = record(item, path);
    const sourceId = stableId(value.sourceId, `${path}.sourceId`);
    const targetId = stableId(value.targetId, `${path}.targetId`);
    if (!entityIds.has(sourceId) || !entityIds.has(targetId)) throw new ValidationError(`${path} references an unknown scientific entity`);
    if (sourceId === targetId) throw new ValidationError(`${path} cannot connect an entity to itself`);
    return {
      id: stableId(value.id, `${path}.id`),
      sourceId,
      type: enumValue(value.type, ["activates", "inhibits", "binds_to", "transports_to", "converts_to", "associates_with", "regulates", "contains", "measures", "flows_to", "illuminates", "captures"], `${path}.type`) as ScientificInteractionType,
      targetId,
      ...(value.label === undefined ? {} : { label: textValue(value.label, `${path}.label`, 160) })
    };
  });
  unique(interactions, "scientific story interaction");
  return interactions;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ValidationError(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function stableId(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) throw new ValidationError(`${path} must be a stable identifier`);
  return value;
}

function semanticTerm(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) throw new ValidationError(`${path} must be a semantic term`);
  return value;
}

function textValue(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) throw new ValidationError(`${path} must be a non-empty string of at most ${maximum} characters`);
  return value;
}

function dimension(value: unknown, path: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > 14400) throw new ValidationError(`${path} must be between ${minimum} and 14400`);
  return value;
}

function enumValue<T extends string>(value: unknown, choices: readonly T[], path: string, fallback?: T): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !choices.includes(value as T)) throw new ValidationError(`${path} must be one of ${choices.join(", ")}`);
  return value as T;
}

function unique(items: Array<{ id: string }>, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new ValidationError(`${label} id must be unique: ${item.id}`);
    seen.add(item.id);
  }
}
