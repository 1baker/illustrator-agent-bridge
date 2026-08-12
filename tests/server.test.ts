import test from "node:test";
import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startBridgeServer } from "../src/bridge/server.js";
import { makeRgbaPng } from "./pngFixture.js";

test("HTTP bridge creates a JSX job", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);

    const response = await fetch(`${server.url}/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "ping", message: "from test" })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      job: { id: string; jobPath: string; resultPath: string };
    };
    assert.equal(body.ok, true);
    await access(body.job.jobPath);
    assert.match(body.job.resultPath, /results\/.+\.json$/);

    const launch = await fetch(`${server.url}/v1/jobs/${body.job.id}/launch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true, platform: "macos", appPath: "Adobe Illustrator" })
    });
    assert.equal(launch.status, 200);
    const launchBody = (await launch.json()) as { ok: boolean; dryRun: boolean; command: { command: string } };
    assert.equal(launchBody.ok, true);
    assert.equal(launchBody.dryRun, true);
    assert.equal(launchBody.command.command, "open");

    const runCom = await fetch(`${server.url}/v1/jobs/${body.job.id}/run-com`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true, platform: "wsl" })
    });
    assert.equal(runCom.status, 200);
    const runComBody = (await runCom.json()) as { ok: boolean; dryRun: boolean; command: { command: string; args: string[] } };
    assert.equal(runComBody.ok, true);
    assert.equal(runComBody.dryRun, true);
    assert.equal(runComBody.command.command, "powershell.exe");
    assert.ok(runComBody.command.args.includes("-EncodedCommand"));

    const status = await fetch(`${server.url}/v1/jobs/${body.job.id}/status`);
    assert.equal(status.status, 200);
    const statusBody = (await status.json()) as { ok: boolean; job: { exists: boolean } };
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.job.exists, false);
  } finally {
    await server.close();
  }
});

test("HTTP bridge serves the browser dashboard", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-dashboard-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/dashboard`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    const html = await response.text();
    assert.match(html, /Illustrator Agent Bridge/);
    assert.match(html, /\/v1\/workflows\/cartoon\/execute/);
    assert.match(html, /name="planner"/);
    assert.match(html, /OPENAI_MODEL or gpt-5\.5/);
    assert.match(html, /Probe Illustrator/);
    assert.match(html, /minNonBlankRatio/);
  } finally {
    await server.close();
  }
});

test("HTTP bridge probes Illustrator communication in dry-run mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-probe-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/illustrator/probe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platform: "macos",
        appPath: "Adobe Illustrator",
        dryRun: true
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      communicationConfirmed: boolean;
      job: { jobPath: string };
      launch: { dryRun: boolean };
    };
    assert.equal(body.ok, true);
    assert.equal(body.communicationConfirmed, false);
    assert.equal(body.launch.dryRun, true);
    await access(body.job.jobPath);
  } finally {
    await server.close();
  }
});

test("HTTP bridge reports Photoshop detect unsupported platforms without launching Photoshop", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-photoshop-detect-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/photoshop/detect?platform=linux`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; platform: string; next: string[] };
    assert.equal(body.ok, false);
    assert.equal(body.platform, "linux");
    assert.match(body.next.join("\n"), /Windows or WSL/);
  } finally {
    await server.close();
  }
});

