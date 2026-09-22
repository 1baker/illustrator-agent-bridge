import { placeLabels, type LabelBox, type LabelPlacement } from "../core/labelPlacement.js";
import { normalizeScene } from "../core/sceneValidation.js";
import {
  contrastRatio,
  DEFAULT_SCIENTIFIC_THEME,
  styleFor,
  validateScientificTheme,
  vectorStyle,
  type ScientificStyleToken,
  type ScientificVisualRole
} from "../core/scientificTheme.js";
import type { ScientificObject, VectorElement, VectorScene, VectorStyle } from "../core/vectorScene.js";

export function composeLabelStyleBasicsScene(): VectorScene {
  const theme = validateScientificTheme(DEFAULT_SCIENTIFIC_THEME);
  const specimen: LabelBox = { id: "specimen", x: 115, y: 310, width: 165, height: 105 };
  const blocker: LabelBox = { id: "apparatus", x: 90, y: 220, width: 220, height: 62 };
  const cell: LabelBox = { id: "cell", x: 690, y: 225, width: 350, height: 300 };
  const nucleus: LabelBox = { id: "nucleus", x: 785, y: 315, width: 135, height: 105 };
  const vesicle: LabelBox = { id: "vesicle", x: 945, y: 350, width: 54, height: 54 };
  const placements = placeLabels(
    [
      {
        id: "specimen-label",
        text: "sample chamber",
        target: specimen,
        preferredPositions: ["top", "right", "bottom", "left"],
        fontSize: 15
      },
      { id: "cell-label", text: "cell compartment", target: cell, preferredPositions: ["bottom", "top", "right", "left"], fontSize: 15 },
      { id: "nucleus-label", text: "nucleus", target: nucleus, preferredPositions: ["top", "left", "right", "bottom"], fontSize: 15 },
      { id: "vesicle-label", text: "vesicle", target: vesicle, preferredPositions: ["right", "top", "bottom", "left"], fontSize: 15 }
    ],
    {
      bounds: { x: 35, y: 130, width: 1130, height: 500 },
      obstacles: [specimen, blocker, nucleus, vesicle]
    }
  );
  const placementByTarget = new Map(placements.map((placement) => [placement.targetId, placement]));
  const elements: VectorElement[] = [
    rect("background", 0, 0, 1200, 700, themeStyle("background"), -100),
    text("title", 45, 28, "Automatic labels and semantic style roles", styleFor(theme, "title"), 100),
    text("subtitle", 45, 76, "Placement and appearance are validated core services; SVG only serializes their resolved output.", styleFor(theme, "body_text"), 100),
    text("placement.heading", 65, 155, "1. Collision-aware placement", { ...styleFor(theme, "body_text"), fontSize: 20 }, 20),
    rectFromBox("apparatus.body", blocker, themeStyle("secondary_object"), 5),
    textAt("apparatus.caption", blocker.x + 44, blocker.y + 19, "blocking apparatus", styleFor(theme, "annotation_text"), 8),
    rectFromBox("specimen.body", specimen, themeStyle("primary_object"), 5),
    textAt("specimen.caption", specimen.x + 43, specimen.y + 39, "specimen", styleFor(theme, "annotation_text"), 8),
    textAt("placement.note", 80, 470, "The preferred top position is blocked, so the solver selects right.", styleFor(theme, "annotation_text"), 20),

    text("style.heading", 650, 155, "2. Scientific roles and coordinated labels", { ...styleFor(theme, "body_text"), fontSize: 20 }, 20),
    ellipseFromBox("cell.body", cell, themeStyle("compartment"), 5),
    ellipseFromBox("nucleus.body", nucleus, themeStyle("secondary_object"), 7),
    ellipseFromBox("vesicle.body", vesicle, themeStyle("primary_object"), 8),
    ...placements.flatMap((placement) => labelElements(placement, theme)),
    textAt("theme.id", 65, 570, `theme: ${theme.id}`, styleFor(theme, "annotation_text"), 30),
    textAt(
      "theme.contrast",
      65,
      605,
      `title contrast ${contrastRatio(theme.tokens.background.fill as string, theme.tokens.title.fill as string).toFixed(2)}:1 · body contrast ${contrastRatio(
        theme.tokens.background.fill as string,
        theme.tokens.body_text.fill as string
      ).toFixed(2)}:1`,
      styleFor(theme, "annotation_text"),
      30
    ),
    textAt("theme.note", 65, 640, "Role tokens control fill, stroke, line weight, opacity, font size, and font family.", styleFor(theme, "annotation_text"), 30)
  ];

  return normalizeScene({
    document: { title: "Automatic label placement and scientific style roles", width: 1200, height: 700, colorMode: "RGB" },
    elements,
    semantics: {
      objects: [
        objectWithLabel("specimen-object", "sample_chamber", ["specimen.body", "specimen.caption"], placementByTarget.get("specimen")!, theme.id),
        { id: "apparatus-object", kind: "instrument", elementIds: ["apparatus.body", "apparatus.caption"], properties: { styleRole: "secondary_object" } },
        objectWithLabel("cell-object", "cell", ["cell.body"], placementByTarget.get("cell")!, theme.id),
        objectWithLabel("nucleus-object", "nucleus", ["nucleus.body"], placementByTarget.get("nucleus")!, theme.id),
        objectWithLabel("vesicle-object", "vesicle", ["vesicle.body"], placementByTarget.get("vesicle")!, theme.id)
      ]
    }
  });
}

