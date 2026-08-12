import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AuraCallExternalArtworkReviewError,
  detectAuraCallChatGptBrowser,
  prepareAuraCallExternalArtworkReviewCommand,
  runAuraCallExternalArtworkReview
} from "../src/qa/auracallExternalArtworkJudge.js";
import { makeExternalArtworkReviewPacket } from "../src/qa/externalArtworkJudge.js";

test("runAuraCallExternalArtworkReview calls browser runner command and parses saved verdict JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "auracall-artwork-review-"));
  const finalSvgPath = join(root, "final.svg");
  const fakeAuracallPath = join(root, "fake-auracall.sh");
  await writeFile(finalSvgPath, `<svg><circle cx="20" cy="20" r="10"/></svg>`, "utf8");
  await writeFile(
    fakeAuracallPath,
    `#!/usr/bin/env bash
set -euo pipefail
out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--write-output" ]; then
    shift
    out="$1"
  fi
  shift
done
if [ -z "$out" ]; then
  exit 9
fi
cat > "$out" <<'JSON'
{
  "pass": true,
  "score": 96,
  "summary": "The browser reviewer accepts the final SVG.",
  "blocking_findings": [],
  "nonblocking_findings": [],
  "tests_or_checks_required": [],
  "confidence": "high"
}
JSON
echo "fake auracall wrote $out"
`,
    "utf8"
  );
  await chmod(fakeAuracallPath, 0o755);

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
    photoshopFeedbackPath: join(root, "missing-feedback.json"),
    workflowOk: true,
    finalExportQaOk: true,
    artworkReviewOk: true,
    artworkReviewScore: 94,
    handoffSequence: ["Illustrator creates editable vector scene", "Photoshop returns SVG handoff"],
    illustratorConsumes: join(root, "missing-handoff.svg")
  });

  const result = await runAuraCallExternalArtworkReview(packet, {
    command: fakeAuracallPath,
    timeoutSeconds: 5
  });

  assert.equal(result.verdict.pass, true);
  assert.equal(result.verdict.score, 96);
  assert.equal(result.provider, "auracall");
  assert.ok(result.command.attachedFiles.includes(finalSvgPath));
  assert.ok(result.command.attachedFiles.includes(result.command.packetPath));
  assert.ok(!result.command.attachedFiles.some((path) => path.includes("missing-source")));
  assert.ok(result.command.args.includes("--browser-target"));
  assert.ok(result.command.args.includes("chatgpt"));
  assert.equal(result.command.args.filter((arg) => arg === "--wait").length, 1);
});

test("prepareAuraCallExternalArtworkReviewCommand honors stable packet and output paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "auracall-artwork-audit-paths-"));
  const packetPath = join(root, "review-packet.json");
  const outputPath = join(root, "verdict.txt");
  const finalSvgPath = join(root, "final.svg");
  await writeFile(finalSvgPath, `<svg><rect width="40" height="20"/></svg>`, "utf8");

  const packet = makeExternalArtworkReviewPacket({
    goal: "Create a final SVG through Illustrator and Photoshop.",
    prompt: "core shell emulsion polymerization figure",
    attempt: 2,
    maxAttempts: 3,
    finalSvgPath,
    sourceSvgPath: join(root, "missing-source.svg"),
    photoshopReferencePngPath: join(root, "missing-reference.png"),
    photoshopHandoffSvgPath: join(root, "missing-handoff.svg"),
    photoshopWorkingPsdPath: join(root, "missing-working.psd"),
    photoshopFeedbackPath: join(root, "missing-feedback.json"),
    workflowOk: true,
    handoffSequence: ["Illustrator creates editable vector scene", "Photoshop returns SVG handoff"],
    illustratorConsumes: join(root, "missing-handoff.svg")
  });

  const command = await prepareAuraCallExternalArtworkReviewCommand(packet, {
    packetPath,
    outputPath,
    model: "gpt-5.2"
  });

  assert.equal(command.packetPath, packetPath);
  assert.equal(command.outputPath, outputPath);
  assert.ok(command.attachedFiles.includes(packetPath));
  assert.ok(command.attachedFiles.includes(finalSvgPath));
  assert.deepEqual(command.args.slice(command.args.indexOf("--write-output"), command.args.indexOf("--write-output") + 2), [
    "--write-output",
    outputPath
  ]);
  const writtenPacket = JSON.parse(await readFile(packetPath, "utf8"));
  assert.equal(writtenPacket.schemaVersion, "adobe-project-external-review.v1");
});

