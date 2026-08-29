import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { generateProposalVisualPackage, parseProposalVisualDirectives } from "../src/proposal/proposalVisualWorkflow.js";
import type { AdobeSvgProofWorkflow } from "../src/workflow/adobeSvgProofWorkflow.js";

const story = {
  schemaVersion: 1,
  document: { title: "Signal mechanism", width: 900, height: 600 },
  entities: [
    { id: "signal", type: "molecule", label: "Signal" },
    { id: "response", type: "process", label: "Response" }
  ],
  interactions: [{ id: "activation", sourceId: "signal", type: "activates", targetId: "response" }]
};

const plot = {
  schemaVersion: 1,
  document: { title: "Expected response", width: 800, height: 560 },
  xAxis: { label: "Time (h)" },
  yAxis: { label: "Conversion (%)" },
  series: [{ id: "conversion", label: "Conversion", mark: "line", data: [{ x: 0, y: 0 }, { x: 4, y: 72 }, { x: 8, y: 94 }] }]
};

const table = {
  schemaVersion: 1,
  title: "Go/no-go criteria",
  columns: [
    { id: "criterion", heading: "Criterion", alignment: "left" },
    { id: "threshold", heading: "Threshold", alignment: "right" }
  ],
  rows: [{ id: "conversion", cells: ["Conversion", ">= 90%"] }]
};

function block(value: unknown): string {
  return `\`\`\`proposal-visual\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

test("extracts exact prompts and source locations from proposal Markdown", () => {
  const markdown = `# Proposal\n\nNarrative.\n\n${block({ id: "figure-one", kind: "figure", renderer: "tikz", prompt: "Show the signal mechanism.", generatorKind: "story", content: story })}`;
  const directives = parseProposalVisualDirectives(markdown);
  assert.equal(directives.length, 1);
  assert.equal(directives[0]?.prompt, "Show the signal mechanism.");
  assert.equal(directives[0]?.source.line, 5);
});

test("routes mixed proposal figures, plots, and tables to their declared generators", async () => {
  const markdown = [
    "# Proposal visual plan",
    block({ id: "mechanism", kind: "figure", renderer: "auto", prompt: "Show signal activation.", generatorKind: "story", content: story }),
    block({ id: "conversion-plot", kind: "plot", renderer: "auto", prompt: "Plot expected conversion versus time.", content: plot }),
    block({ id: "go-no-go", kind: "table", renderer: "auto", prompt: "Tabulate the go/no-go criteria.", content: table })
  ].join("\n\n");
  const generated = await generateProposalVisualPackage({ schemaVersion: 1, proposal: { title: "Proposal visual plan", text: markdown } });
  assert.deepEqual(generated.routes.map((route) => route.resolved), ["tikz", "pgfplots", "latex_table"]);
  assert.equal(generated.assets[0]?.renderer, "tikz");
  assert.match(generated.assets[0]?.renderer === "tikz" ? generated.assets[0].generated.latex : "", /tikzpicture/);
  assert.match(generated.assets[1]?.renderer === "pgfplots" ? generated.assets[1].generated.latex : "", /pgfplots/);
  assert.match(generated.assets[2]?.renderer === "latex_table" ? generated.assets[2].generated.latex : "", /Go\/no-go criteria/);
});

test("routes prompt-only figures to an auditable Illustrator and Photoshop workflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "proposal-adobe-route-"));
  try {
    const markdown = block({ id: "adobe-concept", kind: "figure", renderer: "auto", prompt: "Create a membrane electron-transfer mechanism figure." });
    const generated = await generateProposalVisualPackage(
      { schemaVersion: 1, proposal: { title: "Adobe route", text: markdown }, adobeMode: "prepare" },
      { root, outputDir: join(root, "exports") }
    );
    const asset = generated.assets[0];
    assert.equal(asset?.renderer, "adobe_svg_proof");
    if (!asset || asset.renderer !== "adobe_svg_proof") return;
    const workflow = asset.workflow as AdobeSvgProofWorkflow;
    assert.equal(workflow.ok, true);
    assert.equal(workflow.prompt, "Create a membrane electron-transfer mechanism figure.");
    const sceneScript = await readFile(workflow.sceneJob.jobPath, "utf8");
    assert.match(sceneScript, /Adobe Illustrator/);
    const proofScript = await readFile(workflow.photoshopProofJob.jobPath, "utf8");
    assert.match(proofScript, /Adobe Photoshop/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects malformed, duplicate, incompatible, and data-free declarations", () => {
  assert.throws(() => parseProposalVisualDirectives("No declarations"), /1 to 24/);
  assert.throws(() => parseProposalVisualDirectives("```proposal-visual\n{}"), /unclosed/);
  const duplicate = [
    block({ id: "same", kind: "figure", renderer: "adobe_svg_proof", prompt: "One" }),
    block({ id: "same", kind: "figure", renderer: "adobe_svg_proof", prompt: "Two" })
  ].join("\n");
  assert.throws(() => parseProposalVisualDirectives(duplicate), /duplicate visual id/);
  assert.throws(() => parseProposalVisualDirectives(block({ id: "bad", kind: "table", renderer: "pgfplots", prompt: "Wrong", content: table })), /only valid for plots/);
  assert.throws(() => parseProposalVisualDirectives(block({ id: "missing-data", kind: "plot", renderer: "auto", prompt: "Invent a plot" })), /requires reviewed content/);
});
