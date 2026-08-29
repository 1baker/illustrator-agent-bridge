import assert from "node:assert/strict";
import test from "node:test";
import { transformGeometryElement, translation } from "../src/core/affineTransform.js";
import { normalizeScene } from "../src/core/sceneValidation.js";
import { decodePng } from "../src/qa/pngPixels.js";
import { renderSceneToPng } from "../src/render/pngRenderer.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";

const compound = {
  id: "ring",
  type: "compound_path" as const,
  x: 0,
  y: 0,
  fillRule: "evenodd" as const,
  subpaths: [
    { points: [{ x: 20, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 100 }, { x: 20, y: 100 }] },
    { points: [{ x: 45, y: 45 }, { x: 75, y: 45 }, { x: 75, y: 75 }, { x: 45, y: 75 }] }
  ],
  style: { fill: "#0F766E", stroke: null }
};

test("normalizes advanced stroke style and compound fill rules", () => {
  const scene = normalizeScene({
    document: { width: 120, height: 120 },
    elements: [
      compound,
      { id: "dashed", type: "line", x: 10, y: 110, x2: 110, y2: 110, style: { stroke: "#2563EB", strokeWidth: 6, lineCap: "round", lineJoin: "bevel", dashArray: [12, 6], dashOffset: 3, miterLimit: 8 } }
    ]
  });
  assert.equal(scene.elements[0]?.type, "compound_path");
  assert.equal(scene.elements[1]?.style?.lineCap, "round");
  assert.deepEqual(scene.elements[1]?.style?.dashArray, [12, 6]);
  assert.throws(() => normalizeScene({ elements: [{ type: "line", x: 0, y: 0, x2: 10, y2: 10, style: { lineCap: "soft" } }] }), /lineCap/);
  assert.throws(() => normalizeScene({ elements: [{ ...compound, fillRule: "winding" }] }), /fillRule/);
  assert.throws(() => normalizeScene({ elements: [{ ...compound, subpaths: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] }] }), /3 to 500/);
});

test("renders stroke details and a compound evenodd hole to SVG", () => {
  const svg = renderSceneToSvg({
    document: { width: 120, height: 120 },
    elements: [
      compound,
      { type: "path", x: 0, y: 0, closed: false, points: [{ x: 10, y: 110 }, { x: 110, y: 110 }], style: { fill: null, stroke: "#2563EB", strokeWidth: 6, lineCap: "round", lineJoin: "bevel", dashArray: [12, 6], dashOffset: 3, miterLimit: 8 } }
    ]
  });
  assert.match(svg, /id="ring"[^>]*d="M 20,20 L 100,20 L 100,100 L 20,100 Z M 45,45 L 75,45 L 75,75 L 45,75 Z"/);
  assert.match(svg, /fill-rule="evenodd" clip-rule="evenodd"/);
  assert.match(svg, /stroke-linecap="round"/);
  assert.match(svg, /stroke-linejoin="bevel"/);
  assert.match(svg, /stroke-dasharray="12 6"/);
  assert.match(svg, /stroke-dashoffset="3"/);
  assert.match(svg, /stroke-miterlimit="8"/);
});

test("rasterizes evenodd and nonzero compound fill rules as different interiors", () => {
  const evenodd = decodePng(renderSceneToPng({ document: { width: 120, height: 120 }, elements: [compound] }).png);
  const nonzero = decodePng(renderSceneToPng({ document: { width: 120, height: 120 }, elements: [{ ...compound, fillRule: "nonzero" }] }).png);
  const pixel = (png: ReturnType<typeof decodePng>, x: number, y: number) => [...png.pixels.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
  assert.deepEqual(pixel(evenodd, 30, 60), [15, 118, 110, 255]);
  assert.deepEqual(pixel(evenodd, 60, 60), [255, 255, 255, 255]);
  assert.deepEqual(pixel(nonzero, 60, 60), [15, 118, 110, 255]);
});

test("transforms every compound subpath and preserves its fill rule", () => {
  const transformed = transformGeometryElement(compound, translation(10, 15));
  assert.equal(transformed.type, "compound_path");
  if (transformed.type !== "compound_path") throw new Error("expected compound path");
  assert.deepEqual(transformed.subpaths[0]?.points[0], { x: 30, y: 35 });
  assert.equal(transformed.fillRule, "evenodd");
});