test("HTTP bridge reports ChatGPT browser readiness from AuraCall doctor", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-chatgpt-detect-"));
  const fakeAuracallPath = join(root, "fake-auracall.sh");
  await writeFile(
    fakeAuracallPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{"readiness":{"ok":false,"state":"no-live-managed-browser","summary":"No browser is registered.","recommendedAction":"Run auracall login --target chatgpt.","reasons":["no live managed browser instance"]}}
JSON
exit 1
`,
    "utf8"
  );
  await chmod(fakeAuracallPath, 0o755);
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(
      `${server.url}/v1/chatgpt/detect?auracallCommand=${encodeURIComponent(fakeAuracallPath)}&timeoutSeconds=5`
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; state: string; reasons: string[]; command: { args: string[] }; next: string[] };
    assert.equal(body.ok, false);
    assert.equal(body.state, "no-live-managed-browser");
    assert.deepEqual(body.reasons, ["no live managed browser instance"]);
    assert.deepEqual(body.command.args, ["doctor", "--target", "chatgpt", "--json", "--local-only", "--prune-browser-state"]);
    assert.match(body.next.join("\n"), /auracall login/);
  } finally {
    await server.close();
  }
});

test("HTTP bridge preflights Adobe project workflow prerequisites", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-adobe-preflight-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(
      `${server.url}/v1/workflows/adobe-project/preflight?platform=linux&photoshopPlatform=linux&requireChatGptBrowser=false`
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok: boolean;
      illustrator: { ok: boolean; platform: string };
      photoshop: { ok: boolean };
      chatGpt?: unknown;
    };
    assert.equal(body.ok, false);
    assert.equal(body.illustrator.ok, false);
    assert.equal(body.illustrator.platform, "linux");
    assert.equal(body.photoshop.ok, false);
    assert.equal(body.chatGpt, undefined);
  } finally {
    await server.close();
  }
});

test("HTTP bridge searches semantic scientific concepts", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-semantic-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/semantic/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "electron transfer charge flow",
        kind: "scientific_concept",
        limit: 3
      })
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok: boolean;
      resultCount: number;
      results: Array<{ item: { kind: string; id: string } }>;
    };
    assert.equal(body.ok, true);
    assert.ok(body.resultCount > 0);
    assert.equal(body.results[0]?.item.kind, "scientific_concept");
  } finally {
    await server.close();
  }
});

test("HTTP bridge inspects vector files as shape-combination evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-vector-"));
  const server = await startBridgeServer({ port: 0, root });
  const svgPath = join(root, "http-key.svg");
  await writeFile(svgPath, `<svg><ellipse id="key-bow"/><rect id="key-shaft"/><rect id="key-tooth"/></svg>`, "utf8");

  try {
    const response = await fetch(`${server.url}/v1/semantic/inspect-vector`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paths: [svgPath]
      })
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok: boolean;
      profileCount: number;
      items: Array<{ kind: string; text: string; tags: string[] }>;
    };
    assert.equal(body.ok, true);
    assert.equal(body.profileCount, 1);
    assert.equal(body.items[0]?.kind, "shape_combination");
    assert.ok(body.items[0]?.tags.includes("key"));
    assert.match(body.items[0]?.text ?? "", /key-shaft/);
  } finally {
    await server.close();
  }
});

test("HTTP bridge plans a scientific concept scene", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-science-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/scientific/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "polymer membrane electron transfer catalytic concept",
        width: 960,
        height: 640
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      plan: { qa: { ok: boolean }; evidence: unknown[]; scene: { elements: unknown[] } };
      job: { jobPath: string };
    };
    assert.equal(body.ok, true);
    assert.equal(body.plan.qa.ok, true);
    assert.ok(body.plan.evidence.length > 0);
    assert.ok(body.plan.scene.elements.length > 30);
    await access(body.job.jobPath);
  } finally {
    await server.close();
  }
});

test("HTTP bridge plans and guards an object shape scene", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-object-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/object-shapes/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "full cat icon",
        width: 720,
        height: 520
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      plan: { target: string; guard: { ok: boolean; nextPrompt: string | null }; scene: unknown };
      job: { jobPath: string };
    };
    assert.equal(body.ok, true);
    assert.equal(body.plan.target, "cat");
    assert.equal(body.plan.guard.ok, true);
    assert.equal(body.plan.guard.nextPrompt, null);
    await access(body.job.jobPath);

    const guardResponse = await fetch(`${server.url}/v1/object-shapes/guard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "cat",
        scene: body.plan.scene,
        prompt: "full cat icon"
      })
    });

    assert.equal(guardResponse.status, 200);
    const guardBody = (await guardResponse.json()) as { ok: boolean; guard: { nextPrompt: string | null } };
    assert.equal(guardBody.ok, true);
    assert.equal(guardBody.guard.nextPrompt, null);
  } finally {
    await server.close();
  }
});

