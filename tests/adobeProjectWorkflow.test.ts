import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuraCallExternalArtworkReviewError } from "../src/qa/auracallExternalArtworkJudge.js";
import { executeAdobeProjectWorkflow, prepareAdobeProjectWorkflow } from "../src/workflow/adobeProjectWorkflow.js";

test("prepareAdobeProjectWorkflow creates an Illustrator-Photoshop-Illustrator project handoff", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-prepare-"));
  const workflow = await prepareAdobeProjectWorkflow({
    prompt: "core shell emulsion polymerization scientific concept",
    outputPath: "var/exports/core-shell-final.svg",
    root,
    intent: "auto",
    proofWidth: 1400,
    proofHeight: 900,
    referenceOpacity: 45
  });

  assert.equal(workflow.ok, true);
  assert.equal(workflow.intent, "scientific");
  assert.match(workflow.outputPath, /core-shell-final\.svg$/);
  assert.match(workflow.sourceSvgPath, /core-shell-final\.illustrator-source\.svg$/);
  assert.match(workflow.photoshopReferencePngPath, /core-shell-final\.photoshop-reference\.png$/);
  assert.match(workflow.photoshopHandoffSvgPath, /core-shell-final\.photoshop-handoff\.svg$/);
  assert.match(workflow.photoshopWorkingPsdPath, /core-shell-final\.photoshop-working\.psd$/);
  assert.match(workflow.photoshopFeedbackPath, /core-shell-final\.photoshop-feedback\.json$/);
  assert.equal(workflow.handoff.sequence.length, 5);
  assert.equal(workflow.handoff.illustratorConsumes, workflow.photoshopHandoffSvgPath);
  assert.equal(workflow.runbook.length, 8);

  await access(workflow.sceneJob.jobPath);
  await access(workflow.sourceExportJob.jobPath);
  await access(workflow.photoshopProjectJob.jobPath);
  await access(workflow.illustratorReferenceJob.jobPath);
  await access(workflow.finalExportJob.jobPath);

  const photoshopJsx = await readFile(workflow.photoshopProjectJob.jobPath, "utf8");
  const illustratorReferenceJsx = await readFile(workflow.illustratorReferenceJob.jobPath, "utf8");
  assert.match(photoshopJsx, /"kind":"project_pass"/);
  assert.match(photoshopJsx, /PhotoshopSaveOptions/);
  assert.match(photoshopJsx, /photoshop-handoff\.svg/);
  assert.match(illustratorReferenceJsx, /"kind":"place_file_reference"/);
  assert.match(illustratorReferenceJsx, /photoshop-handoff\.svg/);
  assert.match(illustratorReferenceJsx, /placeReferenceFile\(doc, layer, inputFile, "photoshop-svg-handoff", 0, 0, 1400, 900, 45, false\)/);
  assert.match(illustratorReferenceJsx, /svg_rebuilt_reference/);
});

test("executeAdobeProjectWorkflow dry-runs the full app round-trip through COM", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-execute-"));
  const execution = await executeAdobeProjectWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/lab-final.svg",
    root,
    intent: "cartoon",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    maxReviewIterations: 3,
    visibleMouseProof: true,
    visibleMouseDurationMs: 900
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.dryRun, true);
  assert.equal(execution.illustratorRunMode, "com");
  assert.equal(execution.photoshopRunMode, "com");
  assert.equal(execution.reviewIterations.length, 1);
  assert.equal(execution.workflow.runbook.length, 12);
  assert.equal(execution.workflow.handoff.sequence.length, 7);
  assert.match(execution.workflow.photoshopCommitJob?.jobPath ?? "", /jobs\/.+\.jsx$/);
  assert.equal(execution.sceneLaunch?.command.command, "powershell.exe");
  assert.equal(execution.sourceExportLaunch?.command.command, "powershell.exe");
  assert.equal(execution.photoshopProjectLaunch?.command.command, "powershell.exe");
  assert.equal(execution.photoshopCommitLaunch?.command.command, "powershell.exe");
  assert.equal(execution.illustratorReferenceLaunch?.command.command, "powershell.exe");
  assert.equal(execution.finalExportLaunch?.command.command, "powershell.exe");
  assert.match(execution.photoshopProjectLaunch?.next.resultContract ?? "", /Photoshop/);
  assert.match(execution.photoshopCommitLaunch?.next.resultContract ?? "", /Photoshop/);
  assert.equal(execution.visibleMouseProofs?.illustratorScene?.action, "dry-run");
  assert.equal(execution.visibleMouseProofs?.photoshopEdit?.target, "photoshop");
  assert.equal(execution.visibleMouseProofs?.photoshopEdit?.action, "dry-run");
  assert.equal(execution.visibleMouseProofs?.photoshopEdit?.postShortcut, "{ESC}");
  assert.equal(execution.visibleMouseProofs?.illustratorReturn?.target, "illustrator");
  assert.match(execution.visibleMouseProofs?.illustratorScene?.stdout ?? "", /SetCursorPos/);
  assert.match(execution.visibleMouseProofs?.photoshopEdit?.stdout ?? "", /Photoshop/);
  const photoshopProjectJsx = await readFile(execution.workflow.photoshopProjectJob.jobPath, "utf8");
  assert.match(photoshopProjectJsx, /doc\.resizeImage\(UnitValue\(\d+, 'px'\), UnitValue\(\d+, 'px'\), null, ResampleMethod\.BICUBIC\)/);
  assert.match(photoshopProjectJsx, /"keepOpen":true/);
  assert.equal(execution.photoshopFeedback, undefined);
});

