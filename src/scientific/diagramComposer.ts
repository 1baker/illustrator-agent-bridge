import type {
  ScientificObject,
  ScientificRelationship,
  SemanticScalar,
  VectorDocument,
  VectorElement,
  VectorScene
} from "../core/vectorScene.js";
import { normalizeScene, ValidationError } from "../core/sceneValidation.js";
import { placePathMarkers } from "../core/pathMarkers.js";

export type ScientificSymbolKind = "cell" | "membrane_receptor" | "ligand";
export type ScientificPort = "left" | "right" | "top" | "bottom";

export interface ScientificAnchorSpec {
  targetObjectId: string;
  targetPort: ScientificPort;
  ownPort?: ScientificPort;
  position?: number;
  ownPosition?: number;
  gap?: number;
}

export interface ScientificSymbolSpec {
  id: string;
  kind: ScientificSymbolKind;
  x?: number;
  y?: number;
  anchor?: ScientificAnchorSpec;
  width: number;
  height: number;
  label?: string;
}

interface ResolvedScientificSymbolSpec extends ScientificSymbolSpec {
  x: number;
  y: number;
}

export interface ScientificRelationshipSpec {
  id: string;
  sourceObjectId: string;
  predicate: string;
  targetObjectId: string;
  label?: string;
}

export interface ScientificDiagramSpec {
  document?: VectorDocument;
  symbols: ScientificSymbolSpec[];
  relationships?: ScientificRelationshipSpec[];
}

