import { placeLabels, type LabelBox, type LabelPlacement, type LabelPosition } from "../core/labelPlacement.js";
import { placePathMarkers } from "../core/pathMarkers.js";
import { layoutLayeredGraph, type ResolvedGraphLayoutNode } from "../core/layeredGraphLayout.js";
import { solveLayout, type LayoutConstraint, type ResolvedLayoutNode } from "../core/layoutConstraints.js";
import { routeOrthogonal, type ExistingRoute, type RouteBox, type RoutePort } from "../core/orthogonalRouter.js";
import { DEFAULT_SCIENTIFIC_THEME, styleFor, validateScientificTheme, vectorStyle, type ScientificTheme, type ScientificVisualRole } from "../core/scientificTheme.js";
import { normalizeScene, ValidationError } from "../core/sceneValidation.js";
import type { Point, ScientificObject, ScientificRelationship, VectorElement, VectorScene, VectorStyle } from "../core/vectorScene.js";
import { renderScientificSymbol, type ScientificSymbolRecipeId } from "./symbolRegistry.js";

export type ScientificObjectShape = "rect" | "ellipse";
export type ScientificObjectRole = "primary_object" | "secondary_object" | "compartment";
export type ScientificRelationshipRole = "activation" | "inhibition" | "association" | "transport" | "conversion";

export interface ScientificFigureObjectSpec {
  id: string;
  kind: string;
  label: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  shape?: ScientificObjectShape;
  styleRole?: ScientificObjectRole;
  recipe?: ScientificSymbolRecipeId;
  labelPositions?: LabelPosition[];
}

export interface ScientificFigureRelationshipSpec {
  id: string;
  sourceObjectId: string;
  predicate: string;
  targetObjectId: string;
  label?: string;
  sourcePort?: RoutePort;
  targetPort?: RoutePort;
  role?: ScientificRelationshipRole;
  visual?: "route" | "semantic_only";
}

export interface ScientificFigureSpec {
  schemaVersion: 1;
  document: { title: string; subtitle?: string; width?: number; height?: number };
  objects: ScientificFigureObjectSpec[];
  constraints?: LayoutConstraint[];
  relationships?: ScientificFigureRelationshipSpec[];
  settings?: {
    routeClearance?: number;
    layoutMode?: "explicit" | "layered";
    layoutDirection?: "left_to_right" | "top_to_bottom";
    rankGap?: number;
    nodeGap?: number;
  };
}

interface NormalizedSpec {
  schemaVersion: 1;
  document: { title: string; subtitle?: string; width: number; height: number };
  objects: ScientificFigureObjectSpec[];
  constraints: LayoutConstraint[];
  relationships: ScientificFigureRelationshipSpec[];
  routeClearance: number;
  layoutMode: "explicit" | "layered";
  layoutDirection: "left_to_right" | "top_to_bottom";
  rankGap: number;
  nodeGap: number;
}

interface CompiledObject {
  spec: ScientificFigureObjectSpec;
  box: FigureBox;
  bodyElements: VectorElement[];
  label: LabelPlacement;
  labelElements: VectorElement[];
  semantic: ScientificObject;
}

interface FigureBox extends RouteBox {
  rank?: number;
  component?: number;
}

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 760;
const TITLE_BAND = 120;
const PAGE_MARGIN = 38;

