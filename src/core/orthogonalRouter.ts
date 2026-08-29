import type { Point } from "./vectorScene.js";

export type RoutePort = "left" | "right" | "top" | "bottom";

export interface RouteBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RouteEndpoint {
  box: RouteBox;
  port: RoutePort;
  position?: number;
}

export interface ExistingRoute {
  id: string;
  points: Point[];
}

export interface OrthogonalRouteRequest {
  source: RouteEndpoint;
  target: RouteEndpoint;
  obstacles?: RouteBox[];
  existingRoutes?: ExistingRoute[];
  clearance?: number;
  bendPenalty?: number;
  crossingPenalty?: number;
}

export interface OrthogonalRoute {
  points: Point[];
  length: number;
  bends: number;
  crossings: number;
  clearance: number;
}

export class RouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteError";
  }
}

interface Edge {
  to: number;
  length: number;
  direction: 1 | 2;
  crossings: number;
}

interface HeapEntry {
  state: number;
  cost: number;
}

/** Route a relationship through named ports without entering obstacle clearance boxes. */
export function routeOrthogonal(request: OrthogonalRouteRequest): OrthogonalRoute {
  validateRequest(request);
  const clearance = request.clearance ?? 16;
  const bendPenalty = request.bendPenalty ?? 24;
  const crossingPenalty = request.crossingPenalty ?? 500;
  const sourcePoint = pointOnPort(request.source);
  const targetPoint = pointOnPort(request.target);
  const sourceExit = moveOutward(sourcePoint, request.source.port, clearance);
  const targetEntry = moveOutward(targetPoint, request.target.port, clearance);
  const inflatedObstacles = [request.source.box, request.target.box, ...(request.obstacles ?? [])].map((box) => inflate(box, clearance));
  const existingRoutes = request.existingRoutes ?? [];
  const margin = Math.max(clearance, 1);

  const xValues = new Set<number>([sourceExit.x, targetEntry.x]);
  const yValues = new Set<number>([sourceExit.y, targetEntry.y]);
  for (const obstacle of inflatedObstacles) {
    xValues.add(obstacle.x);
    xValues.add(obstacle.x + obstacle.width);
    yValues.add(obstacle.y);
    yValues.add(obstacle.y + obstacle.height);
  }
  for (const route of existingRoutes) {
    for (const point of route.points) {
      xValues.add(point.x);
      xValues.add(point.x - margin);
      xValues.add(point.x + margin);
      yValues.add(point.y);
      yValues.add(point.y - margin);
      yValues.add(point.y + margin);
    }
  }

  const nodes: Point[] = [];
  const nodeIndex = new Map<string, number>();
  for (const x of [...xValues].sort((left, right) => left - right)) {
    for (const y of [...yValues].sort((left, right) => left - right)) {
      const point = { x, y };
      if (insideAnyOpenInterior(point, inflatedObstacles)) continue;
      nodeIndex.set(pointKey(point), nodes.length);
      nodes.push(point);
    }
  }
  const startIndex = nodeIndex.get(pointKey(sourceExit));
  const endIndex = nodeIndex.get(pointKey(targetEntry));
  if (startIndex === undefined || endIndex === undefined) {
    throw new RouteError("route ports are trapped inside obstacle clearance geometry");
  }

  const edges = Array.from({ length: nodes.length }, () => [] as Edge[]);
  connectRows(nodes, edges, inflatedObstacles, existingRoutes);
  connectColumns(nodes, edges, inflatedObstacles, existingRoutes);
  const middle = shortestPath(nodes, edges, startIndex, endIndex, bendPenalty, crossingPenalty);
  const points = simplifyOrthogonal([sourcePoint, sourceExit, ...middle.slice(1, -1), targetEntry, targetPoint]);
  return {
    points,
    length: pathLength(points),
    bends: Math.max(0, points.length - 2),
    crossings: countRouteCrossings(points, existingRoutes),
    clearance
  };
}

export function pathIntersectsBoxInterior(points: Point[], box: RouteBox): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (segmentBlocked(points[index - 1]!, points[index]!, [box])) return true;
  }
  return false;
}