test("HTTP bridge exposes Illustrator mouse dry-run automation", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-mouse-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/illustrator/mouse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platform: "wsl",
        action: "drag",
        x: 0.35,
        y: 0.5,
        toX: 0.65,
        toY: 0.5,
        dryRun: true
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      dryRun: boolean;
      action: string;
      stdout: string;
    };
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.action, "dry-run");
    assert.match(body.stdout, /AgentBridgeMouse/);
    assert.match(body.stdout, /mouse_event/);

    const photoshopResponse = await fetch(`${server.url}/v1/photoshop/mouse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platform: "wsl",
        action: "drag",
        x: 0.35,
        y: 0.55,
        toX: 0.65,
        toY: 0.58,
        toolShortcut: "b",
        dryRun: true
      })
    });

    assert.equal(photoshopResponse.status, 201);
    const photoshopBody = (await photoshopResponse.json()) as {
      ok: boolean;
      dryRun: boolean;
      target: string;
      action: string;
      stdout: string;
    };
    assert.equal(photoshopBody.ok, true);
    assert.equal(photoshopBody.dryRun, true);
    assert.equal(photoshopBody.target, "photoshop");
    assert.equal(photoshopBody.action, "dry-run");
    assert.match(photoshopBody.stdout, /Photoshop/);
  } finally {
    await server.close();
  }
});

test("HTTP bridge prepares a cartoon workflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-workflow-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/workflows/cartoon`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/http-workflow.pdf",
        format: "pdf",
        planner: "deterministic"
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      plan: { planner: string };
      sceneJob: { jobPath: string };
      exportJob: { jobPath: string };
      runbook: unknown[];
    };
    assert.equal(body.ok, true);
    assert.equal(body.plan.planner, "deterministic");
    assert.equal(body.runbook.length, 4);
    await access(body.sceneJob.jobPath);
    await access(body.exportJob.jobPath);
  } finally {
    await server.close();
  }
});

test("HTTP bridge prepares an object shape workflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-object-workflow-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/workflows/object`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "secure padlock icon",
        outputPath: "var/exports/http-object-lock.svg",
        format: "svg",
        maxGuardIterations: 3
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      plan: { target: string; guard: { ok: boolean } };
      guardIterations: Array<{ guardOk: boolean }>;
      sceneJob: { jobPath: string };
      exportJob: { jobPath: string };
      runbook: unknown[];
    };
    assert.equal(body.ok, true);
    assert.equal(body.plan.target, "lock");
    assert.equal(body.plan.guard.ok, true);
    assert.equal(body.guardIterations.length, 1);
    assert.equal(body.guardIterations[0]?.guardOk, true);
    assert.equal(body.runbook.length, 5);
    await access(body.sceneJob.jobPath);
    await access(body.exportJob.jobPath);
  } finally {
    await server.close();
  }
});

test("HTTP bridge executes a cartoon workflow dry-run", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-execute-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/workflows/cartoon/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/http-execute.svg",
        format: "svg",
        platform: "macos",
        dryRun: true
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      dryRun: boolean;
      sceneLaunch: { dryRun: boolean };
      exportLaunch: { dryRun: boolean };
    };
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.sceneLaunch.dryRun, true);
    assert.equal(body.exportLaunch.dryRun, true);
  } finally {
    await server.close();
  }
});

test("HTTP bridge executes an Adobe SVG proof workflow dry-run", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-adobe-proof-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/workflows/adobe-svg-proof/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/http-adobe-proof.svg",
        intent: "cartoon",
        platform: "wsl",
        photoshopPlatform: "wsl",
        illustratorRunMode: "com",
        dryRun: true,
        maxReviewIterations: 3,
        visibleMouseProof: true
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      dryRun: boolean;
      reviewIterations: Array<{ attempt: number; nextGoalPrompt: string | null }>;
      workflow: { intent: string; photoshopProofJob: { jobPath: string }; runbook: unknown[] };
      sceneLaunch: { command: { command: string } };
      exportLaunch: { command: { command: string } };
      photoshopLaunch: { command: { command: string }; next: { resultContract: string } };
    };
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.reviewIterations.length, 1);
    assert.equal(body.reviewIterations[0]?.attempt, 1);
    assert.equal(body.reviewIterations[0]?.nextGoalPrompt, null);
    assert.equal(body.workflow.intent, "cartoon");
    assert.equal(body.workflow.runbook.length, 6);
    assert.match(body.workflow.photoshopProofJob.jobPath, /jobs\/.+\.jsx$/);
    assert.equal(body.sceneLaunch.command.command, "powershell.exe");
    assert.equal(body.exportLaunch.command.command, "powershell.exe");
    assert.equal(body.photoshopLaunch.command.command, "powershell.exe");
    assert.match(body.photoshopLaunch.next.resultContract, /Photoshop/);
  } finally {
    await server.close();
  }
});