test("executeAdobeProjectWorkflow loops on ChatGPT browser external review findings", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-external-review-"));
  const reportPath = join(root, "review-report.json");
  let reviewCalls = 0;
  const execution = await executeAdobeProjectWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/lab-final.svg",
    root,
    intent: "cartoon",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    maxReviewIterations: 2,
    reviewReportPath: reportPath,
    externalReview: async (packet) => {
      reviewCalls += 1;
      assert.equal(packet.schemaVersion, "adobe-project-external-review.v1");
      assert.match(packet.reviewerPrompt, /ChatGPT Pro browser reviewer/);

      if (reviewCalls === 1) {
        assert.equal(packet.reviewHistory.length, 0);
        return {
          pass: false,
          score: 82,
          summary: "The flask is readable but the handoff layer weakens contrast.",
          blocking_findings: [
            {
              severity: "medium",
              file: null,
              line: 0,
              issue: "The Photoshop handoff layer makes the flask silhouette too low contrast.",
              required_fix: "Increase flask outline contrast and keep the handoff layer subordinate to the Illustrator vector shapes."
            }
          ],
          nonblocking_findings: [],
          tests_or_checks_required: [],
          confidence: "high"
        };
      }

      assert.equal(packet.reviewHistory.length, 1);
      assert.equal(packet.reviewHistory[0].attempt, 1);
      assert.equal(packet.reviewHistory[0].externalReviewOk, false);
      assert.equal(packet.reviewHistory[0].externalReviewScore, 82);
      assert.match(packet.reviewHistory[0].externalSummary ?? "", /handoff layer weakens contrast/);
      assert.match(packet.reviewHistory[0].externalIssues?.join("\n") ?? "", /too low contrast/);
      assert.match(packet.reviewHistory[0].externalBlockingFindings?.[0]?.required_fix ?? "", /Increase flask outline contrast/);
      assert.match(packet.reviewHistory[0].nextGoalPrompt ?? "", /Increase flask outline contrast/);
      assert.match(packet.reviewerPrompt, /Review history:/);
      assert.match(packet.reviewerPrompt, /attempt 1/);
      assert.match(packet.reviewerPrompt, /blockingFindings=/);
      assert.match(packet.reviewerPrompt, /The Photoshop handoff layer makes the flask silhouette too low contrast/);

      return {
        pass: true,
        score: 93,
        summary: "The revised final SVG is acceptable without another Adobe pass.",
        blocking_findings: [],
        nonblocking_findings: [],
        tests_or_checks_required: [],
        confidence: "high"
      };
    }
  });

  assert.equal(reviewCalls, 2);
  assert.equal(execution.ok, true);
  assert.equal(execution.reviewIterations.length, 2);
  assert.equal(execution.reviewIterations[0].externalReviewOk, false);
  assert.equal(execution.reviewIterations[0].externalReviewScore, 82);
  assert.match(execution.reviewIterations[0].nextGoalPrompt ?? "", /Increase flask outline contrast/);
  assert.equal(execution.reviewIterations[1].externalReviewOk, true);
  assert.equal(execution.externalReview?.verdict?.score, 93);
  assert.equal(execution.goalAcceptance?.accepted, false);
  assert.equal(execution.goalAcceptance?.chatGptBrowserReviewRequired, true);
  assert.deepEqual(execution.goalAcceptance?.missing, [
    "Run the Adobe project workflow without dryRun.",
    "Complete and verify the Illustrator -> Photoshop -> Illustrator round trip.",
    "Pass Codex local export QA and artwork review on the final SVG."
  ]);
  assert.equal(execution.reviewReportPath, reportPath);
  assert.equal(execution.reviewReport?.schemaVersion, "adobe-project-review-report.v1");
  assert.equal(execution.reviewReport?.dryRun, true);
  assert.equal(execution.reviewReport?.accepted, false);
  assert.equal(execution.reviewReport?.goalAcceptance.accepted, false);
  assert.equal(execution.reviewReport?.goalAcceptance.chatGptBrowserReviewRequired, true);
  assert.deepEqual(execution.reviewReport?.goalAcceptance.missing, [
    "Run the Adobe project workflow without dryRun.",
    "Complete and verify the Illustrator -> Photoshop -> Illustrator round trip.",
    "Pass Codex local export QA and artwork review on the final SVG."
  ]);
  assert.equal(execution.reviewReport?.requirements.chatGptBrowserReview.passed, true);
  assert.equal(execution.reviewReport?.requirements.chatGptBrowserReview.score, 93);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.schemaVersion, "adobe-project-review-report.v1");
  assert.equal(report.goalAcceptance.accepted, false);
  assert.equal(report.goalAcceptance.chatGptBrowserReviewRequired, true);
  assert.equal(report.requirements.chatGptBrowserReview.passed, true);
  assert.equal(report.iterations.length, 2);
});

