export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface ResolvedLayoutNode extends LayoutNode {
  x: number;
  y: number;
}

export type LayoutConstraint = AlignConstraint | GapConstraint | ContainConstraint;

export interface AlignConstraint {
  id: string;
  type: "align";
  sourceId: string;
  targetId: string;
  axis: "x" | "y";
  mode: "start" | "center" | "end";
  offset?: number;
}

export interface GapConstraint {
  id: string;
  type: "gap";
  sourceId: string;
  targetId: string;
  direction: "left" | "right" | "top" | "bottom";
  gap: number;
}

export interface ContainConstraint {
  id: string;
  type: "contain";
  childId: string;
  containerId: string;
  padding?: number;
}

export interface LayoutProblem {
  nodes: LayoutNode[];
  constraints: LayoutConstraint[];
}

export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutError";
  }
}

type Dimension = "x" | "y";
type CoordinateRule = AlignConstraint | GapConstraint;

/** Resolve a small deterministic equality-constraint graph into world-space boxes. */
export function solveLayout(problem: LayoutProblem): ResolvedLayoutNode[] {
  validateProblem(problem);
  const nodes = new Map(problem.nodes.map((node) => [node.id, { ...node }]));
  const rules = new Map<string, CoordinateRule>();
  const containmentByChild = new Map<string, ContainConstraint>();

  for (const constraint of problem.constraints) {
    if (constraint.type === "contain") {
      if (containmentByChild.has(constraint.childId)) {
        throw new LayoutError(`layout node ${constraint.childId} has more than one containment constraint`);
      }
      containmentByChild.set(constraint.childId, constraint);
      continue;
    }
    const dimension = affectedDimension(constraint);
    const source = nodes.get(constraint.sourceId)!;
    if (source[dimension] !== undefined) {
      throw new LayoutError(`layout node ${source.id}.${dimension} is overconstrained by both an explicit coordinate and ${constraint.id}`);
    }
    const key = coordinateKey(source.id, dimension);
    const existing = rules.get(key);
    if (existing) {
      throw new LayoutError(`layout node ${source.id}.${dimension} is overconstrained by ${existing.id} and ${constraint.id}`);
    }
    rules.set(key, constraint);
  }

  const resolvedCoordinates = new Map<string, number>();
  const resolving = new Set<string>();

  function resolveCoordinate(nodeId: string, dimension: Dimension): number {
    const key = coordinateKey(nodeId, dimension);
    const existing = resolvedCoordinates.get(key);
    if (existing !== undefined) {
      return existing;
    }
    if (resolving.has(key)) {
      throw new LayoutError(`layout dependency cycle detected at ${key}`);
    }
    resolving.add(key);
    const node = nodes.get(nodeId)!;
    let value = node[dimension];

    if (value === undefined) {
      const rule = rules.get(key);
      if (rule) {
        value = resolveRule(rule, dimension, node, nodes, resolveCoordinate);
      } else {
        const containment = containmentByChild.get(nodeId);
        if (!containment) {
          throw new LayoutError(`layout node ${key} is underconstrained`);
        }
        const container = nodes.get(containment.containerId)!;
        const containerCoordinate = resolveCoordinate(container.id, dimension);
        const containerSize = dimension === "x" ? container.width : container.height;
        const childSize = dimension === "x" ? node.width : node.height;
        value = containerCoordinate + (containerSize - childSize) / 2;
      }
    }

    resolving.delete(key);
    resolvedCoordinates.set(key, value);
    return value;
  }

  const resolved = problem.nodes.map((node) => ({
    ...node,
    x: resolveCoordinate(node.id, "x"),
    y: resolveCoordinate(node.id, "y")
  }));
  validateContainment(resolved, problem.constraints);
  return resolved;
}

function resolveRule(
  rule: CoordinateRule,
  dimension: Dimension,
  source: LayoutNode,
  nodes: Map<string, LayoutNode>,
  resolveCoordinate: (nodeId: string, dimension: Dimension) => number
): number {
  const target = nodes.get(rule.targetId)!;
  const targetCoordinate = resolveCoordinate(target.id, dimension);
  const sourceSize = dimension === "x" ? source.width : source.height;
  const targetSize = dimension === "x" ? target.width : target.height;

  if (rule.type === "align") {
    const offset = rule.offset ?? 0;
    if (rule.mode === "start") return targetCoordinate + offset;
    if (rule.mode === "center") return targetCoordinate + (targetSize - sourceSize) / 2 + offset;
    return targetCoordinate + targetSize - sourceSize + offset;
  }

  if (rule.direction === "right" || rule.direction === "bottom") {
    return targetCoordinate + targetSize + rule.gap;
  }
  return targetCoordinate - sourceSize - rule.gap;
}

