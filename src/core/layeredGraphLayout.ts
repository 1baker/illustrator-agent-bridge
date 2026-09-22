export interface GraphLayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface GraphLayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface GraphLayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayeredGraphLayoutOptions {
  direction?: "left_to_right" | "top_to_bottom";
  rankGap?: number;
  nodeGap?: number;
}

export interface ResolvedGraphLayoutNode extends GraphLayoutNode {
  x: number;
  y: number;
  rank: number;
  component: number;
}

export class GraphLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphLayoutError";
  }
}

/** Lay out a directed semantic graph in deterministic layers, condensing feedback cycles first. */
export function layoutLayeredGraph(
  nodes: GraphLayoutNode[],
  edges: GraphLayoutEdge[],
  bounds: GraphLayoutBounds,
  options: LayeredGraphLayoutOptions = {}
): ResolvedGraphLayoutNode[] {
  validateInput(nodes, edges, bounds, options);
  const direction = options.direction ?? "left_to_right";
  const rankGap = options.rankGap ?? 120;
  const nodeGap = options.nodeGap ?? 54;
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.sourceId)!.push(edge.targetId);
  for (const targets of adjacency.values()) targets.sort((left, right) => nodeOrder.get(left)! - nodeOrder.get(right)!);

  const components = stronglyConnectedComponents(nodes.map((node) => node.id), adjacency, nodeOrder);
  const componentByNode = new Map<string, number>();
  components.forEach((component, index) => component.forEach((id) => componentByNode.set(id, index)));
  const componentOrder = components.map((component) => Math.min(...component.map((id) => nodeOrder.get(id)!)));
  const outgoing = components.map(() => new Set<number>());
  const incoming = components.map(() => new Set<number>());
  for (const edge of edges) {
    const source = componentByNode.get(edge.sourceId)!;
    const target = componentByNode.get(edge.targetId)!;
    if (source !== target) {
      outgoing[source]!.add(target);
      incoming[target]!.add(source);
    }
  }

  const indegree = incoming.map((items) => items.size);
  const ready = components.map((_, index) => index).filter((index) => indegree[index] === 0).sort((a, b) => componentOrder[a]! - componentOrder[b]!);
  const componentRanks = new Array<number>(components.length).fill(0);
  let visited = 0;
  while (ready.length > 0) {
    const component = ready.shift()!;
    visited += 1;
    const targets = [...outgoing[component]!].sort((a, b) => componentOrder[a]! - componentOrder[b]!);
    for (const target of targets) {
      componentRanks[target] = Math.max(componentRanks[target]!, componentRanks[component]! + 1);
      indegree[target] -= 1;
      if (indegree[target] === 0) {
        ready.push(target);
        ready.sort((a, b) => componentOrder[a]! - componentOrder[b]!);
      }
    }
  }
  if (visited !== components.length) throw new GraphLayoutError("condensed graph unexpectedly contains a cycle");

  const rankByNode = new Map<string, number>();
  components.forEach((component, index) => component.forEach((id) => rankByNode.set(id, componentRanks[index]!)));
  const maxRank = Math.max(...componentRanks);
  const ranks = Array.from({ length: maxRank + 1 }, () => [] as GraphLayoutNode[]);
  for (const node of nodes) ranks[rankByNode.get(node.id)!]!.push(node);

  const primarySizes = ranks.map((rank) => Math.max(...rank.map((node) => direction === "left_to_right" ? node.width : node.height)));
  const neededPrimary = primarySizes.reduce((sum, value) => sum + value, 0) + rankGap * Math.max(0, ranks.length - 1);
  const availablePrimary = direction === "left_to_right" ? bounds.width : bounds.height;
  if (neededPrimary > availablePrimary) {
    throw new GraphLayoutError(`layered graph requires ${round(neededPrimary)} primary-axis units but only ${round(availablePrimary)} are available`);
  }

  const primaryStart = (direction === "left_to_right" ? bounds.x : bounds.y) + (availablePrimary - neededPrimary) / 2;
  const result = new Map<string, ResolvedGraphLayoutNode>();
  let primaryCursor = primaryStart;
  for (let rankIndex = 0; rankIndex < ranks.length; rankIndex += 1) {
    const rank = ranks[rankIndex]!;
    const secondarySizes = rank.map((node) => direction === "left_to_right" ? node.height : node.width);
    const neededSecondary = secondarySizes.reduce((sum, value) => sum + value, 0) + nodeGap * Math.max(0, rank.length - 1);
    const availableSecondary = direction === "left_to_right" ? bounds.height : bounds.width;
    if (neededSecondary > availableSecondary) {
      throw new GraphLayoutError(`layered graph rank ${rankIndex} requires ${round(neededSecondary)} secondary-axis units but only ${round(availableSecondary)} are available`);
    }
    let secondaryCursor = (direction === "left_to_right" ? bounds.y : bounds.x) + (availableSecondary - neededSecondary) / 2;
    for (const node of rank) {
      const rankPrimarySize = primarySizes[rankIndex]!;
      const nodePrimarySize = direction === "left_to_right" ? node.width : node.height;
      const primary = primaryCursor + (rankPrimarySize - nodePrimarySize) / 2;
      const component = componentByNode.get(node.id)!;
      result.set(node.id, direction === "left_to_right"
        ? { ...node, x: primary, y: secondaryCursor, rank: rankIndex, component }
        : { ...node, x: secondaryCursor, y: primary, rank: rankIndex, component });
      secondaryCursor += (direction === "left_to_right" ? node.height : node.width) + nodeGap;
    }
    primaryCursor += primarySizes[rankIndex]! + rankGap;
  }
  return nodes.map((node) => result.get(node.id)!);
}

