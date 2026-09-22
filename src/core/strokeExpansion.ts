import { flattenBezierPath } from "./bezierFlattening.js";
import { unionPolygonComponents, type PolygonBooleanResult } from "./polygonBoolean.js";
import { normalizeScene, ValidationError } from "./sceneValidation.js";
import type { CompoundPathElement, LineElement, PathElement, Point, VectorStyle } from "./vectorScene.js";

type StrokeSource = LineElement | PathElement;
type LineCap = "butt" | "round" | "square";
type LineJoin = "miter" | "round" | "bevel";

export interface StrokeExpansionRequest {
  source: StrokeSource;
  tolerance: number;
  maxDepth?: number;
  output?: { id?: string; name?: string; style?: VectorStyle };
}

export interface StrokeExpansionResult {
  strokeWidth: number;
  tolerance: number;
  lineCap: LineCap;
  lineJoin: LineJoin;
  miterLimit: number;
  dashArray: number[];
  dashOffset: number;
  sourceClosed: boolean;
  sourceSegmentCount: number;
  centerlinePointCount: number;
  paintedSubpathCount: number;
  componentCount: number;
  capCount: number;
  joinCount: number;
  miterFallbackCount: number;
  curveFlattening?: {
    curvedSegmentCount: number;
    outputPointCount: number;
    maxDepthUsed: number;
  };
  area: number;
  bounds: PolygonBooleanResult["bounds"];
  polygonCount: number;
  ringCount: number;
  pointCount: number;
  element: CompoundPathElement;
  engine: "software-stroke-expansion.v1+polygon-clipping-0.15.7";
}

interface PaintedSubpath {
  points: Point[];
  closed: boolean;
}

const EPSILON = 1e-9;
const MAX_PAINTED_SUBPATHS = 512;
const MAX_ARC_SEGMENTS = 512;

/** Compile renderer stroke appearance into canonical filled polygon geometry. */
export function expandStroke(input: unknown): StrokeExpansionResult {
  const request = normalizeRequest(input);
  const style = request.source.style ?? {};
  const strokeWidth = style.strokeWidth ?? 2;
  if (strokeWidth <= 0) throw new ValidationError("source.style.strokeWidth must be greater than zero for stroke expansion");
  if (style.stroke === null) throw new ValidationError("source.style.stroke cannot be null for stroke expansion");
  const lineCap = style.lineCap ?? "butt";
  const lineJoin = style.lineJoin ?? "miter";
  const miterLimit = style.miterLimit ?? 4;
  const dashArray = normalizeDashArray(style.dashArray ?? []);
  const dashOffset = style.dashOffset ?? 0;

  let centerline: Point[];
  let sourceClosed: boolean;
  let sourceSegmentCount: number;
  let curveFlattening: StrokeExpansionResult["curveFlattening"];
  if (request.source.type === "line") {
    centerline = deduplicate([{ x: request.source.x, y: request.source.y }, { x: request.source.x2, y: request.source.y2 }], false);
    sourceClosed = false;
    sourceSegmentCount = 1;
  } else {
    const flattened = flattenBezierPath({ path: request.source, tolerance: request.tolerance, ...(request.maxDepth === undefined ? {} : { maxDepth: request.maxDepth }) });
    sourceClosed = flattened.path.closed !== false;
    centerline = deduplicate(flattened.path.points, sourceClosed);
    sourceSegmentCount = flattened.sourceSegmentCount;
    if (flattened.curvedSegmentCount > 0) {
      curveFlattening = {
        curvedSegmentCount: flattened.curvedSegmentCount,
        outputPointCount: flattened.outputPointCount,
        maxDepthUsed: flattened.maxDepthUsed
      };
    }
  }
  if (centerline.length < (sourceClosed ? 3 : 2)) throw new ValidationError("Stroke centerline must contain enough distinct points");
  rejectReversals(centerline, sourceClosed);

  const painted = dashArray.length === 0
    ? [{ points: centerline, closed: sourceClosed }]
    : splitDashedPath(centerline, sourceClosed, dashArray, dashOffset);
  if (painted.length < 1) throw new ValidationError("Dash pattern produces no painted stroke geometry");
  if (painted.length > MAX_PAINTED_SUBPATHS) throw new ValidationError(`Stroke cannot produce more than ${MAX_PAINTED_SUBPATHS} painted dash subpaths`);

  const halfWidth = strokeWidth / 2;
  const arcSegments = circleSegmentCount(halfWidth, request.tolerance);
  const components: Point[][] = [];
  const stats = { caps: 0, joins: 0, miterFallbacks: 0 };
  for (const subpath of painted) expandPaintedSubpath(subpath, halfWidth, lineCap, lineJoin, miterLimit, arcSegments, components, stats);

  const defaultFill = style.stroke ?? "#111111";
  const rawOutput = request.output ?? {};
  const merged = unionPolygonComponents(components, {
    id: rawOutput.id ?? request.source.id ?? "expanded-stroke",
    name: rawOutput.name ?? `${request.source.name ?? "stroke"} expanded outline`,
    style: rawOutput.style ?? { fill: defaultFill, stroke: null, opacity: style.opacity }
  });
  if (!merged.element || merged.empty) throw new ValidationError("Stroke expansion unexpectedly produced empty geometry");
  const normalizedElement = normalizeScene({ elements: [merged.element] }).elements[0];
  if (normalizedElement?.type !== "compound_path") throw new ValidationError("Stroke expansion output must be a compound path");
  return {
    strokeWidth,
    tolerance: request.tolerance,
    lineCap,
    lineJoin,
    miterLimit,
    dashArray,
    dashOffset,
    sourceClosed,
    sourceSegmentCount,
    centerlinePointCount: centerline.length,
    paintedSubpathCount: painted.length,
    componentCount: components.length,
    capCount: stats.caps,
    joinCount: stats.joins,
    miterFallbackCount: stats.miterFallbacks,
    ...(curveFlattening ? { curveFlattening } : {}),
    area: merged.area,
    bounds: merged.bounds,
    polygonCount: merged.polygonCount,
    ringCount: merged.ringCount,
    pointCount: merged.pointCount,
    element: normalizedElement,
    engine: "software-stroke-expansion.v1+polygon-clipping-0.15.7"
  };
}

