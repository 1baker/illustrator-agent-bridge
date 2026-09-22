import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { preflightAdobeProjectWorkflow, shouldRelaxPhotoshopCrashHistoryForPreflight } from "../src/workflow/adobeProjectPreflight.js";

test("preflightAdobeProjectWorkflow reports missing Adobe and ChatGPT prerequisites", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-project-preflight-"));
  const result = await preflightAdobeProjectWorkflow({
    illustratorPlatform: "linux",
    photoshopPlatform: "linux",
    requireChatGptBrowser: true,
    auracallCommand: join(root, "missing-auracall"),
    chatGptTimeoutSeconds: 1
  });

  assert.equal(result.ok, false);
  assert.equal(result.illustrator.ok, false);
  assert.equal(result.illustrator.platform, "linux");
  assert.equal(result.photoshop.ok, false);
  assert.equal(result.chatGpt?.ok, false);
  assert.equal(result.chatGpt?.state, "doctor-command-failed");
  assert.match(result.next.join("\n"), /Install Illustrator/);
  assert.match(result.next.join("\n"), /Photoshop COM automation/);
});

test("shouldRelaxPhotoshopCrashHistoryForPreflight only ignores crash history for responding current Photoshop sessions", () => {
  const readiness = {
    ok: false,
    platform: "wsl" as const,
    comRegistered: true,
    clsid: "{photoshop}",
    localServer32: "C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe /Automation",
    appPath: "C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe",
    appExists: true,
    running: true,
    processes: [
      {
        processName: "Photoshop",
        id: 1234,
        mainWindowTitle: "Adobe Photoshop 2026",
        responding: true,
        path: "C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe"
      }
    ],
    recentCrashEvents: [
      {
        timeCreated: "2026-06-28T18:18:35.0000000-05:00",
        providerName: "Application Error",
        id: 1000,
        levelDisplayName: "Error",
        summary: "Faulting application name: Photoshop.exe"
      }
    ],
    next: ["Photoshop is crashing on launch."]
  };

  assert.equal(shouldRelaxPhotoshopCrashHistoryForPreflight(readiness, false), true);
  assert.equal(shouldRelaxPhotoshopCrashHistoryForPreflight(readiness, true), false);
  assert.equal(
    shouldRelaxPhotoshopCrashHistoryForPreflight(
      {
        ...readiness,
        processes: [{ ...readiness.processes[0], responding: false }]
      },
      false
    ),
    false
  );
});