/** Compile a declarative scientific figure into a validated, renderer-independent scene. */
export function compileScientificFigure(input: unknown, theme: ScientificTheme = DEFAULT_SCIENTIFIC_THEME): VectorScene {
  const spec = normalizeFigureSpec(input);
  const checkedTheme = validateScientificTheme(theme);
  const layout = resolveFigureLayout(spec);
  validateResolvedLayout(layout, spec);

  const boxes: FigureBox[] = layout.map((node) => ({
    id: node.id, x: node.x, y: node.y, width: node.width, height: node.height,
    ...("rank" in node ? { rank: node.rank, component: node.component } : {})
  }));
  const boxById = new Map(boxes.map((box) => [box.id, box]));
  const labels = placeObjectLabels(spec.objects, boxes, spec, checkedTheme);
  const labelByTarget = new Map(labels.map((label) => [label.targetId, label]));
  const compiledObjects = spec.objects.map((object) => compileObject(object, boxById.get(object.id)!, labelByTarget.get(object.id)!, checkedTheme, spec.layoutMode));
  const compiledById = new Map(compiledObjects.map((object) => [object.spec.id, object]));
  const routed: ExistingRoute[] = [];
  const relationshipElements: VectorElement[] = [];
  const semanticRelationships: ScientificRelationship[] = [];
  const relationshipLabelPlacements: LabelPlacement[] = [];
  const portAssignments = relationshipPortAssignments(spec.relationships, boxById);

  for (const relationshipIndex of relationshipRoutingOrder(spec.relationships)) {
    const relationship = spec.relationships[relationshipIndex]!;
    if (relationship.visual === "semantic_only") {
      semanticRelationships.push({
        id: relationship.id,
        sourceObjectId: relationship.sourceObjectId,
        predicate: relationship.predicate,
        targetObjectId: relationship.targetObjectId,
        properties: { compiler: "scientific_figure_v1", visual: false }
      });
      continue;
    }
    const source = compiledById.get(relationship.sourceObjectId)!;
    const target = compiledById.get(relationship.targetObjectId)!;
    const [sourcePort, targetPort] = portAssignments.get(relationship.id)!;
    const route = routeOrthogonal({
      source: { box: source.box, port: sourcePort },
      target: { box: target.box, port: targetPort },
      obstacles: routeObstacles(source.box.id, target.box.id, boxes, labels, spec.constraints),
      existingRoutes: routed,
      clearance: spec.routeClearance,
      bendPenalty: 32,
      crossingPenalty: 1000
    });
    routed.push({ id: relationship.id, points: route.points });
    const role = relationship.role ?? "activation";
    const visualIds = relationshipVisualElements(relationship.id, route.points, role, checkedTheme, relationshipElements);
    if (relationship.label) {
      const placement = placeRelationshipLabel(relationship, route.points, boxes, [...labels, ...relationshipLabelPlacements], spec, checkedTheme);
      relationshipLabelPlacements.push(placement);
      const labelElements = makeLabelElements(relationship.id, placement, checkedTheme, 35);
      relationshipElements.push(...labelElements);
      visualIds.push(...labelElements.map((element) => element.id!));
    }
    semanticRelationships.push({
      id: relationship.id,
      sourceObjectId: relationship.sourceObjectId,
      predicate: relationship.predicate,
      targetObjectId: relationship.targetObjectId,
      visualElementIds: visualIds,
      properties: {
        compiler: "scientific_figure_v1",
        router: "orthogonal_visibility_v1",
        role,
        sourcePort,
        targetPort,
        length: route.length,
        bends: route.bends,
        crossings: route.crossings,
        clearance: route.clearance
      }
    });
  }

  const titleToken = styleFor(checkedTheme, "title");
  const bodyToken = styleFor(checkedTheme, "body_text");
  return normalizeScene({
    document: { title: spec.document.title, width: spec.document.width, height: spec.document.height, colorMode: "RGB" },
    elements: [
      rect("figure.background", 0, 0, spec.document.width, spec.document.height, vectorStyle(styleFor(checkedTheme, "background")), -100),
      text("figure.title", PAGE_MARGIN, 28, spec.document.title, titleToken.fontSize!, titleToken.fontFamily!, vectorStyle(titleToken), 100),
      ...(spec.document.subtitle
        ? [text("figure.subtitle", PAGE_MARGIN, 76, spec.document.subtitle, bodyToken.fontSize!, bodyToken.fontFamily!, vectorStyle(bodyToken), 100)]
        : []),
      ...relationshipElements,
      ...compiledObjects.flatMap((object) => [...object.bodyElements, ...object.labelElements])
    ],
    semantics: {
      objects: compiledObjects.map((object) => object.semantic),
      ...(semanticRelationships.length === 0 ? {} : { relationships: semanticRelationships })
    }
  });
}

