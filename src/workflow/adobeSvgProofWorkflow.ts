import { extname, isAbsolute, resolve } from "node:path";
import { runJsxViaIllustratorCom } from "../bridge/comAutomation.js";
import { createGeneratedJob } from "../bridge/jobs.js";
import { generatedJobSummary } from "../bridge/jsxGenerator.js";
import { launchJsxJob, resolveLaunchPlatform, type LaunchJobResult, type LaunchPlatform } from "../bridge/launcher.js";
import { runJsxViaPhotoshopCom } from "../bridge/photoshopComAutomation.js";
import { createGeneratedPhotoshopJob } from "../bridge/photoshopJobs.js";
import { generatedPhotoshopJobSummary } from "../bridge/photoshopJsxGenerator.js";
import { waitForJobResult, type JobStatus } from "../bridge/results.js";
import type { CartoonScene, GeneratedJob } from "../bridge/types.js";
import type { CartoonPlan } from "../planner/cartoonPlanner.js";
import { planGenericObjectScene, type GenericObjectPlan } from "../planner/genericObjectPlanner.js";
import { inferObjectShapeTarget, ObjectShapePlannerError, planObjectShapeScene, type ObjectShapePlan } from "../planner/objectShapePlanner.js";
import { planCartoonSceneWithMode, type PlannerMode } from "../planner/plannerRouter.js";
import { planScientificConceptScene, type ScientificConceptPlan } from "../planner/scientificConceptPlanner.js";
import { reviewArtworkQuality, type ArtworkReviewReport } from "../qa/artworkReviewGuard.js";
import { inspectExportArtifact, type ExportQaReport } from "../qa/exportQa.js";
import { loadDefaultCorpus } from "../semantic/search.js";
import type { SemanticItem } from "../semantic/types.js";

export type AdobeArtworkIntent = "auto" | "cartoon" | "scientific" | "object";
export type AdobeSvgProofRunMode = "launch" | "com";
export type AdobeArtworkPlan = CartoonPlan | ScientificConceptPlan | ObjectShapePlan | GenericObjectPlan;

export interface PrepareAdobeSvgProofWorkflowOptions {
  prompt: string;
  outputPath: string;
  proofPngPath?: string;
  root?: string;
  width?: number;
  height?: number;
  title?: string;
  corpusPath?: string;
  intent?: AdobeArtworkIntent;
  plannerMode?: PlannerMode;
  openAiModel?: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  proofWidth?: number;
  proofHeight?: number;
  proofResolution?: number;
}

export interface AdobeSvgProofWorkflow {
  ok: true;
  prompt: string;
  intent: Exclude<AdobeArtworkIntent, "auto">;
  outputPath: string;
  proofPngPath: string;
  plan: AdobeArtworkPlan;
  sceneJob: ReturnType<typeof generatedJobSummary>;
  exportJob: ReturnType<typeof generatedJobSummary>;
  photoshopProofJob: ReturnType<typeof generatedPhotoshopJobSummary>;
  runbook: AdobeSvgProofWorkflowStep[];
}

export interface AdobeSvgProofWorkflowStep {
  step: number;
  action: string;
  jobId?: string;
  scriptPath?: string;
  resultPath?: string;
  expected?: string;
}

export interface ExecuteAdobeSvgProofWorkflowOptions extends PrepareAdobeSvgProofWorkflowOptions {
  launchPlatform?: LaunchPlatform;
  appPath?: string;
  illustratorRunMode?: AdobeSvgProofRunMode;
  photoshopPlatform?: LaunchPlatform;
  dryRun?: boolean;
  waitForResults?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  skipQa?: boolean;
  skipArtworkReview?: boolean;
  minBytes?: number;
  minWidth?: number;
  minHeight?: number;
  minNonBlankRatio?: number;
  proofMinWidth?: number;
  proofMinHeight?: number;
  proofMinNonBlankRatio?: number;
  maxReviewIterations?: number;
}

