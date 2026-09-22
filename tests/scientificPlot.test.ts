import assert from "node:assert/strict";
import test from "node:test";
import { compileScientificPlot } from "../src/core/scientificPlot.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";

const mixedPlot = {
  schemaVersion: 1,
  document: { title: "Catalyst response", subtitle: "Mean and uncertainty", width: 1000, height: 680 },
  xAxis: { label: "Temperature (°C)", tickCount: 6, grid: false },
  yAxis: { label: "Response (%)", tickCount: 6, grid: true },
  series: [
    {
      id: "model", label: "Model", mark: "line", color: "#2563EB", showPoints: true,
      data: [{ x: 20, y: 18 }, { x: 40, y: 35 }, { x: 60, y: 61 }, { x: 80, y: 74 }]
    },
    {
      id: "measured", label: "Measured", mark: "scatter", color: "#DC2626", fillColor: "#FEE2E2",
      data: [{ x: 20, y: 20, yError: 3 }, { x: 40, y: 33, yError: 4 }, { x: 60, y: 64, yError: 5 }, { x: 80, y: 72, yError: 3 }]
    },
    {
      id: "baseline", label: "Baseline", mark: "bar", color: "#059669", fillColor: "#A7F3D0", opacity: 70,
      data: [{ x: 20, y: 10 }, { x: 40, y: 12 }, { x: 60, y: 15 }, { x: 80, y: 0 }]
    }
  ]
};

test("compiles numerical domains into axes, marks, uncertainty, legend, and semantics", () => {
  const result = compileScientificPlot(mixedPlot);
  assert.equal(result.engine, "software-scientific-plot.v1");
  assert.equal(result.scales.y.domain[0], 0, "bar series forces a zero baseline");
  assert.ok(result.scales.y.domain[1] >= 75, "uncertainty extent is included");
  assert.equal(result.seriesSummaries.length, 3);
  assert.equal(result.seriesSummaries.find((series) => series.id === "measured")?.errorBarCount, 4);
  assert.equal(result.scene.groups?.[0]?.clip?.type, "rect");
  assert.equal(result.scene.semantics?.objects.length, 4);
  assert.equal(result.scene.elements.find((element) => element.id === "baseline.bar.3")?.type, "line", "zero-height bars remain explicit visible marks");
});

test("pads inferred line and scatter domains so endpoint marks are not clipped", () => {
  const result = compileScientificPlot({
    schemaVersion: 1,
    document: { title: "Endpoint-safe plot" },
    xAxis: { label: "x" },
    yAxis: { label: "y" },
    series: [{ id: "series", label: "Series", mark: "scatter", data: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }]
  });
  assert.ok(result.scales.x.domain[0] < 1);
  assert.ok(result.scales.x.domain[1] > 3);
  assert.ok(result.scales.y.domain[0] < 2);
  assert.ok(result.scales.y.domain[1] > 4);
});

test("renders editable axes, clipped marks, error bars, and semantic series identity", () => {
  const result = compileScientificPlot(mixedPlot);
  const svg = renderSceneToSvg(result.scene);
  assert.match(svg, /<clipPath id="clip-plot-marks[^\"]*"/);
  assert.match(svg, /id="model\.line"[^>]*data-scientific-objects="series-model"/);
  assert.match(svg, /id="measured\.y-error\.0\.stem"/);
  assert.match(svg, /id="baseline\.bar\.0"/);
  assert.match(svg, /id="legend\.measured\.label"/);
});

test("preserves source order for line trajectories and groups multiple bar series", () => {
  const result = compileScientificPlot({
    schemaVersion: 1,
    document: { title: "Order and grouping", width: 900, height: 600 },
    xAxis: { label: "x", domain: [0, 3] },
    yAxis: { label: "y", domain: [0, 10] },
    series: [
      { id: "trajectory", label: "Trajectory", mark: "line", data: [{ x: 2, y: 2 }, { x: 0, y: 4 }, { x: 1, y: 6 }] },
      { id: "a", label: "A", mark: "bar", data: [{ x: 1, y: 3 }] },
      { id: "b", label: "B", mark: "bar", data: [{ x: 1, y: 5 }] }
    ]
  });
  const line = result.scene.elements.find((element) => element.id === "trajectory.line");
  assert.equal(line?.type, "path");
  if (line?.type !== "path") throw new Error("expected line path");
  assert.ok(line.points[0]!.x > line.points[1]!.x && line.points[2]!.x > line.points[1]!.x, "input order is retained instead of sorting x");
  const a = result.scene.elements.find((element) => element.id === "a.bar.0");
  const b = result.scene.elements.find((element) => element.id === "b.bar.0");
  assert.equal(a?.type, "rect"); assert.equal(b?.type, "rect");
  if (a?.type !== "rect" || b?.type !== "rect") throw new Error("expected grouped bars");
  assert.notEqual(a.x, b.x);
  assert.equal(a.width, b.width);
});

test("fails closed on malformed, clipped, ambiguous, and excessive plot data", () => {
  assert.throws(() => compileScientificPlot({ ...mixedPlot, schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => compileScientificPlot({ ...mixedPlot, series: [mixedPlot.series[0], mixedPlot.series[0]] }), /series id must be unique/);
  assert.throws(() => compileScientificPlot({ ...mixedPlot, series: [{ id: "short", label: "Short", mark: "line", data: [{ x: 1, y: 2 }] }] }), /invalid point count/);
  assert.throws(() => compileScientificPlot({ ...mixedPlot, xAxis: { label: "x", domain: [30, 70] } }), /would clip data/);
  assert.throws(() => compileScientificPlot({ ...mixedPlot, yAxis: { label: "y", domain: [1, 100] } }), /containing zero/);
  assert.throws(() => compileScientificPlot({ ...mixedPlot, series: [{ id: "bad", label: "Bad", mark: "scatter", color: "red", data: [{ x: 1, y: 2 }] }] }), /#RRGGBB/);
  assert.throws(() => compileScientificPlot({ ...mixedPlot, series: [{ id: "bad", label: "Bad", mark: "scatter", data: [{ x: 1, y: 2, yError: -1 }] }] }), /between 0/);
  assert.throws(() => compileScientificPlot({
    ...mixedPlot,
    series: [{
      id: "dense", label: "Dense uncertainty", mark: "scatter",
      data: Array.from({ length: 200 }, (_, index) => ({ x: index, y: index, xError: 0.1, yError: 0.1 }))
    }]
  }), /would create .* vector elements; the scene limit is 1000/);
});
