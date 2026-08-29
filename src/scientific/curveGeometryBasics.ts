import { flattenBezierPath } from "../core/bezierFlattening.js";
import { constructPolygonBoolean } from "../core/polygonBoolean.js";
import type { PathElement, PathPoint, VectorElement, VectorScene } from "../core/vectorScene.js";

/** Visual lesson: cubic control geometry, explicit approximation, and curved set construction. */
export function composeCurveGeometryBasicsScene(): VectorScene {
  const elements: VectorElement[] = [
    { id: "background", type: "rect", x: 0, y: 0, width: 1180, height: 680, zIndex: -10, style: { fill: "#F8FAFC", stroke: null } },
    { id: "title", type: "text", x: 40, y: 47, text: "Curves are compiled into measurable geometry", size: 29, style: { fill: "#0F172A", stroke: null } },
    { id: "subtitle", type: "text", x: 40, y: 76, text: "Cubic Bézier handles define shape; a declared tolerance controls the straight-segment approximation used by geometry algorithms.", size: 15, style: { fill: "#475569", stroke: null } }
  ];

  const panels = [35, 322, 609, 896];
  for (let index = 0; index < panels.length; index += 1) {
    elements.push({ id: `panel-${index + 1}`, type: "rect", x: panels[index]!, y: 104, width: 249, height: 500, zIndex: -5, style: { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidth: 1 } });
  }

  const definition = archPath("definition-curve", 62, 340, 195, 115);
  const a = definition.points[0]!;
  const b = definition.points[1]!;
  elements.push(
    text("panel-1-heading", 55, 139, "1. Define a cubic curve", 18, "#0F172A"),
    text("panel-1-copy", 55, 166, "Two anchors + two control handles", 13, "#475569"),
    line("handle-line-a", a.x, a.y, a.rightX!, a.rightY!, "#94A3B8", 2, [6, 5]),
    line("handle-line-b", b.x, b.y, b.leftX!, b.leftY!, "#94A3B8", 2, [6, 5]),
    { ...definition, style: { fill: null, stroke: "#2563EB", strokeWidth: 5, lineCap: "round" } },
    dot("anchor-a", a.x, a.y, 6, "#0F172A"),
    dot("anchor-b", b.x, b.y, 6, "#0F172A"),
    dot("handle-a", a.rightX!, a.rightY!, 5, "#F97316"),
    dot("handle-b", b.leftX!, b.leftY!, 5, "#F97316"),
    text("anchor-label", 55, 440, "anchors", 13, "#0F172A"),
    dot("anchor-key", 118, 434, 5, "#0F172A"),
    text("handle-label", 55, 468, "handles", 13, "#0F172A"),
    dot("handle-key", 118, 462, 5, "#F97316"),
    text("panel-1-note", 55, 525, "The handles pull the segment.", 13, "#475569"),
    text("panel-1-note-2", 55, 548, "They are data—not pixels.", 13, "#475569")
  );

  const toleranceCurve = archPath("tolerance-source", 350, 300, 220, 150);
  const coarse = flattenBezierPath({ path: toleranceCurve, tolerance: 14 });
  const fine = flattenBezierPath({ path: toleranceCurve, tolerance: 2 });
  elements.push(
    text("panel-2-heading", 342, 139, "2. Choose a tolerance", 18, "#0F172A"),
    text("panel-2-copy", 342, 166, "Smaller tolerance → more segments", 13, "#475569"),
    { ...toleranceCurve, id: "tolerance-source", style: { fill: null, stroke: "#CBD5E1", strokeWidth: 7, lineCap: "round" } },
    { ...coarse.path, id: "coarse-flattening", name: "coarse tolerance 14", style: { fill: null, stroke: "#EA580C", strokeWidth: 3, lineJoin: "round" } },
    { ...fine.path, id: "fine-flattening", name: "fine tolerance 2", style: { fill: null, stroke: "#0F766E", strokeWidth: 2, dashArray: [5, 4], lineJoin: "round" } },
    text("coarse-label", 342, 435, `tolerance 14: ${coarse.outputSegmentCount} segments`, 13, "#EA580C"),
    text("fine-label", 342, 461, `tolerance 2: ${fine.outputSegmentCount} segments`, 13, "#0F766E"),
    text("panel-2-note", 342, 525, "Tolerance is part of provenance.", 13, "#475569"),
    text("panel-2-note-2", 342, 548, "It makes approximation auditable.", 13, "#475569")
  );

  const membrane = ellipsePath("membrane-curve", 733, 312, 96, 115);
  const membraneFlat = flattenBezierPath({ path: membrane, tolerance: 2 });
  elements.push(
    text("panel-3-heading", 629, 139, "3. Close it into a region", 18, "#0F172A"),
    text("panel-3-copy", 629, 166, "Closed boundary + fill = material", 13, "#475569"),
    { ...membrane, style: { fill: "#CCFBF1", stroke: "#0F766E", strokeWidth: 4 } },
    { ...membraneFlat.path, id: "membrane-flat", style: { fill: null, stroke: "#F97316", strokeWidth: 2, dashArray: [5, 5] } },
    text("filled-label", 681, 318, "filled region", 14, "#115E59"),
    text("boundary-label", 640, 452, `flattened boundary: ${membraneFlat.outputSegmentCount} edges`, 13, "#EA580C"),
    text("panel-3-note", 629, 525, "This can represent a cell, pore,", 13, "#475569"),
    text("panel-3-note-2", 629, 548, "particle, membrane, or domain.", 13, "#475569")
  );

  const left = ellipsePath("source-region-a", 995, 315, 72, 105);
  const right = ellipsePath("source-region-b", 1060, 315, 72, 105);
  const intersected = constructPolygonBoolean({
    operation: "intersection",
    curveTolerance: 1.5,
    operands: [{ rings: [], paths: [left] }, { rings: [], paths: [right] }],
    output: { id: "curved-intersection", name: "curved region intersection", style: { fill: "#C4B5FD", stroke: "#6D28D9", strokeWidth: 3, lineJoin: "round" } }
  });
  elements.push(
    text("panel-4-heading", 916, 139, "4. Compute on regions", 18, "#0F172A"),
    text("panel-4-copy", 916, 166, "Flatten first, then intersect", 13, "#475569"),
    { ...left, style: { fill: null, stroke: "#2563EB", strokeWidth: 2, dashArray: [7, 5] } },
    { ...right, style: { fill: null, stroke: "#EA580C", strokeWidth: 2, dashArray: [7, 5] } },
    intersected.element!,
    text("intersection-label", 973, 319, "shared", 14, "#4C1D95"),
    text("intersection-label-2", 972, 339, "domain", 14, "#4C1D95"),
    text("panel-4-meta", 916, 452, `tolerance 1.5 • ${intersected.pointCount} output points`, 13, "#6D28D9"),
    text("panel-4-note", 916, 525, "Useful for overlaps, exclusions,", 13, "#475569"),
    text("panel-4-note-2", 916, 548, "masks, and compartment analysis.", 13, "#475569")
  );

  elements.push(
    line("pipeline-line", 83, 637, 1092, 637, "#94A3B8", 2),
    text("pipeline-label", 333, 660, "anchors + handles  →  tolerance-controlled segments  →  filled region  →  computational geometry", 14, "#334155")
  );

  return {
    document: { title: "Software-native curve geometry basics", width: 1180, height: 680, colorMode: "RGB" },
    elements,
    semantics: {
      objects: [
        { id: "bezier-definition", kind: "curve_definition", label: "cubic Bezier definition", elementIds: ["definition-curve", "handle-line-a", "handle-line-b"], properties: { representation: "anchors_and_absolute_handles" } },
        { id: "curve-approximation", kind: "geometry_approximation", label: "tolerance-controlled flattening", elementIds: ["coarse-flattening", "fine-flattening"], properties: { coarseTolerance: 14, fineTolerance: 2, coarseSegments: coarse.outputSegmentCount, fineSegments: fine.outputSegmentCount } },
        { id: "membrane-region", kind: "constructed_region", label: "filled membrane region", elementIds: ["membrane-curve", "membrane-flat"], properties: { tolerance: 2, flattenedEdges: membraneFlat.outputSegmentCount } },
        { id: "shared-domain", kind: "constructed_region", label: "curved intersection", elementIds: ["curved-intersection"], properties: { operation: "intersection", tolerance: 1.5, area: intersected.area } }
      ]
    }
  };
}

