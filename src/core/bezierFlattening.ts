import { normalizeScene, ValidationError } from "./sceneValidation.js";
import type { PathElement, PathPoint, Point } from "./vectorScene.js";

export interface BezierFlattenRequest {
  path: PathElement;
  tolerance: number;
  maxDepth?: number;
}

export interface BezierFlattenResult {
  tolerance: number;
  maxDepth: number;
  maxDepthUsed: number;
  sourceSegmentCount: number;
  curvedSegmentCount: number;
  lineSegmentCount: number;
  outputSegmentCount: number;
  outputPointCount: number;
  bounds: { x: number; y: number; width: number; height: number };
  path: PathElement;
}

const MAX_SOURCE_POINTS = 500;
const MAX_OUTPUT_POINTS = 10_000;
const MIN_TOLERANCE = 0.000001;
const MAX_TOLERANCE = 100_000;
const DEFAULT_MAX_DEPTH = 18;
const MAX_ALLOWED_DEPTH = 24;

/**
 * Convert a cubic Bezier path into straight segments. A segment is recursively
 * subdivided until both control handles lie within the declared flatness
 * tolerance of its anchor-to-anchor chord.
 */
export function flattenBezierPath(input: unknown): BezierFlattenResult {
  const request = normalizeRequest(input);
  const source = request.path.points;
  const closed = request.path.closed !== false;
  const points: Point[] = [{ x: source[0]!.x, y: source[0]!.y }];
  const stats = { curved: 0, lines: 0, maxDepthUsed: 0 };
  const segmentCount = closed ? source.length : source.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const from = source[index]!;
    const to = source[(index + 1) % source.length]!;
    const c1 = rightHandle(from);
    const c2 = leftHandle(to);
    if (samePoint(c1, from) && samePoint(c2, to)) {
      stats.lines += 1;
      appendPoint(points, to);
      continue;
    }
    stats.curved += 1;
    flattenCubic(
      point(from),
      c1,
      c2,
      point(to),
      request.tolerance,
      request.maxDepth,
      0,
      points,
      stats
    );
  }

  if (closed && points.length > 1 && samePoint(points[0]!, points[points.length - 1]!)) points.pop();
  if (points.length > MAX_OUTPUT_POINTS) throw new ValidationError(`Flattened path cannot exceed ${MAX_OUTPUT_POINTS} points`);
  const outputSegmentCount = closed ? points.length : Math.max(0, points.length - 1);
  return {
    tolerance: request.tolerance,
    maxDepth: request.maxDepth,
    maxDepthUsed: stats.maxDepthUsed,
    sourceSegmentCount: segmentCount,
    curvedSegmentCount: stats.curved,
    lineSegmentCount: stats.lines,
    outputSegmentCount,
    outputPointCount: points.length,
    bounds: bounds(points),
    path: {
      ...request.path,
      points,
      closed,
      name: request.path.name ? `${request.path.name} (flattened)` : "flattened Bezier path"
    }
  };
}

function flattenCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance: number,
  maxDepth: number,
  depth: number,
  output: Point[],
  stats: { maxDepthUsed: number }
): void {
  stats.maxDepthUsed = Math.max(stats.maxDepthUsed, depth);
  if (isFlatEnough(p0, p1, p2, p3, tolerance)) {
    appendPoint(output, p3);
    return;
  }
  if (depth >= maxDepth) {
    throw new ValidationError(`Bezier segment did not reach tolerance ${tolerance} within maxDepth ${maxDepth}`);
  }
  if (output.length >= MAX_OUTPUT_POINTS) throw new ValidationError(`Flattened path cannot exceed ${MAX_OUTPUT_POINTS} points`);
  const p01 = midpoint(p0, p1);
  const p12 = midpoint(p1, p2);
  const p23 = midpoint(p2, p3);
  const p012 = midpoint(p01, p12);
  const p123 = midpoint(p12, p23);
  const split = midpoint(p012, p123);
  flattenCubic(p0, p01, p012, split, tolerance, maxDepth, depth + 1, output, stats);
  flattenCubic(split, p123, p23, p3, tolerance, maxDepth, depth + 1, output, stats);
}