export interface AdobeSvgProofReviewIteration {
  attempt: number;
  prompt: string;
  workflowPrompt: string;
  intent: Exclude<AdobeArtworkIntent, "auto">;
  ok: boolean;
  exportQaOk?: boolean;
  proofQaOk?: boolean;
  artworkReviewOk?: boolean;
  nextGoalPrompt: string | null;
}

export interface AdobeSvgProofWorkflowExecution {
  ok: boolean;
  dryRun: boolean;
  illustratorRunMode: AdobeSvgProofRunMode;
  photoshopRunMode: "com";
  workflow: AdobeSvgProofWorkflow;
  sceneLaunch?: LaunchJobResult;
  sceneResult?: JobStatus;
  exportLaunch?: LaunchJobResult;
  exportResult?: JobStatus;
  exportQa?: ExportQaReport;
  photoshopLaunch?: LaunchJobResult;
  photoshopResult?: JobStatus;
  proofQa?: ExportQaReport;
  artworkReview?: ArtworkReviewReport;
  reviewIterations: AdobeSvgProofReviewIteration[];
  next: string[];
}

export async function prepareAdobeSvgProofWorkflow(options: PrepareAdobeSvgProofWorkflowOptions): Promise<AdobeSvgProofWorkflow> {
  const outputPath = resolveOutputPath(options.outputPath);
  const proofPngPath = resolveOutputPath(options.proofPngPath ?? defaultProofPath(outputPath));
  const corpus = await loadDefaultCorpus(options.corpusPath);
  const planned = await planAdobeArtworkScene(options.prompt, corpus, options);
  const sceneJob = await createGeneratedJob({ kind: "cartoon_scene", scene: planned.scene }, options.root);
  const exportJob = await createGeneratedJob(
    {
      kind: "export",
      format: "svg",
      outputPath
    },
    options.root
  );
  const photoshopProofJob = await createGeneratedPhotoshopJob(
    {
      kind: "svg_proof",
      inputPath: outputPath,
      outputPath: proofPngPath,
      width: options.proofWidth,
      height: options.proofHeight,
      resolution: options.proofResolution
    },
    options.root
  );

  return {
    ok: true,
    prompt: planned.plan.prompt,
    intent: planned.intent,
    outputPath,
    proofPngPath,
    plan: planned.plan,
    sceneJob: generatedJobSummary(sceneJob),
    exportJob: generatedJobSummary(exportJob),
    photoshopProofJob: generatedPhotoshopJobSummary(photoshopProofJob),
    runbook: buildRunbook(sceneJob, exportJob, photoshopProofJob, outputPath, proofPngPath)
  };
}

export async function executeAdobeSvgProofWorkflow(options: ExecuteAdobeSvgProofWorkflowOptions): Promise<AdobeSvgProofWorkflowExecution> {
  const maxReviewIterations = normalizeMaxReviewIterations(options.maxReviewIterations);
  const reviewIterations: AdobeSvgProofReviewIteration[] = [];
  let currentPrompt = options.prompt;
  let finalExecution: AdobeSvgProofWorkflowExecution | undefined;

  for (let attempt = 1; attempt <= maxReviewIterations; attempt += 1) {
    const execution = await executeAdobeSvgProofWorkflowAttempt({ ...options, prompt: currentPrompt });
    const nextGoalPrompt = execution.artworkReview?.nextGoalPrompt ?? null;
    reviewIterations.push(reviewIteration(attempt, currentPrompt, execution, nextGoalPrompt));
    finalExecution = execution;

    if (!shouldRunReviewIteration(execution, nextGoalPrompt, attempt, maxReviewIterations)) {
      break;
    }

    currentPrompt = nextGoalPrompt;
  }

  if (!finalExecution) {
    throw new Error("Adobe SVG proof workflow did not execute any review iteration.");
  }

  return {
    ...finalExecution,
    reviewIterations,
    next: finalNextSteps(finalExecution.next, reviewIterations)
  };
}

