import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGeneratedPhotoshopJob } from "../src/bridge/photoshopJobs.js";
import { generatePhotoshopJsx } from "../src/bridge/photoshopJsxGenerator.js";
import { annotatePhotoshopComFailure, runJsxViaPhotoshopCom } from "../src/bridge/photoshopComAutomation.js";
import { normalizePhotoshopReadiness } from "../src/bridge/photoshopProbe.js";

test("generates a Photoshop-targeted SVG proof JSX job", () => {
  const jsx = generatePhotoshopJsx(
    {
      kind: "svg_proof",
      inputPath: "C:/Users/example/out/figure.svg",
      outputPath: "C:/Users/example/out/figure-proof.png",
      width: 1200,
      height: 800,
      resolution: 144
    },
    { id: "photoshop-job-1", resultPath: "C:/Users/example/out/result.json" }
  );

  assert.match(jsx, /#target photoshop/);
  assert.match(jsx, /DialogModes\.NO/);
  assert.match(jsx, /app\.open\(inputFile\)/);
  assert.match(jsx, /doc\.resizeImage\(UnitValue\(1200, 'px'\), UnitValue\(800, 'px'\), 144, ResampleMethod\.BICUBIC\)/);
  assert.match(jsx, /PNGSaveOptions/);
  assert.match(jsx, /"kind":"svg_proof"/);
  assert.match(jsx, /figure-proof\.png/);
});

test("creates a Photoshop proof job and can dry-run Photoshop COM execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "photoshop-proof-job-"));
  const job = await createGeneratedPhotoshopJob(
    {
      kind: "svg_proof",
      inputPath: "var/exports/figure.svg",
      outputPath: "var/exports/figure-proof.png"
    },
    root,
    { hostPlatform: "wsl" }
  );

  assert.match(job.jobPath, /jobs\/.+\.jsx$/);
  assert.match(job.resultPath, /results\/.+\.json$/);
  assert.match(job.jsx, /#target photoshop/);
  assert.match(job.photoshopJobPath, /jobs\/.+\.jsx$/);

  const launch = await runJsxViaPhotoshopCom(job.jobPath, {
    platform: "wsl",
    dryRun: true,
    root
  });

  assert.equal(launch.ok, true);
  assert.equal(launch.dryRun, true);
  assert.equal(launch.command.command, "powershell.exe");
  assert.match(launch.next.resultContract, /Photoshop/);
});

test("annotatePhotoshopComFailure explains startup COM factory failures", () => {
  const stderr = "New-Object : Retrieving the COM class factory failed due to error: 80080005 Server execution failed (CO_E_SERVER_EXEC_FAILURE).";
  const annotated = annotatePhotoshopComFailure(stderr);
  assert.match(annotated, /Photoshop COM startup failed/);
  assert.match(annotated, /Start Photoshop 2026 once/);
});

test("normalizePhotoshopReadiness reports recent Photoshop crashes as not ready", () => {
  const readiness = normalizePhotoshopReadiness(
    {
      clsid: "{photoshop-clsid}",
      localServer32: "C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe /Automation",
      appPath: "C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe",
      appExists: true,
      processes: [],
      recentCrashEvents: [
        {
          timeCreated: "2026-06-28T18:00:00.0000000-05:00",
          providerName: "Application Error",
          id: 1000,
          levelDisplayName: "Error",
          summary: "Faulting application name: Photoshop.exe | Exception code: 0xc0000005"
        }
      ]
    },
    "wsl"
  );

  assert.equal(readiness.ok, false);
  assert.equal(readiness.comRegistered, true);
  assert.equal(readiness.recentCrashEvents.length, 1);
  assert.match(readiness.next.join("\n"), /Photoshop is crashing on launch/);
});

test("generates a Photoshop project pass with PSD, PNG, SVG, and feedback artifacts", () => {
  const jsx = generatePhotoshopJsx(
    {
      kind: "project_pass",
      inputPath: "C:/Users/example/out/source.svg",
      outputPngPath: "C:/Users/example/out/project-reference.png",
      outputSvgPath: "C:/Users/example/out/project-handoff.svg",
      outputPsdPath: "C:/Users/example/out/project-working.psd",
      feedbackPath: "C:/Users/example/out/project-feedback.json",
      prompt: "scientific concept figure",
      passName: "texture and contrast pass",
      width: 1200,
      height: 800,
      keepOpen: true
    },
    { id: "photoshop-project-pass-1", resultPath: "C:/Users/example/out/result.json" }
  );

  assert.match(jsx, /#target photoshop/);
  assert.match(jsx, /saveTarget/);
  assert.match(jsx, /copyBackTarget/);
  assert.match(jsx, /washInset/);
  assert.match(jsx, /PhotoshopSaveOptions/);
  assert.match(jsx, /PNGSaveOptions/);
  assert.match(jsx, /project-reference\.png/);
  assert.match(jsx, /project-handoff\.svg/);
  assert.match(jsx, /project-working\.psd/);
  assert.match(jsx, /project-feedback\.json/);
  assert.match(jsx, /"kind":"project_pass"/);
  assert.match(jsx, /writeText\(outputSvgFile\.fsName, svgText\)/);
  assert.match(jsx, /Keep the Photoshop document open for a visible mouse edit pass/);
  assert.doesNotMatch(jsx, /\n    doc\.close\(SaveOptions\.DONOTSAVECHANGES\);\n/);
  assert.match(jsx, /photoshop_project_pass/);
});

test("generates a Photoshop post-mouse project commit with SVG handoff trace", () => {
  const jsx = generatePhotoshopJsx(
    {
      kind: "project_commit",
      inputPath: "C:/Users/example/out/source.svg",
      outputPngPath: "C:/Users/example/out/project-reference.png",
      outputSvgPath: "C:/Users/example/out/project-handoff.svg",
      outputPsdPath: "C:/Users/example/out/project-working.psd",
      feedbackPath: "C:/Users/example/out/project-feedback.json",
      prompt: "scientific concept figure",
      passName: "visible mouse commit"
    },
    { id: "photoshop-project-commit-1", resultPath: "C:/Users/example/out/result.json" }
  );

  assert.match(jsx, /#target photoshop/);
  assert.match(jsx, /app\.activeDocument/);
  assert.match(jsx, /saveTarget/);
  assert.match(jsx, /copyBackTarget/);
  assert.match(jsx, /PhotoshopSaveOptions/);
  assert.match(jsx, /PNGSaveOptions/);
  assert.match(jsx, /photoshop-visible-mouse-stroke/);
  assert.match(jsx, /visibleMouseTrace/);
  assert.match(jsx, /"kind":"project_commit"/);
  assert.match(jsx, /photoshop_project_commit/);
  assert.match(jsx, /doc\.close\(SaveOptions\.DONOTSAVECHANGES\)/);
});
