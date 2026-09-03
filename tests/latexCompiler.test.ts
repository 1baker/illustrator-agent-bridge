import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { compileLatexWithTectonic, LatexCompilationError } from "../src/render/latexCompiler.js";
import { renderSceneToTikz } from "../src/render/tikzRenderer.js";

const tectonicCandidates = [resolve("var/tools/tectonic/tectonic"), resolve("var/tools/tectonic-0.16.9/tectonic")];
const tectonic = tectonicCandidates.find((candidate) => existsSync(candidate)) ?? tectonicCandidates[0];

test("rejects invalid source and timeout settings before starting TeX", async () => {
  await assert.rejects(() => compileLatexWithTectonic(""), LatexCompilationError);
  await assert.rejects(() => compileLatexWithTectonic("x", { timeoutMs: 10 }), /timeout/);
});

test("compiles generated standalone TikZ into a real PDF", { skip: !existsSync(tectonic) }, async () => {
  const rendered = renderSceneToTikz({
    document: { width: 180, height: 100 },
    elements: [
      { type: "rect", x: 10, y: 10, width: 70, height: 60, style: { fill: "#BFDBFE", stroke: "#2563EB", opacity: 50 } },
      { type: "ellipse", x: 95, y: 10, width: 70, height: 60, style: { fill: null, stroke: "#7C3AED" } }
    ]
  });
  const compiled = await compileLatexWithTectonic(rendered.latex, { enginePath: tectonic });
  assert.equal(compiled.engine, "tectonic");
  assert.equal(compiled.pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(compiled.bytes > 500);
  assert.match(compiled.sha256, /^[0-9a-f]{64}$/);
});

test("compiles identical LaTeX to a byte-identical PDF", { skip: !existsSync(tectonic) }, async () => {
  const rendered = renderSceneToTikz({
    document: { width: 120, height: 80 },
    elements: [{ type: "rect", x: 10, y: 10, width: 80, height: 40, style: { fill: "#DBEAFE", stroke: "#1D4ED8" } }]
  });
  const first = await compileLatexWithTectonic(rendered.latex, { enginePath: tectonic });
  const second = await compileLatexWithTectonic(rendered.latex, { enginePath: tectonic });
  assert.equal(second.sha256, first.sha256);
  assert.deepEqual(second.pdf, first.pdf);
});

test("surfaces TeX syntax errors instead of returning an artifact", { skip: !existsSync(tectonic) }, async () => {
  await assert.rejects(
    () => compileLatexWithTectonic("\\documentclass{standalone}\\begin{document}\\definitelyUnknownCommand\\end{document}", { enginePath: tectonic }),
    (error: unknown) => error instanceof LatexCompilationError && /rejected generated LaTeX/.test(error.message) && error.log.length > 0
  );
});