async function executeAdobeSvgProofWorkflowAttempt(options: ExecuteAdobeSvgProofWorkflowOptions): Promise<AdobeSvgProofWorkflowExecution> {
  const dryRun = options.dryRun ?? false;
  const illustratorRunMode = options.illustratorRunMode ?? "launch";
  const waitForResults = !dryRun && (options.waitForResults ?? true);
  const workflow = await prepareAdobeSvgProofWorkflow(options);

  if (isObjectPlan(workflow.plan) && !workflow.plan.guard.ok) {
    return {
      ok: false,
      dryRun,
      illustratorRunMode,
      photoshopRunMode: "com",
      workflow,
      reviewIterations: [],
      next: [workflow.plan.guard.nextGoalPrompt ?? "Revise the object scene until the shape guard passes before launching Illustrator."]
    };
  }

  const sceneLaunch = await runIllustratorWorkflowJob(workflow.sceneJob.jobPath, illustratorRunMode, options);
  if (!sceneLaunch.ok) {
    return {
      ok: false,
      dryRun,
      illustratorRunMode,
      photoshopRunMode: "com",
      workflow,
      sceneLaunch,
      reviewIterations: [],
      next: ["Fix the Illustrator scene launch failure before exporting SVG."]
    };
  }

  const sceneResult = waitForResults ? await waitForJob(workflow.sceneJob.id, options) : undefined;
  if (sceneResult?.result?.ok === false) {
    return {
      ok: false,
      dryRun,
      illustratorRunMode,
      photoshopRunMode: "com",
      workflow,
      sceneLaunch,
      sceneResult,
      reviewIterations: [],
      next: ["Fix the Illustrator scene job failure before exporting SVG."]
    };
  }

  const exportLaunch = await runIllustratorWorkflowJob(workflow.exportJob.jobPath, illustratorRunMode, options);
  if (!exportLaunch.ok) {
    return {
      ok: false,
      dryRun,
      illustratorRunMode,
      photoshopRunMode: "com",
      workflow,
      sceneLaunch,
      sceneResult,
      exportLaunch,
      reviewIterations: [],
      next: ["Fix the Illustrator SVG export launch failure before Photoshop proofing."]
    };
  }

  const exportResult = waitForResults ? await waitForJob(workflow.exportJob.id, options) : undefined;
  if (exportResult?.result?.ok === false) {
    return {
      ok: false,
      dryRun,
      illustratorRunMode,
      photoshopRunMode: "com",
      workflow,
      sceneLaunch,
      sceneResult,
      exportLaunch,
      exportResult,
      reviewIterations: [],
      next: ["Fix the Illustrator SVG export job failure before Photoshop proofing."]
    };
  }

  const exportQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(workflow.outputPath, {
          format: "svg",
          minBytes: options.minBytes
        })
      : undefined;
  if (exportQa && !exportQa.ok) {
    return {
      ok: false,
      dryRun,
      illustratorRunMode,
      photoshopRunMode: "com",
      workflow,
      sceneLaunch,
      sceneResult,
      exportLaunch,
      exportResult,
      exportQa,
      reviewIterations: [],
      next: ["Fix the SVG export QA failure before opening the artwork in Photoshop."]
    };
  }

  const photoshopLaunch = await runJsxViaPhotoshopCom(workflow.photoshopProofJob.jobPath, {
    platform: resolveLaunchPlatform(options.photoshopPlatform ?? options.launchPlatform),
    dryRun,
    timeoutMs: options.timeoutMs,
    root: options.root
  });
  if (!photoshopLaunch.ok) {
    return {
      ok: false,
      dryRun,
      illustratorRunMode,
      photoshopRunMode: "com",
      workflow,
      sceneLaunch,
      sceneResult,
      exportLaunch,
      exportResult,
      exportQa,
      photoshopLaunch,
      reviewIterations: [],
      next: ["Fix the Photoshop proof launch failure before reviewing the SVG rasterization."]
    };
  }

  const photoshopResult = waitForResults ? await waitForJob(workflow.photoshopProofJob.id, options) : undefined;
  if (photoshopResult?.result?.ok === false) {
    return {
      ok: false,
      dryRun,
      illustratorRunMode,
      photoshopRunMode: "com",
      workflow,
      sceneLaunch,
      sceneResult,
      exportLaunch,
      exportResult,
      exportQa,
      photoshopLaunch,
      photoshopResult,
      reviewIterations: [],
      next: ["Fix the Photoshop SVG proof job failure before accepting the SVG."]
    };
  }

  const proofQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(workflow.proofPngPath, {
          format: "png",
          minBytes: options.minBytes,
          minWidth: options.proofMinWidth ?? options.minWidth,
          minHeight: options.proofMinHeight ?? options.minHeight,
          minNonBlankRatio: options.proofMinNonBlankRatio ?? options.minNonBlankRatio
        })
      : undefined;
  const artworkReview =
    waitForResults && !options.skipQa && !options.skipArtworkReview
      ? reviewArtworkQuality({
          prompt: workflow.prompt,
          scene: sceneForPlan(workflow.plan),
          exportQa: proofQa,
          target: isObjectPlan(workflow.plan) ? workflow.plan.target : undefined
        })
      : undefined;

  const artworkReviewClean = artworkReview ? artworkReview.ok && !shouldReviseArtworkFromReview(artworkReview) : true;

  return {
    ok:
      sceneLaunch.ok &&
      exportLaunch.ok &&
      photoshopLaunch.ok &&
      (sceneResult?.result?.ok ?? true) &&
      (exportResult?.result?.ok ?? true) &&
      (photoshopResult?.result?.ok ?? true) &&
      (exportQa?.ok ?? true) &&
      (proofQa?.ok ?? true) &&
      artworkReviewClean,
    dryRun,
    illustratorRunMode,
    photoshopRunMode: "com",
    workflow,
    sceneLaunch,
    sceneResult,
    exportLaunch,
    exportResult,
    exportQa,
    photoshopLaunch,
    photoshopResult,
    proofQa,
    artworkReview,
    reviewIterations: [],
    next: nextSteps(dryRun, waitForResults, Boolean(options.skipQa), sceneLaunch, exportLaunch, photoshopLaunch, artworkReview)
  };
}

