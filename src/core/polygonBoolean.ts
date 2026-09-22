import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from "polygon-clipping";
import type { CompoundPathElement, PathElement, Point, VectorStyle } from "./vectorScene.js";
import { ValidationError } from "./sceneValidation.js";
import { flattenBezierPath } from "./bezierFlattening.js";

export type PolygonBooleanOperation = "union" | "intersection" | "difference" | "xor";

export interface PolygonBooleanRegion {
  rings: Point[][];
  paths?: PathElement[];
}

export interface PolygonBooleanRequest {
  operation: PolygonBooleanOperation;
  operands: PolygonBooleanRegion[];
  curveTolerance?: number;
  curveMaxDepth?: number;
  output?: {
    id?: string;
    name?: string;
    style?: VectorStyle;
  };
}

export interface PolygonBooleanResult {
  operation: PolygonBooleanOperation;
  empty: boolean;
  operandCount: number;
  polygonCount: number;
  ringCount: number;
  pointCount: number;
  area: number;
  bounds?: { x: number; y: number; width: number; height: number };
  curveFlattening?: {
    tolerance: number;
    pathCount: number;
    curvedSegmentCount: number;
    outputPointCount: number;
    maxDepthUsed: number;
  };
  element?: CompoundPathElement;
  engine: "polygon-clipping-0.15.7";
}

export interface PolygonComponentUnionOutput {
  id?: string;
  name?: string;
  style?: VectorStyle;
}

const MAX_OPERANDS = 16;
const MAX_RINGS_PER_OPERAND = 32;
const MAX_POINTS_PER_RING = 500;
const MAX_INPUT_POINTS = 5000;
const MAX_OUTPUT_POLYGONS = 128;
const MAX_OUTPUT_RINGS = 512;
const MAX_OUTPUT_POINTS = 10000;
const MAX_COORDINATE = 1_000_000;
const EPSILON = 1e-9;

/** Perform bounded polygonal constructive geometry and return a normal compound path. */
export function constructPolygonBoolean(input: unknown): PolygonBooleanResult {
  const request = normalizeRequest(input);
  const polygons = request.operands.map(toPolygon);
  let output: MultiPolygon;
  if (request.operation === "union") output = polygonClipping.union(polygons[0]!, ...polygons.slice(1));
  else if (request.operation === "intersection") output = polygonClipping.intersection(polygons[0]!, ...polygons.slice(1));
  else if (request.operation === "xor") output = polygonClipping.xor(polygons[0]!, ...polygons.slice(1));
  else output = polygonClipping.difference(polygons[0]!, ...polygons.slice(1));

  return finalizeBooleanResult(request.operation, request.operands.length, output, request.output, request.curveFlattening);
}

/** Union bounded simple polygon components produced by another trusted core geometry compiler. */
export function unionPolygonComponents(components: Point[][], outputOptions?: PolygonComponentUnionOutput): PolygonBooleanResult {
  if (!Array.isArray(components) || components.length < 1 || components.length > 1024) {
    throw new ValidationError("Polygon component union must contain 1 to 1024 components");
  }
  let totalPoints = 0;
  const polygons = components.map((component, componentIndex) => {
    if (!Array.isArray(component) || component.length < 3 || component.length > 1000) {
      throw new ValidationError(`components[${componentIndex}] must contain 3 to 1000 points`);
    }
    const points = removeClosingAndConsecutiveDuplicates(component.map((item, pointIndex) => normalizePoint(item, `components[${componentIndex}][${pointIndex}]`)));
    if (points.length < 3 || Math.abs(signedArea(points)) <= EPSILON) throw new ValidationError(`components[${componentIndex}] must enclose a non-zero area`);
    totalPoints += points.length;
    return [toClosedRing(points)] as Polygon;
  });
  if (totalPoints > 20_000) throw new ValidationError("Polygon component union cannot exceed 20000 input points");
  const merged = polygonClipping.union(polygons[0]!, ...polygons.slice(1));
  return finalizeBooleanResult("union", components.length, merged, outputOptions);
}

