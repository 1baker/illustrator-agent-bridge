import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { compileLatexWithTectonic } from "../src/render/latexCompiler.js";
import { renderLatexTable } from "../src/render/latexTableRenderer.js";

const tectonic = resolve("var/tools/tectonic/tectonic");
const table = {
  schemaVersion: 1,
  title: "Project milestones & evidence",
  caption: "Values are copied from the reviewed proposal declaration.",
  label: "tab:milestones",
  columns: [
    { id: "milestone", heading: "Milestone", alignment: "left" },
    { id: "month", heading: "Month", alignment: "right" },
    { id: "evidence", heading: "Success criterion", alignment: "left" }
  ],
  rows: [
    { id: "m1", cells: ["Baseline > 80%", 6, "Validated data set"] },
    { id: "m2", cells: ["Scale-up", 18, "1 kg batch"] }
  ],
  notes: ["No numerical values are inferred from the prompt."]
};

test("renders reviewed table values as escaped editable LaTeX", () => {
  const rendered = renderLatexTable(table);
  assert.equal(rendered.renderer, "latex-table.v1");
  assert.deepEqual(rendered.counts, { columns: 3, rows: 2 });
  assert.match(rendered.latex, /Project milestones \\& evidence/);
  assert.match(rendered.latex, /Baseline > 80\\%/);
  assert.match(rendered.latex, /\\begin\{tabular\}\{lrl\}/);
});

test("fails closed on unsupported fields, duplicate ids, and uneven rows", () => {
  assert.throws(() => renderLatexTable({ ...table, invented: true }), /unsupported field/);
  assert.throws(() => renderLatexTable({ ...table, columns: [table.columns[0], table.columns[0]] }), /duplicate id/);
  assert.throws(() => renderLatexTable({ ...table, rows: [{ id: "short", cells: ["one"] }] }), /exactly 3 values/);
});

test("compiles a generated proposal table into a real PDF", { skip: !existsSync(tectonic) }, async () => {
  const compiled = await compileLatexWithTectonic(renderLatexTable(table).latex, { enginePath: tectonic });
  assert.equal(compiled.pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(compiled.bytes > 500);
});
