import { normalizeScene, ValidationError } from "./sceneValidation.js";
import type { LineElement, PathElement, PathPoint, Point, VectorElement, VectorStyle } from "./vectorScene.js";

export type PathMarkerPosition = "start" | "mid" | "end";
export type PathMarkerKind = "arrowhead" | "bar" | "circle" | "diamond";

export interface PathMarkerSpec {
  at: PathMarkerPosition;
  kind: PathMarkerKind;
  size: number;
  thickness?: number;
  reverse?: boolean;
  idPrefix: string;
  name?: string;
  style?: VectorStyle;
  zIndex?: number;
}

export interface PathMarkerRequest {
  source: LineElement | PathElement;
  markers: PathMarkerSpec[];
}

export interface ResolvedPathMarker {
  id: string;
  at: PathMarkerPosition;
  kind: PathMarkerKind;
  sourcePointIndex: number;
  anchor: Point;
  tangent: Point;
  angleDegrees: number;
  reverse: boolean;
  elementId: string;
}

export interface PathMarkerResult {
  sourceType: "line" | "path";
  sourceClosed: boolean;
  sourcePointCount: number;
  requestedMarkerCount: number;
  placedMarkerCount: number;
  placements: ResolvedPathMarker[];
  elements: VectorElement[];
  engine: "software-path-markers.v1";
}

const EPSILON = 1e-9;
const MAX_REQUESTED_MARKERS = 32;
const MAX_OUTPUT_MARKERS = 500;

/** Resolve marker positions and orientation from line or cubic path geometry. */
export function placePathMarkers(input: unknown): PathMarkerResult {
  const request = normalizeRequest(input);
  const points = sourcePoints(request.source);
  const closed = request.source.type === "path" && request.source.closed !== false;
  const placements: ResolvedPathMarker[] = [];
  const elements: VectorElement[] = [];

  for (const marker of request.markers) {
    const indices = marker.at === "start" ? [0] : marker.at === "end" ? [points.length - 1] : midIndices(points.length);
    if (indices.length === 0) throw new ValidationError(`Marker ${marker.idPrefix} requests mid placement on a source without interior vertices`);
    for (const pointIndex of indices) {
      if (elements.length >= MAX_OUTPUT_MARKERS) throw new ValidationError(`Path markers cannot produce more than ${MAX_OUTPUT_MARKERS} elements`);
      const anchor = points[pointIndex]!;
      const baseTangent = tangentAt(request.source, pointIndex, marker.at, closed);
      const tangent = marker.reverse ? { x: -baseTangent.x, y: -baseTangent.y } : baseTangent;
      const id = marker.at === "mid" ? `${marker.idPrefix}.${pointIndex}` : marker.idPrefix;
      const element = markerElement(id, marker, anchor, tangent, request.source);
      elements.push(element);
      placements.push({
        id,
        at: marker.at,
        kind: marker.kind,
        sourcePointIndex: pointIndex,
        anchor: cleanPoint(anchor),
        tangent: cleanPoint(tangent),
        angleDegrees: canonicalAngleDegrees(tangent),
        reverse: marker.reverse ?? false,
        elementId: id
      });
    }
  }
  const normalized = normalizeScene({ elements }).elements;
  return {
    sourceType: request.source.type,
    sourceClosed: closed,
    sourcePointCount: points.length,
    requestedMarkerCount: request.markers.length,
    placedMarkerCount: normalized.length,
    placements,
    elements: normalized,
    engine: "software-path-markers.v1"
  };
}