function objectWithLabel(id: string, kind: string, baseElementIds: string[], placement: LabelPlacement, themeId: string): ScientificObject {
  const prefix = placement.id.replace(/\.label-box$/, "");
  return {
    id,
    kind,
    elementIds: [...baseElementIds, `${prefix}.label-background`, `${prefix}.label-text`, ...(placement.leader ? [`${prefix}.leader`] : [])],
    properties: { labelPosition: placement.position, labelScore: placement.score, styleTheme: themeId }
  };
}

function labelElements(placement: LabelPlacement, theme: typeof DEFAULT_SCIENTIFIC_THEME): VectorElement[] {
  const prefix = placement.id.replace(/\.label-box$/, "");
  const background = styleFor(theme, "label_background");
  const border = styleFor(theme, "label_border");
  const annotation = styleFor(theme, "annotation_text");
  return [
    ...(placement.leader
      ? [
          {
            id: `${prefix}.leader`,
            type: "line" as const,
            name: `${prefix} leader`,
            x: placement.leader.start.x,
            y: placement.leader.start.y,
            x2: placement.leader.end.x,
            y2: placement.leader.end.y,
            zIndex: 24,
            style: { fill: null, stroke: border.stroke, strokeWidth: border.strokeWidth }
          }
        ]
      : []),
    {
      id: `${prefix}.label-background`,
      type: "rect",
      name: `${prefix} label background`,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      zIndex: 25,
      style: { fill: background.fill, stroke: border.stroke, strokeWidth: border.strokeWidth, opacity: background.opacity }
    },
    {
      id: `${prefix}.label-text`,
      type: "text",
      name: `${prefix} label text`,
      x: placement.textX,
      y: placement.textY,
      text: placement.text,
      size: placement.fontSize,
      font: annotation.fontFamily,
      zIndex: 26,
      style: vectorStyle(annotation)
    }
  ];
}

function themeStyle(role: ScientificVisualRole): VectorStyle {
  return vectorStyle(styleFor(DEFAULT_SCIENTIFIC_THEME, role));
}

function rect(id: string, x: number, y: number, width: number, height: number, style: VectorStyle, zIndex?: number): VectorElement {
  return { id, type: "rect", name: id, x, y, width, height, zIndex, style };
}

function rectFromBox(id: string, box: LabelBox, style: VectorStyle, zIndex?: number): VectorElement {
  return rect(id, box.x, box.y, box.width, box.height, style, zIndex);
}

function ellipseFromBox(id: string, box: LabelBox, style: VectorStyle, zIndex?: number): VectorElement {
  return { id, type: "ellipse", name: id, x: box.x, y: box.y, width: box.width, height: box.height, zIndex, style };
}

function text(id: string, x: number, y: number, value: string, token: ScientificStyleToken, zIndex?: number): VectorElement {
  return textAt(id, x, y, value, token, zIndex);
}

function textAt(id: string, x: number, y: number, value: string, token: ScientificStyleToken, zIndex?: number): VectorElement {
  return { id, type: "text", name: id, x, y, text: value, size: token.fontSize, font: token.fontFamily, zIndex, style: vectorStyle(token) };
}
