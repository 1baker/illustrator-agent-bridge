import type {
  PathPoint,
  Point,
  ScientificObject,
  ScientificRelationship,
  SceneSemantics,
  SemanticScalar,
  VectorDocument,
  VectorElement,
  VectorGroup,
  VectorClip,
  VectorPaint,
  GradientUnits,
  GradientSpread,
  VectorScene,
  VectorStyle
} from "./vectorScene.js";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const STABLE_ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/;
const SEMANTIC_TERM = /^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function normalizeScene(input: unknown): VectorScene {
  const value = object(input, "scene");
  const elementsValue = value.elements;

  if (!Array.isArray(elementsValue)) {
    throw new ValidationError("scene.elements must be an array");
  }

  if (elementsValue.length === 0) {
    throw new ValidationError("scene.elements must include at least one element");
  }

  if (elementsValue.length > 1000) {
    throw new ValidationError("scene.elements cannot include more than 1000 elements");
  }

  const paints = normalizePaints(value.paints);
  const elements = elementsValue.map((element, index) => normalizeElement(element, `scene.elements[${index}]`));
  validateUniqueElementIds(elements);
  validatePaintReferences(paints, elements);
  const groups = normalizeGroups(value.groups);
  validateCompositionGraph(groups, elements);
  const semantics = normalizeSemantics(value.semantics, elements);

  return {
    document: normalizeDocument(value.document),
    elements,
    ...(paints.length === 0 ? {} : { paints }),
    ...(groups.length === 0 ? {} : { groups }),
    ...(semantics === undefined ? {} : { semantics })
  };
}

function normalizePaints(input: unknown): VectorPaint[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new ValidationError("scene.paints must be an array");
  if (input.length < 1 || input.length > 64) throw new ValidationError("scene.paints must contain 1 to 64 paint definitions");
  const paints = input.map((item, index) => normalizePaint(item, `scene.paints[${index}]`));
  validateUniqueIds(paints, "scene.paints");
  return paints;
}

function normalizePaint(input: unknown, path: string): VectorPaint {
  const value = object(input, path);
  const type = stringValue(value.type, `${path}.type`);
  if (type !== "linear_gradient" && type !== "radial_gradient") throw new ValidationError(`${path}.type must be linear_gradient or radial_gradient`);
  const units = (value.units === undefined ? undefined : stringValue(value.units, `${path}.units`)) as GradientUnits | undefined;
  if (units !== undefined && units !== "object_bounding_box" && units !== "user_space") throw new ValidationError(`${path}.units must be object_bounding_box or user_space`);
  const spread = (value.spread === undefined ? undefined : stringValue(value.spread, `${path}.spread`)) as GradientSpread | undefined;
  if (spread !== undefined && spread !== "pad" && spread !== "reflect" && spread !== "repeat") throw new ValidationError(`${path}.spread must be pad, reflect, or repeat`);
  if (!Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > 32) throw new ValidationError(`${path}.stops must contain 2 to 32 gradient stops`);
  const stops = value.stops.map((item, index) => {
    const stop = object(item, `${path}.stops[${index}]`);
    return { offset: numberRange(stop.offset, `${path}.stops[${index}].offset`, 0, 100), color: requiredColor(stop.color, `${path}.stops[${index}].color`), opacity: optionalNumberRange(stop.opacity, `${path}.stops[${index}].opacity`, 0, 100) };
  });
  if (stops[0]!.offset !== 0 || stops.at(-1)!.offset !== 100) throw new ValidationError(`${path}.stops must begin at 0 and end at 100`);
  for (let index = 1; index < stops.length; index += 1) if (stops[index]!.offset <= stops[index - 1]!.offset) throw new ValidationError(`${path}.stops offsets must increase strictly`);
  let transform: [number, number, number, number, number, number] | undefined;
  if (value.transform !== undefined) {
    if (!Array.isArray(value.transform) || value.transform.length !== 6) throw new ValidationError(`${path}.transform must contain exactly 6 matrix numbers`);
    transform = value.transform.map((entry, index) => numberRange(entry, `${path}.transform[${index}]`, -1_000_000, 1_000_000)) as [number, number, number, number, number, number];
  }
  const base = { id: stableId(value.id, `${path}.id`), name: optionalString(value.name, `${path}.name`, 120), units, spread, stops, transform };
  if (type === "linear_gradient") {
    const x1 = gradientCoordinate(value.x1, `${path}.x1`, units); const y1 = gradientCoordinate(value.y1, `${path}.y1`, units);
    const x2 = gradientCoordinate(value.x2, `${path}.x2`, units); const y2 = gradientCoordinate(value.y2, `${path}.y2`, units);
    if (x1 === x2 && y1 === y2) throw new ValidationError(`${path} linear gradient vector cannot be zero length`);
    return { ...base, type, x1, y1, x2, y2 };
  }
  const cx = gradientCoordinate(value.cx, `${path}.cx`, units);
  const cy = gradientCoordinate(value.cy, `${path}.cy`, units);
  const r = gradientRadius(value.r, `${path}.r`, units);
  return { ...base, type, cx, cy, r, fx: value.fx === undefined ? undefined : gradientCoordinate(value.fx, `${path}.fx`, units), fy: value.fy === undefined ? undefined : gradientCoordinate(value.fy, `${path}.fy`, units) };
}