function markerElement(id: string, marker: PathMarkerSpec, anchor: Point, tangent: Point, source: LineElement | PathElement): VectorElement {
  const normal = { x: -tangent.y, y: tangent.x };
  const defaultColor = source.style?.stroke ?? "#111111";
  const style = marker.style ?? { fill: defaultColor, stroke: null, opacity: source.style?.opacity };
  const name = marker.name ?? `${marker.kind} ${marker.at} marker`;
  const zIndex = marker.zIndex ?? (source.zIndex ?? 0) + 1;
  if (marker.kind === "circle") {
    return { id, type: "ellipse", name, x: anchor.x - marker.size / 2, y: anchor.y - marker.size / 2, width: marker.size, height: marker.size, zIndex, style };
  }
  if (marker.kind === "arrowhead") {
    const base = add(anchor, scale(tangent, -marker.size));
    const halfWidth = marker.size * 0.55;
    return { id, type: "polygon", name, x: 0, y: 0, zIndex, points: [anchor, add(base, scale(normal, halfWidth)), add(base, scale(normal, -halfWidth))], style };
  }
  if (marker.kind === "bar") {
    const halfLength = marker.size / 2;
    const halfThickness = (marker.thickness ?? Math.max(2, marker.size * 0.2)) / 2;
    return {
      id,
      type: "polygon",
      name,
      x: 0,
      y: 0,
      zIndex,
      points: [
        add(add(anchor, scale(normal, halfLength)), scale(tangent, halfThickness)),
        add(add(anchor, scale(normal, -halfLength)), scale(tangent, halfThickness)),
        add(add(anchor, scale(normal, -halfLength)), scale(tangent, -halfThickness)),
        add(add(anchor, scale(normal, halfLength)), scale(tangent, -halfThickness))
      ],
      style
    };
  }
  const along = marker.size / 2;
  const across = marker.size * 0.38;
  return {
    id,
    type: "polygon",
    name,
    x: 0,
    y: 0,
    zIndex,
    points: [add(anchor, scale(tangent, along)), add(anchor, scale(normal, across)), add(anchor, scale(tangent, -along)), add(anchor, scale(normal, -across))],
    style
  };
}

function tangentAt(source: LineElement | PathElement, pointIndex: number, position: PathMarkerPosition, closed: boolean): Point {
  if (source.type === "line") return unit({ x: source.x2 - source.x, y: source.y2 - source.y }, "line marker tangent");
  const points = source.points;
  if (position === "start") return segmentStartTangent(points[0]!, points[1]!);
  if (position === "end") {
    if (closed) return segmentEndTangent(points.at(-1)!, points[0]!);
    return segmentEndTangent(points.at(-2)!, points.at(-1)!);
  }
  const incoming = segmentEndTangent(points[pointIndex - 1]!, points[pointIndex]!);
  const outgoing = segmentStartTangent(points[pointIndex]!, points[pointIndex + 1]!);
  const sum = { x: incoming.x + outgoing.x, y: incoming.y + outgoing.y };
  if (Math.hypot(sum.x, sum.y) <= EPSILON) throw new ValidationError(`Cannot orient mid marker at exact 180-degree reversal at point ${pointIndex}`);
  return unit(sum, `mid marker tangent at point ${pointIndex}`);
}

function segmentStartTangent(from: PathPoint, to: PathPoint): Point {
  const candidates = [
    from.rightX === undefined ? undefined : { x: from.rightX, y: from.rightY! },
    to.leftX === undefined ? undefined : { x: to.leftX, y: to.leftY! },
    to
  ];
  for (const candidate of candidates) {
    if (candidate && distance(from, candidate) > EPSILON) return unit({ x: candidate.x - from.x, y: candidate.y - from.y }, "cubic start tangent");
  }
  throw new ValidationError("Cannot orient marker on a zero-length path segment");
}

function segmentEndTangent(from: PathPoint, to: PathPoint): Point {
  const candidates = [
    to.leftX === undefined ? undefined : { x: to.leftX, y: to.leftY! },
    from.rightX === undefined ? undefined : { x: from.rightX, y: from.rightY! },
    from
  ];
  for (const candidate of candidates) {
    if (candidate && distance(candidate, to) > EPSILON) return unit({ x: to.x - candidate.x, y: to.y - candidate.y }, "cubic end tangent");
  }
  throw new ValidationError("Cannot orient marker on a zero-length path segment");
}