interface NormalizedScientificDiagramSpec {
  document: VectorDocument;
  symbols: ResolvedScientificSymbolSpec[];
  relationships?: ScientificRelationshipSpec[];
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SymbolFragment {
  elements: VectorElement[];
  object: ScientificObject;
  bounds: Bounds;
}

const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 620;
const MINIMUM_SIZE: Record<ScientificSymbolKind, { width: number; height: number }> = {
  cell: { width: 160, height: 130 },
  membrane_receptor: { width: 70, height: 70 },
  ligand: { width: 36, height: 36 }
};

export function composeScientificDiagram(input: unknown): VectorScene {
  const spec = normalizeScientificDiagramSpec(input);
  const width = spec.document?.width ?? DEFAULT_WIDTH;
  const height = spec.document?.height ?? DEFAULT_HEIGHT;
  const title = spec.document?.title ?? "Scientific symbol composition";
  const fragments = spec.symbols.map((symbol) => makeSymbol(symbol));
  const fragmentById = new Map(fragments.map((fragment) => [fragment.object.id, fragment]));
  const relationshipFragments = (spec.relationships ?? []).map((relationship) =>
    makeRelationship(relationship, fragmentById.get(relationship.sourceObjectId)!, fragmentById.get(relationship.targetObjectId)!)
  );

  const scene: VectorScene = {
    document: {
      title,
      width,
      height,
      colorMode: spec.document?.colorMode ?? "RGB"
    },
    elements: [
      rect("diagram.background", "background", 0, 0, width, height, "#F8FAFC", null, 0),
      text("diagram.title", "diagram title", 40, 30, title, 26, "#0F172A"),
      ...fragments.flatMap((fragment) => fragment.elements),
      ...relationshipFragments.flatMap((fragment) => fragment.elements)
    ],
    semantics: {
      objects: fragments.map((fragment) => fragment.object),
      relationships: relationshipFragments.map((fragment) => fragment.relationship)
    }
  };

  return normalizeScene(scene);
}

function normalizeScientificDiagramSpec(input: unknown): NormalizedScientificDiagramSpec {
  const value = record(input, "scientific diagram spec");
  if (!Array.isArray(value.symbols) || value.symbols.length === 0) {
    throw new ValidationError("scientific diagram spec.symbols must be a non-empty array");
  }
  if (value.symbols.length > 100) {
    throw new ValidationError("scientific diagram spec.symbols cannot include more than 100 symbols");
  }
  if (value.relationships !== undefined && !Array.isArray(value.relationships)) {
    throw new ValidationError("scientific diagram spec.relationships must be an array");
  }

  const document = normalizeDocument(value.document);
  const width = document.width ?? DEFAULT_WIDTH;
  const height = document.height ?? DEFAULT_HEIGHT;
  const requestedSymbols = value.symbols.map((item, index) => normalizeSymbol(item, `scientific diagram spec.symbols[${index}]`));
  uniqueIds(requestedSymbols, "scientific diagram symbols");
  const symbols = resolveSymbolPlacements(requestedSymbols, width, height);
  validateSymbolCollisions(symbols);
  const symbolIds = new Set(requestedSymbols.map((symbol) => symbol.id));
  const relationships = (value.relationships ?? []).map((item, index) =>
    normalizeRelationship(item, `scientific diagram spec.relationships[${index}]`, symbolIds)
  );
  uniqueIds(relationships, "scientific diagram relationships");

  return { document, symbols, ...(relationships.length === 0 ? {} : { relationships }) };
}

function normalizeDocument(input: unknown): VectorDocument {
  if (input === undefined) {
    return {};
  }
  const value = record(input, "scientific diagram spec.document");
  const colorMode = value.colorMode === undefined ? undefined : string(value.colorMode, "scientific diagram spec.document.colorMode", 8);
  if (colorMode !== undefined && colorMode !== "RGB" && colorMode !== "CMYK") {
    throw new ValidationError("scientific diagram spec.document.colorMode must be RGB or CMYK");
  }

  return {
    title: value.title === undefined ? undefined : string(value.title, "scientific diagram spec.document.title", 120),
    width: value.width === undefined ? undefined : positive(value.width, "scientific diagram spec.document.width"),
    height: value.height === undefined ? undefined : positive(value.height, "scientific diagram spec.document.height"),
    colorMode
  };
}

function normalizeSymbol(input: unknown, path: string): ScientificSymbolSpec {
  const value = record(input, path);
  const kind = string(value.kind, `${path}.kind`, 40);
  if (kind !== "cell" && kind !== "membrane_receptor" && kind !== "ligand") {
    throw new ValidationError(`${path}.kind must be cell, membrane_receptor, or ligand`);
  }

  const symbol: ScientificSymbolSpec = {
    id: stableId(value.id, `${path}.id`),
    kind,
    width: positive(value.width, `${path}.width`),
    height: positive(value.height, `${path}.height`),
    label: value.label === undefined ? undefined : string(value.label, `${path}.label`, 120),
    x: value.x === undefined ? undefined : finite(value.x, `${path}.x`),
    y: value.y === undefined ? undefined : finite(value.y, `${path}.y`),
    anchor: value.anchor === undefined ? undefined : normalizeAnchor(value.anchor, `${path}.anchor`)
  };
  const minimum = MINIMUM_SIZE[kind];
  if (symbol.width < minimum.width || symbol.height < minimum.height) {
    throw new ValidationError(`${path} must be at least ${minimum.width} x ${minimum.height} for ${kind}`);
  }
  const hasX = symbol.x !== undefined;
  const hasY = symbol.y !== undefined;
  if (symbol.anchor && (hasX || hasY)) {
    throw new ValidationError(`${path} must use either x/y or anchor placement, not both`);
  }
  if (!symbol.anchor && (!hasX || !hasY)) {
    throw new ValidationError(`${path} requires both x and y when anchor placement is absent`);
  }
  return symbol;
}

function normalizeAnchor(input: unknown, path: string): ScientificAnchorSpec {
  const value = record(input, path);
  return {
    targetObjectId: stableId(value.targetObjectId, `${path}.targetObjectId`),
    targetPort: port(value.targetPort, `${path}.targetPort`),
    ownPort: value.ownPort === undefined ? undefined : port(value.ownPort, `${path}.ownPort`),
    position: value.position === undefined ? undefined : fraction(value.position, `${path}.position`),
    ownPosition: value.ownPosition === undefined ? undefined : fraction(value.ownPosition, `${path}.ownPosition`),
    gap: value.gap === undefined ? undefined : finite(value.gap, `${path}.gap`)
  };
}

function resolveSymbolPlacements(
  symbols: ScientificSymbolSpec[],
  canvasWidth: number,
  canvasHeight: number
): ResolvedScientificSymbolSpec[] {
  const requestedById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const resolvedById = new Map<string, ResolvedScientificSymbolSpec>();
  const resolving = new Set<string>();

  function resolveSymbol(id: string): ResolvedScientificSymbolSpec {
    const existing = resolvedById.get(id);
    if (existing) {
      return existing;
    }
    const symbol = requestedById.get(id);
    if (!symbol) {
      throw new ValidationError(`anchor references unknown target symbol: ${id}`);
    }
    if (resolving.has(id)) {
      throw new ValidationError(`anchor placement cycle detected at symbol: ${id}`);
    }

    resolving.add(id);
    let x: number;
    let y: number;
    if (symbol.anchor) {
      const target = resolveSymbol(symbol.anchor.targetObjectId);
      const targetPoint = pointOnPort(target, symbol.anchor.targetPort, symbol.anchor.position ?? 0.5);
      const ownPort = symbol.anchor.ownPort ?? oppositePort(symbol.anchor.targetPort);
      const ownOffset = pointOnPort({ x: 0, y: 0, width: symbol.width, height: symbol.height }, ownPort, symbol.anchor.ownPosition ?? 0.5);
      const normal = portNormal(symbol.anchor.targetPort);
      const gap = symbol.anchor.gap ?? 0;
      x = targetPoint.x + normal.x * gap - ownOffset.x;
      y = targetPoint.y + normal.y * gap - ownOffset.y;
    } else {
      x = symbol.x!;
      y = symbol.y!;
    }

    const resolved: ResolvedScientificSymbolSpec = { ...symbol, x, y };
    validateResolvedBounds(resolved, canvasWidth, canvasHeight);
    resolving.delete(id);
    resolvedById.set(id, resolved);
    return resolved;
  }

  return symbols.map((symbol) => resolveSymbol(symbol.id));
}

function validateResolvedBounds(symbol: ResolvedScientificSymbolSpec, canvasWidth: number, canvasHeight: number): void {
  if (symbol.x < 0 || symbol.y < 70 || symbol.x + symbol.width > canvasWidth || symbol.y + symbol.height + 40 > canvasHeight) {
    throw new ValidationError(`scientific diagram symbol ${symbol.id} must fit inside the canvas below the title band`);
  }
}

function validateSymbolCollisions(symbols: ResolvedScientificSymbolSpec[]): void {
  for (let leftIndex = 0; leftIndex < symbols.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < symbols.length; rightIndex += 1) {
      const left = symbols[leftIndex]!;
      const right = symbols[rightIndex]!;
      if (!boundsOverlap(left, right)) {
        continue;
      }
      const intentionalAttachment = left.anchor?.targetObjectId === right.id || right.anchor?.targetObjectId === left.id;
      if (!intentionalAttachment) {
        throw new ValidationError(`scientific diagram symbols ${left.id} and ${right.id} overlap without an anchor relationship`);
      }
    }
  }
}

