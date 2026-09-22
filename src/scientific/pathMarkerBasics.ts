import { placePathMarkers } from "../core/pathMarkers.js";
import type { LineElement, PathElement, VectorElement, VectorScene } from "../core/vectorScene.js";

/** Visual lesson: path tangents drive reusable scientific marker geometry. */
export function composePathMarkerBasicsScene(): VectorScene {
  const elements: VectorElement[] = [
    { id: "background", type: "rect", x: 0, y: 0, width: 1180, height: 720, zIndex: -20, style: { fill: "#F8FAFC", stroke: null } },
    text("title", 40, 47, "Path direction determines scientific marker orientation", 28, "#0F172A"),
    text("subtitle", 40, 77, "The generator computes tangents, then emits editable arrowheads, bars, circles, and diamonds as ordinary vector geometry.", 15, "#475569")
  ];
  const panelX = [35, 322, 609, 896];
  panelX.forEach((x, index) => elements.push({ id: `panel-${index + 1}`, type: "rect", x, y: 105, width: 249, height: 545, zIndex: -10, style: { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidth: 1 } }));

  const straight: LineElement = { id: "straight-path", type: "line", x: 68, y: 275, x2: 252, y2: 275, zIndex: 2, style: { fill: null, stroke: "#2563EB", strokeWidth: 4 } };
  const straightMarker = placePathMarkers({ source: straight, markers: [{ at: "end", kind: "arrowhead", size: 20, idPrefix: "straight-arrow" }] });
  elements.push(text("p1-head", 55, 142, "1. Follow a line", 18, "#0F172A"), text("p1-copy", 55, 169, "Normalize endpoint direction", 13, "#475569"), straight, ...straightMarker.elements,
    line("straight-tangent", 200, 235, 252, 235, "#DC2626", 2), text("straight-tangent-label", 130, 225, "tangent = (1, 0)", 13, "#B91C1C"),
    text("p1-note", 55, 548, "The arrow tip stays on the anchor.", 13, "#475569"), text("p1-note-2", 55, 572, "Its base follows the path direction.", 13, "#475569"));

  const curve: PathElement = { id: "curve-path", type: "path", x: 0, y: 0, closed: false, zIndex: 2, points: [{ x: 358, y: 355, rightX: 358, rightY: 210 }, { x: 568, y: 250, leftX: 485, leftY: 250 }], style: { fill: null, stroke: "#0F766E", strokeWidth: 4 } };
  const curveMarkers = placePathMarkers({ source: curve, markers: [
    { at: "start", kind: "circle", size: 18, idPrefix: "curve-start", style: { fill: "#FFFFFF", stroke: "#0F766E", strokeWidth: 4 } },
    { at: "end", kind: "arrowhead", size: 20, idPrefix: "curve-end" }
  ] });
  elements.push(text("p2-head", 342, 142, "2. Read curve handles", 18, "#0F172A"), text("p2-copy", 342, 169, "Cubic controls define exact tangents", 13, "#475569"), curve, ...curveMarkers.elements,
    line("curve-start-guide", 358, 355, 358, 302, "#DC2626", 2), line("curve-end-guide", 515, 250, 568, 250, "#DC2626", 2),
    text("curve-start-label", 370, 337, "start", 13, "#B91C1C"), text("curve-end-label", 505, 225, "end", 13, "#B91C1C"),
    text("p2-note", 342, 548, "No raster sampling is involved.", 13, "#475569"), text("p2-note-2", 342, 572, "The Bézier handles are the evidence.", 13, "#475569"));

  const corner: PathElement = { id: "corner-path", type: "path", x: 0, y: 0, closed: false, zIndex: 2, points: [{ x: 646, y: 340 }, { x: 730, y: 255 }, { x: 814, y: 340 }], style: { fill: null, stroke: "#7C3AED", strokeWidth: 4 } };
  const cornerMarker = placePathMarkers({ source: corner, markers: [{ at: "mid", kind: "diamond", size: 24, idPrefix: "corner-checkpoint", style: { fill: "#FDE68A", stroke: "#92400E", strokeWidth: 2 } }] });
  elements.push(text("p3-head", 629, 142, "3. Bisect a vertex", 18, "#0F172A"), text("p3-copy", 629, 169, "Incoming + outgoing gives direction", 13, "#475569"), corner, ...cornerMarker.elements,
    line("corner-bisector", 730, 255, 730, 205, "#DC2626", 2), text("corner-bisector-label", 746, 216, "bisector", 13, "#B91C1C"),
    text("p3-note", 629, 548, "A 180° reversal is ambiguous", 13, "#475569"), text("p3-note-2", 629, 572, "and fails validation explicitly.", 13, "#475569"));

  const activation: LineElement = { id: "activation-path", type: "line", x: 930, y: 245, x2: 1110, y2: 245, zIndex: 2, style: { fill: null, stroke: "#15803D", strokeWidth: 4 } };
  const inhibition: LineElement = { id: "inhibition-path", type: "line", x: 930, y: 365, x2: 1110, y2: 365, zIndex: 2, style: { fill: null, stroke: "#DC2626", strokeWidth: 4 } };
  const activationMarker = placePathMarkers({ source: activation, markers: [{ at: "end", kind: "arrowhead", size: 20, idPrefix: "activation-arrow" }] });
  const inhibitionMarker = placePathMarkers({ source: inhibition, markers: [{ at: "end", kind: "bar", size: 26, thickness: 5, idPrefix: "inhibition-bar" }] });
  elements.push(text("p4-head", 916, 142, "4. Encode meaning", 18, "#0F172A"), text("p4-copy", 916, 169, "Marker kind carries semantics", 13, "#475569"), activation, ...activationMarker.elements, inhibition, ...inhibitionMarker.elements,
    text("activation-label", 930, 220, "activation / transport", 13, "#166534"), text("inhibition-label", 930, 340, "inhibition", 13, "#B91C1C"),
    text("p4-note", 916, 548, "One geometry service supports", 13, "#475569"), text("p4-note-2", 916, 572, "the scientific connector grammar.", 13, "#475569"));

  elements.push(line("pipeline-line", 82, 672, 1098, 672, "#94A3B8", 2), text("pipeline", 225, 696, "path anchors + cubic handles  →  tangent resolution  →  marker construction  →  semantic vector scene", 14, "#334155"));
  return {
    document: { title: "Software-native path marker basics", width: 1180, height: 720, colorMode: "RGB" },
    elements,
    semantics: {
      objects: [
        { id: "line-end-marker", kind: "path_marker_rule", label: "straight end arrow", elementIds: ["straight-path", "straight-arrow"], properties: { position: "end", marker: "arrowhead", angleDegrees: straightMarker.placements[0]!.angleDegrees } },
        { id: "cubic-endpoint-markers", kind: "path_marker_rule", label: "cubic endpoint markers", elementIds: ["curve-path", "curve-start", "curve-end"], properties: { startAngleDegrees: curveMarkers.placements[0]!.angleDegrees, endAngleDegrees: curveMarkers.placements[1]!.angleDegrees } },
        { id: "vertex-marker", kind: "path_marker_rule", label: "vertex diamond", elementIds: ["corner-path", "corner-checkpoint.1"], properties: { position: "mid", angleDegrees: cornerMarker.placements[0]!.angleDegrees } },
        { id: "activation-connector", kind: "scientific_connector", label: "activation", elementIds: ["activation-path", "activation-arrow"], properties: { role: "activation" } },
        { id: "inhibition-connector", kind: "scientific_connector", label: "inhibition", elementIds: ["inhibition-path", "inhibition-bar"], properties: { role: "inhibition" } }
      ],
      relationships: [
        { id: "marker-encodes-activation", sourceObjectId: "activation-connector", predicate: "uses_marker", targetObjectId: "line-end-marker", visualElementIds: ["activation-arrow"] },
        { id: "marker-encodes-inhibition", sourceObjectId: "inhibition-connector", predicate: "uses_marker", targetObjectId: "line-end-marker", visualElementIds: ["inhibition-bar"] }
      ]
    }
  };
}

function text(id: string, x: number, y: number, value: string, size: number, fill: string): VectorElement { return { id, type: "text", x, y, text: value, size, style: { fill, stroke: null } }; }
function line(id: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number): VectorElement { return { id, type: "line", x, y, x2, y2, style: { fill: null, stroke, strokeWidth } }; }
