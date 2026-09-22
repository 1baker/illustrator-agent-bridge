import type {
  EllipseElement,
  CompoundPathElement,
  LineElement,
  PathElement,
  PathPoint,
  Point,
  PolygonElement,
  RectElement
} from "./vectorScene.js";

/** A standard 2D affine matrix: x' = ax + cy + e; y' = bx + dy + f. */
export interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type TransformableElement = LineElement | PolygonElement | PathElement | CompoundPathElement | RectElement | EllipseElement;
export type TransformedGeometryElement = LineElement | PolygonElement | PathElement | CompoundPathElement;

export function identityTransform(): AffineTransform {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function translation(tx: number, ty: number): AffineTransform {
  finite(tx, "tx");
  finite(ty, "ty");
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scaling(sx: number, sy = sx): AffineTransform {
  finite(sx, "sx");
  finite(sy, "sy");
  if (sx === 0 || sy === 0) {
    throw new Error("scale factors cannot be zero");
  }
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotation(degrees: number): AffineTransform {
  finite(degrees, "degrees");
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 };
}

/** Compose operations in the order they should affect a point. */
export function composeTransforms(...operations: AffineTransform[]): AffineTransform {
  return operations.reduce((combined, operation) => multiply(operation, combined), identityTransform());
}

export function transformPoint(point: Point, transform: AffineTransform): Point {
  return {
    x: transform.a * point.x + transform.c * point.y + transform.e,
    y: transform.b * point.x + transform.d * point.y + transform.f
  };
}

/**
 * Flatten local geometry into world coordinates. Rectangles become polygons and
 * ellipses become cubic paths so arbitrary rotation remains representable in the flattened model.
 * Stroke width is style, so it is intentionally not scaled with geometry.
 */
export function transformGeometryElement(element: TransformableElement, transform: AffineTransform): TransformedGeometryElement {
  if (element.type === "line") {
    const start = transformPoint({ x: element.x, y: element.y }, transform);
    const end = transformPoint({ x: element.x2, y: element.y2 }, transform);
    return { ...element, x: start.x, y: start.y, x2: end.x, y2: end.y };
  }

  if (element.type === "polygon") {
    return { ...element, x: 0, y: 0, points: element.points.map((point) => transformPoint(point, transform)) };
  }

  if (element.type === "path") {
    return { ...element, x: 0, y: 0, points: element.points.map((point) => transformPathPoint(point, transform)) };
  }

  if (element.type === "compound_path") {
    return {
      ...element,
      x: 0,
      y: 0,
      subpaths: element.subpaths.map((subpath) => ({ points: subpath.points.map((point) => transformPathPoint(point, transform)), closed: true }))
    };
  }

  if (element.type === "rect") {
    const points = [
      { x: element.x, y: element.y },
      { x: element.x + element.width, y: element.y },
      { x: element.x + element.width, y: element.y + element.height },
      { x: element.x, y: element.y + element.height }
    ].map((point) => transformPoint(point, transform));
    return {
      type: "polygon",
      id: element.id,
      name: element.name,
      groupId: element.groupId,
      zIndex: element.zIndex,
      visible: element.visible,
      x: 0,
      y: 0,
      points,
      style: element.style
    };
  }

  return {
    type: "path",
    id: element.id,
    name: element.name,
    groupId: element.groupId,
    zIndex: element.zIndex,
    visible: element.visible,
    x: 0,
    y: 0,
    closed: true,
    points: ellipseAsPath(element).map((point) => transformPathPoint(point, transform)),
    style: element.style
  };
}

function multiply(left: AffineTransform, right: AffineTransform): AffineTransform {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f
  };
}

function transformPathPoint(point: PathPoint, transform: AffineTransform): PathPoint {
  const anchor = transformPoint(point, transform);
  const left = point.leftX === undefined || point.leftY === undefined ? undefined : transformPoint({ x: point.leftX, y: point.leftY }, transform);
  const right = point.rightX === undefined || point.rightY === undefined ? undefined : transformPoint({ x: point.rightX, y: point.rightY }, transform);
  return {
    ...anchor,
    ...(left ? { leftX: left.x, leftY: left.y } : {}),
    ...(right ? { rightX: right.x, rightY: right.y } : {}),
    ...(point.pointType ? { pointType: point.pointType } : {})
  };
}

function ellipseAsPath(element: EllipseElement): PathPoint[] {
  const kappa = 0.552284749831;
  const rx = element.width / 2;
  const ry = element.height / 2;
  const cx = element.x + rx;
  const cy = element.y + ry;
  return [
    { x: cx, y: element.y, leftX: cx - kappa * rx, leftY: element.y, rightX: cx + kappa * rx, rightY: element.y, pointType: "smooth" },
    { x: element.x + element.width, y: cy, leftX: element.x + element.width, leftY: cy - kappa * ry, rightX: element.x + element.width, rightY: cy + kappa * ry, pointType: "smooth" },
    { x: cx, y: element.y + element.height, leftX: cx + kappa * rx, leftY: element.y + element.height, rightX: cx - kappa * rx, rightY: element.y + element.height, pointType: "smooth" },
    { x: element.x, y: cy, leftX: element.x, leftY: cy + kappa * ry, rightX: element.x, rightY: cy - kappa * ry, pointType: "smooth" }
  ];
}

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
}
