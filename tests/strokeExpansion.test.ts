import assert from "node:assert/strict";
import test from "node:test";
import { expandStroke } from "../src/core/strokeExpansion.js";
import { normalizeScene } from "../src/core/sceneValidation.js";

const line = (lineCap: "butt" | "round" | "square", extraStyle: Record<string, unknown> = {}) => ({
  tolerance: 0.01,
  source: {
    type: "line",
    x: 0,
    y: 0,
    x2: 100,
    y2: 0,
    style: { stroke: "#2563EB", strokeWidth: 20, lineCap, ...extraStyle }
  }
});

test("expands butt, square, and round caps into measured filled regions", () => {
  const butt = expandStroke(line("butt"));
  const square = expandStroke(line("square"));
  const round = expandStroke(line("round"));

  assert.equal(butt.area, 2000);
  assert.equal(square.area, 2400);
  assert.ok(Math.abs(round.area - (2000 + Math.PI * 100)) < 0.5);
  assert.deepEqual(butt.bounds, { x: 0, y: -10, width: 100, height: 20 });
  assert.deepEqual(square.bounds, { x: -10, y: -10, width: 120, height: 20 });
  assert.ok(round.bounds && Math.abs(round.bounds.width - 120) < 0.001);
  assert.ok([butt, square, round].every((result) => result.element.style?.stroke === null));
  assert.ok([butt, square, round].every((result) => result.element.style?.fill === "#2563EB"));
});

test("distinguishes bevel, round, miter, and miter-limit fallback joins", () => {
  const request = (lineJoin: "bevel" | "round" | "miter", miterLimit = 4) => ({
    tolerance: 0.01,
    source: {
      type: "path",
      x: 0,
      y: 0,
      closed: false,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      style: { stroke: "#0F766E", strokeWidth: 20, lineCap: "butt", lineJoin, miterLimit }
    }
  });
  const bevel = expandStroke(request("bevel"));
  const round = expandStroke(request("round"));
  const miter = expandStroke(request("miter"));
  const fallback = expandStroke(request("miter", 1));

  assert.equal(bevel.area, 3950);
  assert.ok(round.area > bevel.area && round.area < miter.area);
  assert.equal(miter.area, 4000);
  assert.equal(fallback.area, bevel.area);
  assert.equal(fallback.miterFallbackCount, 1);
  assert.equal(miter.joinCount, 1);
});

test("creates a true compound ring when expanding a closed centerline", () => {
  const result = expandStroke({
    tolerance: 0.01,
    source: {
      type: "path",
      x: 0,
      y: 0,
      closed: true,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      style: { stroke: "#7C3AED", strokeWidth: 20, lineJoin: "miter", miterLimit: 4 }
    }
  });
  assert.equal(result.area, 8000);
  assert.equal(result.ringCount, 2);
  assert.equal(result.element.subpaths.length, 2);
  assert.deepEqual(result.bounds, { x: -10, y: -10, width: 120, height: 120 });
  assert.doesNotThrow(() => normalizeScene({ document: { width: 140, height: 140 }, elements: [result.element] }));
});

test("splits dash patterns into independently capped painted geometry", () => {
  const butt = expandStroke(line("butt", { strokeWidth: 10, dashArray: [20, 10] }));
  const offset = expandStroke(line("butt", { strokeWidth: 10, dashArray: [20, 10], dashOffset: 20 }));
  const round = expandStroke(line("round", { strokeWidth: 10, dashArray: [20, 10] }));

  assert.equal(butt.paintedSubpathCount, 4);
  assert.equal(butt.area, 700);
  assert.equal(butt.capCount, 8);
  assert.equal(offset.paintedSubpathCount, 3);
  assert.equal(offset.area, 600);
  assert.ok(round.area > butt.area);
});

test("repeats odd dash lists and preserves a fully painted closed seam as a ring", () => {
  const odd = expandStroke(line("butt", { strokeWidth: 10, dashArray: [10, 5, 2] }));
  assert.deepEqual(odd.dashArray, [10, 5, 2, 10, 5, 2]);
  const closed = expandStroke({
    tolerance: 0.1,
    source: {
      type: "path",
      x: 0,
      y: 0,
      closed: true,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      style: { stroke: "#000000", strokeWidth: 10, lineJoin: "miter", dashArray: [500, 10] }
    }
  });
  assert.equal(closed.paintedSubpathCount, 1);
  assert.equal(closed.capCount, 0);
  assert.equal(closed.ringCount, 2);
});

test("flattens curved centerlines before expanding their stroke", () => {
  const result = expandStroke({
    tolerance: 0.5,
    source: {
      type: "path",
      x: 0,
      y: 0,
      closed: false,
      points: [
        { x: 0, y: 0, rightX: 0, rightY: 100 },
        { x: 100, y: 0, leftX: 100, leftY: 100 }
      ],
      style: { stroke: "#DC2626", strokeWidth: 12, lineCap: "round", lineJoin: "round" }
    }
  });
  assert.equal(result.curveFlattening?.curvedSegmentCount, 1);
  assert.ok((result.curveFlattening?.outputPointCount ?? 0) > 2);
  assert.ok(result.area > 1800);
  assert.equal(result.engine, "software-stroke-expansion.v1+polygon-clipping-0.15.7");
});

test("rejects invisible, degenerate, ambiguous, and excessive stroke geometry", () => {
  assert.throws(() => expandStroke(line("butt", { stroke: null })), /cannot be null/);
  assert.throws(() => expandStroke(line("butt", { strokeWidth: 0 })), /greater than zero/);
  assert.throws(
    () => expandStroke({ tolerance: 1, source: { type: "path", x: 0, y: 0, closed: false, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 0 }], style: { strokeWidth: 10 } } }),
    /180-degree reversal/
  );
  assert.throws(() => expandStroke({ ...line("round"), tolerance: 0.000001 }), /too small/);
});