function expandPaintedSubpath(
  subpath: PaintedSubpath,
  halfWidth: number,
  lineCap: LineCap,
  lineJoin: LineJoin,
  miterLimit: number,
  arcSegments: number,
  components: Point[][],
  stats: { caps: number; joins: number; miterFallbacks: number }
): void {
  const points = subpath.points;
  const segmentCount = subpath.closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    components.push(segmentBody(start, end, halfWidth));
  }

  const joinStart = subpath.closed ? 0 : 1;
  const joinEnd = subpath.closed ? points.length : points.length - 1;
  for (let index = joinStart; index < joinEnd; index += 1) {
    addJoin(points[(index - 1 + points.length) % points.length]!, points[index]!, points[(index + 1) % points.length]!, halfWidth, lineJoin, miterLimit, arcSegments, components, stats);
  }

  if (!subpath.closed) {
    addCap(points[0]!, points[1]!, halfWidth, lineCap, arcSegments, components);
    addCap(points.at(-1)!, points.at(-2)!, halfWidth, lineCap, arcSegments, components);
    stats.caps += 2;
  }
}

function segmentBody(start: Point, end: Point, halfWidth: number): Point[] {
  const unit = direction(start, end);
  const normal = { x: -unit.y * halfWidth, y: unit.x * halfWidth };
  return [add(start, normal), add(end, normal), subtract(end, normal), subtract(start, normal)];
}

function addCap(start: Point, neighbor: Point, halfWidth: number, lineCap: LineCap, arcSegments: number, components: Point[][]): void {
  if (lineCap === "butt") return;
  if (lineCap === "round") {
    components.push(circlePolygon(start, halfWidth, arcSegments));
    return;
  }
  const inward = direction(start, neighbor);
  const outward = scale(inward, -halfWidth);
  const normal = { x: -inward.y * halfWidth, y: inward.x * halfWidth };
  components.push([add(start, normal), add(add(start, outward), normal), subtract(add(start, outward), normal), subtract(start, normal)]);
}