function boundsOverlap(left: Bounds, right: Bounds): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function pointOnPort(bounds: Bounds, selectedPort: ScientificPort, position: number): { x: number; y: number } {
  if (selectedPort === "left") {
    return { x: bounds.x, y: bounds.y + bounds.height * position };
  }
  if (selectedPort === "right") {
    return { x: bounds.x + bounds.width, y: bounds.y + bounds.height * position };
  }
  if (selectedPort === "top") {
    return { x: bounds.x + bounds.width * position, y: bounds.y };
  }
  return { x: bounds.x + bounds.width * position, y: bounds.y + bounds.height };
}

function portNormal(selectedPort: ScientificPort): { x: number; y: number } {
  if (selectedPort === "left") {
    return { x: -1, y: 0 };
  }
  if (selectedPort === "right") {
    return { x: 1, y: 0 };
  }
  if (selectedPort === "top") {
    return { x: 0, y: -1 };
  }
  return { x: 0, y: 1 };
}

function oppositePort(selectedPort: ScientificPort): ScientificPort {
  if (selectedPort === "left") {
    return "right";
  }
  if (selectedPort === "right") {
    return "left";
  }
  if (selectedPort === "top") {
    return "bottom";
  }
  return "top";
}

function normalizeRelationship(input: unknown, path: string, symbolIds: Set<string>): ScientificRelationshipSpec {
  const value = record(input, path);
  const sourceObjectId = stableId(value.sourceObjectId, `${path}.sourceObjectId`);
  const targetObjectId = stableId(value.targetObjectId, `${path}.targetObjectId`);
  if (!symbolIds.has(sourceObjectId)) {
    throw new ValidationError(`${path}.sourceObjectId references unknown symbol: ${sourceObjectId}`);
  }
  if (!symbolIds.has(targetObjectId)) {
    throw new ValidationError(`${path}.targetObjectId references unknown symbol: ${targetObjectId}`);
  }
  if (sourceObjectId === targetObjectId) {
    throw new ValidationError(`${path} cannot connect a symbol to itself`);
  }

  return {
    id: stableId(value.id, `${path}.id`),
    sourceObjectId,
    predicate: stableId(value.predicate, `${path}.predicate`),
    targetObjectId,
    label: value.label === undefined ? undefined : string(value.label, `${path}.label`, 120)
  };
}

