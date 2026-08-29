import assert from "node:assert/strict";
import test from "node:test";
import { placePathMarkers } from "../src/core/pathMarkers.js";

const horizontalLine = {
  id: "signal",
  type: "line" as const,
  x: 0,
  y: 0,
  x2: 100,
  y2: 0,
  style: { fill: null, stroke: "#2563EB", strokeWidth: 3 }
};

test("places an exact end arrowhead on a straight line", () => {
  const result = placePathMarkers({
    source: horizontalLine,
    markers: [{ at: "end", kind: "arrowhead", size: 20, idPrefix: "signal.arrow" }]
  });

  assert.equal(result.engine, "software-path-markers.v1");
  assert.equal(result.placedMarkerCount, 1);
  assert.deepEqual(result.placements[0], {
    id: "signal.arrow",
    at: "end",
    kind: "arrowhead",
    sourcePointIndex: 1,
    anchor: { x: 100, y: 0 },
    tangent: { x: 1, y: 0 },
    angleDegrees: 0,
    reverse: false,
    elementId: "signal.arrow"
  });
  assert.deepEqual(result.elements[0]?.type === "polygon" ? result.elements[0].points : undefined, [
    { x: 100, y: 0 },
    { x: 80, y: 11 },
    { x: 80, y: -11 }
  ]);
});

test("normalizes diagonal and cubic endpoint tangents", () => {
  const diagonal = placePathMarkers({
    source: { ...horizontalLine, x2: 30, y2: 40 },
    markers: [{ at: "end", kind: "circle", size: 12, idPrefix: "diagonal.end" }]
  });
  assert.deepEqual(diagonal.placements[0]?.tangent, { x: 0.6, y: 0.8 });
  assert.equal(diagonal.placements[0]?.angleDegrees, 53.130102354);

  const cubic = placePathMarkers({
    source: {
      id: "curve",
      type: "path",
      x: 0,
      y: 0,
      closed: false,
      points: [
        { x: 0, y: 0, rightX: 0, rightY: 50 },
        { x: 100, y: 100, leftX: 50, leftY: 100 }
      ],
      style: { fill: null, stroke: "#0F766E", strokeWidth: 2 }
    },
    markers: [
      { at: "start", kind: "circle", size: 10, idPrefix: "curve.start" },
      { at: "end", kind: "arrowhead", size: 14, idPrefix: "curve.end" }
    ]
  });
  assert.deepEqual(cubic.placements.map((placement) => placement.tangent), [{ x: 0, y: 1 }, { x: 1, y: 0 }]);
});

test("orients mid markers along the vertex-angle bisector", () => {
  const result = placePathMarkers({
    source: {
      id: "corner",
      type: "path",
      x: 0,
      y: 0,
      closed: false,
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
      style: { fill: null, stroke: "#7C3AED" }
    },
    markers: [{ at: "mid", kind: "diamond", size: 16, idPrefix: "corner.mid" }]
  });

  assert.equal(result.placements[0]?.id, "corner.mid.1");
  assert.deepEqual(result.placements[0]?.tangent, { x: 0.707106781, y: 0.707106781 });
  assert.equal(result.placements[0]?.angleDegrees, 45);
});

test("constructs reverse, bar, circle, and diamond marker geometry", () => {
  const result = placePathMarkers({
    source: horizontalLine,
    markers: [
      { at: "start", kind: "arrowhead", size: 10, reverse: true, idPrefix: "reverse" },
      { at: "end", kind: "bar", size: 20, thickness: 4, idPrefix: "bar" },
      { at: "start", kind: "circle", size: 12, idPrefix: "circle" },
      { at: "end", kind: "diamond", size: 20, idPrefix: "diamond" }
    ]
  });

  assert.equal(result.placements[0]?.angleDegrees, 180);
  assert.deepEqual(result.elements[1]?.type === "polygon" ? result.elements[1].points : undefined, [
    { x: 102, y: 10 }, { x: 102, y: -10 }, { x: 98, y: -10 }, { x: 98, y: 10 }
  ]);
  assert.deepEqual(result.elements[2]?.type === "ellipse" ? { x: result.elements[2].x, y: result.elements[2].y, width: result.elements[2].width, height: result.elements[2].height } : undefined, { x: -6, y: -6, width: 12, height: 12 });
  assert.equal(result.elements[3]?.type, "polygon");
});

test("fails closed on ambiguous and invalid marker requests", () => {
  assert.throws(() => placePathMarkers({ source: horizontalLine, markers: [{ at: "mid", kind: "circle", size: 10, idPrefix: "bad.mid" }] }), /without interior vertices/);
  assert.throws(() => placePathMarkers({
    source: { type: "path", x: 0, y: 0, closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }] },
    markers: [{ at: "mid", kind: "diamond", size: 10, idPrefix: "reversal" }]
  }), /180-degree reversal/);
  assert.throws(() => placePathMarkers({ source: horizontalLine, markers: [{ at: "end", kind: "triangle", size: 10, idPrefix: "bad.kind" }] }), /unsupported/);
  assert.throws(() => placePathMarkers({ source: horizontalLine, markers: [{ at: "end", kind: "circle", size: 0, idPrefix: "bad.size" }] }), /between 1 and 1000/);
  assert.throws(() => placePathMarkers({
    source: horizontalLine,
    markers: [
      { at: "end", kind: "circle", size: 10, idPrefix: "duplicate" },
      { at: "end", kind: "diamond", size: 10, idPrefix: "duplicate" }
    ]
  }), /element ids must be unique/);
});
