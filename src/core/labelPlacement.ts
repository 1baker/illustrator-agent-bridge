import type { Point } from "./vectorScene.js";

export type LabelPosition = "top" | "right" | "bottom" | "left" | "inside";

export interface LabelBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelRequest {
  id: string;
  text: string;
  target: LabelBox;
  fontSize?: number;
  padding?: number;
  gap?: number;
  preferredPositions?: LabelPosition[];
}

export interface LabelPlacementContext {
  bounds: Omit<LabelBox, "id">;
  obstacles?: LabelBox[];
  existingLabels?: LabelPlacement[];
}

export interface LabelPlacement extends LabelBox {
  text: string;
  targetId: string;
  position: LabelPosition;
  fontSize: number;
  padding: number;
  textX: number;
  textY: number;
  score: number;
  leader?: { start: Point; end: Point };
}

export class LabelPlacementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabelPlacementError";
  }
}

const DEFAULT_POSITIONS: LabelPosition[] = ["top", "right", "bottom", "left", "inside"];

/** Place labels sequentially, accepting only candidates with no box collisions. */
export function placeLabels(requests: LabelRequest[], context: LabelPlacementContext): LabelPlacement[] {
  validateContext(requests, context);
  const placed = [...(context.existingLabels ?? [])];
  const results: LabelPlacement[] = [];
  for (const request of requests) {
    const placement = placeOne(request, context.bounds, context.obstacles ?? [], placed);
    placed.push(placement);
    results.push(placement);
  }
  return results;
}

export function measureLabel(text: string, fontSize: number, padding = 6): { width: number; height: number } {
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((line) => [...line].length));
  return {
    width: longest * fontSize * 0.58 + padding * 2,
    height: lines.length * fontSize * 1.25 + padding * 2
  };
}

function placeOne(request: LabelRequest, bounds: Omit<LabelBox, "id">, obstacles: LabelBox[], placed: LabelPlacement[]): LabelPlacement {
  const fontSize = request.fontSize ?? 16;
  const padding = request.padding ?? 6;
  const gap = request.gap ?? 12;
  const size = measureLabel(request.text, fontSize, padding);
  const preferences = request.preferredPositions ?? DEFAULT_POSITIONS;
  const avoid = obstacles.filter((obstacle) => obstacle.id !== request.target.id);
  const candidates = preferences.map((position, preferenceIndex) => {
    const box = candidateBox(request.target, size, position, gap);
    const obstacleArea = avoid.reduce((sum, obstacle) => sum + overlapArea(box, obstacle), 0);
    const labelArea = placed.reduce((sum, label) => sum + overlapArea(box, label), 0);
    const outside = outsideArea(box, bounds);
    const leader = position === "inside" ? undefined : leaderBetween(request.target, box);
    const leaderLength = leader ? Math.abs(leader.end.x - leader.start.x) + Math.abs(leader.end.y - leader.start.y) : 0;
    return { box, position, preferenceIndex, obstacleArea, labelArea, outside, leader, leaderLength };
  });
  const clean = candidates
    .filter((candidate) => candidate.obstacleArea <= 1e-6 && candidate.labelArea <= 1e-6 && candidate.outside <= 1e-6)
    .sort((left, right) => left.preferenceIndex - right.preferenceIndex || left.leaderLength - right.leaderLength)[0];
  if (!clean) {
    const best = candidates.sort(
      (left, right) =>
        left.outside - right.outside ||
        left.obstacleArea + left.labelArea - (right.obstacleArea + right.labelArea) ||
        left.preferenceIndex - right.preferenceIndex
    )[0]!;
    throw new LabelPlacementError(
      `label ${request.id} has no collision-free candidate; best ${best.position} candidate has outsideArea=${round(best.outside)}, overlapArea=${round(
        best.obstacleArea + best.labelArea
      )}`
    );
  }
  const id = `${request.id}.label-box`;
  return {
    id,
    ...clean.box,
    text: request.text,
    targetId: request.target.id,
    position: clean.position,
    fontSize,
    padding,
    textX: clean.box.x + padding,
    textY: clean.box.y + padding,
    score: clean.preferenceIndex * 100 + clean.leaderLength,
    ...(clean.leader ? { leader: clean.leader } : {})
  };
}

