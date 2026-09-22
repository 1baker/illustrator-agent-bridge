import { ValidationError } from "../core/sceneValidation.js";
import { planScientificStory, type ScientificEntityType, type ScientificInteractionType, type ScientificStoryEntity, type ScientificStoryInteraction, type ScientificStorySpec } from "./storyPlanner.js";

export interface ScientificTextRequest {
  text: string;
  title?: string;
  subtitle?: string;
  width?: number;
  height?: number;
  direction?: "left_to_right" | "top_to_bottom";
  spacing?: "compact" | "normal" | "open";
}

export interface ParsedScientificTextStatement {
  line: number;
  text: string;
  kind: "directive" | "entity" | "interaction";
  entityIds?: string[];
  interactionId?: string;
}

export interface ScientificTextParseResult {
  grammar: "scientific-controlled-text.v1";
  story: ScientificStorySpec;
  statements: ParsedScientificTextStatement[];
}

const ENTITY_TYPES = new Set<ScientificEntityType>([
  "molecule", "receptor", "protein", "process", "cell", "nucleus", "generic",
  "dna", "rna", "membrane", "organelle", "particle", "apparatus"
]);

const INTERACTIONS: Array<{ pattern: string; type: ScientificInteractionType; label: string }> = [
  { pattern: "associates with", type: "associates_with", label: "associates" },
  { pattern: "transports to", type: "transports_to", label: "transports" },
  { pattern: "converts to", type: "converts_to", label: "converts" },
  { pattern: "binds to", type: "binds_to", label: "binds" },
  { pattern: "activates", type: "activates", label: "activates" },
  { pattern: "inhibits", type: "inhibits", label: "inhibits" }
];

interface ParsedEndpoint {
  label: string;
  type?: ScientificEntityType;
}

interface ParserState {
  entities: ScientificStoryEntity[];
  interactions: ScientificStoryInteraction[];
  entitiesByLabel: Map<string, ScientificStoryEntity>;
  usedIds: Set<string>;
  interactionKeys: Set<string>;
  statements: ParsedScientificTextStatement[];
  directives: Map<string, { line: number; value: string }>;
}

/** Parse a deliberately constrained line-oriented language into the validated story contract. */
export function parseScientificText(input: string | ScientificTextRequest): ScientificTextParseResult {
  const request = normalizeRequest(input);
  const state: ParserState = {
    entities: [], interactions: [], entitiesByLabel: new Map(), usedIds: new Set(),
    interactionKeys: new Set(), statements: [], directives: new Map()
  };
  const lines = request.text.replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!.trim();
    const line = index + 1;
    if (raw.length === 0 || raw.startsWith("#")) continue;
    const directive = /^(Title|Subtitle|Direction|Spacing|Canvas):\s*(.+)$/i.exec(raw);
    if (directive) {
      recordDirective(state, directive[1]!.toLowerCase(), directive[2]!.trim(), line, raw);
      continue;
    }
    const entityDeclaration = /^Entity:\s*(.+?)\.?$/i.exec(raw);
    if (entityDeclaration) {
      const endpoint = parseEndpoint(entityDeclaration[1]!, line, true);
      const entity = registerEndpoint(state, endpoint, line);
      state.statements.push({ line, text: raw, kind: "entity", entityIds: [entity.id] });
      continue;
    }
    const interaction = parseInteraction(raw, line);
    if (interaction) {
      const source = registerEndpoint(state, interaction.source, line);
      const target = registerEndpoint(state, interaction.target, line);
      if (source.id === target.id) throw lineError(line, "an interaction cannot connect an entity to itself");
      const key = `${source.id}|${interaction.type}|${target.id}`;
      if (state.interactionKeys.has(key)) throw lineError(line, `duplicate interaction: ${source.label} ${interaction.label} ${target.label}`);
      state.interactionKeys.add(key);
      const id = makeInteractionId(state.interactions.length + 1, source.id, interaction.type, target.id);
      state.interactions.push({ id, sourceId: source.id, type: interaction.type, targetId: target.id, label: interaction.label });
      state.statements.push({ line, text: raw, kind: "interaction", entityIds: [source.id, target.id], interactionId: id });
      continue;
    }
    throw lineError(line, "unsupported statement; use a directive, Entity: Label [type], or Source [type] <interaction> Target [type]");
  }
  if (state.entities.length === 0) throw new ValidationError("scientific text must declare at least one typed entity");

  const title = request.title ?? state.directives.get("title")?.value ?? "Scientific figure";
  const subtitle = request.subtitle ?? state.directives.get("subtitle")?.value;
  const direction = request.direction ?? parseDirection(state.directives.get("direction")?.value);
  const spacing = request.spacing ?? parseSpacing(state.directives.get("spacing")?.value);
  const canvas = parseCanvas(state.directives.get("canvas")?.value);
  const width = request.width ?? canvas?.width;
  const height = request.height ?? canvas?.height;
  const story: ScientificStorySpec = {
    schemaVersion: 1,
    document: {
      title,
      ...(subtitle === undefined ? {} : { subtitle }),
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height })
    },
    entities: state.entities,
    interactions: state.interactions,
    presentation: { direction, spacing }
  };
  planScientificStory(story);
  return { grammar: "scientific-controlled-text.v1", story, statements: state.statements };
}

