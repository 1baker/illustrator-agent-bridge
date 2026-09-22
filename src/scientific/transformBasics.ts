import { composeTransforms, rotation, scaling, transformGeometryElement, translation, type AffineTransform } from "../core/affineTransform.js";
import { normalizeScene } from "../core/sceneValidation.js";
import type { PathElement, VectorElement, VectorScene } from "../core/vectorScene.js";

interface Instance {
  id: string;
  label: string;
  transform: AffineTransform;
  fill: string | null;
  description: string;
}

const LOCAL_TRIANGLE: PathElement = {
  type: "path",
  x: 0,
  y: 0,
  closed: true,
  points: [
    { x: -60, y: 50 },
    { x: 0, y: -50 },
    { x: 60, y: 50 }
  ],
  style: { fill: null, stroke: "#0F766E", strokeWidth: 6 }
};

export function composeTransformBasicsScene(): VectorScene {
  const instances: Instance[] = [
    {
      id: "triangle-local",
      label: "1. Local shape",
      description: "same three local points",
      transform: translation(120, 290),
      fill: null
    },
    {
      id: "triangle-translated",
      label: "2. Translate",
      description: "move without changing shape",
      transform: translation(380, 290),
      fill: null
    },
    {
      id: "triangle-rotated",
      label: "3. Rotate + translate",
      description: "compose two matrix operations",
      transform: composeTransforms(rotation(28), translation(650, 290)),
      fill: "#CCFBF1"
    },
    {
      id: "triangle-scaled",
      label: "4. Scale + rotate + translate",
      description: "geometry changes; stroke stays style",
      transform: composeTransforms(scaling(1.35, 0.8), rotation(-18), translation(930, 290)),
      fill: "#99F6E4"
    }
  ];

  const elements: VectorElement[] = [
    rect("background", 0, 0, 1100, 540, "#F8FAFC"),
    text("title", 45, 32, "One local shape, many world-space instances", 29, "#0F172A"),
    text("subtitle", 45, 77, "Software stores the triangle once, then applies affine matrices.", 18, "#475569"),
    ...instances.flatMap((instance, index) => instanceElements(instance, index))
  ];

  return normalizeScene({
    document: { title: "Coordinate transforms: local geometry to world geometry", width: 1100, height: 540, colorMode: "RGB" },
    elements,
    semantics: {
      objects: instances.map((instance) => ({
        id: instance.id,
        kind: "transformed_shape",
        label: instance.label,
        elementIds: [`${instance.id}.shape`, `${instance.id}.origin`],
        properties: {
          matrixA: rounded(instance.transform.a),
          matrixB: rounded(instance.transform.b),
          matrixC: rounded(instance.transform.c),
          matrixD: rounded(instance.transform.d),
          matrixE: rounded(instance.transform.e),
          matrixF: rounded(instance.transform.f),
          fillMode: instance.fill === null ? "empty" : "filled"
        }
      }))
    }
  });
}

function instanceElements(instance: Instance, index: number): VectorElement[] {
  const shape = transformGeometryElement(
    { ...LOCAL_TRIANGLE, id: `${instance.id}.shape`, name: `${instance.label} triangle`, style: { ...LOCAL_TRIANGLE.style, fill: instance.fill } },
    instance.transform
  );
  const origin = { x: instance.transform.e, y: instance.transform.f };
  const labelX = 45 + index * 270;
  return [
    text(`${instance.id}.label`, labelX, 140, instance.label, 19, "#334155"),
    text(`${instance.id}.description`, labelX, 174, instance.description, 14, "#64748B"),
    line(`${instance.id}.axis-x`, origin.x - 82, origin.y, origin.x + 82, origin.y, "#CBD5E1", 2),
    line(`${instance.id}.axis-y`, origin.x, origin.y - 82, origin.x, origin.y + 82, "#CBD5E1", 2),
    shape,
    ellipse(`${instance.id}.origin`, origin.x - 5, origin.y - 5, 10, 10, "#F43F5E", null, 0),
    text(`${instance.id}.matrix`, labelX, 420, matrixLabel(instance.transform), 14, "#475569")
  ];
}

function matrixLabel(matrix: AffineTransform): string {
  return `matrix(${rounded(matrix.a)}, ${rounded(matrix.b)}, ${rounded(matrix.c)}, ${rounded(matrix.d)}, ${rounded(matrix.e)}, ${rounded(matrix.f)})`;
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function rect(id: string, x: number, y: number, width: number, height: number, fill: string): VectorElement {
  return { id, type: "rect", name: id, x, y, width, height, style: { fill, stroke: null } };
}

function ellipse(id: string, x: number, y: number, width: number, height: number, fill: string, stroke: string | null, strokeWidth: number): VectorElement {
  return { id, type: "ellipse", name: id, x, y, width, height, style: { fill, stroke, strokeWidth } };
}

function line(id: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number): VectorElement {
  return { id, type: "line", name: id, x, y, x2, y2, style: { fill: null, stroke, strokeWidth } };
}

function text(id: string, x: number, y: number, value: string, size: number, fill: string): VectorElement {
  return { id, type: "text", name: id, x, y, text: value, size, style: { fill, stroke: null } };
}
