import { normalizeScene } from "../core/sceneValidation.js";
import type { VectorElement, VectorScene } from "../core/vectorScene.js";

export function composeCompositionBasicsScene(): VectorScene {
  const elements: VectorElement[] = [
    rect("background", 0, 0, 1200, 650, "#F8FAFC", null, 0, undefined, -100),
    text("title", 45, 28, "Composition: behind, in front, and inside", 30, "#0F172A", undefined, 100),
    text("subtitle", 45, 75, "Array order is not meaning. Explicit groups and z-order encode the intended structure.", 17, "#475569", undefined, 100),

    text("order-heading", 55, 135, "1. Drawing order", 22, "#1E293B", undefined, 20),
    text("order-note", 55, 170, "Higher z-index is painted later and appears in front.", 15, "#64748B", undefined, 20),
    ellipse("order.back", 85, 245, 190, 190, "#BFDBFE", "#2563EB", 5, undefined, 1),
    ellipse("order.middle", 175, 285, 190, 190, "#FDE68A", "#D97706", 5, undefined, 2),
    ellipse("order.front", 265, 325, 190, 190, "#FECDD3", "#E11D48", 5, undefined, 3),
    text("order.back.label", 115, 265, "back: 1", 16, "#1E40AF", undefined, 4),
    text("order.middle.label", 205, 305, "middle: 2", 16, "#92400E", undefined, 4),
    text("order.front.label", 295, 345, "front: 3", 16, "#9F1239", undefined, 4),

    text("containment-heading", 620, 135, "2. Grouping and clipping", 22, "#1E293B", undefined, 20),
    text("containment-note", 620, 170, "Cell contents are grouped and clipped to the membrane boundary.", 15, "#64748B", undefined, 20),
    ellipse("cell.cytoplasm", 700, 225, 390, 300, "#E0F2FE", null, 0, "cell-fluid", 0),
    ellipse("cell.nucleus", 815, 305, 155, 120, "#C4B5FD", "#6D28D9", 4, "organelles", 1),
    ellipse("particle.inside-1", 760, 285, 42, 42, "#FDE68A", "#B45309", 3, "particles", 1),
    ellipse("particle.inside-2", 980, 410, 48, 48, "#FDE68A", "#B45309", 3, "particles", 2),
    ellipse("particle.clipped", 1055, 275, 90, 90, "#FDA4AF", "#BE123C", 4, "particles", 3),
    ellipse("cell.membrane", 700, 225, 390, 300, null, "#0369A1", 11, undefined, 10),
    text("cell.label", 825, 545, "cell boundary", 18, "#075985", undefined, 20),
    text("clip.label", 995, 220, "partly clipped", 14, "#9F1239", undefined, 20),
    line("clip.pointer", 1040, 245, 1080, 285, "#9F1239", 2, undefined, 20)
  ];

  return normalizeScene({
    document: { title: "Composition basics: grouping, z-order, and clipping", width: 1200, height: 650, colorMode: "RGB" },
    groups: [
      {
        id: "cell-interior",
        name: "clipped cell interior",
        zIndex: 1,
        clip: { type: "ellipse", x: 700, y: 225, width: 390, height: 300 }
      },
      { id: "cell-fluid", name: "cytoplasm layer", parentId: "cell-interior", zIndex: 0 },
      { id: "organelles", name: "organelle layer", parentId: "cell-interior", zIndex: 2 },
      { id: "particles", name: "particle layer", parentId: "cell-interior", zIndex: 3, opacity: 88 }
    ],
    elements,
    semantics: {
      objects: [
        {
          id: "cell-1",
          kind: "cell",
          label: "bounded cell compartment",
          elementIds: ["cell.cytoplasm", "cell.membrane"],
          properties: { containmentGroup: "cell-interior", clippingBoundary: "ellipse" }
        },
        { id: "nucleus-1", kind: "nucleus", elementIds: ["cell.nucleus"] },
        {
          id: "particle-set-1",
          kind: "particle_set",
          elementIds: ["particle.inside-1", "particle.inside-2", "particle.clipped"],
          properties: { clippedToCompartment: true }
        }
      ],
      relationships: [
        { id: "nucleus-containment", sourceObjectId: "nucleus-1", predicate: "contained_in", targetObjectId: "cell-1" },
        { id: "particle-containment", sourceObjectId: "particle-set-1", predicate: "contained_in", targetObjectId: "cell-1" }
      ]
    }
  });
}

function rect(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string | null,
  stroke: string | null,
  strokeWidth: number,
  groupId?: string,
  zIndex?: number
): VectorElement {
  return { id, type: "rect", name: id, x, y, width, height, groupId, zIndex, style: { fill, stroke, strokeWidth } };
}

function ellipse(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string | null,
  stroke: string | null,
  strokeWidth: number,
  groupId?: string,
  zIndex?: number
): VectorElement {
  return { id, type: "ellipse", name: id, x, y, width, height, groupId, zIndex, style: { fill, stroke, strokeWidth } };
}

function line(id: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number, groupId?: string, zIndex?: number): VectorElement {
  return { id, type: "line", name: id, x, y, x2, y2, groupId, zIndex, style: { fill: null, stroke, strokeWidth } };
}

function text(id: string, x: number, y: number, value: string, size: number, fill: string, groupId?: string, zIndex?: number): VectorElement {
  return { id, type: "text", name: id, x, y, text: value, size, groupId, zIndex, style: { fill, stroke: null } };
}