test("executeAdobeProjectWorkflow stops when review feedback repeats unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-repeated-review-"));
  const reportPath = join(root, "review-report.json");
  let reviewCalls = 0;
  const execution = await executeAdobeProjectWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/lab-final.svg",
    root,
    intent: "cartoon",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    maxReviewIterations: 5,
    reviewReportPath: reportPath,
    externalReview: async () => {
      reviewCalls += 1;
      return {
        pass: false,
        score: 82,
        summary: "The flask is readable but the handoff layer weakens contrast.",
        blocking_findings: [
          {
            severity: "medium",
            file: null,
            line: 0,
            issue: "The Photoshop handoff layer makes the flask silhouette too low contrast.",
            required_fix: "Increase flask outline contrast and keep the handoff layer subordinate to the Illustrator vector shapes."
          }
        ],
        nonblocking_findings: [],
        tests_or_checks_required: [],
        confidence: "high"
      };
    }
  });

  assert.equal(reviewCalls, 2);
  assert.equal(execution.ok, false);
  assert.equal(execution.reviewIterations.length, 2);
  assert.equal(execution.reviewIterations[1].repeatedFeedback, true);
  assert.equal(execution.reviewIterations[1].repeatedWithAttempt, 1);
  assert.equal(execution.reviewLoop?.status, "stalled");
  assert.equal(execution.reviewLoop?.stopReason, "repeated-feedback");
  assert.deepEqual(execution.reviewLoop?.repeatedFeedback?.attempts, [1, 2]);
  assert.match(execution.next.join("\n"), /same actionable feedback/);
  assert.equal(execution.goalAcceptance?.accepted, false);
  assert.match(execution.goalAcceptance?.missing.join("\n") ?? "", /Resolve repeated review feedback/);
  assert.equal(execution.reviewReport?.reviewLoop.status, "stalled");

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.reviewLoop.status, "stalled");
  assert.equal(report.reviewLoop.stopReason, "repeated-feedback");
  assert.equal(report.goalAcceptance.accepted, false);
  assert.match(report.goalAcceptance.missing.join("\n"), /Resolve repeated review feedback/);
  assert.equal(report.iterations[1].repeatedFeedback, true);
});