function addJoin(
  previous: Point,
  vertex: Point,
  next: Point,
  halfWidth: number,
  lineJoin: LineJoin,
  miterLimit: number,
  arcSegments: number,
  components: Point[][],
  stats: { joins: number; miterFallbacks: number }
): void {
  const incoming = direction(previous, vertex);
  const outgoing = direction(vertex, next);
  const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
  if (Math.abs(cross) <= EPSILON) return;
  stats.joins += 1;
  if (lineJoin === "round") {
    components.push(circlePolygon(vertex, halfWidth, arcSegments));
    return;
  }
  const side = cross > 0 ? -1 : 1;
  const normalIn = { x: -incoming.y * halfWidth * side, y: incoming.x * halfWidth * side };
  const normalOut = { x: -outgoing.y * halfWidth * side, y: outgoing.x * halfWidth * side };
  const outerIn = add(vertex, normalIn);
  const outerOut = add(vertex, normalOut);
  if (lineJoin === "bevel") {
    components.push([vertex, outerIn, outerOut]);
    return;
  }
  const miter = lineIntersection(outerIn, incoming, outerOut, outgoing);
  if (!miter || distance(vertex, miter) > miterLimit * halfWidth + EPSILON) {
    stats.miterFallbacks += 1;
    components.push([vertex, outerIn, outerOut]);
    return;
  }
  components.push([vertex, outerIn, miter, outerOut]);
}

function splitDashedPath(points: Point[], closed: boolean, pattern: number[], dashOffset: number): PaintedSubpath[] {
  const cycle = pattern.reduce((sum, value) => sum + value, 0);
  let phase = modulo(dashOffset, cycle);
  let patternIndex = 0;
  while (phase >= pattern[patternIndex]! - EPSILON) {
    phase -= pattern[patternIndex]!;
    patternIndex = (patternIndex + 1) % pattern.length;
  }
  let remaining = pattern[patternIndex]! - phase;
  let paintedNow = patternIndex % 2 === 0;
  const startsPainted = paintedNow;
  const fragments: PaintedSubpath[] = [];
  let current: Point[] | undefined;
  const segmentCount = closed ? points.length : points.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    const length = distance(start, end);
    let consumed = 0;
    while (consumed < length - EPSILON) {
      const take = Math.min(remaining, length - consumed);
      const from = interpolate(start, end, consumed / length);
      const to = interpolate(start, end, (consumed + take) / length);
      if (paintedNow) {
        if (!current) current = [from];
        appendDistinct(current, to);
      }
      consumed += take;
      remaining -= take;
      if (remaining <= EPSILON) {
        if (paintedNow && current && current.length >= 2) {
          fragments.push({ points: current, closed: false });
          current = undefined;
          if (fragments.length > MAX_PAINTED_SUBPATHS) throw new ValidationError(`Stroke cannot produce more than ${MAX_PAINTED_SUBPATHS} painted dash subpaths`);
        }
        patternIndex = (patternIndex + 1) % pattern.length;
        paintedNow = patternIndex % 2 === 0;
        remaining = pattern[patternIndex]!;
      }
    }
  }
  if (current && current.length >= 2) fragments.push({ points: current, closed: false });

  if (closed && startsPainted && fragments.length > 1 && samePoint(fragments[0]!.points[0]!, points[0]!) && samePoint(fragments.at(-1)!.points.at(-1)!, points[0]!)) {
    const first = fragments.shift()!;
    const last = fragments.pop()!;
    fragments.unshift({ points: [...last.points, ...first.points.slice(1)], closed: false });
  }
  if (closed && fragments.length === 1) {
    const only = fragments[0]!;
    if (samePoint(only.points[0]!, only.points.at(-1)!)) {
      only.points.pop();
      only.closed = true;
    }
  }
  return fragments;
}

function normalizeRequest(input: unknown): { source: StrokeSource; tolerance: number; maxDepth?: number; output?: StrokeExpansionRequest["output"] } {
  const value = object(input, "Stroke expansion request");
  const tolerance = finiteRange(value.tolerance, "tolerance", 0.000001, 100_000);
  const maxDepth = value.maxDepth === undefined ? undefined : integerRange(value.maxDepth, "maxDepth", 1, 24);
  const sourceValue = object(value.source, "source");
  if (sourceValue.type !== "line" && sourceValue.type !== "path") throw new ValidationError("source.type must be line or path");
  const source = normalizeScene({ elements: [sourceValue] }).elements[0];
  if (source?.type !== "line" && source?.type !== "path") throw new ValidationError("source must normalize as line or path");
  const output = value.output === undefined ? undefined : object(value.output, "output") as StrokeExpansionRequest["output"];
  return { source, tolerance, ...(maxDepth === undefined ? {} : { maxDepth }), ...(output ? { output } : {}) };
}