function finalizeBooleanResult(
  operation: PolygonBooleanOperation,
  operandCount: number,
  output: MultiPolygon,
  outputOptions?: PolygonComponentUnionOutput,
  curveFlattening?: PolygonBooleanResult["curveFlattening"]
): PolygonBooleanResult {
  const canonical = canonicalizeMultiPolygon(output);
  const rings = canonical.flatMap((polygon) => polygon);
  const pointCount = rings.reduce((total, ring) => total + ring.length, 0);
  if (canonical.length > MAX_OUTPUT_POLYGONS || rings.length > MAX_OUTPUT_RINGS || pointCount > MAX_OUTPUT_POINTS) {
    throw new ValidationError("Polygon boolean result exceeds the bounded output complexity");
  }
  if (rings.length === 0) {
    return {
      operation,
      empty: true,
      operandCount,
      polygonCount: 0,
      ringCount: 0,
      pointCount: 0,
      area: 0,
      engine: "polygon-clipping-0.15.7",
      ...(curveFlattening ? { curveFlattening } : {})
    };
  }
  const points = rings.flat();
  const bounds = pointBounds(points);
  const area = canonical.reduce((total, polygon) => total + polygonArea(polygon), 0);
  const element: CompoundPathElement = {
    type: "compound_path",
    id: outputOptions?.id ?? "boolean-result",
    name: outputOptions?.name ?? `${operation} result`,
    x: 0,
    y: 0,
    fillRule: "evenodd",
    subpaths: rings.map((ring) => ({ points: ring.map(([x, y]) => ({ x, y })), closed: true })),
    style: outputOptions?.style ?? { fill: "#99F6E4", stroke: "#0F766E", strokeWidth: 3, lineJoin: "round" }
  };
  return {
    operation,
    empty: false,
    operandCount,
    polygonCount: canonical.length,
    ringCount: rings.length,
    pointCount,
    area: clean(area),
    bounds,
    element,
    engine: "polygon-clipping-0.15.7",
    ...(curveFlattening ? { curveFlattening } : {})
  };
}