function makeSymbol(symbol: ResolvedScientificSymbolSpec): SymbolFragment {
  if (symbol.kind === "cell") {
    return makeCell(symbol);
  }
  if (symbol.kind === "membrane_receptor") {
    return makeReceptor(symbol);
  }
  return makeLigand(symbol);
}

function makeCell(symbol: ResolvedScientificSymbolSpec): SymbolFragment {
  const cytoplasmId = `${symbol.id}.cytoplasm`;
  const membraneId = `${symbol.id}.membrane`;
  const nucleusId = `${symbol.id}.nucleus`;
  const labelId = `${symbol.id}.label`;
  const nucleusWidth = symbol.width * 0.34;
  const nucleusHeight = symbol.height * 0.34;
  const elements: VectorElement[] = [
    ellipse(cytoplasmId, `${symbol.label ?? symbol.id} cytoplasm`, symbol.x, symbol.y, symbol.width, symbol.height, "#E0F2FE", null, 0, 88),
    ellipse(membraneId, `${symbol.label ?? symbol.id} membrane`, symbol.x, symbol.y, symbol.width, symbol.height, null, "#0369A1", 10),
    ellipse(
      nucleusId,
      `${symbol.label ?? symbol.id} nucleus`,
      symbol.x + (symbol.width - nucleusWidth) / 2,
      symbol.y + (symbol.height - nucleusHeight) / 2,
      nucleusWidth,
      nucleusHeight,
      "#C4B5FD",
      "#6D28D9",
      4
    ),
    text(labelId, `${symbol.label ?? symbol.id} label`, symbol.x + symbol.width * 0.4, symbol.y + symbol.height + 12, symbol.label ?? "cell", 19, "#075985")
  ];

  return {
    elements,
    object: {
      id: symbol.id,
      kind: symbol.kind,
      label: symbol.label,
      elementIds: elements.map((element) => element.id!),
      properties: symbolProperties(symbol, { recipe: "basic_cell_v1", notToScale: true })
    },
    bounds: symbol
  };
}