test("executeAdobeProjectWorkflow can write an external review packet before acceptance", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-review-packet-"));
  const packetPath = join(root, "review-packet.json");
  const execution = await executeAdobeProjectWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/lab-final.svg",
    root,
    intent: "cartoon",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    externalReviewPacketPath: packetPath,
    requireExternalReviewPass: true
  });

  assert.equal(execution.ok, false);
  assert.equal(execution.externalReview?.packetPath, packetPath);
  assert.match(execution.externalReview?.issues.join("\n") ?? "", /no verdict JSON was supplied/);
  const packet = JSON.parse(await readFile(packetPath, "utf8"));
  assert.equal(packet.schemaVersion, "adobe-project-external-review.v1");
  assert.match(packet.reviewerPrompt, /Return exactly one JSON object/);
});

test("executeAdobeProjectWorkflow includes artifact hashes in external review packets", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-review-artifacts-"));
  const finalSvgPath = join(root, "lab-final.svg");
  const sourceSvgPath = join(root, "lab-final.illustrator-source.svg");
  const referencePngPath = join(root, "lab-final.photoshop-reference.png");
  const handoffSvgPath = join(root, "lab-final.photoshop-handoff.svg");
  const workingPsdPath = join(root, "lab-final.photoshop-working.psd");
  const feedbackPath = join(root, "lab-final.photoshop-feedback.json");
  const packetPath = join(root, "review-packet.json");
  const finalSvg = "<svg><path d=\"M0 0L10 10\" /></svg>\n";

  await writeFile(finalSvgPath, finalSvg, "utf8");
  await writeFile(sourceSvgPath, "<svg><rect width=\"10\" height=\"10\" /></svg>\n", "utf8");
  await writeFile(referencePngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  await writeFile(handoffSvgPath, "<svg><circle r=\"5\" /></svg>\n", "utf8");
  await writeFile(workingPsdPath, Buffer.from("psd-bytes"));
  await writeFile(feedbackPath, "{\"ok\":true}\n", "utf8");

  const execution = await executeAdobeProjectWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: finalSvgPath,
    root,
    intent: "cartoon",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    externalReviewPacketPath: packetPath,
    requireExternalReviewPass: true
  });

  assert.equal(execution.externalReview?.packetPath, packetPath);
  const packet = JSON.parse(await readFile(packetPath, "utf8"));
  assert.equal(packet.artifactEvidence.finalSvg.status, "available");
  assert.equal(packet.artifactEvidence.finalSvg.bytes, Buffer.byteLength(finalSvg));
  assert.equal(packet.artifactEvidence.finalSvg.sha256, createHash("sha256").update(finalSvg).digest("hex"));
  assert.equal(packet.artifactEvidence.sourceSvg.status, "available");
  assert.equal(packet.artifactEvidence.photoshopReferencePng.status, "available");
  assert.equal(packet.artifactEvidence.photoshopHandoffSvg.status, "available");
  assert.equal(packet.artifactEvidence.photoshopWorkingPsd.status, "available");
  assert.equal(packet.artifactEvidence.photoshopFeedback.status, "available");
  assert.match(packet.reviewerPrompt, /Artifact evidence:/);
  assert.match(packet.reviewerPrompt, /Final SVG: available, bytes=/);
  assert.match(packet.reviewerPrompt, /sha256=/);
});

test("executeAdobeProjectWorkflow reports external browser review runner failures as review issues", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-external-review-error-"));
  const execution = await executeAdobeProjectWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/lab-final.svg",
    root,
    intent: "cartoon",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    requireExternalReviewPass: true,
    externalReview: async () => {
      throw new AuraCallExternalArtworkReviewError(
        "no-live-managed-browser",
        {
          command: "auracall",
          args: ["--engine", "browser", "--browser-target", "chatgpt"],
          attachedFiles: ["/tmp/review-packet.json"],
          packetPath: "/tmp/review-packet.json",
          outputPath: "/tmp/verdict.txt"
        },
        1,
        "doctor output",
        "Cloudflare interstitial",
        ""
      );
    }
  });

  assert.equal(execution.ok, false);
  assert.equal(execution.externalReview?.source, "callback");
  assert.match(execution.externalReview?.error ?? "", /no-live-managed-browser/);
  assert.equal(execution.externalReview?.providerEvidence?.provider, "auracall");
  assert.equal(execution.externalReview?.providerEvidence?.exitCode, 1);
  assert.match(execution.externalReview?.providerEvidence?.stderr ?? "", /Cloudflare/);
  assert.deepEqual((execution.externalReview?.providerEvidence?.command as { args: string[] }).args, [
    "--engine",
    "browser",
    "--browser-target",
    "chatgpt"
  ]);
  assert.match(execution.externalReview?.issues.join("\n") ?? "", /failed before returning verdict JSON/);
});