function normalizeFigureSpec(input: unknown): NormalizedSpec {
  const value = record(input, "scientific figure spec");
  if (value.schemaVersion !== 1) throw new ValidationError("scientific figure spec.schemaVersion must be 1");
  const documentValue = record(value.document, "scientific figure spec.document");
  const width = optionalPositive(documentValue.width, "scientific figure spec.document.width") ?? DEFAULT_WIDTH;
  const height = optionalPositive(documentValue.height, "scientific figure spec.document.height") ?? DEFAULT_HEIGHT;
  if (width < 500 || height < 400) throw new ValidationError("scientific figure document must be at least 500 x 400");
  if (!Array.isArray(value.objects) || value.objects.length === 0 || value.objects.length > 50) {
    throw new ValidationError("scientific figure spec.objects must contain 1 to 50 objects");
  }
  const objects = value.objects.map((item, index) => normalizeObject(item, `scientific figure spec.objects[${index}]`));
  unique(objects, "scientific figure object");
  const objectIds = new Set(objects.map((object) => object.id));
  const constraints = value.constraints === undefined ? [] : normalizeConstraints(value.constraints);
  const relationships = value.relationships === undefined ? [] : normalizeRelationships(value.relationships, objectIds);
  const settings = value.settings === undefined ? {} : record(value.settings, "scientific figure spec.settings");
  const routeClearance = optionalPositive(settings.routeClearance, "scientific figure spec.settings.routeClearance") ?? 18;
  if (routeClearance > 100) throw new ValidationError("scientific figure spec.settings.routeClearance cannot exceed 100");
  const layoutMode = (settings.layoutMode === undefined ? "explicit" : enumValue(settings.layoutMode, ["explicit", "layered"], "scientific figure spec.settings.layoutMode")) as "explicit" | "layered";
  const layoutDirection = (settings.layoutDirection === undefined ? "left_to_right" : enumValue(settings.layoutDirection, ["left_to_right", "top_to_bottom"], "scientific figure spec.settings.layoutDirection")) as "left_to_right" | "top_to_bottom";
  const rankGap = settings.rankGap === undefined ? 120 : nonNegative(settings.rankGap, "scientific figure spec.settings.rankGap");
  const nodeGap = settings.nodeGap === undefined ? 54 : nonNegative(settings.nodeGap, "scientific figure spec.settings.nodeGap");
  if (layoutMode === "layered" && constraints.length > 0) throw new ValidationError("layered scientific figure layout cannot also declare explicit constraints");
  if (layoutMode === "layered" && objects.some((object) => object.x !== undefined || object.y !== undefined)) throw new ValidationError("layered scientific figure layout assigns coordinates automatically; objects cannot declare x or y");
  return {
    schemaVersion: 1,
    document: {
      title: stringValue(documentValue.title, "scientific figure spec.document.title", 160),
      ...(documentValue.subtitle === undefined ? {} : { subtitle: stringValue(documentValue.subtitle, "scientific figure spec.document.subtitle", 300) }),
      width,
      height
    },
    objects,
    constraints,
    relationships,
    routeClearance,
    layoutMode,
    layoutDirection,
    rankGap,
    nodeGap
  };
}

function resolveFigureLayout(spec: NormalizedSpec): Array<ResolvedLayoutNode | ResolvedGraphLayoutNode> {
  if (spec.layoutMode === "layered") {
    return layoutLayeredGraph(
      spec.objects.map((object) => ({ id: object.id, width: object.width, height: object.height })),
      spec.relationships.map((relationship) => ({ id: relationship.id, sourceId: relationship.sourceObjectId, targetId: relationship.targetObjectId })),
      { x: PAGE_MARGIN, y: TITLE_BAND, width: spec.document.width - PAGE_MARGIN * 2, height: spec.document.height - TITLE_BAND - PAGE_MARGIN },
      { direction: spec.layoutDirection, rankGap: spec.rankGap, nodeGap: spec.nodeGap }
    );
  }
  return solveLayout({
    nodes: spec.objects.map((object) => ({ id: object.id, width: object.width, height: object.height, x: object.x, y: object.y })),
    constraints: spec.constraints
  });
}

function normalizeObject(input: unknown, path: string): ScientificFigureObjectSpec {
  const value = record(input, path);
  const shape = value.shape === undefined ? undefined : enumValue(value.shape, ["rect", "ellipse"], `${path}.shape`);
  const styleRole = value.styleRole === undefined ? undefined : enumValue(value.styleRole, ["primary_object", "secondary_object", "compartment"], `${path}.styleRole`);
  const recipe = value.recipe === undefined ? undefined : enumValue(value.recipe, ["generic", "cell", "nucleus", "receptor", "molecule", "protein", "process", "dna", "rna", "membrane", "organelle", "particle", "apparatus"], `${path}.recipe`);
  const labelPositions = value.labelPositions === undefined ? undefined : positionArray(value.labelPositions, `${path}.labelPositions`);
  return {
    id: stableId(value.id, `${path}.id`),
    kind: semanticTerm(value.kind, `${path}.kind`),
    label: stringValue(value.label, `${path}.label`, 160),
    width: positive(value.width, `${path}.width`),
    height: positive(value.height, `${path}.height`),
    ...(value.x === undefined ? {} : { x: finite(value.x, `${path}.x`) }),
    ...(value.y === undefined ? {} : { y: finite(value.y, `${path}.y`) }),
    ...(shape === undefined ? {} : { shape: shape as ScientificObjectShape }),
    ...(styleRole === undefined ? {} : { styleRole: styleRole as ScientificObjectRole }),
    ...(recipe === undefined ? {} : { recipe: recipe as ScientificSymbolRecipeId }),
    ...(labelPositions === undefined ? {} : { labelPositions })
  };
}

