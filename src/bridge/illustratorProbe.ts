import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runJsxViaIllustratorCom } from "./comAutomation.js";
import { confirmIllustratorDialog, type ConfirmIllustratorDialogResult } from "./dialogAutomation.js";
import { toIllustratorPath, type IllustratorHostPlatform } from "./files.js";
import { createGeneratedJob } from "./jobs.js";
import { generatedJobSummary } from "./jsxGenerator.js";
import { launchJsxJob, resolveLaunchPlatform, type LaunchJobResult, type LaunchPlatform } from "./launcher.js";
import { driveIllustratorMouse, type DriveIllustratorMouseResult } from "./mouseAutomation.js";
import { waitForJobResult, type JobStatus } from "./results.js";

export interface IllustratorProbeOptions {
  platform?: LaunchPlatform;
  method?: IllustratorProbeMethod;
  appPath?: string;
  root?: string;
  dryRun?: boolean;
  waitForResult?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  autoConfirmDialog?: boolean;
  dialogTimeoutMs?: number;
  drawCircle?: boolean;
  drawComplex?: boolean;
  mouseProof?: boolean;
  mouseAction?: "move" | "click" | "double-click" | "drag";
  mouseX?: number;
  mouseY?: number;
  mouseToX?: number;
  mouseToY?: number;
  mouseDurationMs?: number;
  mouseWindowTitlePattern?: string;
}

export interface IllustratorAppCandidate {
  name: string;
  appPath: string;
  platform: Exclude<LaunchPlatform, "auto">;
  exists: boolean;
  source: string;
}

export type IllustratorProbeMethod = "auto" | "desktop" | "com";

export interface IllustratorProbeResult {
  ok: boolean;
  communicationConfirmed: boolean;
  platform: Exclude<LaunchPlatform, "auto">;
  method: Exclude<IllustratorProbeMethod, "auto">;
  appPath?: string;
  candidates: IllustratorAppCandidate[];
  job: ReturnType<typeof generatedJobSummary>;
  launch: LaunchJobResult;
  dialogConfirmation?: ConfirmIllustratorDialogResult;
  mouseProof?: DriveIllustratorMouseResult;
  result?: JobStatus;
  waitError?: string;
  next: string[];
}

export async function detectIllustratorApps(platform?: LaunchPlatform): Promise<IllustratorAppCandidate[]> {
  const resolvedPlatform = resolveLaunchPlatform(platform);

  if (resolvedPlatform === "macos") {
    return detectMacIllustratorApps();
  }

  if (resolvedPlatform === "windows" || resolvedPlatform === "wsl") {
    return detectWindowsIllustratorApps(resolvedPlatform);
  }

  return [];
}

