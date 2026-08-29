import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { compileLatexWithTectonic, LatexCompilationError } from "../src/render/latexCompiler.js";
import { renderSceneToTikz } from "../src/render/tikzRenderer.js";

const tectonic = resolve("var/tools/tectonic/tectonic");

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

test("surfaces TeX syntax errors instead of returning an artifact", { skip: !existsSync(tectonic) }, async () => {
  await assert.rejects(
    () => compileLatexWithTectonic("\\documentclass{standalone}\\begin{document}\\definitelyUnknownCommand\\end{document}", { enginePath: tectonic }),
    (error: unknown) => error instanceof LatexCompilationError && /rejected generated LaTeX/.test(error.message) && error.log.length > 0
  );
});