function normalizeConstraints(input: unknown): LayoutConstraint[] {
  if (!Array.isArray(input) || input.length > 500) throw new ValidationError("scientific figure spec.constraints must be an array of at most 500 items");
  return input.map((item, index) => {
    const path = `scientific figure spec.constraints[${index}]`;
    const value = record(item, path);
    const type = enumValue(value.type, ["align", "gap", "contain"], `${path}.type`);
    if (type === "align") {
      return {
        id: stableId(value.id, `${path}.id`), type, sourceId: stableId(value.sourceId, `${path}.sourceId`), targetId: stableId(value.targetId, `${path}.targetId`),
        axis: enumValue(value.axis, ["x", "y"], `${path}.axis`) as "x" | "y",
        mode: enumValue(value.mode, ["start", "center", "end"], `${path}.mode`) as "start" | "center" | "end",
        ...(value.offset === undefined ? {} : { offset: finite(value.offset, `${path}.offset`) })
      };
    }
    if (type === "gap") {
      return {
        id: stableId(value.id, `${path}.id`), type, sourceId: stableId(value.sourceId, `${path}.sourceId`), targetId: stableId(value.targetId, `${path}.targetId`),
        direction: enumValue(value.direction, ["left", "right", "top", "bottom"], `${path}.direction`) as "left" | "right" | "top" | "bottom",
        gap: nonNegative(value.gap, `${path}.gap`)
      };
    }
    return {
      id: stableId(value.id, `${path}.id`), type: "contain", childId: stableId(value.childId, `${path}.childId`), containerId: stableId(value.containerId, `${path}.containerId`),
      ...(value.padding === undefined ? {} : { padding: nonNegative(value.padding, `${path}.padding`) })
    };
  });
}

function normalizeRelationships(input: unknown, objectIds: Set<string>): ScientificFigureRelationshipSpec[] {
  if (!Array.isArray(input) || input.length > 100) throw new ValidationError("scientific figure spec.relationships must be an array of at most 100 items");
  const relationships = input.map((item, index) => {
    const path = `scientific figure spec.relationships[${index}]`;
    const value = record(item, path);
    const sourceObjectId = stableId(value.sourceObjectId, `${path}.sourceObjectId`);
    const targetObjectId = stableId(value.targetObjectId, `${path}.targetObjectId`);
    if (!objectIds.has(sourceObjectId) || !objectIds.has(targetObjectId)) throw new ValidationError(`${path} references an unknown scientific object`);
    if (sourceObjectId === targetObjectId) throw new ValidationError(`${path} cannot connect an object to itself`);
    return {
      id: stableId(value.id, `${path}.id`), sourceObjectId, predicate: semanticTerm(value.predicate, `${path}.predicate`), targetObjectId,
      ...(value.label === undefined ? {} : { label: stringValue(value.label, `${path}.label`, 160) }),
      ...(value.sourcePort === undefined ? {} : { sourcePort: enumValue(value.sourcePort, ["left", "right", "top", "bottom"], `${path}.sourcePort`) as RoutePort }),
      ...(value.targetPort === undefined ? {} : { targetPort: enumValue(value.targetPort, ["left", "right", "top", "bottom"], `${path}.targetPort`) as RoutePort }),
      ...(value.role === undefined ? {} : { role: enumValue(value.role, ["activation", "inhibition", "association", "transport", "conversion"], `${path}.role`) as ScientificRelationshipRole }),
      ...(value.visual === undefined ? {} : { visual: enumValue(value.visual, ["route", "semantic_only"], `${path}.visual`) as "route" | "semantic_only" })
    };
  });
  unique(relationships, "scientific figure relationship");
  return relationships;
}

