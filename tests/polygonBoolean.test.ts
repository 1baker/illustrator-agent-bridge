import assert from "node:assert/strict";
import test from "node:test";
import { constructPolygonBoolean } from "../src/core/polygonBoolean.js";
import { normalizeScene } from "../src/core/sceneValidation.js";

const rectangle = (x: number, y: number, width: number, height: number) => ({
  rings: [[
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ]]
});

const left = rectangle(0, 0, 100, 80);
const right = rectangle(50, 20, 100, 80);

test("computes union, intersection, difference, and xor with measured areas", () => {
  const expected = { union: 13000, intersection: 3000, difference: 5000, xor: 10000 } as const;
  for (const operation of ["union", "intersection", "difference", "xor"] as const) {
    const result = constructPolygonBoolean({ operation, operands: [left, right] });
    assert.equal(result.empty, false);
    assert.equal(result.area, expected[operation]);
    assert.equal(result.engine, "polygon-clipping-0.15.7");
    assert.ok(result.element);
    assert.doesNotThrow(() => normalizeScene({ document: { width: 200, height: 140 }, elements: [result.element] }));
  }
});

test("returns canonical output for commutative operand ordering", () => {
  const forward = constructPolygonBoolean({ operation: "union", operands: [left, right] });
  const reverse = constructPolygonBoolean({ operation: "union", operands: [right, left] });
  assert.deepEqual(forward.element, reverse.element);
  assert.deepEqual(forward.bounds, { x: 0, y: 0, width: 150, height: 100 });
});

test("preserves holes and reports empty topology explicitly", () => {
  const ring = {
    rings: [
      rectangle(0, 0, 100, 100).rings[0],
      rectangle(30, 30, 40, 40).rings[0]
    ]
  };
  const kept = constructPolygonBoolean({ operation: "union", operands: [ring, rectangle(120, 0, 20, 20)] });
  assert.equal(kept.polygonCount, 2);
  assert.equal(kept.ringCount, 3);
  assert.equal(kept.area, 8800);
  const empty = constructPolygonBoolean({ operation: "xor", operands: [left, left] });
  assert.equal(empty.empty, true);
  assert.equal(empty.element, undefined);
  assert.equal(empty.area, 0);
});

test("rejects malformed operations, degenerate rings, excessive coordinates, and unsupported style", () => {
  assert.throws(() => constructPolygonBoolean({ operation: "merge", operands: [left, right] }), /operation/);
  assert.throws(() => constructPolygonBoolean({ operation: "union", operands: [left] }), /2 to 16/);
  assert.throws(() => constructPolygonBoolean({ operation: "union", operands: [{ rings: [[{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]] }, right] }), /non-zero area/);
  assert.throws(() => constructPolygonBoolean({ operation: "union", operands: [{ rings: [[{ x: 2_000_000, y: 0 }, { x: 2_000_001, y: 0 }, { x: 2_000_001, y: 1 }]] }, right] }), /within/);
  assert.throws(() => constructPolygonBoolean({ operation: "union", operands: [left, right], output: { style: { fill: "teal" } } }), /#RRGGBB/);
});
