import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeAdobeSvgProofWorkflow, prepareAdobeSvgProofWorkflow, shouldReviseArtworkFromReview } from "../src/workflow/adobeSvgProofWorkflow.js";

test("prepareAdobeSvgProofWorkflow routes scientific prompts to Illustrator SVG plus Photoshop proof jobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-svg-proof-prepare-"));
  const workflow = await prepareAdobeSvgProofWorkflow({
    prompt: "core shell emulsion polymerization scientific concept",
    outputPath: "var/exports/core-shell.svg",
    root,
    intent: "auto",
    proofWidth: 1400,
    proofHeight: 900
  });

  assert.equal(workflow.ok, true);
  assert.equal(workflow.intent, "scientific");
  assert.match(workflow.outputPath, /core-shell\.svg$/);
  assert.match(workflow.proofPngPath, /core-shell\.photoshop-proof\.png$/);
  assert.match(workflow.sceneJob.jobPath, /jobs\/.+\.jsx$/);
  assert.match(workflow.exportJob.jobPath, /jobs\/.+\.jsx$/);
  assert.match(workflow.photoshopProofJob.jobPath, /jobs\/.+\.jsx$/);
  assert.equal(workflow.runbook.length, 6);
  await access(workflow.sceneJob.jobPath);
  await access(workflow.exportJob.jobPath);
  await access(workflow.photoshopProofJob.jobPath);
});

test("prepareAdobeSvgProofWorkflow falls back to generic object planning for unsupported object targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-svg-proof-generic-object-"));
  const workflow = await prepareAdobeSvgProofWorkflow({
    prompt: "complex microscope object with objective lenses and calibration controls",
    outputPath: "var/exports/microscope.svg",
    root,
    intent: "auto"
  });

  assert.equal(workflow.ok, true);
  assert.equal(workflow.intent, "object");
  assert.equal(workflow.plan.planner, "generic-object-deterministic");
  assert.ok(!("guard" in workflow.plan));
  assert.ok(workflow.plan.evidence.length > 0);
  assert.ok(workflow.plan.scene.elements.some((element) => element.name === "objective lens long"));
  assert.ok(workflow.plan.scene.elements.some((element) => element.name === "coarse focus outer knob"));
  await access(workflow.sceneJob.jobPath);
  await access(workflow.exportJob.jobPath);
  await access(workflow.photoshopProofJob.jobPath);
});

test("executeAdobeSvgProofWorkflow dry-runs Illustrator COM and Photoshop COM proofing", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-svg-proof-execute-"));
  const execution = await executeAdobeSvgProofWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/lab.svg",
    root,
    intent: "cartoon",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    maxReviewIterations: 3
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.dryRun, true);
  assert.equal(execution.illustratorRunMode, "com");
  assert.equal(execution.photoshopRunMode, "com");
  assert.equal(execution.workflow.intent, "cartoon");
  assert.equal(execution.reviewIterations.length, 1);
  assert.equal(execution.reviewIterations[0]?.attempt, 1);
  assert.equal(execution.reviewIterations[0]?.prompt, "cartoon lab scientist with flask");
  assert.equal(execution.reviewIterations[0]?.nextGoalPrompt, null);
  assert.equal(execution.sceneLaunch?.command.command, "powershell.exe");
  assert.equal(execution.exportLaunch?.command.command, "powershell.exe");
  assert.equal(execution.photoshopLaunch?.command.command, "powershell.exe");
  assert.match(execution.photoshopLaunch?.next.resultContract ?? "", /Photoshop/);
  assert.equal(execution.sceneResult, undefined);
  assert.equal(execution.proofQa, undefined);
});

test("executeAdobeSvgProofWorkflow dry-runs generic object fallback without strict guard stop", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-svg-proof-generic-object-execute-"));
  const execution = await executeAdobeSvgProofWorkflow({
    prompt: "complex microscope object with objective lenses and calibration controls",
    outputPath: "var/exports/microscope.svg",
    root,
    intent: "object",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    maxReviewIterations: 2
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.workflow.intent, "object");
  assert.equal(execution.workflow.plan.planner, "generic-object-deterministic");
  assert.ok(!("guard" in execution.workflow.plan));
  assert.equal(execution.reviewIterations.length, 1);
  assert.equal(execution.sceneLaunch?.command.command, "powershell.exe");
  assert.equal(execution.photoshopLaunch?.command.command, "powershell.exe");
});

test("shouldReviseArtworkFromReview treats review warnings as actionable refinement", () => {
  assert.equal(
    shouldReviseArtworkFromReview({
      ok: true,
      confidence: 0.94,
      score: 0.94,
      checks: [
        {
          id: "framing",
          status: "warn",
          message: "The visible artwork is very close to an artboard edge; recenter it or add margin."
        }
      ],
      issues: [],
      improvements: ["The visible artwork is very close to an artboard edge; recenter it or add margin."],
      nextPrompt: "Revise the Illustrator artwork and add margin.",
      nextGoalPrompt: "Revise the Illustrator artwork and add margin."
    }),
    true
  );

  assert.equal(
    shouldReviseArtworkFromReview({
      ok: true,
      confidence: 1,
      score: 1,
      checks: [],
      issues: [],
      improvements: [],
      nextPrompt: null,
      nextGoalPrompt: null
    }),
    false
  );
});
