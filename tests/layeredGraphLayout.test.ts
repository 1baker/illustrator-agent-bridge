import test from "node:test";
import assert from "node:assert/strict";
import { GraphLayoutError, layoutLayeredGraph } from "../src/core/layeredGraphLayout.js";

test("places a branching directed graph in deterministic left-to-right ranks", () => {
  const layout = layoutLayeredGraph(
    [
      { id: "signal", width: 80, height: 60 },
      { id: "branch-a", width: 100, height: 70 },
      { id: "branch-b", width: 120, height: 80 },
      { id: "response", width: 110, height: 70 }
    ],
    [
      { id: "signal-a", sourceId: "signal", targetId: "branch-a" },
      { id: "signal-b", sourceId: "signal", targetId: "branch-b" },
      { id: "a-response", sourceId: "branch-a", targetId: "response" },
      { id: "b-response", sourceId: "branch-b", targetId: "response" }
    ],
    { x: 40, y: 120, width: 920, height: 440 },
    { rankGap: 120, nodeGap: 50 }
  );
  const byId = new Map(layout.map((node) => [node.id, node]));
  assert.equal(byId.get("signal")?.rank, 0);
  assert.equal(byId.get("branch-a")?.rank, 1);
  assert.equal(byId.get("branch-b")?.rank, 1);
  assert.equal(byId.get("response")?.rank, 2);
  assert.ok(byId.get("signal")!.x < byId.get("branch-a")!.x);
  assert.ok(byId.get("branch-a")!.x < byId.get("response")!.x);
  assert.ok(byId.get("branch-a")!.y < byId.get("branch-b")!.y);
});

test("condenses feedback cycles into one rank instead of rejecting biological loops", () => {
  const layout = layoutLayeredGraph(
    [
      { id: "input", width: 80, height: 60 },
      { id: "kinase-a", width: 100, height: 70 },
      { id: "kinase-b", width: 100, height: 70 },
      { id: "output", width: 80, height: 60 }
    ],
    [
      { id: "in-a", sourceId: "input", targetId: "kinase-a" },
      { id: "a-b", sourceId: "kinase-a", targetId: "kinase-b" },
      { id: "b-a", sourceId: "kinase-b", targetId: "kinase-a" },
      { id: "b-out", sourceId: "kinase-b", targetId: "output" }
    ],
    { x: 0, y: 100, width: 900, height: 420 }
  );
  const byId = new Map(layout.map((node) => [node.id, node]));
  assert.equal(byId.get("kinase-a")?.rank, byId.get("kinase-b")?.rank);
  assert.equal(byId.get("kinase-a")?.component, byId.get("kinase-b")?.component);
  assert.ok(byId.get("input")!.rank < byId.get("kinase-a")!.rank);
  assert.ok(byId.get("kinase-b")!.rank < byId.get("output")!.rank);
});

test("supports top-to-bottom layout and fails when the canvas cannot fit", () => {
  const vertical = layoutLayeredGraph(
    [{ id: "a", width: 100, height: 60 }, { id: "b", width: 100, height: 60 }],
    [{ id: "a-b", sourceId: "a", targetId: "b" }],
    { x: 20, y: 100, width: 400, height: 500 },
    { direction: "top_to_bottom", rankGap: 80 }
  );
  assert.ok(vertical[0]!.y < vertical[1]!.y);
  assert.throws(
    () => layoutLayeredGraph([{ id: "too-wide", width: 500, height: 80 }], [], { x: 0, y: 0, width: 300, height: 300 }),
    /only 300 are available/
  );
  assert.ok(GraphLayoutError.prototype instanceof Error);
});