export async function planAdobeArtworkScene(
  prompt: string,
  corpus: SemanticItem[],
  options: PrepareAdobeSvgProofWorkflowOptions
): Promise<{ intent: Exclude<AdobeArtworkIntent, "auto">; plan: AdobeArtworkPlan; scene: CartoonScene }> {
  const intent = resolveIntent(prompt, options.intent);

  if (intent === "object") {
    const objectOptions = {
      width: options.width,
      height: options.height,
      title: options.title
    };
    const plan = planStrictObjectShapeSceneOrGeneric(prompt, corpus, objectOptions);
    return { intent, plan, scene: plan.scene };
  }

  if (intent === "scientific") {
    const plan = planScientificConceptScene(prompt, corpus, {
      width: options.width,
      height: options.height,
      title: options.title
    });
    return { intent, plan, scene: plan.scene };
  }

  const plan = await planCartoonSceneWithMode(prompt, corpus, {
    width: options.width,
    height: options.height,
    title: options.title,
    plannerMode: options.plannerMode,
    openAiModel: options.openAiModel,
    openAiApiKey: options.openAiApiKey,
    openAiBaseUrl: options.openAiBaseUrl
  });
  return { intent, plan, scene: plan.scene };
}

function resolveIntent(prompt: string, intent: AdobeArtworkIntent | undefined): Exclude<AdobeArtworkIntent, "auto"> {
  if (intent && intent !== "auto") {
    return intent;
  }

  try {
    inferObjectShapeTarget(prompt);
    return "object";
  } catch (error) {
    if (!(error instanceof ObjectShapePlannerError)) {
      throw error;
    }
  }

  if (looksScientific(prompt) && !looksGenericObjectPrompt(prompt)) {
    return "scientific";
  }

  if (looksGenericObjectPrompt(prompt)) {
    return "object";
  }

  if (looksScientific(prompt)) {
    return "scientific";
  }

  return "cartoon";
}

