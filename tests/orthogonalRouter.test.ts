import test from "node:test";
import assert from "node:assert/strict";
import { pathIntersectsBoxInterior, routeOrthogonal, RouteError } from "../src/core/orthogonalRouter.js";

test("routes between ports around an inflated obstacle", () => {
  const obstacle = { id: "block", x: 120, y: 20, width: 80, height: 100 };
  const route = routeOrthogonal({
    source: { box: { id: "source", x: 20, y: 50, width: 50, height: 40 }, port: "right" },
    target: { box: { id: "target", x: 250, y: 50, width: 50, height: 40 }, port: "left" },
    obstacles: [obstacle],
    clearance: 10,
    bendPenalty: 20
  });

  assert.deepEqual(route.points[0], { x: 70, y: 70 });
  assert.deepEqual(route.points.at(-1), { x: 250, y: 70 });
  assert.equal(pathIntersectsBoxInterior(route.points, obstacle), false);
  assert.equal(pathIntersectsBoxInterior(route.points, { id: "inflated-block", x: 110, y: 10, width: 100, height: 120 }), false);
  assert.ok(route.bends >= 2);
  assert.ok(route.points.some((point) => point.y === 10 || point.y === 130));
});

test("uses crossing penalties to detour around a previously routed relationship", () => {
  const previous = { id: "vertical", points: [{ x: 50, y: 20 }, { x: 50, y: 100 }] };
  const route = routeOrthogonal({
    source: { box: { id: "source", x: 0, y: 50, width: 10, height: 20 }, port: "right" },
    target: { box: { id: "target", x: 100, y: 50, width: 10, height: 20 }, port: "left" },
    existingRoutes: [previous],
    clearance: 10,
    bendPenalty: 5,
    crossingPenalty: 1000
  });

  assert.equal(route.crossings, 0);
  assert.ok(route.points.some((point) => point.y < 20 || point.y > 100));
});

test("rejects invalid geometry and non-orthogonal prior routes", () => {
  assert.throws(
    () =>
      routeOrthogonal({
        source: { box: { id: "same", x: 0, y: 0, width: 10, height: 10 }, port: "right" },
        target: { box: { id: "same", x: 20, y: 0, width: 10, height: 10 }, port: "left" }
      }),
    /ids must be unique/
  );
  assert.throws(
    () =>
      routeOrthogonal({
        source: { box: { id: "a", x: 0, y: 0, width: 10, height: 10 }, port: "right" },
        target: { box: { id: "b", x: 50, y: 0, width: 10, height: 10 }, port: "left" },
        existingRoutes: [{ id: "diagonal", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }]
      }),
    /must be orthogonal/
  );
  assert.throws(
    () =>
      routeOrthogonal({
        source: { box: { id: "a", x: 0, y: 0, width: 10, height: 10 }, port: "right" },
        target: { box: { id: "b", x: 100, y: 0, width: 10, height: 10 }, port: "left" },
        obstacles: [{ id: "trap", x: 70, y: -50, width: 60, height: 110 }],
        clearance: 10
      }),
    /trapped inside obstacle clearance geometry/
  );
  assert.ok(RouteError.prototype instanceof Error);
});

test("does not classify a shared relationship endpoint as a crossing", () => {
  const source = { id: "source", x: 100, y: 100, width: 50, height: 50 };
  const target = { id: "target", x: 400, y: 100, width: 50, height: 50 };
  const route = routeOrthogonal({
    source: { box: source, port: "right" },
    target: { box: target, port: "left" },
    existingRoutes: [{ id: "arriving", points: [{ x: 40, y: 125 }, { x: 150, y: 125 }] }],
    clearance: 20
  });
  assert.equal(route.crossings, 0);
});