test("HTTP bridge executes an Adobe project workflow dry-run", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-adobe-project-"));
  const reviewReportPath = join(root, "http-adobe-project.review.json");
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/workflows/adobe-project/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/http-adobe-project.svg",
        intent: "cartoon",
        platform: "wsl",
        photoshopPlatform: "wsl",
        illustratorRunMode: "com",
        dryRun: true,
        maxReviewIterations: 3,
        visibleMouseProof: true,
        reviewReportPath
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      dryRun: boolean;
      reviewReportPath: string;
      reviewReport: {
        schemaVersion: string;
        dryRun: boolean;
        accepted: boolean;
        goalAcceptance: { accepted: boolean; chatGptBrowserReviewRequired: boolean; missing: string[] };
      };
      reviewIterations: Array<{ attempt: number; nextGoalPrompt: string | null }>;
      workflow: {
        photoshopHandoffSvgPath: string;
        handoff: { sequence: string[]; illustratorConsumes: string };
        photoshopProjectJob: { jobPath: string };
        photoshopCommitJob: { jobPath: string };
        runbook: unknown[];
      };
      sceneLaunch: { command: { command: string } };
      sourceExportLaunch: { command: { command: string } };
      photoshopProjectLaunch: { command: { command: string } };
      photoshopCommitLaunch: { command: { command: string } };
      illustratorReferenceLaunch: { command: { command: string } };
      finalExportLaunch: { command: { command: string } };
      visibleMouseProofs: {
        illustratorScene: { action: string };
        photoshopEdit: { target: string };
        illustratorReturn: { target: string };
      };
    };
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.reviewReportPath, reviewReportPath);
    assert.equal(body.reviewReport.schemaVersion, "adobe-project-review-report.v1");
    assert.equal(body.reviewReport.dryRun, true);
    assert.equal(body.reviewReport.accepted, false);
    assert.equal(body.reviewReport.goalAcceptance.accepted, false);
    assert.equal(body.reviewReport.goalAcceptance.chatGptBrowserReviewRequired, true);
    assert.match(body.reviewReport.goalAcceptance.missing.join("\n"), /ChatGPT browser external review/);
    assert.equal(body.reviewIterations.length, 1);
    assert.equal(body.reviewIterations[0]?.attempt, 1);
    assert.equal(body.workflow.runbook.length, 12);
    assert.equal(body.workflow.handoff.sequence.length, 7);
    assert.match(body.workflow.photoshopHandoffSvgPath, /http-adobe-project\.photoshop-handoff\.svg$/);
    assert.equal(body.workflow.handoff.illustratorConsumes, body.workflow.photoshopHandoffSvgPath);
    assert.match(body.workflow.photoshopProjectJob.jobPath, /jobs\/.+\.jsx$/);
    assert.match(body.workflow.photoshopCommitJob.jobPath, /jobs\/.+\.jsx$/);
    assert.equal(body.sceneLaunch.command.command, "powershell.exe");
    assert.equal(body.sourceExportLaunch.command.command, "powershell.exe");
    assert.equal(body.photoshopProjectLaunch.command.command, "powershell.exe");
    assert.equal(body.photoshopCommitLaunch.command.command, "powershell.exe");
    assert.equal(body.illustratorReferenceLaunch.command.command, "powershell.exe");
    assert.equal(body.finalExportLaunch.command.command, "powershell.exe");
    assert.equal(body.visibleMouseProofs.illustratorScene.action, "dry-run");
    assert.equal(body.visibleMouseProofs.photoshopEdit.target, "photoshop");
    assert.equal(body.visibleMouseProofs.illustratorReturn.target, "illustrator");
    const report = JSON.parse(await readFile(reviewReportPath, "utf8"));
    assert.equal(report.schemaVersion, "adobe-project-review-report.v1");
    assert.equal(report.goalAcceptance.accepted, false);
    assert.equal(report.finalSvgPath.endsWith("http-adobe-project.svg"), true);
  } finally {
    await server.close();
  }
});