function validateResolvedLayout(layout: ResolvedLayoutNode[], spec: NormalizedSpec): void {
  for (const node of layout) {
    if (node.x < PAGE_MARGIN || node.y < TITLE_BAND || node.x + node.width > spec.document.width - PAGE_MARGIN || node.y + node.height > spec.document.height - PAGE_MARGIN) {
      throw new ValidationError(`scientific figure object ${node.id} leaves the drawable canvas`);
    }
  }
  const contained = new Set(spec.constraints.filter((item) => item.type === "contain").map((item) => `${item.childId}|${item.containerId}`));
  for (let left = 0; left < layout.length; left += 1) {
    for (let right = left + 1; right < layout.length; right += 1) {
      const a = layout[left]!;
      const b = layout[right]!;
      if (overlaps(a, b) && !contained.has(`${a.id}|${b.id}`) && !contained.has(`${b.id}|${a.id}`)) {
        throw new ValidationError(`scientific figure objects ${a.id} and ${b.id} overlap without containment`);
      }
    }
  }
}

function placeObjectLabels(objects: ScientificFigureObjectSpec[], boxes: RouteBox[], spec: NormalizedSpec, theme: ScientificTheme): LabelPlacement[] {
  const results: LabelPlacement[] = [];
  const ancestors = containmentAncestors(spec.constraints);
  for (const object of objects) {
    const target = boxes.find((box) => box.id === object.id)!;
    const excluded = new Set([object.id, ...(ancestors.get(object.id) ?? [])]);
    const placement = placeLabels(
      [{ id: `${object.id}.auto-label`, text: object.label, target, fontSize: styleFor(theme, "annotation_text").fontSize, preferredPositions: object.labelPositions ?? defaultLabelPositions(object) }],
      {
        bounds: { x: PAGE_MARGIN, y: TITLE_BAND, width: spec.document.width - PAGE_MARGIN * 2, height: spec.document.height - TITLE_BAND - PAGE_MARGIN },
        obstacles: boxes.filter((box) => !excluded.has(box.id)),
        existingLabels: results
      }
    )[0]!;
    results.push(placement);
  }
  return results;
}

function compileObject(spec: ScientificFigureObjectSpec, box: FigureBox, label: LabelPlacement, theme: ScientificTheme, layoutMode: "explicit" | "layered"): CompiledObject {
  const role = spec.styleRole ?? defaultObjectRole(spec.kind);
  const shape = spec.shape ?? defaultObjectShape(spec.kind);
  const rendered = renderScientificSymbol({ objectId: spec.id, kind: spec.kind, box, shape, role, recipe: spec.recipe, theme, zIndex: 20 });
  const labelElements = makeLabelElements(spec.id, label, theme, 40);
  const semantic: ScientificObject = {
    id: spec.id,
    kind: spec.kind,
    label: spec.label,
    elementIds: [...rendered.elements.map((element) => element.id!), ...labelElements.map((element) => element.id!)],
    properties: {
      compiler: "scientific_figure_v1", theme: theme.id, shape, styleRole: role, recipe: rendered.recipeId, layoutMode,
      x: box.x, y: box.y, width: box.width, height: box.height, labelPosition: label.position,
      ...(box.rank === undefined ? {} : { layoutRank: box.rank, layoutComponent: box.component! })
    }
  };
  return { spec, box, bodyElements: rendered.elements, label, labelElements, semantic };
}

function relationshipVisualElements(id: string, points: Point[], role: ScientificRelationshipRole, theme: ScientificTheme, target: VectorElement[]): string[] {
  const token = styleFor(theme, role);
  const pathId = `${id}.path`;
  const path: VectorElement & { type: "path" } = { id: pathId, type: "path", name: `${id} routed relationship`, x: 0, y: 0, points, closed: false, zIndex: 10, style: vectorStyle(token) };
  target.push(path);
  if (role === "inhibition") {
    const barId = `${id}.inhibition-bar`;
    target.push(...placePathMarkers({ source: path, markers: [{ at: "end", kind: "bar", size: 20, thickness: token.strokeWidth, idPrefix: barId, name: `${id} inhibition bar`, zIndex: 11, style: { fill: token.stroke, stroke: null } }] }).elements);
    return [pathId, barId];
  }
  if (role === "association") return [pathId];
  const arrowId = `${id}.arrowhead`;
  target.push(...placePathMarkers({ source: path, markers: [{ at: "end", kind: "arrowhead", size: 16, idPrefix: arrowId, name: `${id} arrowhead`, zIndex: 11, style: { fill: token.stroke, stroke: null } }] }).elements);
  return [pathId, arrowId];
}