function archPath(id: string, x: number, y: number, width: number, height: number): PathElement {
  return {
    id,
    type: "path",
    x: 0,
    y: 0,
    closed: false,
    points: [
      { x, y, rightX: x, rightY: y - height },
      { x: x + width, y, leftX: x + width, leftY: y - height }
    ]
  };
}

function ellipsePath(id: string, cx: number, cy: number, rx: number, ry: number): PathElement {
  const k = 0.552284749831;
  const points: PathPoint[] = [
    { x: cx, y: cy - ry, leftX: cx - k * rx, leftY: cy - ry, rightX: cx + k * rx, rightY: cy - ry },
    { x: cx + rx, y: cy, leftX: cx + rx, leftY: cy - k * ry, rightX: cx + rx, rightY: cy + k * ry },
    { x: cx, y: cy + ry, leftX: cx + k * rx, leftY: cy + ry, rightX: cx - k * rx, rightY: cy + ry },
    { x: cx - rx, y: cy, leftX: cx - rx, leftY: cy + k * ry, rightX: cx - rx, rightY: cy - k * ry }
  ];
  return { id, type: "path", x: 0, y: 0, closed: true, points };
}

function text(id: string, x: number, y: number, value: string, size: number, fill: string): VectorElement {
  return { id, type: "text", x, y, text: value, size, style: { fill, stroke: null } };
}

function line(id: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number, dashArray?: number[]): VectorElement {
  return { id, type: "line", x, y, x2, y2, style: { fill: null, stroke, strokeWidth, ...(dashArray ? { dashArray } : {}) } };
}

function dot(id: string, cx: number, cy: number, radius: number, fill: string): VectorElement {
  return { id, type: "ellipse", x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2, style: { fill, stroke: "#FFFFFF", strokeWidth: 1 } };
}