function makeReceptor(symbol: ResolvedScientificSymbolSpec): SymbolFragment {
  const stemId = `${symbol.id}.stem`;
  const pocketId = `${symbol.id}.binding-pocket`;
  const labelId = `${symbol.id}.label`;
  const centerY = symbol.y + symbol.height / 2;
  const pocketX = symbol.x + symbol.width * 0.9;
  const elements: VectorElement[] = [
    line(stemId, `${symbol.label ?? symbol.id} stem`, symbol.x, centerY, symbol.x + symbol.width * 0.45, centerY, "#BE123C", 12),
    path(
      pocketId,
      `${symbol.label ?? symbol.id} binding pocket`,
      [
        { x: symbol.x + symbol.width * 0.42, y: symbol.y + symbol.height * 0.15 },
        { x: pocketX, y: centerY },
        { x: symbol.x + symbol.width * 0.42, y: symbol.y + symbol.height * 0.85 }
      ],
      null,
      "#BE123C",
      10,
      false
    ),
    text(labelId, `${symbol.label ?? symbol.id} label`, symbol.x, symbol.y + symbol.height + 10, symbol.label ?? "receptor", 17, "#9F1239")
  ];

  return {
    elements,
    object: {
      id: symbol.id,
      kind: symbol.kind,
      label: symbol.label,
      elementIds: elements.map((element) => element.id!),
      properties: symbolProperties(symbol, { recipe: "membrane_receptor_v1" })
    },
    bounds: symbol
  };
}

function makeLigand(symbol: ResolvedScientificSymbolSpec): SymbolFragment {
  const bodyId = `${symbol.id}.body`;
  const labelId = `${symbol.id}.label`;
  const elements: VectorElement[] = [
    ellipse(bodyId, `${symbol.label ?? symbol.id} body`, symbol.x, symbol.y, symbol.width, symbol.height, "#FDE68A", "#B45309", 5),
    text(labelId, `${symbol.label ?? symbol.id} label`, symbol.x, symbol.y + symbol.height + 10, symbol.label ?? "ligand", 17, "#92400E")
  ];

  return {
    elements,
    object: {
      id: symbol.id,
      kind: symbol.kind,
      label: symbol.label,
      elementIds: elements.map((element) => element.id!),
      properties: symbolProperties(symbol, { recipe: "ligand_v1" })
    },
    bounds: symbol
  };
}

function makeRelationship(
  spec: ScientificRelationshipSpec,
  source: SymbolFragment,
  target: SymbolFragment
): { elements: VectorElement[]; relationship: ScientificRelationship } {
  const sourceCenter = center(source.bounds);
  const targetCenter = center(target.bounds);
  const start = boundaryPoint(source.bounds, targetCenter);
  const end = boundaryPoint(target.bounds, sourceCenter);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const arrowSize = Math.max(10, Math.min(22, length * 0.12));
  const lineId = `${spec.id}.line`;
  const arrowId = `${spec.id}.arrowhead`;
  const labelId = `${spec.id}.label`;
  const relationshipLine = { id: lineId, type: "line" as const, name: `${spec.label ?? spec.predicate} line`, x: start.x, y: start.y, x2: end.x, y2: end.y, style: { fill: null, stroke: "#475569", strokeWidth: 4 } };
  const arrow = placePathMarkers({ source: relationshipLine, markers: [{ at: "end", kind: "arrowhead", size: arrowSize, idPrefix: arrowId, name: `${spec.label ?? spec.predicate} arrowhead`, zIndex: 0, style: { fill: "#475569", stroke: null } }] }).elements[0]!;
  const elements: VectorElement[] = [
    relationshipLine,
    arrow,
    text(labelId, `${spec.label ?? spec.predicate} label`, (start.x + end.x) / 2 - 24, (start.y + end.y) / 2 - 34, spec.label ?? spec.predicate, 16, "#334155")
  ];

  return {
    elements,
    relationship: {
      id: spec.id,
      sourceObjectId: spec.sourceObjectId,
      predicate: spec.predicate,
      targetObjectId: spec.targetObjectId,
      visualElementIds: elements.map((element) => element.id!),
      properties: { directional: true, recipe: "directed_relationship_v1" }
    }
  };
}

function boundaryPoint(bounds: Bounds, toward: { x: number; y: number }): { x: number; y: number } {
  const origin = center(bounds);
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  if (dx === 0 && dy === 0) {
    return origin;
  }
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : bounds.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : bounds.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: origin.x + dx * scale, y: origin.y + dy * scale };
}

