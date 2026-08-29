import { routeOrthogonal, type OrthogonalRoute, type RouteBox } from "../core/orthogonalRouter.js";
import { normalizeScene } from "../core/sceneValidation.js";
import type { Point, ScientificRelationship, VectorElement, VectorScene } from "../core/vectorScene.js";

export function composeRoutingBasicsScene(): VectorScene {
  const signalA: RouteBox = { id: "signal-a", x: 70, y: 205, width: 145, height: 76 };
  const signalB: RouteBox = { id: "signal-b", x: 40, y: 430, width: 145, height: 76 };
  const responseA: RouteBox = { id: "response-a", x: 985, y: 430, width: 145, height: 76 };
  const responseB: RouteBox = { id: "response-b", x: 1015, y: 205, width: 145, height: 76 };
  const organelle: RouteBox = { id: "organelle", x: 485, y: 270, width: 225, height: 170 };
  const firstRoute = routeOrthogonal({
    source: { box: signalA, port: "right" },
    target: { box: responseA, port: "left" },
    obstacles: [signalB, responseB, organelle],
    clearance: 22,
    bendPenalty: 35,
    crossingPenalty: 800
  });
  const secondRoute = routeOrthogonal({
    source: { box: signalB, port: "right" },
    target: { box: responseB, port: "left" },
    obstacles: [signalA, responseA, organelle],
    existingRoutes: [{ id: "activation-route", points: firstRoute.points }],
    clearance: 22,
    bendPenalty: 35,
    crossingPenalty: 1200
  });

  const elements: VectorElement[] = [
    rect("background", 0, 0, 1200, 700, "#F8FAFC", null, 0, -100),
    text("title", 45, 28, "Relationship routing: ports, obstacles, bends, and crossings", 29, "#0F172A", 100),
    text("subtitle", 45, 76, "Paths are computed on a rectilinear visibility graph before SVG renders them.", 17, "#475569", 100),
    text("source.heading", 70, 145, "source objects", 16, "#64748B", 20),
    text("target.heading", 985, 145, "target objects", 16, "#64748B", 20),
    boxElement("signal-a.box", signalA, "#DBEAFE", "#2563EB"),
    text("signal-a.label", signalA.x + 25, signalA.y + 25, "signal A", 18, "#1E40AF", 10),
    boxElement("signal-b.box", signalB, "#FCE7F3", "#DB2777"),
    text("signal-b.label", signalB.x + 25, signalB.y + 25, "signal B", 18, "#9D174D", 10),
    boxElement("response-a.box", responseA, "#CCFBF1", "#0F766E"),
    text("response-a.label", responseA.x + 16, responseA.y + 25, "response A", 18, "#115E59", 10),
    boxElement("response-b.box", responseB, "#FEF3C7", "#D97706"),
    text("response-b.label", responseB.x + 16, responseB.y + 25, "response B", 18, "#92400E", 10),
    ellipse("organelle.body", organelle.x, organelle.y, organelle.width, organelle.height, "#E9D5FF", "#7E22CE", 6, 8),
    text("organelle.label", organelle.x + 58, organelle.y + 67, "obstacle", 20, "#6B21A8", 10),
    ...routeElements("activation-route", firstRoute, "#2563EB"),
    ...routeElements("inhibition-route", secondRoute, "#DB2777"),
    text("activation.metrics", 325, 585, metrics("A", firstRoute), 15, "#1E40AF", 30),
    text("inhibition.metrics", 325, 620, metrics("B", secondRoute), 15, "#9D174D", 30),
    text("routing.note", 325, 655, "Route B scores intersections with Route A and selects a zero-crossing alternative.", 14, "#64748B", 30)
  ];

  const relationships: ScientificRelationship[] = [
    {
      id: "activation-route",
      sourceObjectId: "signal-a-object",
      predicate: "activates",
      targetObjectId: "response-a-object",
      visualElementIds: ["activation-route.path", "activation-route.arrow"],
      properties: routeProperties(firstRoute)
    },
    {
      id: "inhibition-route",
      sourceObjectId: "signal-b-object",
      predicate: "inhibits",
      targetObjectId: "response-b-object",
      visualElementIds: ["inhibition-route.path", "inhibition-route.arrow"],
      properties: routeProperties(secondRoute)
    }
  ];

  return normalizeScene({
    document: { title: "Obstacle-aware scientific relationship routing", width: 1200, height: 700, colorMode: "RGB" },
    elements,
    semantics: {
      objects: [
        { id: "signal-a-object", kind: "signal", label: "signal A", elementIds: ["signal-a.box", "signal-a.label"] },
        { id: "signal-b-object", kind: "signal", label: "signal B", elementIds: ["signal-b.box", "signal-b.label"] },
        { id: "response-a-object", kind: "response", label: "response A", elementIds: ["response-a.box", "response-a.label"] },
        { id: "response-b-object", kind: "response", label: "response B", elementIds: ["response-b.box", "response-b.label"] },
        { id: "organelle-object", kind: "organelle", elementIds: ["organelle.body", "organelle.label"], properties: { routingObstacle: true } }
      ],
      relationships
    }
  });
}

function routeElements(id: string, route: OrthogonalRoute, color: string): VectorElement[] {
  return [
    {
      id: `${id}.path`,
      type: "path",
      name: `${id} routed path`,
      x: 0,
      y: 0,
      zIndex: 2,
      closed: false,
      points: route.points,
      style: { fill: null, stroke: color, strokeWidth: 6 }
    },
    {
      id: `${id}.arrow`,
      type: "polygon",
      name: `${id} arrowhead`,
      x: 0,
      y: 0,
      zIndex: 3,
      points: arrowhead(route.points, 17),
      style: { fill: color, stroke: null }
    }
  ];
}

function arrowhead(points: Point[], size: number): Point[] {
  const end = points.at(-1)!;
  const previous = points.at(-2)!;
  const dx = Math.sign(end.x - previous.x);
  const dy = Math.sign(end.y - previous.y);
  const px = -dy;
  const py = dx;
  const baseX = end.x - dx * size;
  const baseY = end.y - dy * size;
  return [
    end,
    { x: baseX + px * size * 0.55, y: baseY + py * size * 0.55 },
    { x: baseX - px * size * 0.55, y: baseY - py * size * 0.55 }
  ];
}

function routeProperties(route: OrthogonalRoute) {
  return { router: "orthogonal_visibility_v1", length: route.length, bends: route.bends, crossings: route.crossings, clearance: route.clearance };
}

function metrics(label: string, route: OrthogonalRoute): string {
  return `Route ${label}: length ${route.length} · bends ${route.bends} · crossings ${route.crossings} · clearance ${route.clearance}`;
}

function boxElement(id: string, box: RouteBox, fill: string, stroke: string): VectorElement {
  return rect(id, box.x, box.y, box.width, box.height, fill, stroke, 4, 8);
}

function rect(id: string, x: number, y: number, width: number, height: number, fill: string | null, stroke: string | null, strokeWidth: number, zIndex?: number): VectorElement {
  return { id, type: "rect", name: id, x, y, width, height, zIndex, style: { fill, stroke, strokeWidth } };
}

function ellipse(id: string, x: number, y: number, width: number, height: number, fill: string | null, stroke: string | null, strokeWidth: number, zIndex?: number): VectorElement {
  return { id, type: "ellipse", name: id, x, y, width, height, zIndex, style: { fill, stroke, strokeWidth } };
}

function text(id: string, x: number, y: number, value: string, size: number, fill: string, zIndex?: number): VectorElement {
  return { id, type: "text", name: id, x, y, text: value, size, zIndex, style: { fill, stroke: null } };
}
