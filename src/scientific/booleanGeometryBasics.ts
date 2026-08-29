import { constructPolygonBoolean, type PolygonBooleanOperation, type PolygonBooleanRegion } from "../core/polygonBoolean.js";
import type { Point, VectorElement, VectorScene } from "../core/vectorScene.js";

const PANEL_CENTERS = [155, 445, 735, 1025];
const OPERATIONS: PolygonBooleanOperation[] = ["union", "intersection", "difference", "xor"];
const COLORS = ["#14B8A6", "#8B5CF6", "#3B82F6", "#F97316"];
const DESCRIPTIONS = [
  "merge both occupied regions",
  "keep only their shared region",
  "remove B from A",
  "keep regions belonging to only one"
];

/** Build a visual lesson using the same boolean service exposed to agents. */
export function composeBooleanGeometryBasicsScene(): VectorScene {
  const elements: VectorElement[] = [
    { id: "title", type: "text", x: 42, y: 28, text: "Constructing scientific shapes with set operations", size: 30, style: { fill: "#0F172A", stroke: null } },
    { id: "subtitle", type: "text", x: 44, y: 70, text: "closed polygonal regions in -> canonical compound paths out", size: 17, style: { fill: "#475569", stroke: null } },
    { id: "legend-a", type: "polygon", x: 0, y: 0, points: rectanglePoints(44, 107, 24, 14), style: { fill: null, stroke: "#0F766E", strokeWidth: 3, dashArray: [8, 5] } },
    { id: "legend-a-text", type: "text", x: 78, y: 103, text: "input A", size: 15, style: { fill: "#334155", stroke: null } },
    { id: "legend-b", type: "polygon", x: 0, y: 0, points: rectanglePoints(158, 107, 24, 14), style: { fill: null, stroke: "#7C3AED", strokeWidth: 3, dashArray: [8, 5] } },
    { id: "legend-b-text", type: "text", x: 192, y: 103, text: "input B", size: 15, style: { fill: "#334155", stroke: null } }
  ];
  const objects: NonNullable<VectorScene["semantics"]>["objects"] = [];

  OPERATIONS.forEach((operation, index) => {
    const center = PANEL_CENTERS[index]!;
    const left = circleRegion(center - 38, 325, 88, 48);
    const right = circleRegion(center + 38, 325, 88, 48);
    const result = constructPolygonBoolean({
      operation,
      operands: [left, right],
      output: {
        id: `${operation}-result`,
        name: `${operation} constructed region`,
        style: { fill: COLORS[index], stroke: darkenColor(index), strokeWidth: 4, opacity: 76, lineJoin: "round" }
      }
    });
    if (!result.element) throw new Error(`Boolean geometry lesson unexpectedly produced an empty ${operation} result`);
    elements.push(
      { id: `${operation}-heading`, type: "text", x: center - 55, y: 155, text: operation.toUpperCase(), size: 20, style: { fill: "#1E293B", stroke: null } },
      { id: `${operation}-formula`, type: "text", x: center - 48, y: 188, text: formula(operation), size: 17, style: { fill: darkenColor(index), stroke: null } },
      { ...result.element, zIndex: 1 },
      { id: `${operation}-input-a`, type: "polygon", x: 0, y: 0, zIndex: 2, points: left.rings[0]!, style: { fill: null, stroke: "#0F766E", strokeWidth: 3, dashArray: [9, 6] } },
      { id: `${operation}-input-b`, type: "polygon", x: 0, y: 0, zIndex: 2, points: right.rings[0]!, style: { fill: null, stroke: "#7C3AED", strokeWidth: 3, dashArray: [9, 6], dashOffset: 4 } },
      { id: `${operation}-description`, type: "text", x: center - 112, y: 454, text: DESCRIPTIONS[index]!, size: 15, style: { fill: "#334155", stroke: null } },
      { id: `${operation}-topology`, type: "text", x: center - 80, y: 487, text: `${result.polygonCount} polygon${result.polygonCount === 1 ? "" : "s"}, ${result.ringCount} ring${result.ringCount === 1 ? "" : "s"}`, size: 14, style: { fill: "#64748B", stroke: null } }
    );
    objects.push({
      id: `${operation}-region`,
      kind: "constructed_region",
      label: `${operation} region`,
      elementIds: [`${operation}-result`],
      properties: { operation, area: result.area, polygonCount: result.polygonCount, ringCount: result.ringCount }
    });
  });

  elements.push(
    { id: "science-note", type: "text", x: 50, y: 548, text: "Scientific uses: merged compartments, shared domains, exclusions, cutouts, segmented phases, and non-overlapping populations.", size: 17, style: { fill: "#334155", stroke: null } },
    { id: "curve-note", type: "text", x: 50, y: 582, text: "This bounded service operates on polygons; curved paths must be flattened to a declared tolerance before boolean construction.", size: 16, style: { fill: "#7C2D12", stroke: null } }
  );

  return {
    document: { title: "Polygon boolean construction", width: 1180, height: 630, colorMode: "RGB" },
    elements,
    semantics: { objects }
  };
}

function circleRegion(cx: number, cy: number, radius: number, segments: number): PolygonBooleanRegion {
  const points: Point[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return { rings: [points] };
}

function rectanglePoints(x: number, y: number, width: number, height: number): Point[] {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

function formula(operation: PolygonBooleanOperation): string {
  if (operation === "union") return "A OR B";
  if (operation === "intersection") return "A AND B";
  if (operation === "difference") return "A AND NOT B";
  return "A XOR B";
}

function darkenColor(index: number): string {
  return ["#0F766E", "#6D28D9", "#1D4ED8", "#C2410C"][index]!;
}
