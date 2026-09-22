import assert from "node:assert/strict";
import test from "node:test";
import { generateJsx } from "../src/bridge/jsxGenerator.js";
import { normalizeScene } from "../src/core/sceneValidation.js";
import { decodePng } from "../src/qa/pngPixels.js";
import { renderSceneToPng } from "../src/render/pngRenderer.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";

const gradientScene = {
  document: { title: "Paint test", width: 240, height: 120 },
  paints: [
    {
      id: "concentration",
      name: "Concentration ramp",
      type: "linear_gradient",
      units: "object_bounding_box",
      spread: "pad",
      x1: 0, y1: 0, x2: 1, y2: 0,
      stops: [
        { offset: 0, color: "#EFF6FF" },
        { offset: 50, color: "#60A5FA", opacity: 80 },
        { offset: 100, color: "#1E3A8A" }
      ]
    },
    {
      id: "particle-depth",
      type: "radial_gradient",
      units: "object_bounding_box",
      cx: 0.4, cy: 0.35, r: 0.7,
      fx: 0.3, fy: 0.25,
      stops: [
        { offset: 0, color: "#FFFFFF" },
        { offset: 100, color: "#7C3AED" }
      ]
    }
  ],
  elements: [
    { id: "ramp", type: "rect", x: 10, y: 20, width: 140, height: 80, style: { fillPaint: "concentration", stroke: "#1E3A8A", strokeWidth: 2 } },
    { id: "particle", type: "ellipse", x: 170, y: 30, width: 70, height: 70, style: { fillPaint: "particle-depth", stroke: null } }
  ]
};

test("normalizes reusable linear and radial gradient paint definitions", () => {
  const scene = normalizeScene(gradientScene);
  assert.equal(scene.paints?.length, 2);
  assert.equal(scene.paints?.[0]?.stops[1]?.color, "#60A5FA");
  assert.equal(scene.elements[0]?.style?.fillPaint, "concentration");
});

test("renders paint definitions and references into editable SVG", () => {
  const svg = renderSceneToSvg(normalizeScene(gradientScene));
  assert.match(svg, /<linearGradient id="concentration"[^>]*gradientUnits="objectBoundingBox"/);
  assert.match(svg, /<stop offset="50%" stop-color="#60A5FA" stop-opacity="0\.8"/);
  assert.match(svg, /<radialGradient id="particle-depth"[^>]*fx="0\.3" fy="0\.25"/);
  assert.match(svg, /id="ramp"[^>]*fill="url\(#concentration\)"/);
  assert.match(svg, /id="particle"[^>]*fill="url\(#particle-depth\)"/);
});

test("software rasterization preserves visible gradient direction", () => {
  const png = decodePng(renderSceneToPng(normalizeScene(gradientScene)).png);
  const rgb = (x: number, y: number) => {
    const offset = (y * png.width + x) * 4;
    return Array.from(png.pixels.subarray(offset, offset + 3));
  };
  const left = rgb(25, 60);
  const right = rgb(135, 60);
  assert.ok(left[2]! > left[0]!, "light-blue start remains blue-weighted");
  assert.ok(right[2]! > right[0]!, "dark-blue end remains blue-weighted");
  assert.ok(left.reduce((sum, value) => sum + value, 0) > right.reduce((sum, value) => sum + value, 0), "gradient becomes darker from left to right");
});

test("rejects ambiguous, dangling, malformed, and conflicting paints", () => {
  assert.throws(() => normalizeScene({ ...gradientScene, elements: [{ id: "bad", type: "rect", x: 0, y: 0, width: 10, height: 10, style: { fillPaint: "missing" } }] }), /unknown paint id/);
  assert.throws(() => normalizeScene({ ...gradientScene, elements: [{ id: "bad", type: "rect", x: 0, y: 0, width: 10, height: 10, style: { fill: "#FFFFFF", fillPaint: "concentration" } }] }), /both fill and fillPaint/);
  assert.throws(() => normalizeScene({ ...gradientScene, paints: [{ ...gradientScene.paints[0], stops: [{ offset: 10, color: "#FFFFFF" }, { offset: 100, color: "#000000" }] }] }), /begin at 0/);
  assert.throws(() => normalizeScene({ ...gradientScene, paints: [{ ...gradientScene.paints[0], stops: [{ offset: 0, color: "#FFFFFF" }, { offset: 50, color: "#000000" }, { offset: 50, color: "#FFFFFF" }, { offset: 100, color: "#000000" }] }] }), /increase strictly/);
  assert.throws(() => normalizeScene({ ...gradientScene, paints: [{ ...gradientScene.paints[0], id: "ramp" }] }), /conflicts with scene element id/);
  assert.throws(() => normalizeScene({ ...gradientScene, paints: [{ ...gradientScene.paints[0], x2: 0, y2: 0 }] }), /vector cannot be zero length/);
  assert.throws(() => normalizeScene({ ...gradientScene, elements: [{ id: "line", type: "line", x: 0, y: 0, x2: 10, y2: 10, style: { fillPaint: "concentration" } }] }), /cannot paint a line interior/);
});

test("optional Illustrator JSX adapter fails visibly instead of dropping paints", () => {
  const scene = normalizeScene(gradientScene);
  assert.throws(() => generateJsx({ kind: "cartoon_scene", scene }, { id: "paint-job", resultPath: "C:/tmp/result.json" }), /does not yet support reusable gradient paints/);
});