function shortestPath(
  nodes: Point[],
  edges: Edge[][],
  startIndex: number,
  endIndex: number,
  bendPenalty: number,
  crossingPenalty: number
): Point[] {
  const stateCount = nodes.length * 3;
  const distances = new Float64Array(stateCount);
  distances.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(stateCount);
  previous.fill(-1);
  const heap = new MinHeap();
  const startState = startIndex * 3;
  distances[startState] = 0;
  heap.push({ state: startState, cost: 0 });
  let finalState = -1;

  while (heap.size > 0) {
    const current = heap.pop()!;
    if (current.cost !== distances[current.state]) continue;
    const node = Math.floor(current.state / 3);
    const incoming = current.state % 3;
    if (node === endIndex) {
      finalState = current.state;
      break;
    }
    for (const edge of edges[node]!) {
      const bendCost = incoming !== 0 && incoming !== edge.direction ? bendPenalty : 0;
      const cost = current.cost + edge.length + bendCost + edge.crossings * crossingPenalty;
      const nextState = edge.to * 3 + edge.direction;
      if (cost < distances[nextState]!) {
        distances[nextState] = cost;
        previous[nextState] = current.state;
        heap.push({ state: nextState, cost });
      }
    }
  }
  if (finalState < 0) throw new RouteError("no orthogonal route exists between the requested ports");

  const reversed: Point[] = [];
  let state = finalState;
  while (state >= 0) {
    reversed.push(nodes[Math.floor(state / 3)]!);
    state = previous[state]!;
  }
  return reversed.reverse();
}

function connectRows(nodes: Point[], edges: Edge[][], obstacles: RouteBox[], routes: ExistingRoute[]): void {
  const rows = new Map<number, number[]>();
  nodes.forEach((point, index) => rows.set(point.y, [...(rows.get(point.y) ?? []), index]));
  for (const indices of rows.values()) {
    indices.sort((left, right) => nodes[left]!.x - nodes[right]!.x);
    connectAdjacent(indices, nodes, edges, obstacles, routes, 1);
  }
}

function connectColumns(nodes: Point[], edges: Edge[][], obstacles: RouteBox[], routes: ExistingRoute[]): void {
  const columns = new Map<number, number[]>();
  nodes.forEach((point, index) => columns.set(point.x, [...(columns.get(point.x) ?? []), index]));
  for (const indices of columns.values()) {
    indices.sort((top, bottom) => nodes[top]!.y - nodes[bottom]!.y);
    connectAdjacent(indices, nodes, edges, obstacles, routes, 2);
  }
}

function connectAdjacent(
  indices: number[],
  nodes: Point[],
  edges: Edge[][],
  obstacles: RouteBox[],
  routes: ExistingRoute[],
  direction: 1 | 2
): void {
  for (let index = 1; index < indices.length; index += 1) {
    const from = indices[index - 1]!;
    const to = indices[index]!;
    const first = nodes[from]!;
    const second = nodes[to]!;
    if (segmentBlocked(first, second, obstacles)) continue;
    const length = Math.abs(second.x - first.x) + Math.abs(second.y - first.y);
    if (length === 0) continue;
    const crossings = countSegmentCrossings(first, second, routes);
    edges[from]!.push({ to, length, direction, crossings });
    edges[to]!.push({ to: from, length, direction, crossings });
  }
}

function segmentBlocked(first: Point, second: Point, obstacles: RouteBox[]): boolean {
  if (first.y === second.y) {
    const minX = Math.min(first.x, second.x);
    const maxX = Math.max(first.x, second.x);
    return obstacles.some((box) => first.y > box.y && first.y < box.y + box.height && Math.max(minX, box.x) < Math.min(maxX, box.x + box.width));
  }
  if (first.x === second.x) {
    const minY = Math.min(first.y, second.y);
    const maxY = Math.max(first.y, second.y);
    return obstacles.some((box) => first.x > box.x && first.x < box.x + box.width && Math.max(minY, box.y) < Math.min(maxY, box.y + box.height));
  }
  throw new RouteError("orthogonal router received a diagonal segment");
}