function placeRelationshipLabel(relationship: ScientificFigureRelationshipSpec, points: Point[], boxes: RouteBox[], labels: LabelPlacement[], spec: NormalizedSpec, theme: ScientificTheme): LabelPlacement {
  const anchor = longestSegmentMidpoint(points);
  return placeLabels(
    [{ id: `${relationship.id}.auto-label`, text: relationship.label!, target: { id: `${relationship.id}.route-anchor`, x: anchor.x - 1, y: anchor.y - 1, width: 2, height: 2 }, fontSize: styleFor(theme, "annotation_text").fontSize, preferredPositions: ["inside", "top", "bottom", "right", "left"] }],
    {
      bounds: { x: PAGE_MARGIN, y: TITLE_BAND, width: spec.document.width - PAGE_MARGIN * 2, height: spec.document.height - TITLE_BAND - PAGE_MARGIN },
      obstacles: boxes,
      existingLabels: labels
    }
  )[0]!;
}

function makeLabelElements(prefix: string, placement: LabelPlacement, theme: ScientificTheme, zIndex: number): VectorElement[] {
  const background = styleFor(theme, "label_background");
  const border = styleFor(theme, "label_border");
  const annotation = styleFor(theme, "annotation_text");
  return [
    ...(placement.leader ? [{ id: `${prefix}.label-leader`, type: "line" as const, name: `${prefix} label leader`, x: placement.leader.start.x, y: placement.leader.start.y, x2: placement.leader.end.x, y2: placement.leader.end.y, zIndex, style: { fill: null, stroke: border.stroke, strokeWidth: border.strokeWidth } }] : []),
    rect(`${prefix}.label-background`, placement.x, placement.y, placement.width, placement.height, { fill: background.fill, stroke: border.stroke, strokeWidth: border.strokeWidth, opacity: background.opacity }, zIndex + 1),
    text(`${prefix}.label-text`, placement.textX, placement.textY, placement.text, placement.fontSize, annotation.fontFamily!, vectorStyle(annotation), zIndex + 2)
  ];
}

function routeObstacles(sourceId: string, targetId: string, boxes: RouteBox[], labels: LabelPlacement[], constraints: LayoutConstraint[]): RouteBox[] {
  const ancestors = containmentAncestors(constraints);
  const excluded = new Set([sourceId, targetId, ...(ancestors.get(sourceId) ?? []), ...(ancestors.get(targetId) ?? [])]);
  return [
    ...boxes.filter((box) => !excluded.has(box.id)),
    ...labels.filter((label) => !excluded.has(label.targetId)).map((label) => ({ id: label.id, x: label.x, y: label.y, width: label.width, height: label.height }))
  ];
}

function containmentAncestors(constraints: LayoutConstraint[]): Map<string, string[]> {
  const parent = new Map(constraints.filter((item) => item.type === "contain").map((item) => [item.childId, item.containerId]));
  const result = new Map<string, string[]>();
  for (const child of parent.keys()) {
    const ancestors: string[] = [];
    let current = parent.get(child);
    while (current) {
      ancestors.push(current);
      current = parent.get(current);
    }
    result.set(child, ancestors);
  }
  return result;
}

function relationshipPorts(spec: ScientificFigureRelationshipSpec, source: RouteBox, target: RouteBox): [RoutePort, RoutePort] {
  if (spec.sourcePort && spec.targetPort) return [spec.sourcePort, spec.targetPort];
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const horizontal = Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y);
  if (horizontal) return targetCenter.x >= sourceCenter.x ? [spec.sourcePort ?? "right", spec.targetPort ?? "left"] : [spec.sourcePort ?? "left", spec.targetPort ?? "right"];
  return targetCenter.y >= sourceCenter.y ? [spec.sourcePort ?? "bottom", spec.targetPort ?? "top"] : [spec.sourcePort ?? "top", spec.targetPort ?? "bottom"];
}

function reciprocalRelationshipPorts(
  index: number,
  relationships: ScientificFigureRelationshipSpec[],
  source: RouteBox,
  target: RouteBox
): [RoutePort, RoutePort] | undefined {
  const relationship = relationships[index]!;
  if (relationship.sourcePort || relationship.targetPort || relationship.visual === "semantic_only") return undefined;
  const reciprocalIndex = relationships.findIndex(
    (candidate, candidateIndex) =>
      candidateIndex !== index &&
      candidate.visual !== "semantic_only" &&
      candidate.sourceObjectId === relationship.targetObjectId &&
      candidate.targetObjectId === relationship.sourceObjectId
  );
  if (reciprocalIndex < 0) return undefined;
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const horizontalSeparation = Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y);
  if (horizontalSeparation) return ["right", "left"];
  return ["bottom", "top"];
}

