import assert from "node:assert/strict";
import test from "node:test";
import { flattenBezierPath } from "../src/core/bezierFlattening.js";
import { constructPolygonBoolean } from "../src/core/polygonBoolean.js";
import { normalizeScene } from "../src/core/sceneValidation.js";

const arch = {
  type: "path" as const,
  x: 0,
  y: 0,
  closed: false,
  points: [
    { x: 0, y: 0, rightX: 0, rightY: 100 },
    { x: 100, y: 0, leftX: 100, leftY: 100 }
  ]
};

test("adaptively flattens cubic Bezier curves to the declared tolerance", () => {
  const coarse = flattenBezierPath({ path: arch, tolerance: 10 });
  const fine = flattenBezierPath({ path: arch, tolerance: 1 });

  assert.equal(coarse.sourceSegmentCount, 1);
  assert.equal(coarse.curvedSegmentCount, 1);
  assert.equal(coarse.lineSegmentCount, 0);
  assert.ok(fine.outputPointCount > coarse.outputPointCount);
  assert.deepEqual(fine.path.points[0], { x: 0, y: 0 });
  assert.deepEqual(fine.path.points.at(-1), { x: 100, y: 0 });
  assert.ok(fine.path.points.every((point) => point.leftX === undefined && point.rightX === undefined));
  assert.deepEqual(fine.bounds, { x: 0, y: 0, width: 100, height: 75 });
});

test("preserves straight segments and removes duplicate closure points", () => {
  const result = flattenBezierPath({
    tolerance: 0.1,
    path: {
      type: "path",
      x: 0,
      y: 0,
      closed: true,
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]
    }
  });
  assert.equal(result.curvedSegmentCount, 0);
  assert.equal(result.lineSegmentCount, 4);
  assert.equal(result.outputPointCount, 4);
  assert.equal(result.outputSegmentCount, 4);
});

test("subdivides collinear controls that overshoot the finite chord", () => {
  const result = flattenBezierPath({
    tolerance: 1,
    path: {
      type: "path",
      x: 0,
      y: 0,
      closed: false,
      points: [
        { x: 0, y: 0, rightX: 80, rightY: 0 },
        { x: 20, y: 0, leftX: -60, leftY: 0 }
      ]
    }
  });
  assert.ok(result.outputPointCount > 2, "finite-chord flatness must detect collinear overshoot");
  assert.ok(result.bounds.width > 20, "flattened geometry retains the curve's excursion beyond its anchors");
});

test("feeds tolerance-controlled curved regions into polygon booleans", () => {
  const k = 0.552284749831;
  const circle = {
    type: "path" as const,
    x: 0,
    y: 0,
    closed: true as const,
    points: [
      { x: 50, y: 0, leftX: 50 - 50 * k, leftY: 0, rightX: 50 + 50 * k, rightY: 0 },
      { x: 100, y: 50, leftX: 100, leftY: 50 - 50 * k, rightX: 100, rightY: 50 + 50 * k },
      { x: 50, y: 100, leftX: 50 + 50 * k, leftY: 100, rightX: 50 - 50 * k, rightY: 100 },
      { x: 0, y: 50, leftX: 0, leftY: 50 + 50 * k, rightX: 0, rightY: 50 - 50 * k }
    ]
  };
  const result = constructPolygonBoolean({
    operation: "intersection",
    curveTolerance: 0.5,
    operands: [
      { paths: [circle] },
      { rings: [[{ x: 50, y: -10 }, { x: 110, y: -10 }, { x: 110, y: 110 }, { x: 50, y: 110 }]] }
    ]
  });

  assert.equal(result.empty, false);
  assert.equal(result.curveFlattening?.pathCount, 1);
  assert.equal(result.curveFlattening?.curvedSegmentCount, 4);
  assert.equal(result.curveFlattening?.tolerance, 0.5);
  assert.ok(result.area > 3900 && result.area < 3950);
  assert.ok(result.element);
  assert.doesNotThrow(() => normalizeScene({ document: { width: 120, height: 120 }, elements: [result.element] }));
});

test("rejects ambiguous or unbounded curve-flattening requests", () => {
  assert.throws(() => flattenBezierPath({ path: arch, tolerance: 0 }), /tolerance/);
  assert.throws(
    () => flattenBezierPath({ path: { ...arch, points: [{ x: 0, y: 0, rightX: 10 }, { x: 20, y: 0 }] }, tolerance: 1 }),
    /provided together/
  );
  assert.throws(() => flattenBezierPath({ path: arch, tolerance: 0.000001, maxDepth: 1 }), /did not reach tolerance/);
  assert.throws(
    () => constructPolygonBoolean({ operation: "union", operands: [{ paths: [{ ...arch, closed: true }] }, { rings: [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 20 }]] }] }),
    /curveTolerance is required/
  );
  assert.throws(
    () => constructPolygonBoolean({ operation: "union", curveTolerance: 1, operands: [{ paths: [arch] }, { rings: [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 20 }]] }] }),
    /must be closed/
  );
});
