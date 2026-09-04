import test from "node:test";
import assert from "node:assert/strict";
import type { CartoonScene } from "../src/bridge/types.js";
import { reviewArtworkQuality } from "../src/qa/artworkReviewGuard.js";
import type { ExportQaReport } from "../src/qa/exportQa.js";

test("reviewArtworkQuality passes a rich recognizable object scene", () => {
  const review = reviewArtworkQuality({
    prompt: "full cat icon",
    target: "cat",
    scene: catScene(),
    exportQa: svgExportQa({ vectorElementCount: 14 })
  });

  assert.equal(review.ok, true);
  assert.equal(review.issues.length, 0);
  assert.equal(review.nextPrompt, null);
  assert.equal(review.checks.some((check) => check.id === "visual-richness" && check.status === "pass"), true);
});

test("a subject label cannot change the verdict for an already rich scene", () => {
  const labeled = catScene();
  labeled.elements.push({ type: "text", name: "subject-label", x: 40, y: 45, text: "cat", size: 18, style: { fill: "#111111", stroke: null } });
  const synonym = structuredClone(labeled);
  const synonymLabel = synonym.elements.at(-1);
  if (synonymLabel?.type === "text") synonymLabel.text = "unit";

  const targetReview = reviewArtworkQuality({ prompt: "full cat icon", target: "cat", scene: labeled, exportQa: svgExportQa({ vectorElementCount: 15 }) });
  const synonymReview = reviewArtworkQuality({ prompt: "full cat icon", target: "cat", scene: synonym, exportQa: svgExportQa({ vectorElementCount: 15 }) });

  assert.equal(targetReview.ok, true);
  assert.equal(targetReview.ok, synonymReview.ok);
  assert.equal(targetReview.checks.find((check) => check.id === "text-reliance")?.status, "pass");
});

test("reviewArtworkQuality rejects sparse label-driven object scenes", () => {
  const review = reviewArtworkQuality({
    prompt: "full cat icon",
    target: "cat",
    scene: {
      document: { width: 720, height: 480 },
      elements: [
        { type: "rect", name: "background", x: 0, y: 0, width: 720, height: 480, style: { fill: "#ffffff", stroke: null } },
        { type: "text", name: "cat-label", x: 320, y: 250, text: "cat", size: 42, style: { fill: "#111111", stroke: null } }
      ]
    },
    exportQa: svgExportQa({ vectorElementCount: 1 })
  });

  assert.equal(review.ok, false);
  assert.match(review.issues.join("\n"), /text spelling out cat without enough supporting vector structure/);
  assert.match(review.nextGoalPrompt ?? "", /Make the cat recognizable/);
  assert.match(review.nextGoalPrompt ?? "", /concrete named vector elements/);
});

test("reviewArtworkQuality fails when the export artifact failed QA", () => {
  const review = reviewArtworkQuality({
    prompt: "cartoon lab scientist with flask",
    scene: catScene(),
    exportQa: {
      ...svgExportQa({ vectorElementCount: 14 }),
      ok: false,
      checks: [{ id: "file-size", status: "fail", message: "File size is 0 bytes; expected at least 100." }]
    }
  });

  assert.equal(review.ok, false);
  assert.equal(review.checks.some((check) => check.id === "export-qa" && check.status === "fail"), true);
  assert.match(review.nextGoalPrompt ?? "", /failed QA/);
});

function svgExportQa({ vectorElementCount }: { vectorElementCount: number }): ExportQaReport {
  return {
    ok: true,
    path: "figure.svg",
    format: "svg",
    bytes: 2048,
    dimensions: { width: 720, height: 480 },
    checks: [
      { id: "file-size", status: "pass", message: "File size is 2048 bytes." },
      { id: "format", status: "pass", message: "Detected SVG export." },
      { id: "dimensions", status: "pass", message: "Dimensions are 720 x 480." },
      { id: "svg-vector-elements", status: "pass", message: `SVG contains ${vectorElementCount} vector/text element(s).` }
    ],
    details: { vectorElementCount }
  };
}

function catScene(): CartoonScene {
  return {
    document: { width: 720, height: 480 },
    elements: [
      { type: "rect", name: "background", x: 0, y: 0, width: 720, height: 480, style: { fill: "#ffffff", stroke: null } },
      { type: "ellipse", name: "cat-body", x: 220, y: 180, width: 250, height: 160, style: { fill: "#f2c083", stroke: "#2a2320", strokeWidth: 4 } },
      { type: "ellipse", name: "cat-head", x: 285, y: 105, width: 130, height: 120, style: { fill: "#f2c083", stroke: "#2a2320", strokeWidth: 4 } },
      { type: "polygon", name: "left-ear", x: 0, y: 0, points: [{ x: 300, y: 120 }, { x: 330, y: 62 }, { x: 355, y: 126 }], style: { fill: "#f2c083", stroke: "#2a2320", strokeWidth: 4 } },
      { type: "polygon", name: "right-ear", x: 0, y: 0, points: [{ x: 352, y: 126 }, { x: 390, y: 62 }, { x: 408, y: 136 }], style: { fill: "#f2c083", stroke: "#2a2320", strokeWidth: 4 } },
      { type: "ellipse", name: "left-eye", x: 322, y: 152, width: 14, height: 20, style: { fill: "#111111", stroke: null } },
      { type: "ellipse", name: "right-eye", x: 370, y: 152, width: 14, height: 20, style: { fill: "#111111", stroke: null } },
      { type: "ellipse", name: "nose", x: 348, y: 178, width: 18, height: 12, style: { fill: "#d96a6a", stroke: "#2a2320", strokeWidth: 2 } },
      { type: "line", name: "left-whisker", x: 340, y: 190, x2: 270, y2: 178, style: { fill: null, stroke: "#2a2320", strokeWidth: 3 } },
      { type: "line", name: "right-whisker", x: 365, y: 190, x2: 435, y2: 178, style: { fill: null, stroke: "#2a2320", strokeWidth: 3 } },
      {
        type: "path",
        name: "curled-tail",
        x: 0,
        y: 0,
        closed: false,
        points: [
          { x: 450, y: 230 },
          { x: 560, y: 150, leftX: 475, leftY: 150, rightX: 545, rightY: 115, pointType: "smooth" },
          { x: 540, y: 270, leftX: 595, leftY: 210, rightX: 560, rightY: 300, pointType: "smooth" }
        ],
        style: { fill: null, stroke: "#2a2320", strokeWidth: 18 }
      },
      { type: "ellipse", name: "front-paw", x: 275, y: 320, width: 58, height: 32, style: { fill: "#f2c083", stroke: "#2a2320", strokeWidth: 3 } },
      { type: "ellipse", name: "back-paw", x: 405, y: 318, width: 58, height: 32, style: { fill: "#f2c083", stroke: "#2a2320", strokeWidth: 3 } }
    ]
  };
}