export async function probeIllustratorCommunication(options: IllustratorProbeOptions = {}): Promise<IllustratorProbeResult> {
  const platform = resolveLaunchPlatform(options.platform);
  const method = resolveProbeMethod(options.method, platform);
  const candidates = await detectIllustratorApps(platform);
  const appPath = options.appPath ?? candidates.find((candidate) => candidate.exists)?.appPath;
  const drawingMode = probeDrawingMode(options);
  const job = await createGeneratedJob(probeCommand(drawingMode), options.root, { hostPlatform: hostPlatformForJob(platform) });
  const launch =
    method === "com"
      ? await runJsxViaIllustratorCom(job.jobPath, {
          platform,
          dryRun: options.dryRun,
          timeoutMs: options.timeoutMs,
          root: options.root
        })
      : await launchJsxJob(job.jobPath, {
          platform,
          appPath,
          dryRun: options.dryRun,
          root: options.root
        });
  const dialogConfirmation =
    launch.ok && method === "desktop" && options.autoConfirmDialog
      ? await confirmIllustratorDialog({
          platform,
          dryRun: options.dryRun,
          timeoutMs: options.dialogTimeoutMs
        })
      : undefined;
  const mouseProof =
    launch.ok && options.mouseProof
      ? await driveIllustratorMouse({
          platform,
          dryRun: options.dryRun,
          action: options.mouseAction,
          relativeX: options.mouseX,
          relativeY: options.mouseY,
          endRelativeX: options.mouseToX,
          endRelativeY: options.mouseToY,
          durationMs: options.mouseDurationMs,
          windowTitlePattern: options.mouseWindowTitlePattern
        })
      : undefined;
  let result: JobStatus | undefined;
  let waitError: string | undefined;
  if (launch.ok && options.waitForResult && !options.dryRun) {
    try {
      result = await waitForJobResult(job.id, {
        root: options.root,
        timeoutMs: options.timeoutMs,
        intervalMs: options.intervalMs
      });
    } catch (error) {
      waitError = error instanceof Error ? error.message : String(error);
    }
  }
  const communicationConfirmed = Boolean(result?.exists && result.result?.ok === true);
  const mouseConfirmed = options.mouseProof ? mouseProof?.ok === true : true;
  const ok = options.waitForResult && !options.dryRun ? communicationConfirmed && mouseConfirmed : launch.ok && mouseConfirmed;

  return {
    ok,
    communicationConfirmed,
    platform,
    method,
    appPath,
    candidates,
    job: generatedJobSummary(job),
    launch,
    dialogConfirmation,
    mouseProof,
    result,
    waitError,
    next: nextSteps({
      dryRun: Boolean(options.dryRun),
      waitForResult: Boolean(options.waitForResult),
      communicationConfirmed,
      method,
      autoConfirmDialog: Boolean(options.autoConfirmDialog),
      drawingMode,
      mouseProof: Boolean(options.mouseProof),
      launch
    })
  };
}

function resolveProbeMethod(method: IllustratorProbeMethod | undefined, platform: Exclude<LaunchPlatform, "auto">): Exclude<IllustratorProbeMethod, "auto"> {
  const selected = method ?? "auto";
  if (selected === "desktop" || selected === "com") {
    return selected;
  }

  return platform === "windows" || platform === "wsl" ? "com" : "desktop";
}

type ProbeDrawingMode = "ping" | "circle" | "complex";

function probeDrawingMode(options: IllustratorProbeOptions): ProbeDrawingMode {
  if (options.drawComplex) {
    return "complex";
  }

  if (options.drawCircle) {
    return "circle";
  }

  return "ping";
}

function probeCommand(drawingMode: ProbeDrawingMode) {
  if (drawingMode === "ping") {
    return {
      kind: "ping" as const,
      message: `illustrator-agent-bridge communication probe ${new Date().toISOString()}`
    };
  }

  if (drawingMode === "complex") {
    return {
      kind: "cartoon_scene" as const,
      scene: complexProbeScene()
    };
  }

  return {
    kind: "cartoon_scene" as const,
    scene: {
      document: {
        title: "Illustrator Bridge Circle Probe",
        width: 360,
        height: 240,
        colorMode: "RGB" as const
      },
      elements: [
        {
          type: "ellipse" as const,
          name: "communication proof circle",
          x: 110,
          y: 50,
          width: 140,
          height: 140,
          style: {
            fill: "#8DD6C8",
            stroke: "#1D1B1B",
            strokeWidth: 5,
            opacity: 100
          }
        }
      ]
    }
  };
}

