import assert from "node:assert/strict";
import test from "node:test";
import { renderScientificPlotToPgfplots } from "../src/render/pgfplotsRenderer.js";
import { escapeLatexText, renderSceneToTikz } from "../src/render/tikzRenderer.js";

test("renders flat vector geometry, curves, groups, clips, and escaped labels as standalone TikZ", () => {
  const result = renderSceneToTikz({
    document: { title: "TikZ scene", width: 320, height: 220 },
    groups: [{ id: "clipped", opacity: 80, clip: { type: "rect", x: 10, y: 10, width: 280, height: 180 } }],
    elements: [
      { id: "background", type: "rect", x: 0, y: 0, width: 320, height: 220, style: { fill: "#FFFFFF", stroke: null } },
      { id: "curve", type: "path", x: 0, y: 0, groupId: "clipped", closed: false, points: [
        { x: 20, y: 160, rightX: 70, rightY: 40 },
        { x: 180, y: 80, leftX: 120, leftY: 20 }
      ], style: { fill: null, stroke: "#2563EB", strokeWidth: 3, lineCap: "round" } },
      { id: "label", type: "text", x: 22, y: 22, text: "Yield_50% ± 2°", size: 16, style: { fill: "#0F172A" } }
    ],
    semantics: { objects: [{ id: "curve-object", kind: "response_curve", elementIds: ["curve"] }] }
  });

  assert.equal(result.renderer, "tikz-scene.v1");
  assert.match(result.latex, /\\documentclass\[tikz,border=0pt\]\{standalone\}/);
  assert.match(result.latex, /\\begin\{tikzpicture\}\[x=1pt,y=-1pt\]/);
  assert.match(result.latex, /\\clip \(10,10\) rectangle \(290,190\);/);
  assert.match(result.latex, /\.\. controls \(70,40\) and \(120,20\) \.\. \(180,80\)/);
  assert.match(result.latex, /Yield\\_50\\% \\ensuremath\{\\pm\} 2\\ensuremath\{\{\}\^\{\\circ\}\}/);
  assert.match(result.latex, /Scientific semantics/);
  assert.ok(result.latex.includes("\\begin{scope}[transparency group, opacity=0.8]"));
});

test("renders bounded mutable vector gradient paints as editable TikZ shading", () => {
  const result = renderSceneToTikz({
    paints: [{ id: "gradient", type: "linear_gradient", x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 100, color: "#FFFFFF" }] }],
    elements: [{ type: "rect", x: 0, y: 0, width: 100, height: 100, style: { fillPaint: "gradient" } }]
  });
  assert.equal(result.renderer, "tikz-scene.v2");
  assert.match(result.latex, /\\pgfdeclarehorizontalshading\{bridgepaint1\}/);
  assert.match(result.latex, /shade, shading=bridgepaint1/);
});

test("fails closed for unsupported gradient transforms and gradient strokes", () => {
  assert.throws(() => renderSceneToTikz({
    paints: [{ id: "gradient", type: "linear_gradient", x1: 0, y1: 0, x2: 1, y2: 0, transform: [1, 0, 0, 1, 1, 0], stops: [{ offset: 0, color: "#000000" }, { offset: 100, color: "#FFFFFF" }] }],
    elements: [{ type: "rect", x: 0, y: 0, width: 100, height: 100, style: { fillPaint: "gradient" } }]
  }), /transforms are not supported/);
  assert.throws(() => renderSceneToTikz({
    paints: [{ id: "gradient", type: "linear_gradient", x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 100, color: "#FFFFFF" }] }],
    elements: [{ type: "line", x: 0, y: 0, x2: 100, y2: 100, style: { strokePaint: "gradient" } }]
  }), /expand the stroke/);
});

test("escapes TeX control characters in untrusted scientific labels", () => {
  assert.equal(escapeLatexText("A_B%{x}#&$"), "A\\_B\\%\\{x\\}\\#\\&\\$");
});

test("matches the scene renderer default white fill and dark stroke", () => {
  const result = renderSceneToTikz({ elements: [{ type: "rect", x: 0, y: 0, width: 20, height: 10 }] });
  assert.match(result.latex, /fill=bridgecolor\d+, draw=bridgecolor\d+, line width=2pt/);
  assert.match(result.latex, /\{HTML\}\{FFFFFF\}/);
  assert.match(result.latex, /\{HTML\}\{111111\}/);
});

test("preserves compound holes and explicit opacity levels in TikZ", () => {
  const result = renderSceneToTikz({
    elements: [
      {
        id: "ring",
        type: "compound_path",
        x: 0,
        y: 0,
        fillRule: "evenodd",
        subpaths: [
          { points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }], closed: true },
          { points: [{ x: 35, y: 35 }, { x: 65, y: 35 }, { x: 65, y: 65 }, { x: 35, y: 65 }], closed: true }
        ],
        style: { fill: "#2563EB", stroke: "#0F172A", opacity: 50 }
      }
    ]
  });
  assert.match(result.latex, /\\path\[even odd rule, fill=bridgecolor\d+, draw=bridgecolor\d+, line width=2pt, miter limit=4, opacity=0\.5\]/);
  assert.equal((result.latex.match(/-- cycle/g) ?? []).length, 2);
});

test("renders deterministic line, scatter, grouped bar, legend, ticks, and explicit errors with PGFPlots", () => {
  const result = renderScientificPlotToPgfplots({
    schemaVersion: 1,
    document: { title: "Dose_response", subtitle: "mean ± uncertainty", width: 900, height: 620 },
    xAxis: { label: "Dose (%)", grid: false },
    yAxis: { label: "Response", grid: true },
    series: [
      { id: "trend", label: "Trend_1", mark: "line", showPoints: true, data: [{ x: 0, y: 1 }, { x: 1, y: 2, yError: 0.2 }] },
      { id: "observed", label: "Observed", mark: "scatter", data: [{ x: 0.25, y: 1.2, xError: 0.05 }, { x: 0.75, y: 1.8 }] },
      { id: "bars", label: "Bars", mark: "bar", data: [{ x: 0.25, y: 0.8 }, { x: 0.75, y: 1.1 }] }
    ]
  });

  assert.equal(result.compat, "1.18");
  assert.match(result.latex, /\\pgfplotsset\{compat=1\.18\}/);
  assert.match(result.latex, /title=\{\\shortstack\{Dose\\_response/);
  assert.match(result.latex, /xmajorgrids=false/);
  assert.match(result.latex, /ymajorgrids=true/);
  assert.match(result.latex, /mark=\*/);
  assert.match(result.latex, /only marks/);
  assert.match(result.latex, /ybar/);
  assert.match(result.latex, /error bars\/\.cd/);
  assert.match(result.latex, /\(1,2\) \+- \(0,0\.2\)/);
  assert.match(result.latex, /\\addlegendentry\{Trend\\_1\}/);
  assert.equal(result.plot.seriesSummaries.length, 3);
});