function normalizeRequest(input: string | ScientificTextRequest): ScientificTextRequest {
  const request = typeof input === "string" ? { text: input } : input;
  if (typeof request !== "object" || request === null || typeof request.text !== "string") {
    throw new ValidationError("scientific text request must be a string or an object with a text string");
  }
  if (request.text.trim().length === 0 || request.text.length > 20_000) {
    throw new ValidationError("scientific text must contain 1 to 20000 characters");
  }
  return request;
}

function recordDirective(state: ParserState, name: string, value: string, line: number, text: string): void {
  if (state.directives.has(name)) throw lineError(line, `duplicate ${name} directive`);
  state.directives.set(name, { line, value });
  state.statements.push({ line, text, kind: "directive" });
}

function parseInteraction(raw: string, line: number): { source: ParsedEndpoint; target: ParsedEndpoint; type: ScientificInteractionType; label: string } | undefined {
  const statement = raw.endsWith(".") ? raw.slice(0, -1).trim() : raw;
  for (const interaction of INTERACTIONS) {
    const expression = new RegExp(`^(.+?)\\s+${interaction.pattern.replace(" ", "\\s+")}\\s+(.+?)$`, "i");
    const match = expression.exec(statement);
    if (!match) continue;
    return {
      source: parseEndpoint(match[1]!, line, false),
      target: parseEndpoint(match[2]!, line, false),
      type: interaction.type,
      label: interaction.label
    };
  }
  return undefined;
}

function parseEndpoint(input: string, line: number, requireType: boolean): ParsedEndpoint {
  const match = /^(.*?)\s*\[([A-Za-z_]+)\]\s*$/.exec(input.trim());
  const label = stripQuotes((match?.[1] ?? input).trim());
  if (label.length === 0 || label.length > 160) throw lineError(line, "entity labels must contain 1 to 160 characters");
  if (/[\[\]]/.test(label)) throw lineError(line, "entity type annotations must use exactly one trailing [type]");
  if (!match) {
    if (requireType) throw lineError(line, "Entity declarations require a trailing [type]");
    return { label };
  }
  const type = match[2]!.toLowerCase() as ScientificEntityType;
  if (!ENTITY_TYPES.has(type)) throw lineError(line, `unsupported entity type [${match[2]}]`);
  return { label, type };
}

function registerEndpoint(state: ParserState, endpoint: ParsedEndpoint, line: number): ScientificStoryEntity {
  const key = normalizeLabel(endpoint.label);
  const existing = state.entitiesByLabel.get(key);
  if (existing) {
    if (endpoint.type !== undefined && existing.type !== endpoint.type) {
      throw lineError(line, `entity ${endpoint.label} was already declared as [${existing.type}], not [${endpoint.type}]`);
    }
    return existing;
  }
  if (endpoint.type === undefined) throw lineError(line, `unknown entity ${endpoint.label}; annotate its first occurrence with [type]`);
  const id = uniqueEntityId(slug(endpoint.label), state.usedIds);
  const entity: ScientificStoryEntity = { id, type: endpoint.type, label: endpoint.label };
  state.entities.push(entity);
  state.entitiesByLabel.set(key, entity);
  state.usedIds.add(id);
  return entity;
}

function parseDirection(value: string | undefined): "left_to_right" | "top_to_bottom" {
  if (value === undefined) return "left_to_right";
  const normalized = value.toLowerCase().replace(/[ -]+/g, "_");
  if (normalized !== "left_to_right" && normalized !== "top_to_bottom") {
    throw new ValidationError("Direction must be left-to-right or top-to-bottom");
  }
  return normalized;
}

function parseSpacing(value: string | undefined): "compact" | "normal" | "open" {
  if (value === undefined) return "normal";
  const normalized = value.toLowerCase();
  if (normalized !== "compact" && normalized !== "normal" && normalized !== "open") {
    throw new ValidationError("Spacing must be compact, normal, or open");
  }
  return normalized;
}

function parseCanvas(value: string | undefined): { width: number; height: number } | undefined {
  if (value === undefined) return undefined;
  const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(value);
  if (!match) throw new ValidationError("Canvas must use WIDTHxHEIGHT, for example 1800x920");
  return { width: Number(match[1]), height: Number(match[2]) };
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).trim();
  return value;
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function slug(value: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = normalized.length === 0 ? "entity" : normalized;
  return /^[a-z]/.test(base) ? base.slice(0, 100) : `entity_${base}`.slice(0, 100);
}

function uniqueEntityId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, 110)}_${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new ValidationError(`could not derive a unique stable id for ${base}`);
}

function makeInteractionId(index: number, sourceId: string, type: ScientificInteractionType, targetId: string): string {
  return `interaction_${index}_${sourceId}_${type}_${targetId}`.slice(0, 120);
}

function lineError(line: number, message: string): ValidationError {
  return new ValidationError(`scientific text line ${line}: ${message}`);
}
