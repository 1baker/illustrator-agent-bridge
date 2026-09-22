import assert from "node:assert/strict";
import test from "node:test";
import { compileScientificFigureBrief } from "../src/scientific/figureBrief.js";
import { generateScientificImage } from "../src/scientific/imageGenerator.js";

const content = {
  schemaVersion: 1,
  source: { mode: "sketch_notes", description: "A reviewed sketch of signal activation." },
  brief: { title: "Signal", audience: "journal", intent: "pathway", direction: "left_to_right", spacing: "compact" },
  components: [
    { id: "signal", type: "molecule", label: "Signal" },
    { id: "response", type: "process", label: "Draft response" }
  ],
  relationships: [{ id: "activation", sourceId: "signal", type: "activates", targetId: "response", label: "draft" }],
  refinements: [
    { operation: "rename_component", componentId: "response", label: "Transcriptional response" },
    { operation: "set_emphasis", componentId: "response", emphasis: "primary" },
    { operation: "rename_relationship", relationshipId: "activation", label: "induces" },
    { operation: "set_layout", direction: "top_to_bottom", spacing: "open" }
  ]
};

test("compiles a reviewed brief and applies stable-id refinements before layout", () => {
  const compiled = compileScientificFigureBrief(content);
  assert.equal(compiled.story.entities[1]?.label, "Transcriptional response");
  assert.equal(compiled.story.entities[1]?.emphasis, "primary");
  assert.equal(compiled.story.interactions?.[0]?.label, "induces");
  assert.equal(compiled.story.presentation?.direction, "top_to_bottom");
  assert.equal(compiled.story.presentation?.spacing, "open");
  assert.equal(compiled.audit.sourceMode, "sketch_notes");
  assert.equal(compiled.audit.appliedRefinements.length, 4);
});

test("generates editable TikZ and audited artifacts from a reviewed brief", () => {
  const generated = generateScientificImage({ schemaVersion: 1, kind: "brief", content });
  assert.equal(generated.manifest.kind, "brief");
  assert.equal(generated.manifest.adobeUsed, false);
  assert.match(generated.latex, /\\begin\{tikzpicture\}/);
  assert.ok(generated.manifest.stages.includes("apply_stable_id_refinements"));
  assert.deepEqual((generated.intermediate.brief as { appliedRefinements: unknown[] }).appliedRefinements.length, 4);
});

test("fails closed for unsupported operations and unknown targets", () => {
  assert.throws(() => compileScientificFigureBrief({ ...content, refinements: [{ operation: "redraw_everything" }] }), /operation must be/);
  assert.throws(() => compileScientificFigureBrief({ ...content, refinements: [{ operation: "rename_component", componentId: "missing", label: "Nope" }] }), /unknown component/);
  assert.throws(() => compileScientificFigureBrief({ ...content, source: { mode: "image", description: "Unsupported" } }), /mode must be/);
});