function normalizeDashArray(pattern: number[]): number[] {
  if (pattern.length === 0) return [];
  return pattern.length % 2 === 0 ? [...pattern] : [...pattern, ...pattern];
}

function circleSegmentCount(radius: number, tolerance: number): number {
  if (tolerance >= radius) return 8;
  const required = Math.ceil(Math.PI / Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius))));
  const count = Math.ceil(Math.max(8, required) / 4) * 4;
  if (count > MAX_ARC_SEGMENTS) throw new ValidationError(`tolerance ${tolerance} is too small to approximate round stroke geometry within ${MAX_ARC_SEGMENTS} segments`);
  return count;
}

function circlePolygon(center: Point, radius: number, segments: number): Point[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index * Math.PI * 2) / segments;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

function rejectReversals(points: Point[], closed: boolean): void {
  const start = closed ? 0 : 1;
  const end = closed ? points.length : points.length - 1;
  for (let index = start; index < end; index += 1) {
    const incoming = direction(points[(index - 1 + points.length) % points.length]!, points[index]!);
    const outgoing = direction(points[index]!, points[(index + 1) % points.length]!);
    if (incoming.x * outgoing.x + incoming.y * outgoing.y < -1 + 1e-9) throw new ValidationError("Stroke centerline cannot contain an exact 180-degree reversal");
  }
}

function lineIntersection(pointA: Point, directionA: Point, pointB: Point, directionB: Point): Point | undefined {
  const denominator = directionA.x * directionB.y - directionA.y * directionB.x;
  if (Math.abs(denominator) <= EPSILON) return undefined;
  const delta = subtract(pointB, pointA);
  const t = (delta.x * directionB.y - delta.y * directionB.x) / denominator;
  return add(pointA, scale(directionA, t));
}

function direction(start: Point, end: Point): Point {
  const length = distance(start, end);
  if (length <= EPSILON) throw new ValidationError("Stroke centerline cannot contain zero-length segments");
  return { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
}

function deduplicate(points: Point[], closed: boolean): Point[] {
  const result: Point[] = [];
  for (const item of points) appendDistinct(result, item);
  if (closed && result.length > 1 && samePoint(result[0]!, result.at(-1)!)) result.pop();
  return result;
}

function appendDistinct(points: Point[], value: Point): void {
  if (points.length === 0 || !samePoint(points.at(-1)!, value)) points.push({ x: clean(value.x), y: clean(value.y) });
}

function interpolate(start: Point, end: Point, t: number): Point {
  return { x: clean(start.x + (end.x - start.x) * t), y: clean(start.y + (end.y - start.y) * t) };
}

function add(left: Point, right: Point): Point { return { x: left.x + right.x, y: left.y + right.y }; }
function subtract(left: Point, right: Point): Point { return { x: left.x - right.x, y: left.y - right.y }; }
function scale(value: Point, factor: number): Point { return { x: value.x * factor, y: value.y * factor }; }
function distance(left: Point, right: Point): number { return Math.hypot(right.x - left.x, right.y - left.y); }
function samePoint(left: Point, right: Point): boolean { return Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.y - right.y) <= EPSILON; }
function modulo(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor; }
function object(input: unknown, name: string): Record<string, unknown> { if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ValidationError(`${name} must be an object`); return input as Record<string, unknown>; }
function finiteRange(input: unknown, name: string, min: number, max: number): number { if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) throw new ValidationError(`${name} must be finite and between ${min} and ${max}`); return input; }
function integerRange(input: unknown, name: string, min: number, max: number): number { if (typeof input !== "number" || !Number.isInteger(input) || input < min || input > max) throw new ValidationError(`${name} must be an integer between ${min} and ${max}`); return input; }
function clean(value: number): number { const rounded = Number(value.toFixed(9)); return Object.is(rounded, -0) ? 0 : rounded; }