function relationshipPortAssignments(
  relationships: ScientificFigureRelationshipSpec[],
  boxes: Map<string, FigureBox>
): Map<string, [RoutePort, RoutePort]> {
  const assignments = new Map<string, [RoutePort, RoutePort]>();
  const protectedEndpoints = new Set<string>();
  for (let index = 0; index < relationships.length; index += 1) {
    const relationship = relationships[index]!;
    const source = boxes.get(relationship.sourceObjectId)!;
    const target = boxes.get(relationship.targetObjectId)!;
    const reciprocal = reciprocalRelationshipPorts(index, relationships, source, target);
    assignments.set(relationship.id, reciprocal ?? relationshipPorts(relationship, source, target));
    if (reciprocal) {
      protectedEndpoints.add(`${relationship.id}|source`);
      protectedEndpoints.add(`${relationship.id}|target`);
    }
    if (relationship.sourcePort) protectedEndpoints.add(`${relationship.id}|source`);
    if (relationship.targetPort) protectedEndpoints.add(`${relationship.id}|target`);
  }
  spreadCongestedPorts("source", relationships, boxes, assignments, protectedEndpoints);
  spreadCongestedPorts("target", relationships, boxes, assignments, protectedEndpoints);
  return assignments;
}

function spreadCongestedPorts(
  endpoint: "source" | "target",
  relationships: ScientificFigureRelationshipSpec[],
  boxes: Map<string, FigureBox>,
  assignments: Map<string, [RoutePort, RoutePort]>,
  protectedEndpoints: Set<string>
): void {
  const groups = new Map<string, Array<{ relationship: ScientificFigureRelationshipSpec; index: number }>>();
  relationships.forEach((relationship, index) => {
    if (relationship.visual === "semantic_only" || protectedEndpoints.has(`${relationship.id}|${endpoint}`)) return;
    const ports = assignments.get(relationship.id)!;
    const objectId = endpoint === "source" ? relationship.sourceObjectId : relationship.targetObjectId;
    const port = ports[endpoint === "source" ? 0 : 1];
    const key = `${objectId}|${port}`;
    const group = groups.get(key) ?? [];
    group.push({ relationship, index });
    groups.set(key, group);
  });
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const basePorts = assignments.get(group[0]!.relationship.id)!;
    const basePort = basePorts[endpoint === "source" ? 0 : 1];
    group.sort((left, right) => {
      const leftOther = boxes.get(endpoint === "source" ? left.relationship.targetObjectId : left.relationship.sourceObjectId)!;
      const rightOther = boxes.get(endpoint === "source" ? right.relationship.targetObjectId : right.relationship.sourceObjectId)!;
      const leftCenter = center(leftOther);
      const rightCenter = center(rightOther);
      const secondary = basePort === "left" || basePort === "right" ? leftCenter.y - rightCenter.y : leftCenter.x - rightCenter.x;
      return secondary || left.index - right.index;
    });
    const ports = spreadPorts(basePort, group.length);
    group.forEach(({ relationship }, index) => {
      const current = assignments.get(relationship.id)!;
      assignments.set(relationship.id, endpoint === "source" ? [ports[index]!, current[1]] : [current[0], ports[index]!]);
    });
  }
}

function spreadPorts(base: RoutePort, count: number): RoutePort[] {
  const perpendicular: RoutePort[] = base === "left" || base === "right" ? ["top", "bottom"] : ["left", "right"];
  const opposite: RoutePort = base === "left" ? "right" : base === "right" ? "left" : base === "top" ? "bottom" : "top";
  const order = count === 2 ? perpendicular : [perpendicular[0]!, base, perpendicular[1]!, opposite];
  return Array.from({ length: count }, (_, index) => order[index % order.length]!);
}

function relationshipRoutingOrder(relationships: ScientificFigureRelationshipSpec[]): number[] {
  const isReciprocalBackEdge = (index: number): boolean => {
    const relationship = relationships[index]!;
    return relationships.some(
      (candidate, candidateIndex) =>
        candidateIndex < index &&
        candidate.visual !== "semantic_only" &&
        candidate.sourceObjectId === relationship.targetObjectId &&
        candidate.targetObjectId === relationship.sourceObjectId
    );
  };
  return relationships
    .map((_, index) => index)
    .sort((left, right) => Number(isReciprocalBackEdge(left)) - Number(isReciprocalBackEdge(right)) || left - right);
}