function normalizeRequest(input: unknown): PolygonBooleanRequest & {
  operands: Array<{ rings: Point[][] }>;
  curveFlattening?: NonNullable<PolygonBooleanResult["curveFlattening"]>;
} {
  const value = object(input, "Polygon boolean request");
  const operation = value.operation;
  if (operation !== "union" && operation !== "intersection" && operation !== "difference" && operation !== "xor") {
    throw new ValidationError("Polygon boolean operation must be union, intersection, difference, or xor");
  }
  if (!Array.isArray(value.operands) || value.operands.length < 2 || value.operands.length > MAX_OPERANDS) {
    throw new ValidationError(`Polygon boolean operands must contain 2 to ${MAX_OPERANDS} regions`);
  }
  const hasCurves = value.operands.some((raw) => typeof raw === "object" && raw !== null && !Array.isArray(raw) && Array.isArray((raw as Record<string, unknown>).paths));
  const curveTolerance = value.curveTolerance === undefined ? undefined : boundedNumber(value.curveTolerance, "curveTolerance", 0.000001, 100_000);
  const curveMaxDepth = value.curveMaxDepth === undefined ? undefined : boundedInteger(value.curveMaxDepth, "curveMaxDepth", 1, 24);
  if (hasCurves && curveTolerance === undefined) throw new ValidationError("curveTolerance is required when polygon boolean operands contain paths");
  let inputPointCount = 0;
  let pathCount = 0;
  let curvedSegmentCount = 0;
  let flattenedPointCount = 0;
  let maxDepthUsed = 0;
  const operands = value.operands.map((raw, operandIndex) => {
    const operand = object(raw, `operands[${operandIndex}]`);
    const rawRings = operand.rings === undefined ? [] : operand.rings;
    const rawPaths = operand.paths === undefined ? [] : operand.paths;
    if (!Array.isArray(rawRings)) throw new ValidationError(`operands[${operandIndex}].rings must be an array`);
    if (!Array.isArray(rawPaths)) throw new ValidationError(`operands[${operandIndex}].paths must be an array`);
    if (rawRings.length + rawPaths.length < 1 || rawRings.length + rawPaths.length > MAX_RINGS_PER_OPERAND) {
      throw new ValidationError(`operands[${operandIndex}] must contain 1 to ${MAX_RINGS_PER_OPERAND} total rings or closed paths`);
    }
    const rings = rawRings.map((rawRing, ringIndex) => {
      if (!Array.isArray(rawRing) || rawRing.length < 3 || rawRing.length > MAX_POINTS_PER_RING) {
        throw new ValidationError(`operands[${operandIndex}].rings[${ringIndex}] must contain 3 to ${MAX_POINTS_PER_RING} points`);
      }
      const points = rawRing.map((rawPoint, pointIndex) => normalizePoint(rawPoint, `operands[${operandIndex}].rings[${ringIndex}][${pointIndex}]`));
      const deduplicated = removeClosingAndConsecutiveDuplicates(points);
      if (deduplicated.length < 3 || Math.abs(signedArea(deduplicated)) <= EPSILON) {
        throw new ValidationError(`operands[${operandIndex}].rings[${ringIndex}] must enclose a non-zero area`);
      }
      inputPointCount += deduplicated.length;
      return deduplicated;
    });
    for (let pathIndex = 0; pathIndex < rawPaths.length; pathIndex += 1) {
      const rawPath = object(rawPaths[pathIndex], `operands[${operandIndex}].paths[${pathIndex}]`);
      if (rawPath.closed === false) throw new ValidationError(`operands[${operandIndex}].paths[${pathIndex}] must be closed`);
      const flattened = flattenBezierPath({
        path: { ...rawPath, type: "path", closed: true },
        tolerance: curveTolerance,
        ...(curveMaxDepth === undefined ? {} : { maxDepth: curveMaxDepth })
      });
      if (flattened.path.points.length < 3 || Math.abs(signedArea(flattened.path.points)) <= EPSILON) {
        throw new ValidationError(`operands[${operandIndex}].paths[${pathIndex}] must enclose a non-zero area after flattening`);
      }
      pathCount += 1;
      curvedSegmentCount += flattened.curvedSegmentCount;
      flattenedPointCount += flattened.outputPointCount;
      maxDepthUsed = Math.max(maxDepthUsed, flattened.maxDepthUsed);
      inputPointCount += flattened.outputPointCount;
      rings.push(flattened.path.points);
    }
    return { rings };
  });
  if (inputPointCount > MAX_INPUT_POINTS) throw new ValidationError(`Polygon boolean input cannot exceed ${MAX_INPUT_POINTS} points`);
  const output = value.output === undefined ? undefined : normalizeOutput(value.output);
  return {
    operation,
    operands,
    output,
    ...(curveTolerance === undefined ? {} : { curveTolerance }),
    ...(curveMaxDepth === undefined ? {} : { curveMaxDepth }),
    ...(pathCount === 0 ? {} : {
      curveFlattening: {
        tolerance: curveTolerance!,
        pathCount,
        curvedSegmentCount,
        outputPointCount: flattenedPointCount,
        maxDepthUsed
      }
    })
  };
}

function normalizeOutput(input: unknown): NonNullable<PolygonBooleanRequest["output"]> {
  const value = object(input, "output");
  const id = optionalString(value.id, "output.id", 120);
  if (id !== undefined && !/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(id)) throw new ValidationError("output.id must be a stable identifier");
  const name = optionalString(value.name, "output.name", 120);
  const style = value.style === undefined ? undefined : normalizeOutputStyle(value.style);
  return { id, name, style };
}

function normalizeOutputStyle(input: unknown): VectorStyle {
  const style = object(input, "output.style");
  const probe = constructStyleProbe(style);
  return probe;
}

