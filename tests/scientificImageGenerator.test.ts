import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { generateScientificImage } from "../src/scientific/imageGenerator.js";

const story = {
  schemaVersion: 1,
  document: { title: "Unified story", width: 900, height: 600 },
  entities: [
    { id: "a", type: "molecule", label: "Signal" },
    { id: "b", type: "process", label: "Response" }
  ],
  interactions: [{ id: "r", sourceId: "a", type: "activates", targetId: "b" }]
};

const plot = {
  schemaVersion: 1,
  document: { title: "Unified plot", width: 800, height: 560 },
  xAxis: { label: "Time" },
  yAxis: { label: "Signal" },
  series: [{ id: "signal", label: "Signal", mark: "line", data: [{ x: 0, y: 1 }, { x: 1, y: 3 }] }]
};

test("generates one auditable scene, SVG, TikZ, and PNG contract for stories", () => {
  const generated = generateScientificImage({ schemaVersion: 1, kind: "story", content: story, output: { png: { width: 720, background: "#FFFFFF" } } });
  assert.equal(generated.manifest.engine, "software-scientific-image.v1");
  assert.equal(generated.manifest.kind, "story");
  assert.equal(generated.manifest.adobeUsed, false);
  assert.equal(generated.manifest.sourceOfTruth, "semantic_vector_scene");
  assert.equal(generated.png.width, 720);
  assert.equal(generated.manifest.counts.objects, 2);
  assert.equal(generated.manifest.counts.relationships, 1);
  assert.match(generated.svg, /data-format="scientific-image-generator\.scene-semantics\.v1"/);
  assert.match(generated.latex, /\\begin\{tikzpicture\}/);
  assert.equal(generated.manifest.latex.renderer, "tikz-scene.v1");
  assert.equal(generated.manifest.artifacts.latex.sha256, createHash("sha256").update(generated.latex).digest("hex"));
  assert.equal(generated.manifest.artifacts.svg.sha256, createHash("sha256").update(generated.svg).digest("hex"));
  assert.equal(generated.manifest.artifacts.png.sha256, createHash("sha256").update(generated.png.png).digest("hex"));
  assert.ok("figure" in generated.intermediate);
});

test("routes plot, controlled-text, and figure content through the same output shape", () => {
  const requests = [
    { schemaVersion: 1, kind: "plot", content: plot },
    { schemaVersion: 1, kind: "text", content: "Title: Text route\nSignal [molecule] activates Response [process]." },
    {
      schemaVersion: 1, kind: "figure", content: {
        schemaVersion: 1,
        document: { title: "Figure route", width: 800, height: 560 },
        objects: [{ id: "object", kind: "molecule", label: "Object", width: 120, height: 80, x: 300, y: 240 }]
      }
    }
  ];
  for (const request of requests) {
    const generated = generateScientificImage(request);
    assert.equal(generated.manifest.kind, request.kind);
    assert.ok(generated.scene.elements.length > 0);
    assert.ok(generated.svg.startsWith("<?xml"));
    assert.match(generated.latex, request.kind === "plot" ? /\\usepackage\{pgfplots\}/ : /\\begin\{tikzpicture\}/);
    assert.deepEqual([...generated.png.png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test("fails closed at the unified request and renderer boundaries", () => {
  assert.throws(() => generateScientificImage({ schemaVersion: 2, kind: "story", content: story }), /schemaVersion/);
  assert.throws(() => generateScientificImage({ schemaVersion: 1, kind: "photo", content: story }), /kind must be/);
  assert.throws(() => generateScientificImage({ schemaVersion: 1, kind: "story", content: story, surprise: true }), /unsupported field/);
  assert.throws(() => generateScientificImage({ schemaVersion: 1, kind: "story", content: story, output: { png: { width: 200, height: 200 } } }), /only one of width, height, or scale/);
  assert.throws(() => generateScientificImage({ schemaVersion: 1, kind: "plot", content: story }), /xAxis/);
});
