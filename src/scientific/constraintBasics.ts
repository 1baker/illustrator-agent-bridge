import { solveLayout, type LayoutConstraint, type ResolvedLayoutNode } from "../core/layoutConstraints.js";
import { normalizeScene } from "../core/sceneValidation.js";
import type { ScientificRelationship, VectorElement, VectorScene } from "../core/vectorScene.js";

export function composeConstraintBasicsScene(): VectorScene {
  const constraints: LayoutConstraint[] = [
    { id: "sample-in-panel", type: "contain", childId: "sample", containerId: "workflow-panel", padding: 30 },
    { id: "reaction-after-sample", type: "gap", sourceId: "reaction", targetId: "sample", direction: "right", gap: 70 },
    { id: "reaction-centerline", type: "align", sourceId: "reaction", targetId: "sample", axis: "y", mode: "center" },
    { id: "reaction-in-panel", type: "contain", childId: "reaction", containerId: "workflow-panel", padding: 30 },
    { id: "analysis-after-reaction", type: "gap", sourceId: "analysis", targetId: "reaction", direction: "right", gap: 70 },
    { id: "analysis-centerline", type: "align", sourceId: "analysis", targetId: "reaction", axis: "y", mode: "center" },
    { id: "analysis-in-panel", type: "contain", childId: "analysis", containerId: "workflow-panel", padding: 30 },
    { id: "nucleus-in-cell", type: "contain", childId: "nucleus", containerId: "cell", padding: 30 },
    { id: "vesicle-after-nucleus", type: "gap", sourceId: "vesicle", targetId: "nucleus", direction: "right", gap: 30 },
    { id: "vesicle-centerline", type: "align", sourceId: "vesicle", targetId: "nucleus", axis: "y", mode: "center" },
    { id: "vesicle-in-cell", type: "contain", childId: "vesicle", containerId: "cell", padding: 20 }
  ];

  const nodes = solveLayout({
    nodes: [
      { id: "analysis", width: 120, height: 80 },
      { id: "cell", x: 800, y: 210, width: 320, height: 300 },
      { id: "workflow-panel", x: 60, y: 210, width: 640, height: 300 },
      { id: "sample", x: 120, y: 320, width: 120, height: 80 },
      { id: "reaction", width: 140, height: 100 },
      { id: "nucleus", width: 120, height: 100 },
      { id: "vesicle", width: 50, height: 50 }
    ],
    constraints
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sample = byId.get("sample")!;
  const reaction = byId.get("reaction")!;
  const analysis = byId.get("analysis")!;
  const cell = byId.get("cell")!;
  const nucleus = byId.get("nucleus")!;
  const vesicle = byId.get("vesicle")!;

  const relationships: ScientificRelationship[] = [
    relationship("sample-to-reaction", "sample-1", "flows_to", "reaction-1", ["sample-to-reaction.line", "sample-to-reaction.arrow"]),
    relationship("reaction-to-analysis", "reaction-1", "flows_to", "analysis-1", ["reaction-to-analysis.line", "reaction-to-analysis.arrow"]),
    relationship("nucleus-containment-layout", "nucleus-1", "contained_in", "cell-1"),
    relationship("vesicle-containment-layout", "vesicle-1", "contained_in", "cell-1")
  ];

  const elements: VectorElement[] = [
    rect("background", 0, 0, 1200, 650, "#F8FAFC", null, 0, undefined, -100),
    text("title", 45, 28, "Constraint layout: describe relationships, solve coordinates", 29, "#0F172A", undefined, 100),
    text("subtitle", 45, 75, "Only root boxes are positioned manually; dependent boxes are aligned, spaced, and contained by equations.", 16, "#475569", undefined, 100),
    text("workflow.heading", 60, 145, "1. Aligned scientific workflow", 21, "#1E293B", undefined, 20),
    rect("workflow.panel", 60, 210, 640, 300, "#FFFFFF", "#94A3B8", 3, undefined, 0),
    nodeRect("sample.box", sample, "#DBEAFE", "#2563EB"),
    text("sample.label", sample.x + 27, sample.y + 27, "sample", 18, "#1E40AF", undefined, 4),
    nodeRect("reaction.box", reaction, "#CCFBF1", "#0F766E"),
    text("reaction.label", reaction.x + 25, reaction.y + 36, "reaction", 18, "#115E59", undefined, 4),
    nodeRect("analysis.box", analysis, "#FEF3C7", "#D97706"),
    text("analysis.label", analysis.x + 25, analysis.y + 27, "analysis", 18, "#92400E", undefined, 4),
    ...arrowBetween("sample-to-reaction", sample, reaction),
    ...arrowBetween("reaction-to-analysis", reaction, analysis),
    text("workflow.rules", 112, 455, "gap = 70 · center-y alignment · panel containment", 15, "#64748B", undefined, 10),

    text("cell.heading", 790, 145, "2. Compartment containment", 21, "#1E293B", undefined, 20),
    ellipse("cell.cytoplasm.constraint", cell.x, cell.y, cell.width, cell.height, "#E0F2FE", null, 0, "constraint-cell-interior", 0),
    ellipse("cell.nucleus.constraint", nucleus.x, nucleus.y, nucleus.width, nucleus.height, "#C4B5FD", "#6D28D9", 4, "constraint-cell-contents", 1),
    ellipse("cell.vesicle.constraint", vesicle.x, vesicle.y, vesicle.width, vesicle.height, "#FDE68A", "#B45309", 3, "constraint-cell-contents", 2),
    ellipse("cell.membrane.constraint", cell.x, cell.y, cell.width, cell.height, null, "#0369A1", 10, undefined, 10),
    text("nucleus.label.constraint", nucleus.x + 26, nucleus.y + 37, "nucleus", 16, "#5B21B6", "constraint-cell-contents", 4),
    text("vesicle.label.constraint", vesicle.x - 5, vesicle.y + 63, "vesicle", 14, "#92400E", "constraint-cell-contents", 4),
    text("cell.rules", 807, 545, "center fallback · right gap = 30 · containment", 14, "#64748B", undefined, 20)
  ];

  return normalizeScene({
    document: { title: "Constraint-based scientific layout", width: 1200, height: 650, colorMode: "RGB" },
    groups: [
      {
        id: "constraint-cell-interior",
        name: "constraint-solved cell interior",
        zIndex: 1,
        clip: { type: "ellipse", x: cell.x, y: cell.y, width: cell.width, height: cell.height }
      },
      { id: "constraint-cell-contents", name: "constraint-solved organelles", parentId: "constraint-cell-interior", zIndex: 2 }
    ],
    elements,
    semantics: {
      objects: [
        scientificObject("sample-1", "sample", ["sample.box"], sample, "explicit"),
        scientificObject("reaction-1", "reaction", ["reaction.box"], reaction, "gap_and_align"),
        scientificObject("analysis-1", "analysis", ["analysis.box"], analysis, "gap_and_align"),
        scientificObject("cell-1", "cell", ["cell.cytoplasm.constraint", "cell.membrane.constraint"], cell, "explicit_container"),
        scientificObject("nucleus-1", "nucleus", ["cell.nucleus.constraint", "nucleus.label.constraint"], nucleus, "contain_center"),
        scientificObject("vesicle-1", "vesicle", ["cell.vesicle.constraint", "vesicle.label.constraint"], vesicle, "gap_align_contain")
      ],
      relationships
    }
  });
}

function scientificObject(id: string, kind: string, elementIds: string[], box: ResolvedLayoutNode, layoutMode: string) {
  return { id, kind, elementIds, properties: { layoutMode, resolvedX: box.x, resolvedY: box.y, width: box.width, height: box.height } };
}

function relationship(id: string, sourceObjectId: string, predicate: string, targetObjectId: string, visualElementIds?: string[]): ScientificRelationship {
  return { id, sourceObjectId, predicate, targetObjectId, ...(visualElementIds ? { visualElementIds } : {}) };
}

function arrowBetween(id: string, source: ResolvedLayoutNode, target: ResolvedLayoutNode): VectorElement[] {
  const startX = source.x + source.width;
  const startY = source.y + source.height / 2;
  const endX = target.x;
  const endY = target.y + target.height / 2;
  return [
    line(`${id}.line`, startX, startY, endX, endY, "#475569", 4, undefined, 2),
    {
      id: `${id}.arrow`,
      type: "polygon",
      name: `${id}.arrow`,
      x: 0,
      y: 0,
      zIndex: 3,
      points: [{ x: endX, y: endY }, { x: endX - 14, y: endY - 9 }, { x: endX - 14, y: endY + 9 }],
      style: { fill: "#475569", stroke: null }
    }
  ];
}

function nodeRect(id: string, node: ResolvedLayoutNode, fill: string, stroke: string): VectorElement {
  return rect(id, node.x, node.y, node.width, node.height, fill, stroke, 4, undefined, 3);
}

function rect(id: string, x: number, y: number, width: number, height: number, fill: string | null, stroke: string | null, strokeWidth: number, groupId?: string, zIndex?: number): VectorElement {
  return { id, type: "rect", name: id, x, y, width, height, groupId, zIndex, style: { fill, stroke, strokeWidth } };
}

function ellipse(id: string, x: number, y: number, width: number, height: number, fill: string | null, stroke: string | null, strokeWidth: number, groupId?: string, zIndex?: number): VectorElement {
  return { id, type: "ellipse", name: id, x, y, width, height, groupId, zIndex, style: { fill, stroke, strokeWidth } };
}

function line(id: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number, groupId?: string, zIndex?: number): VectorElement {
  return { id, type: "line", name: id, x, y, x2, y2, groupId, zIndex, style: { fill: null, stroke, strokeWidth } };
}

function text(id: string, x: number, y: number, value: string, size: number, fill: string, groupId?: string, zIndex?: number): VectorElement {
  return { id, type: "text", name: id, x, y, text: value, size, groupId, zIndex, style: { fill, stroke: null } };
}
