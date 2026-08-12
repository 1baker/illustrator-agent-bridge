import { isAbsolute, resolve } from "node:path";
import { runJsxViaIllustratorCom } from "../bridge/comAutomation.js";
import { launchJsxJob, resolveLaunchPlatform, type LaunchJobResult, type LaunchPlatform } from "../bridge/launcher.js";
import { waitForJobResult, type JobStatus } from "../bridge/results.js";
import type { ExportFormat } from "../bridge/types.js";
import { reviewArtworkQuality, type ArtworkReviewReport } from "../qa/artworkReviewGuard.js";
import { inspectExportArtifact, type ExportQaReport } from "../qa/exportQa.js";
import { prepareObjectShapeWorkflow, type ObjectShapeWorkflow, type PrepareObjectShapeWorkflowOptions } from "./objectWorkflow.js";

export type ObjectWorkflowRunMode = "launch" | "com";

export interface ExecuteObjectShapeWorkflowOptions extends PrepareObjectShapeWorkflowOptions {
  launchPlatform?: LaunchPlatform;
  appPath?: string;
  dryRun?: boolean;
  waitForResults?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  skipQa?: boolean;
  minBytes?: number;
  minWidth?: number;
  minHeight?: number;
  minNonBlankRatio?: number;
  runMode?: ObjectWorkflowRunMode;
  skipArtworkReview?: boolean;
}

export interface ObjectShapeWorkflowExecution {
  ok: boolean;
  dryRun: boolean;
  runMode: ObjectWorkflowRunMode;
  workflow: ObjectShapeWorkflow;
  sceneLaunch?: LaunchJobResult;
  sceneResult?: JobStatus;
  exportLaunch?: LaunchJobResult;
  exportResult?: JobStatus;
  exportQa?: ExportQaReport;
  artworkReview?: ArtworkReviewReport;
  next: string[];
}

export async function executeObjectShapeWorkflow(options: ExecuteObjectShapeWorkflowOptions): Promise<ObjectShapeWorkflowExecution> {
  const dryRun = options.dryRun ?? false;
  const runMode = options.runMode ?? "launch";
  const waitForResults = !dryRun && (options.waitForResults ?? true);
  const workflow = await prepareObjectShapeWorkflow(options);

  if (!workflow.plan.guard.ok) {
    return {
      ok: false,
      dryRun,
      runMode,
      workflow,
      next: [workflow.plan.guard.nextGoalPrompt ?? "Revise the object scene until the guard passes before running Illustrator."]
    };
  }

  const sceneLaunch = await runWorkflowJob(workflow.sceneJob.jobPath, runMode, options);
  if (!sceneLaunch.ok) {
    return {
      ok: false,
      dryRun,
      runMode,
      workflow,
      sceneLaunch,
      next: ["Fix the object scene launch failure before launching export."]
    };
  }

  const sceneResult = waitForResults
    ? await waitForJobResult(workflow.sceneJob.id, {
        root: options.root,
        timeoutMs: options.timeoutMs,
        intervalMs: options.intervalMs
      })
    : undefined;

  if (sceneResult?.result?.ok === false) {
    return {
      ok: false,
      dryRun,
      runMode,
      workflow,
      sceneLaunch,
      sceneResult,
      next: ["Fix the object scene job failure before launching export."]
    };
  }

  const exportLaunch = await runWorkflowJob(workflow.exportJob.jobPath, runMode, options);
  if (!exportLaunch.ok) {
    return {
      ok: false,
      dryRun,
      runMode,
      workflow,
      sceneLaunch,
      sceneResult,
      exportLaunch,
      next: ["Fix the object export launch failure before waiting for export output."]
    };
  }

  const exportResult = waitForResults
    ? await waitForJobResult(workflow.exportJob.id, {
        root: options.root,
        timeoutMs: options.timeoutMs,
        intervalMs: options.intervalMs
      })
    : undefined;

  if (exportResult?.result?.ok === false) {
    return {
      ok: false,
      dryRun,
      runMode,
      workflow,
      sceneLaunch,
      sceneResult,
      exportLaunch,
      exportResult,
      next: ["Fix the object export job failure before running artifact QA."]
    };
  }

  const exportQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(resolveOutputArtifactPath(options.outputPath), {
          format: workflowExportFormat(options.format),
          minBytes: options.minBytes,
          minWidth: options.minWidth,
          minHeight: options.minHeight,
          minNonBlankRatio: options.minNonBlankRatio
        })
      : undefined;
  const artworkReview =
    waitForResults && !options.skipQa && !options.skipArtworkReview
      ? reviewArtworkQuality({
          prompt: workflow.prompt,
          scene: workflow.plan.scene,
          exportQa,
          target: workflow.plan.target
        })
      : undefined;

  return {
    ok:
      sceneLaunch.ok &&
      exportLaunch.ok &&
      (sceneResult?.result?.ok ?? true) &&
      (exportResult?.result?.ok ?? true) &&
      (exportQa?.ok ?? true) &&
      (artworkReview?.ok ?? true),
    dryRun,
    runMode,
    workflow,
    sceneLaunch,
    sceneResult,
    exportLaunch,
    exportResult,
    exportQa,
    artworkReview,
    next: nextSteps(dryRun, waitForResults, Boolean(options.skipQa), sceneLaunch, exportLaunch, artworkReview)
  };
}

async function runWorkflowJob(
  jobPath: string,
  runMode: ObjectWorkflowRunMode,
  options: ExecuteObjectShapeWorkflowOptions
): Promise<LaunchJobResult> {
  if (runMode === "com") {
    return runJsxViaIllustratorCom(jobPath, {
      platform: resolveLaunchPlatform(options.launchPlatform),
      dryRun: options.dryRun,
      timeoutMs: options.timeoutMs,
      root: options.root
    });
  }

  return launchJsxJob(jobPath, {
    platform: options.launchPlatform,
    appPath: options.appPath,
    dryRun: options.dryRun,
    root: options.root
  });
}

function workflowExportFormat(format: ExportFormat | undefined): ExportFormat {
  return format ?? "png";
}

function resolveOutputArtifactPath(outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath);
}

function nextSteps(
  dryRun: boolean,
  waitForResults: boolean,
  skipQa: boolean,
  sceneLaunch: LaunchJobResult,
  exportLaunch: LaunchJobResult,
  artworkReview?: ArtworkReviewReport
): string[] {
  if (dryRun) {
    return [
      "Run the same object workflow without dryRun after Illustrator is open.",
      sceneLaunch.next.waitForResult,
      exportLaunch.next.waitForResult
    ];
  }

  if (!waitForResults) {
    return [sceneLaunch.next.waitForResult, exportLaunch.next.waitForResult];
  }

  if (artworkReview && !artworkReview.ok && artworkReview.nextGoalPrompt) {
    return [artworkReview.nextGoalPrompt];
  }

  return skipQa ? ["Run qa:export on the exported object artifact before accepting it."] : ["Review exported object artwork visually before accepting it."];
}