function stronglyConnectedComponents(ids: string[], adjacency: Map<string, string[]>, order: Map<string, number>): string[][] {
  let nextIndex = 0;
  const indexById = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  function visit(id: string): void {
    indexById.set(id, nextIndex);
    lowLink.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    onStack.add(id);
    for (const target of adjacency.get(id)!) {
      if (!indexById.has(target)) {
        visit(target);
        lowLink.set(id, Math.min(lowLink.get(id)!, lowLink.get(target)!));
      } else if (onStack.has(target)) {
        lowLink.set(id, Math.min(lowLink.get(id)!, indexById.get(target)!));
      }
    }
    if (lowLink.get(id) === indexById.get(id)) {
      const component: string[] = [];
      let current: string;
      do {
        current = stack.pop()!;
        onStack.delete(current);
        component.push(current);
      } while (current !== id);
      component.sort((left, right) => order.get(left)! - order.get(right)!);
      components.push(component);
    }
  }
  for (const id of ids) if (!indexById.has(id)) visit(id);
  components.sort((left, right) => Math.min(...left.map((id) => order.get(id)!)) - Math.min(...right.map((id) => order.get(id)!)));
  return components;
}

function validateInput(nodes: GraphLayoutNode[], edges: GraphLayoutEdge[], bounds: GraphLayoutBounds, options: LayeredGraphLayoutOptions): void {
  if (!Array.isArray(nodes) || nodes.length === 0 || nodes.length > 200) throw new GraphLayoutError("layered graph requires 1 to 200 nodes");
  if (!Array.isArray(edges) || edges.length > 1000) throw new GraphLayoutError("layered graph edges must be an array of at most 1000 items");
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    stableId(node.id, "graph node id");
    if (nodeIds.has(node.id)) throw new GraphLayoutError(`graph node ids must be unique: ${node.id}`);
    nodeIds.add(node.id);
    positive(node.width, `graph node ${node.id}.width`);
    positive(node.height, `graph node ${node.id}.height`);
  }
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    stableId(edge.id, "graph edge id");
    if (edgeIds.has(edge.id)) throw new GraphLayoutError(`graph edge ids must be unique: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) throw new GraphLayoutError(`graph edge ${edge.id} references an unknown node`);
    if (edge.sourceId === edge.targetId) throw new GraphLayoutError(`graph edge ${edge.id} cannot connect a node to itself`);
  }
  finite(bounds.x, "graph bounds.x");
  finite(bounds.y, "graph bounds.y");
  positive(bounds.width, "graph bounds.width");
  positive(bounds.height, "graph bounds.height");
  if (options.direction !== undefined && options.direction !== "left_to_right" && options.direction !== "top_to_bottom") throw new GraphLayoutError("graph direction is invalid");
  nonNegative(options.rankGap ?? 120, "graph rankGap");
  nonNegative(options.nodeGap ?? 54, "graph nodeGap");
}

function stableId(value: string, path: string): void { if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) throw new GraphLayoutError(`${path} must be stable`); }
function finite(value: number, path: string): void { if (!Number.isFinite(value)) throw new GraphLayoutError(`${path} must be finite`); }
function positive(value: number, path: string): void { finite(value, path); if (value <= 0) throw new GraphLayoutError(`${path} must be greater than zero`); }
function nonNegative(value: number, path: string): void { finite(value, path); if (value < 0) throw new GraphLayoutError(`${path} cannot be negative`); }
function round(value: number): number { return Number(value.toFixed(2)); }
