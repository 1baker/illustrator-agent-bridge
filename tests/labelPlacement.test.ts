import test from "node:test";
import assert from "node:assert/strict";
import { LabelPlacementError, measureLabel, placeLabels } from "../src/core/labelPlacement.js";

test("selects the next preferred collision-free label position", () => {
  const [label] = placeLabels(
    [{ id: "cell-label", text: "cell", target: { id: "cell", x: 100, y: 100, width: 100, height: 80 }, preferredPositions: ["top", "right"] }],
    {
      bounds: { x: 0, y: 0, width: 500, height: 400 },
      obstacles: [{ id: "top-blocker", x: 100, y: 40, width: 100, height: 50 }]
    }
  );
  assert.equal(label?.position, "right");
  assert.ok(label?.leader);
  assert.equal(label?.targetId, "cell");
});

test("places labels sequentially without label-label overlap", () => {
  const labels = placeLabels(
    [
      { id: "first", text: "alpha", target: { id: "a", x: 100, y: 100, width: 60, height: 60 }, preferredPositions: ["top", "right"] },
      { id: "second", text: "beta", target: { id: "b", x: 150, y: 100, width: 60, height: 60 }, preferredPositions: ["top", "right"] }
    ],
    { bounds: { x: 0, y: 0, width: 500, height: 400 } }
  );
  assert.equal(labels[0]?.position, "top");
  assert.equal(labels[1]?.position, "right");
  assert.ok(labels[0]!.x + labels[0]!.width <= labels[1]!.x || labels[1]!.x + labels[1]!.width <= labels[0]!.x || labels[0]!.y + labels[0]!.height <= labels[1]!.y || labels[1]!.y + labels[1]!.height <= labels[0]!.y);
});

test("fails when every requested candidate collides or leaves the canvas", () => {
  assert.throws(
    () =>
      placeLabels(
        [{ id: "trapped", text: "trapped label", target: { id: "target", x: 40, y: 40, width: 20, height: 20 }, preferredPositions: ["top", "right", "bottom", "left"] }],
        {
          bounds: { x: 0, y: 0, width: 100, height: 100 },
          obstacles: [{ id: "cover", x: 0, y: 0, width: 100, height: 100 }]
        }
      ),
    /no collision-free candidate/
  );
  assert.deepEqual(measureLabel("AB", 10, 5), { width: 21.6, height: 22.5 });
  assert.ok(LabelPlacementError.prototype instanceof Error);
});
