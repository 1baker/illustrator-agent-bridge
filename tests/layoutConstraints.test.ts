import test from "node:test";
import assert from "node:assert/strict";
import { LayoutError, solveLayout } from "../src/core/layoutConstraints.js";

test("resolves forward-referenced alignment, directional gaps, and centered containment", () => {
  const nodes = solveLayout({
    nodes: [
      { id: "third", width: 80, height: 60 },
      { id: "container", x: 20, y: 30, width: 600, height: 240 },
      { id: "first", x: 80, y: 100, width: 80, height: 60 },
      { id: "second", width: 100, height: 80 },
      { id: "centered", width: 120, height: 100 }
    ],
    constraints: [
      { id: "second-after-first", type: "gap", sourceId: "second", targetId: "first", direction: "right", gap: 70 },
      { id: "second-center-y", type: "align", sourceId: "second", targetId: "first", axis: "y", mode: "center" },
      { id: "third-after-second", type: "gap", sourceId: "third", targetId: "second", direction: "right", gap: 70 },
      { id: "third-center-y", type: "align", sourceId: "third", targetId: "second", axis: "y", mode: "center" },
      { id: "centered-inside", type: "contain", childId: "centered", containerId: "container", padding: 20 }
    ]
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  assert.deepEqual(byId.get("second"), { id: "second", width: 100, height: 80, x: 230, y: 90 });
  assert.deepEqual(byId.get("third"), { id: "third", width: 80, height: 60, x: 400, y: 100 });
  assert.deepEqual(byId.get("centered"), { id: "centered", width: 120, height: 100, x: 260, y: 100 });
});

test("rejects underconstraint, cycles, overconstraint, and containment violations", () => {
  assert.throws(() => solveLayout({ nodes: [{ id: "free", width: 10, height: 10 }], constraints: [] }), /underconstrained/);
  assert.throws(
    () =>
      solveLayout({
        nodes: [
          { id: "a", width: 10, height: 10, y: 0 },
          { id: "b", width: 10, height: 10, y: 0 }
        ],
        constraints: [
          { id: "a-after-b", type: "gap", sourceId: "a", targetId: "b", direction: "right", gap: 5 },
          { id: "b-after-a", type: "gap", sourceId: "b", targetId: "a", direction: "right", gap: 5 }
        ]
      }),
    /dependency cycle/
  );
  assert.throws(
    () =>
      solveLayout({
        nodes: [
          { id: "fixed", x: 10, y: 10, width: 10, height: 10 },
          { id: "target", x: 30, y: 10, width: 10, height: 10 }
        ],
        constraints: [{ id: "also-place-fixed", type: "align", sourceId: "fixed", targetId: "target", axis: "x", mode: "start" }]
      }),
    /overconstrained/
  );
  assert.throws(
    () =>
      solveLayout({
        nodes: [
          { id: "container", x: 0, y: 0, width: 100, height: 100 },
          { id: "child", x: 80, y: 80, width: 40, height: 40 }
        ],
        constraints: [{ id: "inside", type: "contain", childId: "child", containerId: "container", padding: 5 }]
      }),
    /violates containment/
  );
  assert.ok(LayoutError.prototype instanceof Error);
});