test("HTTP bridge executes an object workflow dry-run through COM mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-object-execute-"));
  const server = await startBridgeServer({ port: 0, root });

  try {
    const response = await fetch(`${server.url}/v1/workflows/object/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "simple house key icon",
        outputPath: "var/exports/http-object-key.png",
        format: "png",
        platform: "wsl",
        runMode: "com",
        maxGuardIterations: 3,
        dryRun: true
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      dryRun: boolean;
      runMode: string;
      workflow: { plan: { target: string; guard: { ok: boolean } }; guardIterations: Array<{ guardOk: boolean }> };
      sceneLaunch: { command: { command: string } };
      exportLaunch: { command: { command: string } };
    };
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.runMode, "com");
    assert.equal(body.workflow.plan.target, "key");
    assert.equal(body.workflow.plan.guard.ok, true);
    assert.equal(body.workflow.guardIterations.length, 1);
    assert.equal(body.workflow.guardIterations[0]?.guardOk, true);
    assert.equal(body.sceneLaunch.command.command, "powershell.exe");
    assert.equal(body.exportLaunch.command.command, "powershell.exe");
  } finally {
    await server.close();
  }
});

test("HTTP bridge QA checks an exported SVG", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-qa-"));
  const server = await startBridgeServer({ port: 0, root });
  const svgPath = join(root, "exports", "figure.svg");

  try {
    await mkdir(join(root, "exports"), { recursive: true });
    await writeFile(svgPath, `<svg width="720" height="480"><rect width="720" height="480"/></svg>`, "utf8");
    const response = await fetch(`${server.url}/v1/qa/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: svgPath, minBytes: 1 })
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; report: { format: string } };
    assert.equal(body.ok, true);
    assert.equal(body.report.format, "svg");
  } finally {
    await server.close();
  }
});

test("HTTP bridge reviews exported artwork and returns refinement prompts", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-artwork-review-"));
  const server = await startBridgeServer({ port: 0, root });
  const svgPath = join(root, "exports", "cat-label.svg");

  try {
    await mkdir(join(root, "exports"), { recursive: true });
    await writeFile(svgPath, `<svg width="720" height="480"><text x="320" y="250">cat</text></svg>`, "utf8");
    const response = await fetch(`${server.url}/v1/qa/artwork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: svgPath,
        prompt: "full cat icon",
        target: "cat",
        minBytes: 1,
        scene: {
          document: { width: 720, height: 480 },
          elements: [
            { type: "rect", name: "background", x: 0, y: 0, width: 720, height: 480, style: { fill: "#ffffff", stroke: null } },
            { type: "text", name: "cat-label", x: 320, y: 250, text: "cat", size: 42, style: { fill: "#111111", stroke: null } }
          ]
        }
      })
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; exportQa: { ok: boolean }; review: { ok: boolean; nextGoalPrompt: string | null } };
    assert.equal(body.ok, false);
    assert.equal(body.exportQa.ok, true);
    assert.equal(body.review.ok, false);
    assert.match(body.review.nextGoalPrompt ?? "", /Make the cat recognizable/);
  } finally {
    await server.close();
  }
});

test("HTTP bridge QA checks PNG nonblank pixels", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-bridge-qa-png-"));
  const server = await startBridgeServer({ port: 0, root });
  const pngPath = join(root, "exports", "figure.png");

  try {
    await mkdir(join(root, "exports"), { recursive: true });
    await writeFile(
      pngPath,
      makeRgbaPng(16, 16, (x, y) => (x >= 4 && x < 12 && y >= 4 && y < 12 ? [24, 24, 24, 255] : [255, 255, 255, 255]))
    );
    const response = await fetch(`${server.url}/v1/qa/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pngPath, format: "png", minBytes: 1, minWidth: 1, minHeight: 1, minNonBlankRatio: 0.01 })
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; report: { details?: { pixelAnalysis?: unknown } } };
    assert.equal(body.ok, true);
    assert.notEqual(body.report.details?.pixelAnalysis, undefined);
  } finally {
    await server.close();
  }
});