function defaultObjectRole(kind: string): ScientificObjectRole {
  if (/compartment|cell|membrane/i.test(kind)) return "compartment";
  if (/protein|enzyme|receptor|organelle/i.test(kind)) return "secondary_object";
  return "primary_object";
}

function defaultObjectShape(kind: string): ScientificObjectShape {
  return /molecule|ligand|cell|organelle|compartment|nucleus/i.test(kind) ? "ellipse" : "rect";
}

function defaultLabelPositions(object: ScientificFigureObjectSpec): LabelPosition[] {
  return object.width >= 130 && object.height >= 70 ? ["inside", "bottom", "top", "right", "left"] : ["bottom", "top", "right", "left", "inside"];
}

function lastSegment(points: Point[]): [Point, Point] {
  if (points.length < 2) throw new ValidationError("routed relationship requires at least two points");
  return [points[points.length - 2]!, points[points.length - 1]!];
}

function longestSegmentMidpoint(points: Point[]): Point {
  let best: [Point, Point] = lastSegment(points);
  let length = -1;
  for (let index = 1; index < points.length; index += 1) {
    const candidate: [Point, Point] = [points[index - 1]!, points[index]!];
    const candidateLength = Math.abs(candidate[1].x - candidate[0].x) + Math.abs(candidate[1].y - candidate[0].y);
    if (candidateLength > length) { best = candidate; length = candidateLength; }
  }
  return { x: (best[0].x + best[1].x) / 2, y: (best[0].y + best[1].y) / 2 };
}

function center(box: RouteBox): Point { return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; }
function overlaps(left: ResolvedLayoutNode, right: ResolvedLayoutNode): boolean { return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y; }
function rect(id: string, x: number, y: number, width: number, height: number, style: VectorStyle, zIndex: number): VectorElement { return { id, type: "rect", name: id, x, y, width, height, style, zIndex }; }
function ellipse(id: string, x: number, y: number, width: number, height: number, style: VectorStyle, zIndex: number): VectorElement { return { id, type: "ellipse", name: id, x, y, width, height, style, zIndex }; }
function text(id: string, x: number, y: number, value: string, size: number, font: string, style: VectorStyle, zIndex: number): VectorElement { return { id, type: "text", name: id, x, y, text: value, size, font, style, zIndex }; }

function record(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${path} must be an object`); return value as Record<string, unknown>; }
function finite(value: unknown, path: string): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new ValidationError(`${path} must be finite`); return value; }
function positive(value: unknown, path: string): number { const number = finite(value, path); if (number <= 0) throw new ValidationError(`${path} must be greater than zero`); return number; }
function optionalPositive(value: unknown, path: string): number | undefined { return value === undefined ? undefined : positive(value, path); }
function nonNegative(value: unknown, path: string): number { const number = finite(value, path); if (number < 0) throw new ValidationError(`${path} cannot be negative`); return number; }
function stringValue(value: unknown, path: string, max: number): string { if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw new ValidationError(`${path} must be a non-empty string of at most ${max} characters`); return value; }
function stableId(value: unknown, path: string): string { const id = stringValue(value, path, 120); if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) throw new ValidationError(`${path} must be a stable identifier`); return id; }
function semanticTerm(value: unknown, path: string): string { return stableId(value, path); }
function enumValue(value: unknown, allowed: string[], path: string): string { if (typeof value !== "string" || !allowed.includes(value)) throw new ValidationError(`${path} must be one of: ${allowed.join(", ")}`); return value; }
function positionArray(value: unknown, path: string): LabelPosition[] { if (!Array.isArray(value) || value.length === 0) throw new ValidationError(`${path} must be a non-empty array`); const positions = value.map((item, index) => enumValue(item, ["top", "right", "bottom", "left", "inside"], `${path}[${index}]`) as LabelPosition); if (new Set(positions).size !== positions.length) throw new ValidationError(`${path} must not contain duplicates`); return positions; }
function unique(items: Array<{ id: string }>, label: string): void { const ids = new Set<string>(); for (const item of items) { if (ids.has(item.id)) throw new ValidationError(`${label} ids must be unique: ${item.id}`); ids.add(item.id); } }