function isFlatEnough(p0: Point, p1: Point, p2: Point, p3: Point, tolerance: number): boolean {
  return Math.max(distanceToSegment(p1, p0, p3), distanceToSegment(p2, p0, p3)) <= tolerance;
}

function distanceToSegment(pointValue: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const squaredLength = dx * dx + dy * dy;
  if (squaredLength === 0) return Math.hypot(pointValue.x - start.x, pointValue.y - start.y);
  const projection = Math.max(0, Math.min(1, ((pointValue.x - start.x) * dx + (pointValue.y - start.y) * dy) / squaredLength));
  return Math.hypot(pointValue.x - (start.x + projection * dx), pointValue.y - (start.y + projection * dy));
}

function normalizeRequest(input: unknown): { path: PathElement; tolerance: number; maxDepth: number } {
  const value = object(input, "Bezier flatten request");
  const tolerance = finiteRange(value.tolerance, "tolerance", MIN_TOLERANCE, MAX_TOLERANCE);
  const maxDepth = value.maxDepth === undefined ? DEFAULT_MAX_DEPTH : integerRange(value.maxDepth, "maxDepth", 1, MAX_ALLOWED_DEPTH);
  const rawPath = object(value.path, "path");
  if (rawPath.type !== "path") throw new ValidationError("path.type must be path");
  if (!Array.isArray(rawPath.points) || rawPath.points.length < (rawPath.closed === false ? 2 : 3) || rawPath.points.length > MAX_SOURCE_POINTS) {
    throw new ValidationError(`path.points must contain ${rawPath.closed === false ? "2" : "3"} to ${MAX_SOURCE_POINTS} points`);
  }
  rawPath.points.forEach((item, index) => {
    const pointValue = object(item, `path.points[${index}]`);
    for (const [xName, yName] of [["leftX", "leftY"], ["rightX", "rightY"]] as const) {
      if ((pointValue[xName] === undefined) !== (pointValue[yName] === undefined)) {
        throw new ValidationError(`path.points[${index}].${xName} and path.points[${index}].${yName} must be provided together`);
      }
    }
  });
  const path = normalizeScene({
    elements: [{ ...rawPath, type: "path", x: rawPath.x ?? 0, y: rawPath.y ?? 0, closed: rawPath.closed === false ? false : true }]
  }).elements[0];
  if (path?.type !== "path") throw new ValidationError("path must normalize as a path element");
  return { path, tolerance, maxDepth };
}

function rightHandle(value: PathPoint): Point {
  return value.rightX === undefined ? point(value) : { x: value.rightX, y: value.rightY! };
}

function leftHandle(value: PathPoint): Point {
  return value.leftX === undefined ? point(value) : { x: value.leftX, y: value.leftY! };
}

function appendPoint(points: Point[], value: Point): void {
  if (!samePoint(points[points.length - 1]!, value)) points.push({ x: clean(value.x), y: clean(value.y) });
}

function midpoint(left: Point, right: Point): Point {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

function point(value: Point): Point {
  return { x: value.x, y: value.y };
}

function bounds(points: Point[]): { x: number; y: number; width: number; height: number } {
  const xs = points.map((item) => item.x);
  const ys = points.map((item) => item.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x: clean(x), y: clean(y), width: clean(Math.max(...xs) - x), height: clean(Math.max(...ys) - y) };
}

function object(input: unknown, name: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ValidationError(`${name} must be an object`);
  return input as Record<string, unknown>;
}

function finiteRange(input: unknown, name: string, min: number, max: number): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) throw new ValidationError(`${name} must be finite and between ${min} and ${max}`);
  return clean(input);
}

function integerRange(input: unknown, name: string, min: number, max: number): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < min || input > max) throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  return input;
}

function clean(value: number): number {
  const rounded = Number(value.toFixed(9));
  return Object.is(rounded, -0) ? 0 : rounded;
}