test("detectAuraCallChatGptBrowser normalizes AuraCall doctor readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "auracall-doctor-ready-"));
  const fakeAuracallPath = join(root, "fake-auracall.sh");
  await writeFile(
    fakeAuracallPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" != "doctor" ]; then
  exit 9
fi
cat <<'JSON'
{
  "readiness": {
    "ok": false,
    "state": "manual-clear-required",
    "severity": "blocked",
    "requiresHuman": true,
    "summary": "Cloudflare anti-bot interstitial detected.",
    "recommendedAction": "Clear the challenge manually.",
    "reasons": ["browser page blocked by cloudflare"]
  }
}
JSON
exit 1
`,
    "utf8"
  );
  await chmod(fakeAuracallPath, 0o755);

  const readiness = await detectAuraCallChatGptBrowser({
    command: fakeAuracallPath,
    timeoutSeconds: 5
  });

  assert.equal(readiness.ok, false);
  assert.equal(readiness.state, "manual-clear-required");
  assert.equal(readiness.requiresHuman, true);
  assert.equal(readiness.exitCode, 1);
  assert.deepEqual(readiness.reasons, ["browser page blocked by cloudflare"]);
  assert.equal(readiness.provider, "auracall");
  assert.equal(readiness.target, "chatgpt");
  assert.deepEqual(readiness.command.args, ["doctor", "--target", "chatgpt", "--json", "--local-only", "--prune-browser-state"]);
  assert.match(readiness.next.join("\n"), /Clear the challenge manually/);
});

test("runAuraCallExternalArtworkReview preflight fails before starting browser review", async () => {
  const root = await mkdtemp(join(tmpdir(), "auracall-preflight-blocked-"));
  const finalSvgPath = join(root, "final.svg");
  const outputPath = join(root, "verdict.txt");
  const fakeAuracallPath = join(root, "fake-auracall.sh");
  await writeFile(finalSvgPath, `<svg><rect x="4" y="4" width="32" height="20"/></svg>`, "utf8");
  await writeFile(
    fakeAuracallPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "doctor" ]; then
  cat <<'JSON'
{"readiness":{"ok":false,"state":"no-live-managed-browser","summary":"No live managed browser.","recommendedAction":"Run auracall login --target chatgpt.","reasons":["no live managed browser instance"]}}
JSON
  exit 1
fi
echo "review command should not run" > "${outputPath}"
exit 0
`,
    "utf8"
  );
  await chmod(fakeAuracallPath, 0o755);

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
    photoshopFeedbackPath: join(root, "missing-feedback.json"),
    workflowOk: true,
    handoffSequence: ["Illustrator creates editable vector scene", "Photoshop returns SVG handoff"],
    illustratorConsumes: join(root, "missing-handoff.svg")
  });

  await assert.rejects(
    () =>
      runAuraCallExternalArtworkReview(packet, {
        command: fakeAuracallPath,
        outputPath,
        timeoutSeconds: 5,
        preflightBrowserReadiness: true
      }),
    (error) => {
      assert.ok(error instanceof AuraCallExternalArtworkReviewError);
      assert.match(error.message, /not ready/);
      assert.match(error.message, /no-live-managed-browser/);
      assert.equal(error.command?.command, fakeAuracallPath);
      assert.equal(error.exitCode, 1);
      assert.equal(error.readiness?.state, "no-live-managed-browser");
      assert.match(error.responseText ?? "", /no-live-managed-browser/);
      return true;
    }
  );

  await assert.rejects(() => readFile(outputPath, "utf8"));
});

test("runAuraCallExternalArtworkReview preserves command evidence when browser runner cannot start", async () => {
  const root = await mkdtemp(join(tmpdir(), "auracall-artwork-review-spawn-error-"));
  const finalSvgPath = join(root, "final.svg");
  const missingAuracallPath = join(root, "missing-auracall");
  await writeFile(finalSvgPath, `<svg><rect x="4" y="4" width="32" height="20"/></svg>`, "utf8");

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
    photoshopFeedbackPath: join(root, "missing-feedback.json"),
    workflowOk: true,
    finalExportQaOk: true,
    artworkReviewOk: true,
    artworkReviewScore: 94,
    handoffSequence: ["Illustrator creates editable vector scene", "Photoshop returns SVG handoff"],
    illustratorConsumes: join(root, "missing-handoff.svg")
  });

  await assert.rejects(
    () =>
      runAuraCallExternalArtworkReview(packet, {
        command: missingAuracallPath,
        timeoutSeconds: 1
      }),
    (error) => {
      assert.ok(error instanceof AuraCallExternalArtworkReviewError);
      assert.equal(error.provider, "auracall");
      assert.equal(error.command?.command, missingAuracallPath);
      assert.equal(error.exitCode, null);
      assert.equal(error.stdout, "");
      assert.match(error.stderr ?? "", /ENOENT|spawn/);
      assert.equal(error.responseText, "");
      assert.ok(error.command?.attachedFiles.includes(finalSvgPath));
      assert.ok(error.command?.attachedFiles.includes(error.command.packetPath));
      return true;
    }
  );
});
