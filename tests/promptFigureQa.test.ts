import assert from "node:assert/strict";
import test from "node:test";
import { inspectPromptFigureScene } from "../src/qa/promptFigureQa.js";

test("measures scene clipping, label collisions, physical type, strokes, and contrast", () => {
  const report = inspectPromptFigureScene({ document: { width: 300, height: 180 }, elements: [
    { id: "a", type: "text", x: 20, y: 20, text: "Overlapping label", size: 10, style: { fill: "#BBBBBB" } },
    { id: "b", type: "text", x: 24, y: 20, text: "Other label", size: 10, style: { fill: "#111111" } },
    { id: "crowded.label-background", type: "rect", x: 20, y: 140, width: 40, height: 20, style: { fill: "#FFFFFF", stroke: "#111111" } },
    { id: "crowded.label-text", type: "text", x: 24, y: 144, text: "Does not fit", size: 16, style: { fill: "#111111" } },
    { id: "outside", type: "line", x: 10, y: 100, x2: 305, y2: 100, style: { stroke: "#DDDDDD", strokeWidth: 0.1 } }
  ], semantics: { objects: [{ id: "missing", kind: "test", elementIds: ["not-present"] }] } }, "manuscript", { widthMm: 90, heightMm: 54 });
  assert.equal(report.ok, false); assert.equal(report.checks.clipping, false); assert.equal(report.checks.labelOverlap, false); assert.equal(report.checks.textFitsFrames, false); assert.equal(report.checks.semanticReferences, false); assert.equal(report.checks.contrast, false); assert.equal(report.checks.strokes, false);
});

test("passes a readable bounded mutable scene", () => {
  const report = inspectPromptFigureScene({ document: { width: 300, height: 180 }, elements: [
    { id: "label-a", type: "text", x: 30, y: 24, text: "Input", size: 28, style: { fill: "#111111" } },
    { id: "label-b", type: "text", x: 190, y: 24, text: "Output", size: 28, style: { fill: "#111111" } },
    { id: "input", type: "ellipse", x: 35, y: 80, width: 60, height: 45, style: { fill: "#DCEEFF", stroke: "#1F4E79", strokeWidth: 2 } },
    { id: "output", type: "rect", x: 205, y: 80, width: 60, height: 45, style: { fill: "#F3E8FF", stroke: "#6B21A8", strokeWidth: 2 } },
    { id: "flow", type: "line", x: 105, y: 102, x2: 195, y2: 102, style: { stroke: "#111111", strokeWidth: 2 } }
  ], semantics: { objects: [{ id: "in", kind: "input", elementIds: ["input"] }, { id: "out", kind: "output", elementIds: ["output"] }], relationships: [{ id: "r", sourceObjectId: "in", predicate: "transforms", targetObjectId: "out", visualElementIds: ["flow"] }] } }, "proposal", { widthMm: 180, heightMm: 108 });
  assert.equal(report.ok, true); assert.equal(report.metrics.labelOverlapCount, 0); assert.equal(report.checks.stableIds, true); assert.equal(report.checks.textFitsFrames, true);
});

test("fails a stock-glyph node row that lacks publication depiction operators", () => {
  const elements = Array.from({ length: 4 }, (_, index) => ({ id: `object-${index}.body`, type: "rect" as const, x: 30 + index * 65, y: 75, width: 45, height: 30, style: { fill: "#DBEAFE", stroke: "#1D4ED8", strokeWidth: 2 } }));
  const report = inspectPromptFigureScene({ document: { width: 320, height: 220 }, elements, semantics: { objects: elements.map((element, index) => ({ id: `object-${index}`, kind: "generic", label: `Generic ${index}`, elementIds: [element.id], properties: { recipe: "generic" } })) } }, "proposal", { widthMm: 171.5, heightMm: 105 });
  assert.equal(report.ok, false);
  assert.equal(report.checks.composition, false);
  assert.equal(report.checks.scientificSpecificity, false);
  assert.equal(report.checks.symbolDiversity, false);
  assert.ok(report.findings.some((finding) => finding.code === "generic_object_overuse"));
});