function gradientCoordinate(input: unknown, path: string, units: unknown): number {
  return units === "user_space" ? numberRange(input, path, -14400, 14400) : numberRange(input, path, -10, 10);
}

function gradientRadius(input: unknown, path: string, units: unknown): number {
  return units === "user_space" ? positiveNumber(input, path, 28800) : positiveNumber(input, path, 10);
}

function validatePaintReferences(paints: VectorPaint[], elements: VectorElement[]): void {
  const paintIds = new Set(paints.map((paint) => paint.id));
  const elementIds = new Set(elements.flatMap((element) => element.id ? [element.id] : []));
  for (const id of paintIds) if (elementIds.has(id)) throw new ValidationError(`scene paint id conflicts with scene element id: ${id}`);
  for (const element of elements) {
    for (const [property, reference] of [["fillPaint", element.style?.fillPaint], ["strokePaint", element.style?.strokePaint]] as const) {
      if (reference !== undefined && !paintIds.has(reference)) throw new ValidationError(`scene element ${element.id ?? element.name ?? element.type} ${property} references unknown paint id: ${reference}`);
    }
  }
}

function normalizeDocument(input: unknown): VectorDocument {
  if (input === undefined) {
    return {};
  }

  const value = object(input, "scene.document");
  const colorMode = value.colorMode === undefined ? undefined : stringValue(value.colorMode, "scene.document.colorMode");

  if (colorMode !== undefined && colorMode !== "RGB" && colorMode !== "CMYK") {
    throw new ValidationError("scene.document.colorMode must be RGB or CMYK");
  }

  return {
    title: optionalString(value.title, "scene.document.title", 120),
    width: optionalPositiveNumber(value.width, "scene.document.width", 14400),
    height: optionalPositiveNumber(value.height, "scene.document.height", 14400),
    colorMode
  };
}

