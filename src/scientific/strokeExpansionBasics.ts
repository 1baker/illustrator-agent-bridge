import { expandStroke } from "../core/strokeExpansion.js";
import type { PathElement, VectorElement, VectorScene } from "../core/vectorScene.js";

/** Visual lesson: a stroke style is compiled from a centerline into filled geometry. */
export function composeStrokeExpansionBasicsScene(): VectorScene {
  const elements: VectorElement[] = [
    { id: "background", type: "rect", x: 0, y: 0, width: 1180, height: 720, zIndex: -20, style: { fill: "#F8FAFC", stroke: null } },
    text("title", 40, 47, "A stroke is a filled region generated around a centerline", 28, "#0F172A"),
    text("subtitle", 40, 77, "Width, caps, joins, and dash intervals become explicit polygon boundaries that software can measure and combine.", 15, "#475569")
  ];
  const panelX = [35, 322, 609, 896];
  for (let index = 0; index < panelX.length; index += 1) {
    elements.push({ id: `panel-${index + 1}`, type: "rect", x: panelX[index]!, y: 105, width: 249, height: 545, zIndex: -10, style: { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidth: 1 } });
  }

  const base = expandStroke({
    tolerance: 0.25,
    source: { type: "line", id: "base-source", x: 66, y: 290, x2: 254, y2: 290, style: { stroke: "#2563EB", strokeWidth: 30, lineCap: "butt" } },
    output: { id: "base-outline", name: "expanded width region", style: { fill: "#BFDBFE", stroke: "#2563EB", strokeWidth: 2 } }
  });
  elements.push(
    text("p1-head", 55, 142, "1. Expand width", 18, "#0F172A"),
    text("p1-copy", 55, 169, "A zero-area line becomes a region", 13, "#475569"),
    base.element,
    line("base-centerline", 66, 290, 254, 290, "#0F172A", 2, [7, 5]),
    line("width-guide", 93, 275, 93, 305, "#DC2626", 2),
    text("width-label", 104, 295, "30 units", 13, "#B91C1C"),
    text("base-area", 55, 392, `area = ${base.area}`, 14, "#1D4ED8"),
    text("p1-note", 55, 548, "The centerline remains editable.", 13, "#475569"),
    text("p1-note-2", 55, 572, "The outline is measurable fill.", 13, "#475569")
  );

  const caps = ["butt", "round", "square"] as const;
  const capY = [242, 350, 458];
  for (let index = 0; index < caps.length; index += 1) {
    const cap = caps[index]!;
    const y = capY[index]!;
    const result = expandStroke({
      tolerance: 0.2,
      source: { type: "line", x: 372, y, x2: 522, y2: y, style: { stroke: "#0F766E", strokeWidth: 22, lineCap: cap } },
      output: { id: `cap-${cap}-outline`, style: { fill: "#99F6E4", stroke: "#0F766E", strokeWidth: 1 } }
    });
    elements.push(
      result.element,
      line(`cap-${cap}-centerline`, 372, y, 522, y, "#134E4A", 1, [5, 4]),
      text(`cap-${cap}-label`, 342, y - 31, cap, 14, "#115E59")
    );
  }
  elements.push(
    text("p2-head", 342, 142, "2. Resolve endpoints", 18, "#0F172A"),
    text("p2-copy", 342, 169, "Caps decide where an open stroke ends", 13, "#475569"),
    text("p2-note", 342, 548, "Butt stops at the anchor.", 13, "#475569"),
    text("p2-note-2", 342, 572, "Round and square extend by ½ width.", 13, "#475569")
  );

  const joins = ["miter", "round", "bevel"] as const;
  const joinY = [244, 363, 482];
  for (let index = 0; index < joins.length; index += 1) {
    const join = joins[index]!;
    const y = joinY[index]!;
    const source: PathElement = {
      type: "path",
      x: 0,
      y: 0,
      closed: false,
      points: [{ x: 650, y: y + 25 }, { x: 724, y: y - 22 }, { x: 798, y: y + 25 }],
      style: { fill: null, stroke: "#7C3AED", strokeWidth: 20, lineCap: "butt", lineJoin: join, miterLimit: 4 }
    };
    const result = expandStroke({
      tolerance: 0.2,
      source,
      output: { id: `join-${join}-outline`, style: { fill: "#DDD6FE", stroke: "#7C3AED", strokeWidth: 1 } }
    });
    elements.push(
      result.element,
      { ...source, id: `join-${join}-centerline`, style: { fill: null, stroke: "#4C1D95", strokeWidth: 1, dashArray: [5, 4] } },
      text(`join-${join}-label`, 629, y - 44, join, 14, "#5B21B6")
    );
  }
  elements.push(
    text("p3-head", 629, 142, "3. Resolve corners", 18, "#0F172A"),
    text("p3-copy", 629, 169, "Joins construct the outside corner", 13, "#475569"),
    text("p3-note", 629, 548, "Miter spikes are bounded by", 13, "#475569"),
    text("p3-note-2", 629, 572, "miterLimit, then fall back to bevel.", 13, "#475569")
  );

  const dashedSource: PathElement = {
    type: "path",
    x: 0,
    y: 0,
    closed: false,
    points: [
      { x: 928, y: 287, rightX: 958, rightY: 190 },
      { x: 1019, y: 253, leftX: 982, leftY: 213, rightX: 1055, rightY: 293 },
      { x: 1115, y: 230, leftX: 1084, leftY: 315 }
    ],
    style: { fill: null, stroke: "#DC2626", strokeWidth: 15, lineCap: "round", lineJoin: "round", dashArray: [30, 14], dashOffset: 5 }
  };
  const dashed = expandStroke({
    tolerance: 0.5,
    source: dashedSource,
    output: { id: "dashed-curve-outline", style: { fill: "#FCA5A5", stroke: "#DC2626", strokeWidth: 1 } }
  });
  const closedSource: PathElement = {
    type: "path",
    x: 0,
    y: 0,
    closed: true,
    points: [{ x: 965, y: 414 }, { x: 1092, y: 414 }, { x: 1092, y: 507 }, { x: 965, y: 507 }],
    style: { fill: null, stroke: "#EA580C", strokeWidth: 18, lineJoin: "round" }
  };
  const closed = expandStroke({
    tolerance: 0.4,
    source: closedSource,
    output: { id: "closed-stroke-outline", style: { fill: "#FED7AA", stroke: "#EA580C", strokeWidth: 1 } }
  });
  elements.push(
    text("p4-head", 916, 142, "4. Compile patterns", 18, "#0F172A"),
    text("p4-copy", 916, 169, "Each dash becomes capped geometry", 13, "#475569"),
    dashed.element,
    { ...dashedSource, id: "dashed-curve-centerline", style: { fill: null, stroke: "#7F1D1D", strokeWidth: 1, dashArray: [5, 4] } },
    text("dash-meta", 916, 343, `${dashed.paintedSubpathCount} painted dash regions`, 13, "#B91C1C"),
    closed.element,
    { ...closedSource, id: "closed-stroke-centerline", style: { fill: null, stroke: "#9A3412", strokeWidth: 1, dashArray: [5, 4] } },
    text("hole-label", 995, 466, "empty hole", 14, "#9A3412"),
    text("p4-note", 916, 548, "A closed centerline expands", 13, "#475569"),
    text("p4-note-2", 916, 572, "into a true compound ring.", 13, "#475569")
  );

  elements.push(
    line("pipeline-line", 82, 672, 1098, 672, "#94A3B8", 2),
    text("pipeline", 225, 696, "centerline + style  →  segment bodies + cap/join components  →  polygon union  →  canonical filled outline", 14, "#334155")
  );
  return {
    document: { title: "Software-native stroke expansion basics", width: 1180, height: 720, colorMode: "RGB" },
    elements,
    semantics: {
      objects: [
        { id: "width-region", kind: "expanded_stroke", label: "width expansion", elementIds: ["base-outline", "base-centerline"], properties: { strokeWidth: 30, area: base.area, cap: "butt" } },
        ...caps.map((cap) => ({ id: `cap-rule-${cap}`, kind: "stroke_cap_rule", label: `${cap} cap`, elementIds: [`cap-${cap}-outline`, `cap-${cap}-centerline`], properties: { cap } })),
        ...joins.map((join) => ({ id: `join-rule-${join}`, kind: "stroke_join_rule", label: `${join} join`, elementIds: [`join-${join}-outline`, `join-${join}-centerline`], properties: { join } })),
        { id: "dash-regions", kind: "expanded_stroke", label: "expanded dashed curve", elementIds: ["dashed-curve-outline", "dashed-curve-centerline"], properties: { paintedSubpaths: dashed.paintedSubpathCount, tolerance: dashed.tolerance } },
        { id: "closed-ring", kind: "expanded_stroke", label: "closed stroke compound ring", elementIds: ["closed-stroke-outline", "closed-stroke-centerline"], properties: { ringCount: closed.ringCount, area: closed.area } }
      ]
    }
  };
}

function text(id: string, x: number, y: number, value: string, size: number, fill: string): VectorElement {
  return { id, type: "text", x, y, text: value, size, style: { fill, stroke: null } };
}

function line(id: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number, dashArray?: number[]): VectorElement {
  return { id, type: "line", x, y, x2, y2, style: { fill: null, stroke, strokeWidth, ...(dashArray ? { dashArray } : {}) } };
}