function normalizeRequest(input: unknown): PathMarkerRequest {
  const value = object(input, "Path marker request");
  const rawSource = object(value.source, "source");
  if (rawSource.type !== "line" && rawSource.type !== "path") throw new ValidationError("source.type must be line or path");
  const source = normalizeScene({ elements: [rawSource] }).elements[0];
  if (source?.type !== "line" && source?.type !== "path") throw new ValidationError("source must normalize as line or path");
  if (!Array.isArray(value.markers) || value.markers.length < 1 || value.markers.length > MAX_REQUESTED_MARKERS) {
    throw new ValidationError(`markers must contain 1 to ${MAX_REQUESTED_MARKERS} specifications`);
  }
  const markers = value.markers.map((raw, index) => normalizeMarker(raw, index));
  return { source, markers };
}

function normalizeMarker(input: unknown, index: number): PathMarkerSpec {
  const value = object(input, `markers[${index}]`);
  if (value.at !== "start" && value.at !== "mid" && value.at !== "end") throw new ValidationError(`markers[${index}].at must be start, mid, or end`);
  if (value.kind !== "arrowhead" && value.kind !== "bar" && value.kind !== "circle" && value.kind !== "diamond") throw new ValidationError(`markers[${index}].kind is unsupported`);
  const size = finiteRange(value.size, `markers[${index}].size`, 1, 1000);
  const thickness = value.thickness === undefined ? undefined : finiteRange(value.thickness, `markers[${index}].thickness`, 0.1, 1000);
  if (value.reverse !== undefined && typeof value.reverse !== "boolean") throw new ValidationError(`markers[${index}].reverse must be boolean`);
  const idPrefix = string(value.idPrefix, `markers[${index}].idPrefix`, 120);
  const name = value.name === undefined ? undefined : string(value.name, `markers[${index}].name`, 120);
  const zIndex = value.zIndex === undefined ? undefined : integerRange(value.zIndex, `markers[${index}].zIndex`, -10_000, 10_000);
  const style = value.style === undefined ? undefined : object(value.style, `markers[${index}].style`) as VectorStyle;
  return { at: value.at, kind: value.kind, size, idPrefix, ...(thickness === undefined ? {} : { thickness }), ...(value.reverse === undefined ? {} : { reverse: value.reverse }), ...(name === undefined ? {} : { name }), ...(style === undefined ? {} : { style }), ...(zIndex === undefined ? {} : { zIndex }) };
}

function sourcePoints(source: LineElement | PathElement): PathPoint[] {
  return source.type === "line" ? [{ x: source.x, y: source.y }, { x: source.x2, y: source.y2 }] : source.points;
}

function midIndices(length: number): number[] { return Array.from({ length: Math.max(0, length - 2) }, (_, index) => index + 1); }
function unit(value: Point, name: string): Point { const length = Math.hypot(value.x, value.y); if (length <= EPSILON) throw new ValidationError(`${name} cannot be zero length`); return { x: value.x / length, y: value.y / length }; }
function add(left: Point, right: Point): Point { return { x: clean(left.x + right.x), y: clean(left.y + right.y) }; }
function scale(value: Point, factor: number): Point { return { x: value.x * factor, y: value.y * factor }; }
function distance(left: Point, right: Point): number { return Math.hypot(right.x - left.x, right.y - left.y); }
function cleanPoint(value: Point): Point { return { x: clean(value.x), y: clean(value.y) }; }
function canonicalAngleDegrees(value: Point): number { const angle = clean((Math.atan2(value.y, value.x) * 180) / Math.PI); return angle === -180 ? 180 : angle; }
function clean(value: number): number { const rounded = Number(value.toFixed(9)); return Object.is(rounded, -0) ? 0 : rounded; }
function object(input: unknown, name: string): Record<string, unknown> { if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ValidationError(`${name} must be an object`); return input as Record<string, unknown>; }
function string(input: unknown, name: string, max: number): string { if (typeof input !== "string" || input.length < 1 || input.length > max) throw new ValidationError(`${name} must contain 1 to ${max} characters`); return input; }
function finiteRange(input: unknown, name: string, min: number, max: number): number { if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) throw new ValidationError(`${name} must be finite and between ${min} and ${max}`); return input; }
function integerRange(input: unknown, name: string, min: number, max: number): number { if (typeof input !== "number" || !Number.isInteger(input) || input < min || input > max) throw new ValidationError(`${name} must be an integer between ${min} and ${max}`); return input; }