function countRouteCrossings(points: Point[], routes: ExistingRoute[]): number {
  let count = 0;
  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1]!;
    const second = points[index]!;
    for (const route of routes) {
      for (let routeIndex = 1; routeIndex < route.points.length; routeIndex += 1) {
        const third = route.points[routeIndex - 1]!;
        const fourth = route.points[routeIndex]!;
        if (!segmentsIntersect(first, second, third, fourth)) continue;
        if (sharedWholeRouteEndpointOnly(first, second, third, fourth, points[0]!, points.at(-1)!, route.points[0]!, route.points.at(-1)!)) continue;
        count += 1;
      }
    }
  }
  return count;
}

function countSegmentCrossings(first: Point, second: Point, routes: ExistingRoute[]): number {
  let count = 0;
  for (const route of routes) {
    for (let index = 1; index < route.points.length; index += 1) {
      if (segmentsIntersect(first, second, route.points[index - 1]!, route.points[index]!)) count += 1;
    }
  }
  return count;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const aHorizontal = a.y === b.y;
  const cHorizontal = c.y === d.y;
  if (aHorizontal !== cHorizontal) {
    const horizontalStart = aHorizontal ? a : c;
    const horizontalEnd = aHorizontal ? b : d;
    const verticalStart = aHorizontal ? c : a;
    const verticalEnd = aHorizontal ? d : b;
    const horizontalMin = Math.min(horizontalStart.x, horizontalEnd.x);
    const horizontalMax = Math.max(horizontalStart.x, horizontalEnd.x);
    const verticalMin = Math.min(verticalStart.y, verticalEnd.y);
    const verticalMax = Math.max(verticalStart.y, verticalEnd.y);
    return verticalStart.x >= horizontalMin && verticalStart.x <= horizontalMax && horizontalStart.y >= verticalMin && horizontalStart.y <= verticalMax;
  }
  if (aHorizontal) {
    if (a.y !== c.y) return false;
    return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
  }
  if (a.x !== c.x) return false;
  return Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
}

function sharedWholeRouteEndpointOnly(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
  candidateStart: Point,
  candidateEnd: Point,
  existingStart: Point,
  existingEnd: Point
): boolean {
  const intersection = singleIntersectionPoint(a, b, c, d);
  return intersection !== undefined && isEndpoint(intersection, candidateStart, candidateEnd) && isEndpoint(intersection, existingStart, existingEnd);
}

function singleIntersectionPoint(a: Point, b: Point, c: Point, d: Point): Point | undefined {
  const aHorizontal = a.y === b.y;
  const cHorizontal = c.y === d.y;
  if (aHorizontal !== cHorizontal) {
    const horizontal = aHorizontal ? [a, b] : [c, d];
    const vertical = aHorizontal ? [c, d] : [a, b];
    return { x: vertical[0]!.x, y: horizontal[0]!.y };
  }
  if (aHorizontal) {
    const start = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
    const end = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
    return start === end ? { x: start, y: a.y } : undefined;
  }
  const start = Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
  const end = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
  return start === end ? { x: a.x, y: start } : undefined;
}

function isEndpoint(point: Point, first: Point, second: Point): boolean {
  return (point.x === first.x && point.y === first.y) || (point.x === second.x && point.y === second.y);
}

function simplifyOrthogonal(points: Point[]): Point[] {
  const unique = points.filter((point, index) => index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y);
  const simplified: Point[] = [];
  for (const point of unique) {
    const previous = simplified[simplified.length - 1];
    const before = simplified[simplified.length - 2];
    if (before && previous && ((before.x === previous.x && previous.x === point.x) || (before.y === previous.y && previous.y === point.y))) {
      simplified[simplified.length - 1] = point;
    } else {
      simplified.push(point);
    }
  }
  return simplified;
}