function center(bounds: Bounds): { x: number; y: number } {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function rect(id: string, name: string, x: number, y: number, width: number, height: number, fill: string, stroke: string | null, strokeWidth: number): VectorElement {
  return { id, type: "rect", name, x, y, width, height, style: { fill, stroke, strokeWidth } };
}

function ellipse(id: string, name: string, x: number, y: number, width: number, height: number, fill: string | null, stroke: string | null, strokeWidth: number, opacity = 100): VectorElement {
  return { id, type: "ellipse", name, x, y, width, height, style: { fill, stroke, strokeWidth, opacity } };
}

function line(id: string, name: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number): VectorElement {
  return { id, type: "line", name, x, y, x2, y2, style: { fill: null, stroke, strokeWidth } };
}

function path(id: string, name: string, points: Array<{ x: number; y: number }>, fill: string | null, stroke: string, strokeWidth: number, closed: boolean): VectorElement {
  return { id, type: "path", name, x: 0, y: 0, points, closed, style: { fill, stroke, strokeWidth } };
}

function polygon(id: string, name: string, points: Array<{ x: number; y: number }>, fill: string, stroke: string | null, strokeWidth: number): VectorElement {
  return { id, type: "polygon", name, x: 0, y: 0, points, style: { fill, stroke, strokeWidth } };
}

function text(id: string, name: string, x: number, y: number, content: string, size: number, fill: string): VectorElement {
  return { id, type: "text", name, x, y, text: content, size, style: { fill, stroke: null } };
}

function symbolProperties(
  symbol: ResolvedScientificSymbolSpec,
  recipeProperties: Record<string, SemanticScalar>
): Record<string, SemanticScalar> {
  const layout: Record<string, SemanticScalar> = {
    layoutMode: symbol.anchor ? "anchor" : "absolute",
    resolvedX: symbol.x,
    resolvedY: symbol.y,
    width: symbol.width,
    height: symbol.height
  };
  if (symbol.anchor) {
    layout.anchorTarget = symbol.anchor.targetObjectId;
    layout.targetPort = symbol.anchor.targetPort;
    layout.ownPort = symbol.anchor.ownPort ?? oppositePort(symbol.anchor.targetPort);
    layout.targetPosition = symbol.anchor.position ?? 0.5;
    layout.ownPosition = symbol.anchor.ownPosition ?? 0.5;
    layout.anchorGap = symbol.anchor.gap ?? 0;
  }
  return { ...recipeProperties, ...layout };
}

function uniqueIds(items: Array<{ id: string }>, path: string): void {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError(`${path} must have unique ids`);
  }
}

function record(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError(`${path} must be an object`);
  }
  return input as Record<string, unknown>;
}

function string(input: unknown, path: string, maximum: number): string {
  if (typeof input !== "string" || input.length === 0 || input.length > maximum) {
    throw new ValidationError(`${path} must be a non-empty string no longer than ${maximum} characters`);
  }
  return input;
}

function stableId(input: unknown, path: string): string {
  const value = string(input, path, 120);
  if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) {
    throw new ValidationError(`${path} must be a machine-readable id`);
  }
  return value;
}

function port(input: unknown, path: string): ScientificPort {
  const value = string(input, path, 12);
  if (value !== "left" && value !== "right" && value !== "top" && value !== "bottom") {
    throw new ValidationError(`${path} must be left, right, top, or bottom`);
  }
  return value;
}

function fraction(input: unknown, path: string): number {
  const value = finite(input, path);
  if (value < 0 || value > 1) {
    throw new ValidationError(`${path} must be between 0 and 1`);
  }
  return value;
}

function finite(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new ValidationError(`${path} must be a finite number`);
  }
  return input;
}

function positive(input: unknown, path: string): number {
  const value = finite(input, path);
  if (value <= 0 || value > 14400) {
    throw new ValidationError(`${path} must be greater than 0 and no more than 14400`);
  }
  return value;
}