function candidateBox(target: LabelBox, size: { width: number; height: number }, position: LabelPosition, gap: number): Omit<LabelBox, "id"> {
  if (position === "top") return { x: target.x + (target.width - size.width) / 2, y: target.y - gap - size.height, ...size };
  if (position === "right") return { x: target.x + target.width + gap, y: target.y + (target.height - size.height) / 2, ...size };
  if (position === "bottom") return { x: target.x + (target.width - size.width) / 2, y: target.y + target.height + gap, ...size };
  if (position === "left") return { x: target.x - gap - size.width, y: target.y + (target.height - size.height) / 2, ...size };
  return { x: target.x + (target.width - size.width) / 2, y: target.y + (target.height - size.height) / 2, ...size };
}

function leaderBetween(target: LabelBox, label: Omit<LabelBox, "id">): { start: Point; end: Point } {
  const targetCenter = center(target);
  const labelCenter = center(label);
  return {
    start: boundaryPoint(target, labelCenter),
    end: boundaryPoint(label, targetCenter)
  };
}

function boundaryPoint(box: Omit<LabelBox, "id">, toward: Point): Point {
  const centerPoint = center(box);
  const dx = toward.x - centerPoint.x;
  const dy = toward.y - centerPoint.y;
  if (dx === 0 && dy === 0) return centerPoint;
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: centerPoint.x + dx * scale, y: centerPoint.y + dy * scale };
}

function center(box: Omit<LabelBox, "id">): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function overlapArea(left: Omit<LabelBox, "id">, right: Omit<LabelBox, "id">): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

function outsideArea(box: Omit<LabelBox, "id">, bounds: Omit<LabelBox, "id">): number {
  return box.width * box.height - overlapArea(box, bounds);
}

function validateContext(requests: LabelRequest[], context: LabelPlacementContext): void {
  if (!Array.isArray(requests) || requests.length === 0) throw new LabelPlacementError("label placement requires at least one request");
  validateBox({ id: "canvas", ...context.bounds });
  const ids = new Set<string>();
  for (const request of requests) {
    stableId(request.id, "label id");
    if (ids.has(request.id)) throw new LabelPlacementError(`label ids must be unique: ${request.id}`);
    ids.add(request.id);
    if (typeof request.text !== "string" || request.text.length === 0 || request.text.length > 500) throw new LabelPlacementError(`label ${request.id}.text is invalid`);
    validateBox(request.target);
    positive(request.fontSize ?? 16, `label ${request.id}.fontSize`);
    nonNegative(request.padding ?? 6, `label ${request.id}.padding`);
    nonNegative(request.gap ?? 12, `label ${request.id}.gap`);
    const positions = request.preferredPositions ?? DEFAULT_POSITIONS;
    if (positions.length === 0 || new Set(positions).size !== positions.length || positions.some((position) => !DEFAULT_POSITIONS.includes(position))) {
      throw new LabelPlacementError(`label ${request.id}.preferredPositions must contain unique supported positions`);
    }
  }
  for (const obstacle of context.obstacles ?? []) validateBox(obstacle);
}

function validateBox(box: LabelBox): void {
  stableId(box.id, "box id");
  for (const [name, value] of Object.entries({ x: box.x, y: box.y, width: box.width, height: box.height })) {
    if (!Number.isFinite(value)) throw new LabelPlacementError(`box ${box.id}.${name} must be finite`);
  }
  positive(box.width, `box ${box.id}.width`);
  positive(box.height, `box ${box.id}.height`);
}

function stableId(value: string, name: string): void {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) throw new LabelPlacementError(`${name} must be stable`);
}

function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new LabelPlacementError(`${name} must be a positive finite number`);
}

function nonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new LabelPlacementError(`${name} must be a non-negative finite number`);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