function constructStyleProbe(style: Record<string, unknown>): VectorStyle {
  const color = (value: unknown, name: string): string | null | undefined => {
    if (value === undefined || value === null) return value;
    if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) throw new ValidationError(`${name} must be null or #RRGGBB`);
    return value.toUpperCase();
  };
  const number = (value: unknown, name: string, min: number, max: number): number | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(`${name} must be between ${min} and ${max}`);
    return value;
  };
  const lineJoin = style.lineJoin;
  if (lineJoin !== undefined && lineJoin !== "miter" && lineJoin !== "round" && lineJoin !== "bevel") throw new ValidationError("output.style.lineJoin is invalid");
  return {
    fill: color(style.fill, "output.style.fill"),
    stroke: color(style.stroke, "output.style.stroke"),
    strokeWidth: number(style.strokeWidth, "output.style.strokeWidth", 0, 1000),
    opacity: number(style.opacity, "output.style.opacity", 0, 100),
    lineJoin
  };
}

function toPolygon(region: PolygonBooleanRegion): Polygon {
  return region.rings.map(toClosedRing) as Ring[];
}

function toClosedRing(ring: Point[]): Ring {
  return [...ring.map((point) => [point.x, point.y] as [number, number]), [ring[0]!.x, ring[0]!.y]];
}

function canonicalizeMultiPolygon(input: MultiPolygon): MultiPolygon {
  return input
    .map((polygon) => polygon
      .map((ring) => canonicalizeRing(ring))
      .filter((ring) => ring.length >= 3))
    .filter((polygon) => polygon.length > 0)
    .sort((left, right) => compareRing(left[0]!, right[0]!));
}

function canonicalizeRing(input: Ring): Ring {
  const open = removeClosingAndConsecutiveDuplicates(input.map(([x, y]) => ({ x: clean(x), y: clean(y) })))
    .map((point) => [point.x, point.y] as [number, number]);
  if (open.length < 3) return [];
  let start = 0;
  for (let index = 1; index < open.length; index += 1) {
    if (comparePoint(open[index]!, open[start]!) < 0) start = index;
  }
  return [...open.slice(start), ...open.slice(0, start)];
}

function compareRing(left: Ring, right: Ring): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const compared = comparePoint(left[index]!, right[index]!);
    if (compared !== 0) return compared;
  }
  return left.length - right.length;
}

function comparePoint(left: [number, number], right: [number, number]): number {
  return left[0] - right[0] || left[1] - right[1];
}

function removeClosingAndConsecutiveDuplicates(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous === undefined || previous.x !== point.x || previous.y !== point.y) result.push(point);
  }
  if (result.length > 1 && result[0]!.x === result[result.length - 1]!.x && result[0]!.y === result[result.length - 1]!.y) result.pop();
  return result;
}

function polygonArea(polygon: Polygon): number {
  if (polygon.length === 0) return 0;
  return Math.abs(ringArea(polygon[0]!)) - polygon.slice(1).reduce((total, ring) => total + Math.abs(ringArea(ring)), 0);
}

function ringArea(ring: Ring): number {
  return signedArea(ring.map(([x, y]) => ({ x, y })));
}

function signedArea(points: Point[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function pointBounds(points: Ring): { x: number; y: number; width: number; height: number } {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: clean(Math.max(...xs) - x), height: clean(Math.max(...ys) - y) };
}

function normalizePoint(input: unknown, path: string): Point {
  const value = object(input, path);
  const coordinate = (raw: unknown, axis: string): number => {
    if (typeof raw !== "number" || !Number.isFinite(raw) || Math.abs(raw) > MAX_COORDINATE) throw new ValidationError(`${path}.${axis} must be finite and within +/-${MAX_COORDINATE}`);
    return clean(raw);
  };
  return { x: coordinate(value.x, "x"), y: coordinate(value.y, "y") };
}

function object(input: unknown, name: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ValidationError(`${name} must be an object`);
  return input as Record<string, unknown>;
}

function optionalString(input: unknown, name: string, max: number): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "string" || input.length < 1 || input.length > max) throw new ValidationError(`${name} must contain 1 to ${max} characters`);
  return input;
}

function boundedNumber(input: unknown, name: string, min: number, max: number): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) throw new ValidationError(`${name} must be finite and between ${min} and ${max}`);
  return input;
}

function boundedInteger(input: unknown, name: string, min: number, max: number): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < min || input > max) throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  return input;
}

function clean(value: number): number {
  const rounded = Number(value.toFixed(9));
  return Object.is(rounded, -0) ? 0 : rounded;
}