function normalizeElement(input: unknown, path: string): VectorElement {
  const value = object(input, path);
  const type = stringValue(value.type, `${path}.type`);
  const base = {
    id: optionalStableId(value.id, `${path}.id`),
    name: optionalString(value.name, `${path}.name`, 120),
    x: finiteNumber(value.x, `${path}.x`),
    y: finiteNumber(value.y, `${path}.y`),
    groupId: optionalStableId(value.groupId, `${path}.groupId`),
    zIndex: optionalIntegerRange(value.zIndex, `${path}.zIndex`, -10000, 10000),
    visible: value.visible === undefined ? undefined : booleanValue(value.visible, `${path}.visible`),
    style: normalizeStyle(value.style, `${path}.style`)
  };

  if (type === "rect" || type === "ellipse") {
    return {
      ...base,
      type,
      width: positiveNumber(value.width, `${path}.width`, 14400),
      height: positiveNumber(value.height, `${path}.height`, 14400)
    };
  }

  if (type === "text") {
    return {
      ...base,
      type,
      text: stringValue(value.text, `${path}.text`, 5000),
      size: optionalPositiveNumber(value.size, `${path}.size`, 1000),
      font: optionalString(value.font, `${path}.font`, 200)
    };
  }

  if (type === "line") {
    if (base.style.fillPaint !== undefined) throw new ValidationError(`${path}.style.fillPaint cannot paint a line interior; use strokePaint`);
    return {
      ...base,
      type,
      x2: finiteNumber(value.x2, `${path}.x2`),
      y2: finiteNumber(value.y2, `${path}.y2`)
    };
  }

  if (type === "polygon") {
    if (!Array.isArray(value.points)) {
      throw new ValidationError(`${path}.points must be an array`);
    }
    if (value.points.length < 3) {
      throw new ValidationError(`${path}.points must contain at least 3 points`);
    }
    if (value.points.length > 500) {
      throw new ValidationError(`${path}.points cannot contain more than 500 points`);
    }
    return {
      ...base,
      type,
      points: value.points.map((point, index) => normalizePoint(point, `${path}.points[${index}]`))
    };
  }

  if (type === "path") {
    if (!Array.isArray(value.points)) {
      throw new ValidationError(`${path}.points must be an array`);
    }
    const closed = value.closed === undefined ? undefined : booleanValue(value.closed, `${path}.closed`);
    const minimumPoints = closed === false ? 2 : 3;
    if (value.points.length < minimumPoints) {
      throw new ValidationError(`${path}.points must contain at least ${minimumPoints} points`);
    }
    if (value.points.length > 500) {
      throw new ValidationError(`${path}.points cannot contain more than 500 points`);
    }
    return {
      ...base,
      type,
      points: value.points.map((point, index) => normalizePathPoint(point, `${path}.points[${index}]`)),
      closed
    };
  }

  if (type === "compound_path") {
    if (!Array.isArray(value.subpaths) || value.subpaths.length < 1 || value.subpaths.length > 32) {
      throw new ValidationError(`${path}.subpaths must contain 1 to 32 closed paths`);
    }
    const fillRule = value.fillRule === undefined ? undefined : stringValue(value.fillRule, `${path}.fillRule`);
    if (fillRule !== undefined && fillRule !== "nonzero" && fillRule !== "evenodd") {
      throw new ValidationError(`${path}.fillRule must be nonzero or evenodd`);
    }
    let totalPoints = 0;
    const subpaths = value.subpaths.map((input, index) => {
      const subpath = object(input, `${path}.subpaths[${index}]`);
      if (!Array.isArray(subpath.points) || subpath.points.length < 3 || subpath.points.length > 500) {
        throw new ValidationError(`${path}.subpaths[${index}].points must contain 3 to 500 points`);
      }
      if (subpath.closed === false) {
        throw new ValidationError(`${path}.subpaths[${index}] must be closed`);
      }
      totalPoints += subpath.points.length;
      return {
        points: subpath.points.map((point, pointIndex) => normalizePathPoint(point, `${path}.subpaths[${index}].points[${pointIndex}]`)),
        closed: true as const
      };
    });
    if (totalPoints > 2000) throw new ValidationError(`${path}.subpaths cannot contain more than 2000 points total`);
    return { ...base, type, subpaths, fillRule };
  }

  throw new ValidationError(`${path}.type is not supported: ${type}`);
}

function normalizeGroups(input: unknown): VectorGroup[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    throw new ValidationError("scene.groups must be an array");
  }
  if (input.length > 250) {
    throw new ValidationError("scene.groups cannot include more than 250 groups");
  }
  const groups = input.map((item, index) => normalizeGroup(item, `scene.groups[${index}]`));
  validateUniqueIds(groups, "scene.groups");
  return groups;
}

function normalizeGroup(input: unknown, path: string): VectorGroup {
  const value = object(input, path);
  return {
    id: stableId(value.id, `${path}.id`),
    name: optionalString(value.name, `${path}.name`, 120),
    parentId: optionalStableId(value.parentId, `${path}.parentId`),
    zIndex: optionalIntegerRange(value.zIndex, `${path}.zIndex`, -10000, 10000),
    opacity: optionalNumberRange(value.opacity, `${path}.opacity`, 0, 100),
    visible: value.visible === undefined ? undefined : booleanValue(value.visible, `${path}.visible`),
    clip: value.clip === undefined ? undefined : normalizeClip(value.clip, `${path}.clip`)
  };
}

function normalizeClip(input: unknown, path: string): VectorClip {
  const value = object(input, path);
  const type = stringValue(value.type, `${path}.type`);
  const base = { x: finiteNumber(value.x, `${path}.x`), y: finiteNumber(value.y, `${path}.y`) };
  if (type === "rect" || type === "ellipse") {
    return {
      ...base,
      type,
      width: positiveNumber(value.width, `${path}.width`, 14400),
      height: positiveNumber(value.height, `${path}.height`, 14400)
    };
  }
  if (type === "polygon" || type === "path") {
    if (!Array.isArray(value.points) || value.points.length < 3) {
      throw new ValidationError(`${path}.points must contain at least 3 points`);
    }
    if (value.points.length > 500) {
      throw new ValidationError(`${path}.points cannot contain more than 500 points`);
    }
    if (type === "path" && value.closed === false) {
      throw new ValidationError(`${path} must be closed because an open path cannot define a clipping interior`);
    }
    return type === "polygon"
      ? { ...base, type, points: value.points.map((point, index) => normalizePoint(point, `${path}.points[${index}]`)) }
      : { ...base, type, closed: true, points: value.points.map((point, index) => normalizePathPoint(point, `${path}.points[${index}]`)) };
  }
  throw new ValidationError(`${path}.type must be rect, ellipse, polygon, or path`);
}