test("executeAdobeProjectWorkflow stops before Adobe launches when external review preflight fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-external-review-preflight-"));
  const packetPath = join(root, "review-packet.json");
  let reviewCalls = 0;
  const externalReview = Object.assign(
    async () => {
      reviewCalls += 1;
      throw new Error("review should not run after failed preflight");
    },
    {
      preflight: async () => ({
        provider: "auracall",
        target: "chatgpt",
        ok: false,
        state: "no-live-managed-browser",
        severity: "warning",
        requiresHuman: false,
        summary: "No live managed browser.",
        recommendedAction: "Run auracall login --target chatgpt.",
        reasons: ["no live managed browser instance"],
        command: {
          command: "auracall",
          args: ["doctor", "--target", "chatgpt", "--json", "--local-only", "--prune-browser-state"]
        },
        exitCode: 1,
        stdout: "doctor output",
        stderr: "",
        next: ["Run auracall login --target chatgpt."]
      })
    }
  );

  const execution = await executeAdobeProjectWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/lab-final.svg",
    root,
    intent: "cartoon",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    requireExternalReviewPass: true,
    externalReviewPacketPath: packetPath,
    externalReview
  });

  assert.equal(reviewCalls, 0);
  assert.equal(execution.ok, false);
  assert.equal(execution.sceneLaunch, undefined);
  assert.equal(execution.photoshopProjectLaunch, undefined);
  assert.equal(execution.externalReview?.source, "preflight");
  assert.equal(execution.externalReview?.packetPath, packetPath);
  assert.equal(execution.externalReview?.providerEvidence?.provider, "auracall");
  assert.equal(execution.externalReview?.providerEvidence?.exitCode, 1);
  assert.equal((execution.externalReview?.providerEvidence?.readiness as { state: string }).state, "no-live-managed-browser");
  assert.match(execution.externalReview?.issues.join("\n") ?? "", /preflight failed before launching Adobe jobs/);
  assert.match(execution.next.join("\n"), /Resolve external ChatGPT browser review readiness/);

  const packet = JSON.parse(await readFile(packetPath, "utf8"));
  assert.equal(packet.localVerification.workflowOk, false);
  assert.match(packet.localVerification.localIssues.join("\n"), /no-live-managed-browser/);
});

test("executeAdobeProjectWorkflow preserves external provider evidence from browser review runners", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-external-review-evidence-"));
  const execution = await executeAdobeProjectWorkflow({
    prompt: "cartoon lab scientist with flask",
    outputPath: "var/exports/lab-final.svg",
    root,
    intent: "cartoon",
    illustratorRunMode: "com",
    launchPlatform: "wsl",
    photoshopPlatform: "wsl",
    dryRun: true,
    requireExternalReviewPass: true,
    externalReview: async () => ({
      provider: "auracall",
      command: {
        command: "auracall",
        args: ["--engine", "browser", "--browser-target", "chatgpt"],
        attachedFiles: ["/tmp/review-packet.json"],
        packetPath: "/tmp/review-packet.json",
        outputPath: "/tmp/verdict.txt"
      },
      exitCode: 0,
      stdout: "review complete",
      stderr: "",
      responseText: "{\"pass\":true}",
      verdict: {
        pass: true,
        score: 95,
        summary: "The browser reviewer accepts the final SVG.",
        blocking_findings: [],
        nonblocking_findings: [],
        tests_or_checks_required: [],
        confidence: "high"
      }
    })
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.externalReview?.source, "callback");
  assert.equal(execution.externalReview?.providerEvidence?.provider, "auracall");
  assert.deepEqual((execution.externalReview?.providerEvidence?.command as { args: string[] }).args, [
    "--engine",
    "browser",
    "--browser-target",
    "chatgpt"
  ]);
  assert.equal(execution.externalReview?.providerEvidence?.exitCode, 0);
  assert.match(execution.externalReview?.providerEvidence?.stdout ?? "", /review complete/);
});