function validateProblem(problem: LayoutProblem): void {
  if (!problem || !Array.isArray(problem.nodes) || problem.nodes.length === 0) {
    throw new LayoutError("layout problem requires at least one node");
  }
  if (!Array.isArray(problem.constraints)) {
    throw new LayoutError("layout problem constraints must be an array");
  }
  if (problem.nodes.length > 500 || problem.constraints.length > 2000) {
    throw new LayoutError("layout problem exceeds the supported node or constraint limit");
  }

  const nodeIds = new Set<string>();
  for (const node of problem.nodes) {
    stableId(node.id, "layout node id");
    if (nodeIds.has(node.id)) throw new LayoutError(`layout node ids must be unique: ${node.id}`);
    nodeIds.add(node.id);
    positive(node.width, `layout node ${node.id}.width`);
    positive(node.height, `layout node ${node.id}.height`);
    if (node.x !== undefined) finite(node.x, `layout node ${node.id}.x`);
    if (node.y !== undefined) finite(node.y, `layout node ${node.id}.y`);
  }

  const constraintIds = new Set<string>();
  for (const constraint of problem.constraints) {
    stableId(constraint.id, "layout constraint id");
    if (constraintIds.has(constraint.id)) throw new LayoutError(`layout constraint ids must be unique: ${constraint.id}`);
    constraintIds.add(constraint.id);
    const sourceId = constraint.type === "contain" ? constraint.childId : constraint.sourceId;
    const targetId = constraint.type === "contain" ? constraint.containerId : constraint.targetId;
    if (!nodeIds.has(sourceId)) throw new LayoutError(`layout constraint ${constraint.id} references unknown source node: ${sourceId}`);
    if (!nodeIds.has(targetId)) throw new LayoutError(`layout constraint ${constraint.id} references unknown target node: ${targetId}`);
    if (sourceId === targetId) throw new LayoutError(`layout constraint ${constraint.id} cannot reference the same source and target`);
    if (constraint.type === "align") {
      if (constraint.axis !== "x" && constraint.axis !== "y") throw new LayoutError(`layout constraint ${constraint.id}.axis must be x or y`);
      if (!(["start", "center", "end"] as string[]).includes(constraint.mode)) throw new LayoutError(`layout constraint ${constraint.id}.mode is invalid`);
      if (constraint.offset !== undefined) finite(constraint.offset, `layout constraint ${constraint.id}.offset`);
    } else if (constraint.type === "gap") {
      if (!(["left", "right", "top", "bottom"] as string[]).includes(constraint.direction)) {
        throw new LayoutError(`layout constraint ${constraint.id}.direction is invalid`);
      }
      nonNegative(constraint.gap, `layout constraint ${constraint.id}.gap`);
    } else if (constraint.type === "contain") {
      if (constraint.padding !== undefined) nonNegative(constraint.padding, `layout constraint ${constraint.id}.padding`);
    } else {
      throw new LayoutError(`layout constraint ${String((constraint as { type?: unknown }).type)} is unsupported`);
    }
  }
}

function validateContainment(nodes: ResolvedLayoutNode[], constraints: LayoutConstraint[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const constraint of constraints) {
    if (constraint.type !== "contain") continue;
    const child = byId.get(constraint.childId)!;
    const container = byId.get(constraint.containerId)!;
    const padding = constraint.padding ?? 0;
    const fits =
      child.x >= container.x + padding &&
      child.y >= container.y + padding &&
      child.x + child.width <= container.x + container.width - padding &&
      child.y + child.height <= container.y + container.height - padding;
    if (!fits) {
      throw new LayoutError(`layout node ${child.id} violates containment constraint ${constraint.id} inside ${container.id}`);
    }
  }
}

function affectedDimension(constraint: CoordinateRule): Dimension {
  if (constraint.type === "align") return constraint.axis;
  return constraint.direction === "left" || constraint.direction === "right" ? "x" : "y";
}

function coordinateKey(nodeId: string, dimension: Dimension): string {
  return `${nodeId}.${dimension}`;
}

function stableId(value: string, name: string): void {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) {
    throw new LayoutError(`${name} must be a stable machine-readable identifier`);
  }
}

function positive(value: number, name: string): void {
  finite(value, name);
  if (value <= 0) throw new LayoutError(`${name} must be greater than zero`);
}

function nonNegative(value: number, name: string): void {
  finite(value, name);
  if (value < 0) throw new LayoutError(`${name} cannot be negative`);
}

function finite(value: number, name: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new LayoutError(`${name} must be a finite number`);
}