function validateCompositionGraph(groups: VectorGroup[], elements: VectorElement[]): void {
  const groupIds = new Set(groups.map((group) => group.id));
  for (const group of groups) {
    if (group.parentId !== undefined && !groupIds.has(group.parentId)) {
      throw new ValidationError(`scene group ${group.id} references unknown parent group: ${group.parentId}`);
    }
    if (group.parentId === group.id) {
      throw new ValidationError(`scene group ${group.id} cannot parent itself`);
    }
  }
  for (const element of elements) {
    if (element.groupId !== undefined && !groupIds.has(element.groupId)) {
      throw new ValidationError(`scene element ${element.id ?? element.name ?? element.type} references unknown group: ${element.groupId}`);
    }
  }

  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const group of groups) {
    const visited = new Set<string>();
    let current: VectorGroup | undefined = group;
    while (current?.parentId !== undefined) {
      if (visited.has(current.id)) {
        throw new ValidationError(`scene group parent cycle detected at: ${current.id}`);
      }
      visited.add(current.id);
      current = byId.get(current.parentId);
    }
  }
}

function normalizeSemantics(input: unknown, elements: VectorElement[]): SceneSemantics | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = object(input, "scene.semantics");
  if (!Array.isArray(value.objects) || value.objects.length === 0) {
    throw new ValidationError("scene.semantics.objects must be a non-empty array");
  }
  if (value.objects.length > 500) {
    throw new ValidationError("scene.semantics.objects cannot include more than 500 objects");
  }
  if (value.relationships !== undefined && !Array.isArray(value.relationships)) {
    throw new ValidationError("scene.semantics.relationships must be an array");
  }

  const elementIds = new Set(elements.flatMap((element) => (element.id ? [element.id] : [])));
  const objects = value.objects.map((item, index) => normalizeScientificObject(item, `scene.semantics.objects[${index}]`, elementIds));
  validateUniqueIds(objects, "scene.semantics.objects");
  const objectIds = new Set(objects.map((item) => item.id));
  const relationships = (value.relationships ?? []).map((item, index) =>
    normalizeScientificRelationship(item, `scene.semantics.relationships[${index}]`, objectIds, elementIds)
  );
  validateUniqueIds(relationships, "scene.semantics.relationships");

  return {
    objects,
    ...(relationships.length === 0 ? {} : { relationships })
  };
}

function normalizeScientificObject(input: unknown, path: string, elementIds: Set<string>): ScientificObject {
  const value = object(input, path);
  const id = stableId(value.id, `${path}.id`);
  const kind = semanticTerm(value.kind, `${path}.kind`);
  const referencedElements = stableIdArray(value.elementIds, `${path}.elementIds`, 500);
  validateReferences(referencedElements, elementIds, `${path}.elementIds`, "scene element");

  return {
    id,
    kind,
    label: optionalString(value.label, `${path}.label`, 200),
    elementIds: referencedElements,
    properties: normalizeSemanticProperties(value.properties, `${path}.properties`)
  };
}

function normalizeScientificRelationship(
  input: unknown,
  path: string,
  objectIds: Set<string>,
  elementIds: Set<string>
): ScientificRelationship {
  const value = object(input, path);
  const sourceObjectId = stableId(value.sourceObjectId, `${path}.sourceObjectId`);
  const targetObjectId = stableId(value.targetObjectId, `${path}.targetObjectId`);
  validateReferences([sourceObjectId, targetObjectId], objectIds, path, "scientific object");
  const visualElementIds = value.visualElementIds === undefined ? [] : stableIdArray(value.visualElementIds, `${path}.visualElementIds`, 100);
  validateReferences(visualElementIds, elementIds, `${path}.visualElementIds`, "scene element");

  return {
    id: stableId(value.id, `${path}.id`),
    sourceObjectId,
    predicate: semanticTerm(value.predicate, `${path}.predicate`),
    targetObjectId,
    ...(visualElementIds.length === 0 ? {} : { visualElementIds }),
    properties: normalizeSemanticProperties(value.properties, `${path}.properties`)
  };
}

