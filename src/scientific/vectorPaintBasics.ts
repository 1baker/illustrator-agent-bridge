import type { VectorElement, VectorScene } from "../core/vectorScene.js";

/** Visual lesson: geometry defines interiors; reusable paints define how those interiors and boundaries are colored. */
export function composeVectorPaintBasicsScene(): VectorScene {
  const elements: VectorElement[] = [
    { id: "background", type: "rect", x: 0, y: 0, width: 1180, height: 720, zIndex: -20, style: { fill: "#F8FAFC", stroke: null } },
    text("title", 40, 47, "Geometry defines the region; paint defines its appearance", 28, "#0F172A"),
    text("subtitle", 40, 77, "Empty, solid, linear, radial, and stroke paints are validated scene data—not hidden Illustrator or Photoshop effects.", 15, "#475569")
  ];
  const panelX = [35, 322, 609, 896];
  panelX.forEach((x, index) => elements.push({ id: `panel-${index + 1}`, type: "rect", x, y: 105, width: 249, height: 545, zIndex: -10, style: { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidth: 1 } }));

  elements.push(
    text("p1-head", 55, 142, "1. Choose an interior", 18, "#0F172A"),
    text("p1-copy", 55, 169, "One boundary, two fill states", 13, "#475569"),
    { id: "empty-compartment", type: "polygon", x: 0, y: 0, points: [{ x: 75, y: 240 }, { x: 160, y: 195 }, { x: 245, y: 240 }, { x: 215, y: 340 }, { x: 105, y: 340 }], style: { fill: null, stroke: "#2563EB", strokeWidth: 5, lineJoin: "round" } },
    text("empty-label", 112, 365, "empty / transparent", 14, "#1D4ED8"),
    { id: "solid-compartment", type: "polygon", x: 0, y: 0, points: [{ x: 91, y: 445 }, { x: 160, y: 408 }, { x: 229, y: 445 }, { x: 205, y: 525 }, { x: 115, y: 525 }], style: { fill: "#BFDBFE", stroke: "#2563EB", strokeWidth: 4, lineJoin: "round" } },
    text("solid-label", 126, 548, "solid fill", 14, "#1D4ED8"),
    text("p1-note", 55, 596, "Fill does not change the boundary.", 13, "#475569")
  );

  elements.push(
    text("p2-head", 342, 142, "2. Encode a quantity", 18, "#0F172A"),
    text("p2-copy", 342, 169, "A linear ramp maps position to value", 13, "#475569"),
    { id: "concentration-channel", type: "rect", x: 355, y: 230, width: 185, height: 120, style: { fillPaint: "concentration-ramp", stroke: "#1E3A8A", strokeWidth: 3 } },
    line("channel-centerline", 370, 290, 525, 290, "#FFFFFF", 2),
    text("low-label", 355, 375, "low", 13, "#64748B"), text("high-label", 507, 375, "high", 13, "#1E3A8A"),
    { id: "concentration-legend", type: "rect", x: 355, y: 410, width: 185, height: 24, style: { fillPaint: "concentration-ramp", stroke: "#CBD5E1", strokeWidth: 1 } },
    text("p2-note", 342, 548, "Stops are ordered percentages.", 13, "#475569"),
    text("p2-note-2", 342, 572, "The legend uses the same paint ID.", 13, "#475569")
  );

  elements.push(
    text("p3-head", 629, 142, "3. Suggest spatial depth", 18, "#0F172A"),
    text("p3-copy", 629, 169, "A radial ramp grows from a focus", 13, "#475569"),
    { id: "particle-shadow", type: "ellipse", x: 662, y: 338, width: 146, height: 35, style: { fill: "#CBD5E1", stroke: null, opacity: 60 } },
    { id: "radial-particle", type: "ellipse", x: 653, y: 215, width: 164, height: 164, style: { fillPaint: "particle-depth", stroke: "#5B21B6", strokeWidth: 3 } },
    { id: "particle-core", type: "ellipse", x: 710, y: 272, width: 50, height: 50, style: { fill: null, stroke: "#FFFFFF", strokeWidth: 3, opacity: 80 } },
    text("focus-label", 650, 405, "focus ≠ geometric center", 13, "#6D28D9"),
    text("p3-note", 629, 548, "Useful for particles and spheres.", 13, "#475569"),
    text("p3-note-2", 629, 572, "It is appearance, not hidden data.", 13, "#475569")
  );

  elements.push(
    text("p4-head", 916, 142, "4. Paint a boundary", 18, "#0F172A"),
    text("p4-copy", 916, 169, "A stroke can reference a paint too", 13, "#475569"),
    { id: "energy-path", type: "path", x: 0, y: 0, closed: false, points: [{ x: 930, y: 330, rightX: 985, rightY: 205 }, { x: 1110, y: 330, leftX: 1055, leftY: 205 }], style: { fill: null, strokePaint: "energy-flow", strokeWidth: 14, lineCap: "round" } },
    { id: "energy-source", type: "ellipse", x: 922, y: 320, width: 20, height: 20, style: { fill: "#FDE68A", stroke: "#B45309", strokeWidth: 2 } },
    { id: "energy-target", type: "ellipse", x: 1100, y: 320, width: 20, height: 20, style: { fill: "#C4B5FD", stroke: "#6D28D9", strokeWidth: 2 } },
    text("source-label", 920, 375, "source", 13, "#B45309"), text("target-label", 1070, 375, "target", 13, "#6D28D9"),
    text("p4-note", 916, 548, "Paint is reusable scene state.", 13, "#475569"),
    text("p4-note-2", 916, 572, "Geometry and meaning stay separate.", 13, "#475569")
  );

  elements.push(line("pipeline-line", 82, 672, 1098, 672, "#94A3B8", 2), text("pipeline", 205, 696, "closed boundary  →  interior exists  →  fill/stroke references paint  →  SVG + PNG execute the same scene", 14, "#334155"));
  return {
    document: { title: "Software-native vector paint basics", width: 1180, height: 720, colorMode: "RGB" },
    paints: [
      { id: "concentration-ramp", name: "Concentration low to high", type: "linear_gradient", units: "object_bounding_box", x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: "#EFF6FF" }, { offset: 45, color: "#60A5FA" }, { offset: 100, color: "#1E3A8A" }] },
      { id: "particle-depth", name: "Particle depth", type: "radial_gradient", units: "object_bounding_box", cx: 0.5, cy: 0.5, r: 0.68, fx: 0.32, fy: 0.28, stops: [{ offset: 0, color: "#FFFFFF" }, { offset: 35, color: "#DDD6FE" }, { offset: 100, color: "#7C3AED" }] },
      { id: "energy-flow", name: "Energy direction", type: "linear_gradient", units: "user_space", x1: 930, y1: 330, x2: 1110, y2: 330, stops: [{ offset: 0, color: "#F59E0B" }, { offset: 50, color: "#EC4899" }, { offset: 100, color: "#7C3AED" }] }
    ],
    elements,
    semantics: { objects: [
      { id: "empty-region", kind: "fill_state", label: "transparent interior", elementIds: ["empty-compartment"], properties: { filled: false } },
      { id: "solid-region", kind: "fill_state", label: "solid interior", elementIds: ["solid-compartment"], properties: { filled: true, paintType: "flat" } },
      { id: "concentration-field", kind: "quantitative_field", label: "concentration gradient", elementIds: ["concentration-channel", "concentration-legend"], properties: { paintId: "concentration-ramp", mapping: "left_low_right_high" } },
      { id: "particle", kind: "scientific_particle", label: "radially shaded particle", elementIds: ["particle-shadow", "radial-particle", "particle-core"], properties: { paintId: "particle-depth", encoding: "visual_depth" } },
      { id: "energy-transfer", kind: "scientific_flow", label: "energy transfer", elementIds: ["energy-path", "energy-source", "energy-target"], properties: { paintId: "energy-flow", direction: "source_to_target" } }
    ] }
  };
}

function text(id: string, x: number, y: number, value: string, size: number, fill: string): VectorElement { return { id, type: "text", x, y, text: value, size, style: { fill, stroke: null } }; }
function line(id: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number): VectorElement { return { id, type: "line", x, y, x2, y2, style: { fill: null, stroke, strokeWidth } }; }
