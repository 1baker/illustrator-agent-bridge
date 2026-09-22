import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareAuraCallExternalArtworkReviewCommand } from "../src/qa/auracallExternalArtworkJudge.js";
import {
  assessExternalArtworkJudgeVerdict,
  makeExternalArtworkReviewPacket,
  normalizeExternalArtworkJudgeVerdict,
  parseExternalArtworkJudgeVerdictText
} from "../src/qa/externalArtworkJudge.js";

test("normalizeExternalArtworkJudgeVerdict accepts the ChatGPT Pro guard JSON contract", () => {
  const verdict = normalizeExternalArtworkJudgeVerdict({
    pass: true,
    score: 94,
    summary: "The final SVG is acceptable without another revision.",
    blocking_findings: [],
    nonblocking_findings: [],
    tests_or_checks_required: [],
    confidence: "high"
  });

  const assessment = assessExternalArtworkJudgeVerdict(verdict, "core shell emulsion polymerization figure");
  assert.equal(assessment.ok, true);
  assert.equal(assessment.nextGoalPrompt, null);
});

test("assessExternalArtworkJudgeVerdict turns blocking findings into the next Adobe revision prompt", () => {
  const verdict = normalizeExternalArtworkJudgeVerdict({
    pass: false,
    score: 78,
    summary: "The figure still needs one composition fix.",
    blocking_findings: [
      {
        severity: "high",
        file: null,
        line: 0,
        issue: "The Photoshop handoff texture obscures the central polymer shell.",
        required_fix: "Lower the handoff opacity and redraw the shell boundary as an editable Illustrator path."
      }
    ],
    nonblocking_findings: [],
    tests_or_checks_required: ["Rerun final SVG QA"],
    confidence: "medium"
  });

  const assessment = assessExternalArtworkJudgeVerdict(verdict, "core shell emulsion polymerization figure");
  assert.equal(assessment.ok, false);
  assert.match(assessment.nextGoalPrompt ?? "", /Photoshop handoff texture obscures/);
  assert.match(assessment.nextGoalPrompt ?? "", /editable Illustrator path/);
});

test("parseExternalArtworkJudgeVerdictText extracts fenced browser JSON", () => {
  const verdict = parseExternalArtworkJudgeVerdictText(`Here is the verdict:\n\n\`\`\`json\n{
  "pass": true,
  "score": 95,
  "summary": "The final SVG is acceptable.",
  "blocking_findings": [],
  "nonblocking_findings": [],
  "tests_or_checks_required": [],
  "confidence": "high"
}\n\`\`\``);

  assert.equal(verdict.pass, true);
  assert.equal(verdict.score, 95);
});

test("makeExternalArtworkReviewPacket embeds a strict no-markdown reviewer prompt", () => {
  const packet = makeExternalArtworkReviewPacket({
    goal: "Create a final SVG through Illustrator and Photoshop.",
    prompt: "core shell emulsion polymerization figure",
    attempt: 2,
    maxAttempts: 3,
    finalSvgPath: "/tmp/final.svg",
    sourceSvgPath: "/tmp/source.svg",
    photoshopReferencePngPath: "/tmp/reference.png",
    photoshopHandoffSvgPath: "/tmp/handoff.svg",
    photoshopWorkingPsdPath: "/tmp/working.psd",
    photoshopFeedbackPath: "/tmp/feedback.json",
    workflowOk: true,
    finalExportQaOk: true,
    artworkReviewOk: true,
    artworkReviewScore: 0.94,
    handoffSequence: ["Illustrator creates editable vector scene", "Photoshop returns SVG handoff"],
    illustratorConsumes: "/tmp/handoff.svg",
    reviewHistory: [
      {
        attempt: 1,
        prompt: "core shell emulsion polymerization figure",
        workflowPrompt: "core shell emulsion polymerization figure",
        localReviewOk: true,
        localIssues: ["Final SVG has a low-contrast shell outline."],
        localImprovements: ["Increase shell outline contrast."],
        externalReviewOk: false,
        externalReviewScore: 82,
        externalSummary: "The shell boundary still needs a composition fix.",
        externalIssues: ["The shell boundary is too low contrast."],
        externalBlockingFindings: [
          {
            severity: "medium",
            file: null,
            line: 0,
            issue: "The shell boundary is too low contrast.",
            required_fix: "Increase contrast around the shell boundary."
          }
        ],
        nextGoalPrompt: "Increase contrast around the shell boundary.",
        feedbackFingerprint: "abc123"
      }
    ]
  });

  assert.equal(packet.schemaVersion, "adobe-project-external-review.v1");
  assert.equal(packet.artifactEvidence.finalSvg.status, "not-collected");
  assert.equal(packet.reviewHistory.length, 1);
  assert.match(packet.reviewerPrompt, /Return exactly one JSON object and no markdown/);
  assert.match(packet.reviewerPrompt, /Primary artifact: \/tmp\/final\.svg/);
  assert.match(packet.reviewerPrompt, /Artifact evidence:/);
  assert.match(packet.reviewerPrompt, /Final SVG: not-collected/);
  assert.match(packet.reviewerPrompt, /Review history:/);
  assert.match(packet.reviewerPrompt, /attempt 1/);
  assert.match(packet.reviewerPrompt, /localIssues=Final SVG has a low-contrast shell outline/);
  assert.match(packet.reviewerPrompt, /blockingFindings=1\. \[medium\] The shell boundary is too low contrast/);
  assert.match(packet.reviewerPrompt, /previous blocking findings were actually resolved/);
});

test("prepareAuraCallExternalArtworkReviewCommand attaches the packet and existing Adobe artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-artwork-auracall-test-"));
  const finalSvgPath = join(root, "final.svg");
  const feedbackPath = join(root, "feedback.json");
  const packetPath = join(root, "packet.json");
  const outputPath = join(root, "verdict.txt");
  await writeFile(finalSvgPath, "<svg><circle /></svg>", "utf8");
  await writeFile(feedbackPath, "{\"ok\":true}\n", "utf8");

  const packet = makeExternalArtworkReviewPacket({
    goal: "Create a final SVG through Illustrator and Photoshop.",
    prompt: "core shell emulsion polymerization figure",
    attempt: 1,
    maxAttempts: 3,
    finalSvgPath,
    sourceSvgPath: join(root, "missing-source.svg"),
    photoshopReferencePngPath: join(root, "missing-reference.png"),
    photoshopHandoffSvgPath: join(root, "missing-handoff.svg"),
    photoshopWorkingPsdPath: join(root, "missing-working.psd"),
    photoshopFeedbackPath: feedbackPath,
    workflowOk: true,
    handoffSequence: ["Illustrator creates editable vector scene", "Photoshop returns SVG handoff"],
    illustratorConsumes: join(root, "missing-handoff.svg")
  });

  const command = await prepareAuraCallExternalArtworkReviewCommand(packet, {
    command: "auracall-test",
    model: "gpt-5.2",
    timeoutSeconds: 120,
    packetPath,
    outputPath
  });

  assert.equal(command.command, "auracall-test");
  assert.ok(command.args.includes("--wait"));
  assert.ok(command.args.includes("--write-output"));
  assert.ok(command.args.includes(outputPath));
  assert.ok(command.attachedFiles.includes(packetPath));
  assert.ok(command.attachedFiles.includes(finalSvgPath));
  assert.ok(command.attachedFiles.includes(feedbackPath));
  assert.ok(!command.attachedFiles.some((path) => path.includes("missing-source")));
});