function normalizeSemanticProperties(input: unknown, path: string): Record<string, SemanticScalar> | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = object(input, path);
  const entries = Object.entries(value);
  if (entries.length > 50) {
    throw new ValidationError(`${path} cannot contain more than 50 properties`);
  }

  const normalized: Record<string, SemanticScalar> = {};
  for (const [key, item] of entries) {
    semanticTerm(key, `${path} key`);
    if (typeof item === "string") {
      normalized[key] = stringValue(item, `${path}.${key}`, 500);
    } else if (typeof item === "number") {
      normalized[key] = finiteNumber(item, `${path}.${key}`);
    } else if (typeof item === "boolean") {
      normalized[key] = item;
    } else {
      throw new ValidationError(`${path}.${key} must be a string, number, or boolean`);
    }
  }

  return normalized;
}

function validateUniqueElementIds(elements: VectorElement[]): void {
  const ids = elements.flatMap((element) => (element.id ? [element.id] : []));
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError("scene element ids must be unique");
  }
}

function validateUniqueIds(items: Array<{ id: string }>, path: string): void {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError(`${path} ids must be unique`);
  }
}

function validateReferences(values: string[], known: Set<string>, path: string, target: string): void {
  for (const value of values) {
    if (!known.has(value)) {
      throw new ValidationError(`${path} references unknown ${target} id: ${value}`);
    }
  }
}

function stableIdArray(input: unknown, path: string, maximum: number): string[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ValidationError(`${path} must be a non-empty array`);
  }
  if (input.length > maximum) {
    throw new ValidationError(`${path} cannot contain more than ${maximum} ids`);
  }
  const ids = input.map((item, index) => stableId(item, `${path}[${index}]`));
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError(`${path} cannot contain duplicate ids`);
  }
  return ids;
}

function stableId(input: unknown, path: string): string {
  const value = stringValue(input, path, 120);
  if (!STABLE_ID.test(value)) {
    throw new ValidationError(`${path} must start with a letter and contain only letters, numbers, dot, colon, underscore, or hyphen`);
  }
  return value;
}

function optionalStableId(input: unknown, path: string): string | undefined {
  return input === undefined ? undefined : stableId(input, path);
}

function semanticTerm(input: unknown, path: string): string {
  const value = stringValue(input, path, 120);
  if (!SEMANTIC_TERM.test(value)) {
    throw new ValidationError(`${path} must be a machine-readable semantic term`);
  }
  return value;
}

function normalizePoint(input: unknown, path: string): Point {
  const value = object(input, path);
  return {
    x: finiteNumber(value.x, `${path}.x`),
    y: finiteNumber(value.y, `${path}.y`)
  };
}

function normalizePathPoint(input: unknown, path: string): PathPoint {
  const value = object(input, path);
  const pointType = value.pointType === undefined ? undefined : stringValue(value.pointType, `${path}.pointType`);
  if (pointType !== undefined && pointType !== "corner" && pointType !== "smooth") {
    throw new ValidationError(`${path}.pointType must be corner or smooth`);
  }
  if ((value.leftX === undefined) !== (value.leftY === undefined)) {
    throw new ValidationError(`${path}.leftX and ${path}.leftY must be provided together`);
  }
  if ((value.rightX === undefined) !== (value.rightY === undefined)) {
    throw new ValidationError(`${path}.rightX and ${path}.rightY must be provided together`);
  }

  return {
    x: finiteNumber(value.x, `${path}.x`),
    y: finiteNumber(value.y, `${path}.y`),
    leftX: optionalFiniteNumber(value.leftX, `${path}.leftX`),
    leftY: optionalFiniteNumber(value.leftY, `${path}.leftY`),
    rightX: optionalFiniteNumber(value.rightX, `${path}.rightX`),
    rightY: optionalFiniteNumber(value.rightY, `${path}.rightY`),
    pointType
  };
}