function looksScientific(prompt: string): boolean {
  return /\b(scientific|concept|polymer|emulsion|molecular|cataly(?:st|sis|tic)|reaction|membrane|electron|phase|biobased|bio-based|latex|micelle|surfactant|protein|cell|redox|monomer|initiator)\b/i.test(
    prompt
  );
}

function looksGenericObjectPrompt(prompt: string): boolean {
  return /\b(object|icon|shape|silhouette|device|machine|instrument|equipment|apparatus|tool|microscope|objective|eyepiece|reactor|bioreactor|fermenter|vessel|tank|impeller|baffle|gear|engine|motor|robot|drone|pump|valve|sensor|assembly)\b/i.test(
    prompt
  );
}

function planStrictObjectShapeSceneOrGeneric(
  prompt: string,
  corpus: SemanticItem[],
  options: { width?: number; height?: number; title?: string }
): ObjectShapePlan | GenericObjectPlan {
  try {
    return planObjectShapeScene(prompt, corpus, options);
  } catch (error) {
    if (!(error instanceof ObjectShapePlannerError) || prompt.trim().length === 0) {
      throw error;
    }
    return planGenericObjectScene(prompt, corpus, options);
  }
}

async function runIllustratorWorkflowJob(
  jobPath: string,
  runMode: AdobeSvgProofRunMode,
  options: ExecuteAdobeSvgProofWorkflowOptions
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

async function waitForJob(jobId: string, options: ExecuteAdobeSvgProofWorkflowOptions): Promise<JobStatus> {
  return waitForJobResult(jobId, {
    root: options.root,
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs
  });
}

function sceneForPlan(plan: AdobeArtworkPlan): CartoonScene {
  return plan.scene;
}

function isObjectPlan(plan: AdobeArtworkPlan): plan is ObjectShapePlan {
  return "guard" in plan && "target" in plan;
}

function buildRunbook(
  sceneJob: GeneratedJob,
  exportJob: GeneratedJob,
  photoshopProofJob: { id: string; jobPath: string; resultPath: string; photoshopJobPath: string; photoshopResultPath: string },
  outputPath: string,
  proofPngPath: string
): AdobeSvgProofWorkflowStep[] {
  return [
    {
      step: 1,
      action: "Run the Illustrator scene JSX with job:run-com, bridge_run_job_via_com, or desktop launch.",
      jobId: sceneJob.id,
      scriptPath: sceneJob.illustratorJobPath,
      resultPath: sceneJob.resultPath,
      expected: "Scene job result JSON exists with ok=true and kind=cartoon_scene."
    },
    {
      step: 2,
      action: "Wait for the Illustrator scene result before exporting.",
      jobId: sceneJob.id,
      resultPath: sceneJob.resultPath,
      expected: "Use job:wait or bridge_wait_for_job_result."
    },
    {
      step: 3,
      action: `Run the Illustrator export JSX to write the editable SVG at ${outputPath}.`,
      jobId: exportJob.id,
      scriptPath: exportJob.illustratorJobPath,
      resultPath: exportJob.resultPath,
      expected: "SVG export job result JSON exists with ok=true and kind=export."
    },
    {
      step: 4,
      action: "Run SVG export QA before Photoshop proofing.",
      expected: "SVG file exists, is non-empty, and parses as an SVG artifact."
    },
    {
      step: 5,
      action: `Run the Photoshop proof JSX with job:run-photoshop-com to rasterize the SVG into ${proofPngPath}.`,
      jobId: photoshopProofJob.id,
      scriptPath: photoshopProofJob.photoshopJobPath,
      resultPath: photoshopProofJob.resultPath,
      expected: "Photoshop proof job result JSON exists with ok=true and kind=svg_proof."
    },
    {
      step: 6,
      action: "Run PNG proof QA and artwork review; feed review.nextGoalPrompt into the next Illustrator planning pass until no actionable review prompt remains.",
      expected: "The SVG remains the editable source of truth; the Photoshop PNG is the rasterization proof."
    }
  ];
}

function nextSteps(
  dryRun: boolean,
  waitForResults: boolean,
  skipQa: boolean,
  sceneLaunch: LaunchJobResult,
  exportLaunch: LaunchJobResult,
  photoshopLaunch: LaunchJobResult,
  artworkReview?: ArtworkReviewReport
): string[] {
  if (dryRun) {
    return [
      "Run the same Adobe SVG proof workflow without dryRun after Illustrator and Photoshop are available.",
      sceneLaunch.next.waitForResult,
      exportLaunch.next.waitForResult,
      photoshopLaunch.next.waitForResult
    ];
  }

  if (!waitForResults) {
    return [sceneLaunch.next.waitForResult, exportLaunch.next.waitForResult, photoshopLaunch.next.waitForResult];
  }

  if (artworkReview && shouldReviseArtworkFromReview(artworkReview)) {
    return [artworkReview.nextGoalPrompt];
  }

  return skipQa
    ? ["Run qa:export on the SVG and Photoshop proof PNG before accepting the artwork."]
    : ["Use the Illustrator SVG as the editable source of truth and inspect the Photoshop PNG proof for rasterization issues."];
}

function reviewIteration(
  attempt: number,
  prompt: string,
  execution: AdobeSvgProofWorkflowExecution,
  nextGoalPrompt: string | null
): AdobeSvgProofReviewIteration {
  return {
    attempt,
    prompt,
    workflowPrompt: execution.workflow.prompt,
    intent: execution.workflow.intent,
    ok: execution.ok,
    exportQaOk: execution.exportQa?.ok,
    proofQaOk: execution.proofQa?.ok,
    artworkReviewOk: execution.artworkReview?.ok,
    nextGoalPrompt
  };
}

function shouldRunReviewIteration(
  execution: AdobeSvgProofWorkflowExecution,
  nextGoalPrompt: string | null,
  attempt: number,
  maxReviewIterations: number
): nextGoalPrompt is string {
  return Boolean(
    attempt < maxReviewIterations &&
      execution.artworkReview &&
      shouldReviseArtworkFromReview(execution.artworkReview) &&
      nextGoalPrompt &&
      nextGoalPrompt.trim().length > 0
  );
}

export function shouldReviseArtworkFromReview(artworkReview: ArtworkReviewReport | undefined): artworkReview is ArtworkReviewReport & { nextGoalPrompt: string } {
  return Boolean(artworkReview?.nextGoalPrompt && artworkReview.nextGoalPrompt.trim().length > 0);
}

function finalNextSteps(next: string[], reviewIterations: AdobeSvgProofReviewIteration[]): string[] {
  if (reviewIterations.length <= 1) {
    return next;
  }

  const last = reviewIterations[reviewIterations.length - 1];
  const summary = last?.ok
    ? `Adobe SVG proof review passed after ${reviewIterations.length} iteration(s).`
    : `Adobe SVG proof review stopped after ${reviewIterations.length} iteration(s); use the latest nextGoalPrompt for another Illustrator revision.`;

  return [summary, ...next];
}

function normalizeMaxReviewIterations(value: number | undefined): number {
  if (value === undefined) {
    return 1;
  }

  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("maxReviewIterations must be an integer from 1 to 10.");
  }

  return value;
}

function resolveOutputPath(outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath);
}

function defaultProofPath(outputPath: string): string {
  const extension = extname(outputPath);
  if (!extension) {
    return `${outputPath}.photoshop-proof.png`;
  }

  return `${outputPath.slice(0, -extension.length)}.photoshop-proof.png`;
}