function complexProbeScene() {
  return {
    document: {
      title: "Illustrator Bridge Complex Shape Probe",
      width: 640,
      height: 420,
      colorMode: "RGB" as const
    },
    elements: [
      {
        type: "rect" as const,
        name: "complex proof background",
        x: 0,
        y: 0,
        width: 640,
        height: 420,
        style: { fill: "#F8FBFF", stroke: null, strokeWidth: 0 }
      },
      {
        type: "path" as const,
        name: "complex proof curved ribbon",
        x: 0,
        y: 0,
        closed: false,
        points: [
          { x: 70, y: 120, rightX: 150, rightY: 30, pointType: "smooth" as const },
          { x: 260, y: 115, leftX: 180, leftY: 210, rightX: 330, rightY: 35, pointType: "smooth" as const },
          { x: 470, y: 140, leftX: 390, leftY: 230, rightX: 560, rightY: 50, pointType: "smooth" as const }
        ],
        style: { fill: null, stroke: "#2667FF", strokeWidth: 14, opacity: 85 }
      },
      {
        type: "polygon" as const,
        name: "complex proof star",
        x: 0,
        y: 0,
        points: [
          { x: 508, y: 62 },
          { x: 523, y: 101 },
          { x: 565, y: 104 },
          { x: 532, y: 130 },
          { x: 542, y: 171 },
          { x: 508, y: 148 },
          { x: 473, y: 171 },
          { x: 484, y: 130 },
          { x: 450, y: 104 },
          { x: 493, y: 101 }
        ],
        style: { fill: "#FFD166", stroke: "#6C4A00", strokeWidth: 4 }
      },
      {
        type: "path" as const,
        name: "complex proof flask body",
        x: 0,
        y: 0,
        closed: true,
        points: [
          { x: 188, y: 128, rightX: 188, rightY: 172, pointType: "smooth" as const },
          { x: 116, y: 306, leftX: 104, leftY: 232, rightX: 90, rightY: 360, pointType: "smooth" as const },
          { x: 295, y: 306, leftX: 172, leftY: 382, rightX: 324, rightY: 356, pointType: "smooth" as const },
          { x: 224, y: 128, leftX: 246, leftY: 230, pointType: "smooth" as const }
        ],
        style: { fill: "#8DD6C8", stroke: "#1D1B1B", strokeWidth: 5, opacity: 92 }
      },
      {
        type: "rect" as const,
        name: "complex proof flask neck",
        x: 184,
        y: 76,
        width: 48,
        height: 70,
        style: { fill: "#E9FFFB", stroke: "#1D1B1B", strokeWidth: 5, opacity: 95 }
      },
      {
        type: "ellipse" as const,
        name: "complex proof bubble large",
        x: 250,
        y: 178,
        width: 38,
        height: 38,
        style: { fill: "#FFFFFF", stroke: "#166B61", strokeWidth: 3, opacity: 76 }
      },
      {
        type: "ellipse" as const,
        name: "complex proof bubble small",
        x: 184,
        y: 224,
        width: 24,
        height: 24,
        style: { fill: "#FFFFFF", stroke: "#166B61", strokeWidth: 3, opacity: 76 }
      },
      {
        type: "line" as const,
        name: "complex proof molecule bond",
        x: 386,
        y: 250,
        x2: 490,
        y2: 302,
        style: { fill: null, stroke: "#2D2A32", strokeWidth: 5 }
      },
      {
        type: "ellipse" as const,
        name: "complex proof molecule node a",
        x: 354,
        y: 222,
        width: 54,
        height: 54,
        style: { fill: "#EF476F", stroke: "#2D2A32", strokeWidth: 4 }
      },
      {
        type: "ellipse" as const,
        name: "complex proof molecule node b",
        x: 478,
        y: 282,
        width: 54,
        height: 54,
        style: { fill: "#06D6A0", stroke: "#2D2A32", strokeWidth: 4 }
      },
      {
        type: "text" as const,
        name: "complex proof label",
        x: 72,
        y: 365,
        text: "complex vector probe",
        size: 24,
        style: { fill: "#1D1B1B", stroke: null, strokeWidth: 0 }
      }
    ]
  };
}

function hostPlatformForJob(platform: Exclude<LaunchPlatform, "auto">): IllustratorHostPlatform {
  return platform === "wsl" ? "wsl" : platform;
}

async function detectMacIllustratorApps(): Promise<IllustratorAppCandidate[]> {
  const applications = "/Applications";
  const candidates: IllustratorAppCandidate[] = [];

  try {
    const entries = await readdir(applications);
    for (const entry of entries) {
      if (!/^Adobe Illustrator/i.test(entry)) {
        continue;
      }

      const appPath = join(applications, entry, "Adobe Illustrator.app");
      candidates.push({
        name: entry,
        appPath,
        platform: "macos",
        exists: await isExistingPath(appPath),
        source: applications
      });
    }
  } catch {
    // Missing /Applications is normal on non-macOS test hosts.
  }

  candidates.push({
    name: "Adobe Illustrator",
    appPath: "Adobe Illustrator",
    platform: "macos",
    exists: false,
    source: "default app name"
  });
  return uniqueCandidates(candidates);
}

