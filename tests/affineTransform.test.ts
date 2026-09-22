import test from "node:test";
import assert from "node:assert/strict";
import { composeTransforms, rotation, scaling, transformGeometryElement, transformPoint, translation } from "../src/core/affineTransform.js";
import { composeTransformBasicsScene } from "../src/scientific/transformBasics.js";

test("composes scale, rotation, and translation in declared order", () => {
  const transform = composeTransforms(scaling(2), rotation(90), translation(10, 20));
  const point = transformPoint({ x: 3, y: 4 }, transform);
  assert.ok(Math.abs(point.x - 2) < 1e-9);
  assert.ok(Math.abs(point.y - 26) < 1e-9);
});

test("flattens rectangles and ellipses into rotation-safe geometry", () => {
  const rectangle = transformGeometryElement(
    { type: "rect", x: 0, y: 0, width: 20, height: 10, style: { fill: null } },
    composeTransforms(rotation(90), translation(100, 50))
  );
  assert.equal(rectangle.type, "polygon");
  if (rectangle.type !== "polygon") throw new Error("expected polygon");
  assert.deepEqual(rectangle.points.map((point) => [Math.round(point.x), Math.round(point.y)]), [
    [100, 50],
    [100, 70],
    [90, 70],
    [90, 50]
  ]);

  const ellipse = transformGeometryElement({ type: "ellipse", x: -20, y: -10, width: 40, height: 20 }, rotation(30));
  assert.equal(ellipse.type, "path");
  if (ellipse.type !== "path") throw new Error("expected path");
  assert.equal(ellipse.closed, true);
  assert.equal(ellipse.points.length, 4);
  assert.ok(ellipse.points.every((point) => point.leftX !== undefined && point.rightX !== undefined));
});

test("builds a semantic transform lesson from one reusable local triangle", () => {
  const scene = composeTransformBasicsScene();
  assert.equal(scene.semantics?.objects.length, 4);
  assert.equal(scene.semantics?.objects[3]?.properties?.fillMode, "filled");
  assert.ok(scene.elements.some((element) => element.id === "triangle-rotated.shape" && element.type === "path"));
  assert.equal(scene.document?.width, 1100);
});