function pointOnPort(endpoint: RouteEndpoint): Point {
  const position = endpoint.position ?? 0.5;
  const box = endpoint.box;
  if (endpoint.port === "left") return { x: box.x, y: box.y + box.height * position };
  if (endpoint.port === "right") return { x: box.x + box.width, y: box.y + box.height * position };
  if (endpoint.port === "top") return { x: box.x + box.width * position, y: box.y };
  return { x: box.x + box.width * position, y: box.y + box.height };
}

function moveOutward(point: Point, port: RoutePort, distance: number): Point {
  if (port === "left") return { x: point.x - distance, y: point.y };
  if (port === "right") return { x: point.x + distance, y: point.y };
  if (port === "top") return { x: point.x, y: point.y - distance };
  return { x: point.x, y: point.y + distance };
}

function inflate(box: RouteBox, amount: number): RouteBox {
  return { ...box, x: box.x - amount, y: box.y - amount, width: box.width + amount * 2, height: box.height + amount * 2 };
}

function insideAnyOpenInterior(point: Point, boxes: RouteBox[]): boolean {
  return boxes.some((box) => point.x > box.x && point.x < box.x + box.width && point.y > box.y && point.y < box.y + box.height);
}

function pathLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.abs(points[index]!.x - points[index - 1]!.x) + Math.abs(points[index]!.y - points[index - 1]!.y);
  }
  return length;
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

function validateRequest(request: OrthogonalRouteRequest): void {
  if (!request?.source || !request.target) throw new RouteError("route request requires source and target endpoints");
  const boxes = [request.source.box, request.target.box, ...(request.obstacles ?? [])];
  const ids = new Set<string>();
  for (const box of boxes) {
    if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(box.id)) throw new RouteError("route box ids must be stable machine-readable identifiers");
    if (ids.has(box.id)) throw new RouteError(`route box ids must be unique: ${box.id}`);
    ids.add(box.id);
    for (const [name, value] of Object.entries({ x: box.x, y: box.y, width: box.width, height: box.height })) {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new RouteError(`route box ${box.id}.${name} must be finite`);
    }
    if (box.width <= 0 || box.height <= 0) throw new RouteError(`route box ${box.id} must have positive dimensions`);
  }
  for (const endpoint of [request.source, request.target]) {
    if (!(["left", "right", "top", "bottom"] as string[]).includes(endpoint.port)) throw new RouteError(`route port is invalid: ${endpoint.port}`);
    if (endpoint.position !== undefined && (!Number.isFinite(endpoint.position) || endpoint.position < 0 || endpoint.position > 1)) {
      throw new RouteError("route port position must be between 0 and 1");
    }
  }
  for (const [name, value] of Object.entries({
    clearance: request.clearance ?? 16,
    bendPenalty: request.bendPenalty ?? 24,
    crossingPenalty: request.crossingPenalty ?? 500
  })) {
    if (!Number.isFinite(value) || value < 0) throw new RouteError(`${name} must be a non-negative finite number`);
  }
  for (const route of request.existingRoutes ?? []) {
    if (route.points.length < 2) throw new RouteError(`existing route ${route.id} must contain at least two points`);
    for (let index = 1; index < route.points.length; index += 1) {
      const first = route.points[index - 1]!;
      const second = route.points[index]!;
      if (first.x !== second.x && first.y !== second.y) throw new RouteError(`existing route ${route.id} must be orthogonal`);
    }
  }
}

class MinHeap {
  private readonly values: HeapEntry[] = [];
  get size(): number {
    return this.values.length;
  }
  push(value: HeapEntry): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent]!.cost <= value.cost) break;
      this.values[index] = this.values[parent]!;
      index = parent;
    }
    this.values[index] = value;
  }
  pop(): HeapEntry | undefined {
    const root = this.values[0];
    const last = this.values.pop();
    if (!root || !last || this.values.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const child = right < this.values.length && this.values[right]!.cost < this.values[left]!.cost ? right : left;
      if (this.values[child]!.cost >= last.cost) break;
      this.values[index] = this.values[child]!;
      index = child;
    }
    this.values[index] = last;
    return root;
  }
}