async function detectWindowsIllustratorApps(platform: "windows" | "wsl"): Promise<IllustratorAppCandidate[]> {
  const roots = platform === "wsl" ? ["/mnt/c/Program Files/Adobe", "/mnt/c/Program Files (x86)/Adobe"] : ["C:/Program Files/Adobe", "C:/Program Files (x86)/Adobe"];
  const candidates: IllustratorAppCandidate[] = [];

  for (const root of roots) {
    try {
      const entries = await readdir(root);
      for (const entry of entries) {
        if (!/^Adobe Illustrator/i.test(entry)) {
          continue;
        }

        const localExe = join(root, entry, "Support Files", "Contents", "Windows", "Illustrator.exe");
        candidates.push({
          name: entry,
          appPath: platform === "wsl" ? toIllustratorPath(localExe, "windows") : localExe.replace(/\\/g, "/"),
          platform,
          exists: await isExistingPath(localExe),
          source: root
        });
      }
    } catch {
      // Missing Adobe install roots are expected on systems without Illustrator.
    }
  }

  return uniqueCandidates(candidates);
}

async function isExistingPath(path: string): Promise<boolean> {
  try {
    const pathStat = await stat(path);
    return pathStat.isFile() || pathStat.isDirectory();
  } catch {
    return existsSync(path);
  }
}

function uniqueCandidates(candidates: IllustratorAppCandidate[]): IllustratorAppCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.platform}:${candidate.appPath}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function nextSteps(options: {
  dryRun: boolean;
  waitForResult: boolean;
  communicationConfirmed: boolean;
  method: Exclude<IllustratorProbeMethod, "auto">;
  autoConfirmDialog: boolean;
  drawingMode: ProbeDrawingMode;
  mouseProof: boolean;
  launch: LaunchJobResult;
}): string[] {
  if (options.dryRun) {
    return [
      options.method === "com" ? "Run the probe without dryRun to execute the JSX through Illustrator COM automation." : "Run the probe without dryRun to open Illustrator through the host desktop.",
      options.launch.next.waitForResult
    ];
  }

  if (options.communicationConfirmed) {
    const messages = [
      options.drawingMode === "complex"
        ? "Illustrator wrote the complex-shape probe result JSON. Local bridge communication and multi-element vector drawing are confirmed."
        : options.drawingMode === "circle"
        ? "Illustrator wrote the circle probe result JSON. Local bridge communication and circle drawing are confirmed."
        : "Illustrator wrote the probe result JSON. Local bridge communication is confirmed."
    ];
    if (options.mouseProof) {
      messages.push("The requested mouse proof was attempted; inspect mouseProof.ok for live pointer-control confirmation.");
    }
    return messages;
  }

  if (options.waitForResult) {
    return [
      "Illustrator did not write the probe result before the timeout.",
      options.autoConfirmDialog
        ? "If Illustrator opened, inspect any remaining Adobe prompt; auto-confirm did not produce a result yet."
        : options.method === "com"
          ? "COM execution returned but Illustrator did not write the result JSON; inspect the JSX result path and Illustrator scripting errors."
          : "If Illustrator opened, approve any script warning or rerun with auto-confirm enabled, then confirm it can access the bridge result path.",
      options.launch.next.waitForResult
    ];
  }

  return [
    options.method === "com"
      ? "If Illustrator opened, wait for COM script execution to finish."
      : options.autoConfirmDialog
      ? "If Illustrator opened, wait for any auto-confirmed script to finish."
      : "If Illustrator opened, approve any script warning or rerun with auto-confirm enabled.",
    options.launch.next.waitForResult,
    "The result JSON with ok=true is the communication proof."
  ];
}