function normalizeStyle(input: unknown, path: string): VectorStyle {
  if (input === undefined) {
    return {};
  }

  const value = object(input, path);
  if (value.fillPaint !== undefined && value.fill !== undefined) throw new ValidationError(`${path} cannot define both fill and fillPaint`);
  if (value.strokePaint !== undefined && value.stroke !== undefined) throw new ValidationError(`${path} cannot define both stroke and strokePaint`);
  const lineCap = value.lineCap === undefined ? undefined : stringValue(value.lineCap, `${path}.lineCap`);
  if (lineCap !== undefined && lineCap !== "butt" && lineCap !== "round" && lineCap !== "square") {
    throw new ValidationError(`${path}.lineCap must be butt, round, or square`);
  }
  const lineJoin = value.lineJoin === undefined ? undefined : stringValue(value.lineJoin, `${path}.lineJoin`);
  if (lineJoin !== undefined && lineJoin !== "miter" && lineJoin !== "round" && lineJoin !== "bevel") {
    throw new ValidationError(`${path}.lineJoin must be miter, round, or bevel`);
  }
  let dashArray: number[] | undefined;
  if (value.dashArray !== undefined) {
    if (!Array.isArray(value.dashArray) || value.dashArray.length < 1 || value.dashArray.length > 32) {
      throw new ValidationError(`${path}.dashArray must contain 1 to 32 positive numbers`);
    }
    dashArray = value.dashArray.map((entry, index) => positiveNumber(entry, `${path}.dashArray[${index}]`, 14400));
  }
  return {
    fill: optionalColor(value.fill, `${path}.fill`),
    fillPaint: optionalStableId(value.fillPaint, `${path}.fillPaint`),
    stroke: optionalColor(value.stroke, `${path}.stroke`),
    strokePaint: optionalStableId(value.strokePaint, `${path}.strokePaint`),
    strokeWidth: optionalNonNegativeNumber(value.strokeWidth, `${path}.strokeWidth`, 1000),
    opacity: optionalNumberRange(value.opacity, `${path}.opacity`, 0, 100),
    lineCap,
    lineJoin,
    dashArray,
    dashOffset: optionalNumberRange(value.dashOffset, `${path}.dashOffset`, -14400, 14400),
    miterLimit: optionalNumberRange(value.miterLimit, `${path}.miterLimit`, 1, 100)
  };
}

function object(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError(`${path} must be an object`);
  }

  return input as Record<string, unknown>;
}

function stringValue(input: unknown, path: string, maxLength = 200): string {
  if (typeof input !== "string") {
    throw new ValidationError(`${path} must be a string`);
  }

  if (input.length > maxLength) {
    throw new ValidationError(`${path} cannot exceed ${maxLength} characters`);
  }

  return input;
}

function optionalString(input: unknown, path: string, maxLength: number): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  return stringValue(input, path, maxLength);
}

function finiteNumber(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new ValidationError(`${path} must be a finite number`);
  }

  return input;
}

function optionalFiniteNumber(input: unknown, path: string): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  return finiteNumber(input, path);
}

function booleanValue(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") {
    throw new ValidationError(`${path} must be a boolean`);
  }

  return input;
}

function positiveNumber(input: unknown, path: string, max: number): number {
  const value = finiteNumber(input, path);
  if (value <= 0 || value > max) {
    throw new ValidationError(`${path} must be greater than 0 and no more than ${max}`);
  }

  return value;
}

function optionalPositiveNumber(input: unknown, path: string, max: number): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  return positiveNumber(input, path, max);
}

function optionalNonNegativeNumber(input: unknown, path: string, max: number): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = finiteNumber(input, path);
  if (value < 0 || value > max) {
    throw new ValidationError(`${path} must be between 0 and ${max}`);
  }

  return value;
}

function optionalNumberRange(input: unknown, path: string, min: number, max: number): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = finiteNumber(input, path);
  if (value < min || value > max) {
    throw new ValidationError(`${path} must be between ${min} and ${max}`);
  }

  return value;
}

function numberRange(input: unknown, path: string, min: number, max: number): number {
  const value = finiteNumber(input, path);
  if (value < min || value > max) throw new ValidationError(`${path} must be between ${min} and ${max}`);
  return value;
}

function optionalIntegerRange(input: unknown, path: string, min: number, max: number): number | undefined {
  const value = optionalNumberRange(input, path, min, max);
  if (value !== undefined && !Number.isInteger(value)) {
    throw new ValidationError(`${path} must be an integer`);
  }
  return value;
}

function optionalColor(input: unknown, path: string): string | null | undefined {
  if (input === undefined || input === null) {
    return input;
  }

  const value = stringValue(input, path, 7);
  if (!HEX_COLOR.test(value)) {
    throw new ValidationError(`${path} must be a #RRGGBB color or null`);
  }

  return value.toUpperCase();
}

function requiredColor(input: unknown, path: string): string {
  const value = optionalColor(input, path);
  if (value === undefined || value === null) throw new ValidationError(`${path} must be a #RRGGBB color`);
  return value;
}
