import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { runJsxViaIllustratorCom } from "../bridge/comAutomation.js";
import { createGeneratedJob } from "../bridge/jobs.js";
import { generatedJobSummary } from "../bridge/jsxGenerator.js";
import { launchJsxJob, resolveLaunchPlatform, type LaunchJobResult, type LaunchPlatform } from "../bridge/launcher.js";
import { driveIllustratorMouse, drivePhotoshopMouse, type DriveAdobeMouseResult } from "../bridge/mouseAutomation.js";
import { runJsxViaPhotoshopCom } from "../bridge/photoshopComAutomation.js";
import { createGeneratedPhotoshopJob } from "../bridge/photoshopJobs.js";
import { generatedPhotoshopJobSummary } from "../bridge/photoshopJsxGenerator.js";
import { waitForJobResult, type JobStatus } from "../bridge/results.js";
import type { GeneratedJob } from "../bridge/types.js";
import type { ObjectShapePlan } from "../planner/objectShapePlanner.js";
import {
  assessExternalArtworkJudgeVerdict,
  makeExternalArtworkReviewPacket,
  normalizeExternalArtworkJudgeVerdict,
  type ExternalArtworkJudgeAssessment,
  type ExternalArtworkJudgeVerdict,
  type ExternalArtworkArtifactEvidenceItem,
  type ExternalArtworkReviewArtifactEvidence,
  type ExternalArtworkReviewHistoryItem,
  type ExternalArtworkReviewPacket
} from "../qa/externalArtworkJudge.js";
import { reviewArtworkQuality, type ArtworkReviewReport } from "../qa/artworkReviewGuard.js";
import { inspectExportArtifact, type ExportQaReport } from "../qa/exportQa.js";
import { loadDefaultCorpus } from "../semantic/search.js";
import type {
  AdobeArtworkIntent,
  AdobeArtworkPlan,
  AdobeSvgProofRunMode,
  PrepareAdobeSvgProofWorkflowOptions
} from "./adobeSvgProofWorkflow.js";
import { planAdobeArtworkScene, shouldReviseArtworkFromReview } from "./adobeSvgProofWorkflow.js";

export interface PrepareAdobeProjectWorkflowOptions extends PrepareAdobeSvgProofWorkflowOptions {
  sourceSvgPath?: string;
  photoshopReferencePngPath?: string;
  photoshopHandoffSvgPath?: string;
  photoshopWorkingPsdPath?: string;
  photoshopFeedbackPath?: string;
  referenceOpacity?: number;
  embedReference?: boolean;
  visibleMouseProof?: boolean;
}

export interface AdobeProjectWorkflow {
  ok: true;
  prompt: string;
  intent: Exclude<AdobeArtworkIntent, "auto">;
  outputPath: string;
  sourceSvgPath: string;
  photoshopReferencePngPath: string;
  photoshopHandoffSvgPath: string;
  photoshopWorkingPsdPath: string;
  photoshopFeedbackPath: string;
  plan: AdobeArtworkPlan;
  sceneJob: ReturnType<typeof generatedJobSummary>;
  sourceExportJob: ReturnType<typeof generatedJobSummary>;
  photoshopProjectJob: ReturnType<typeof generatedPhotoshopJobSummary>;
  photoshopCommitJob?: ReturnType<typeof generatedPhotoshopJobSummary>;
  illustratorReferenceJob: ReturnType<typeof generatedJobSummary>;
  finalExportJob: ReturnType<typeof generatedJobSummary>;
  handoff: AdobeProjectHandoff;
  runbook: AdobeProjectWorkflowStep[];
}

export interface AdobeProjectHandoff {
  sourceOfTruth: "illustrator-vector-document";
  sequence: string[];
  photoshopArtifacts: {
    referencePngPath: string;
    handoffSvgPath: string;
    workingPsdPath: string;
    feedbackPath: string;
  };
  illustratorConsumes: string;
}

export interface AdobeProjectWorkflowStep {
  step: number;
  app: "Illustrator" | "Photoshop" | "Bridge";
  action: string;
  jobId?: string;
  scriptPath?: string;
  resultPath?: string;
  expected?: string;
}

export interface ExecuteAdobeProjectWorkflowOptions extends PrepareAdobeProjectWorkflowOptions {
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
  visibleMouseProof?: boolean;
  visibleMouseDurationMs?: number;
  illustratorMouseToolShortcut?: string;
  photoshopMouseToolShortcut?: string;
  illustratorMouseWindowTitlePattern?: string;
  photoshopMouseWindowTitlePattern?: string;
  externalReview?: AdobeProjectExternalReviewRunner;
  externalReviewVerdict?: ExternalArtworkJudgeVerdict | unknown;
  externalReviewVerdicts?: Array<ExternalArtworkJudgeVerdict | unknown>;
  externalReviewPacketPath?: string;
  requireExternalReviewPass?: boolean;
  externalReviewMinScore?: number;
  reviewReportPath?: string;
}

export interface AdobeProjectReviewIteration {
  attempt: number;
  prompt: string;
  workflowPrompt: string;
  intent: Exclude<AdobeArtworkIntent, "auto">;
  ok: boolean;
  sourceExportQaOk?: boolean;
  photoshopReferenceQaOk?: boolean;
  photoshopHandoffQaOk?: boolean;
  finalExportQaOk?: boolean;
  artworkReviewOk?: boolean;
  artworkReviewIssues?: string[];
  artworkReviewImprovements?: string[];
  externalReviewOk?: boolean;
  externalReviewScore?: number;
  externalReviewSummary?: string;
  externalReviewIssues?: string[];
  externalReviewBlockingFindings?: ExternalArtworkJudgeVerdict["blocking_findings"];
  visibleMouseOk?: boolean;
  nextGoalPrompt: string | null;
  feedbackFingerprint?: string;
  repeatedFeedback?: boolean;
  repeatedWithAttempt?: number;
}

export type AdobeProjectReviewLoopStatus =
  | "accepted"
  | "dry-run"
  | "needs-revision"
  | "pending-external-review"
  | "blocked-external-readiness"
  | "stalled";

export type AdobeProjectReviewLoopStopReason =
  | "passed"
  | "dry-run"
  | "iteration-limit"
  | "repeated-feedback"
  | "external-review-pending"
  | "external-review-preflight"
  | "failed-without-actionable-prompt";

export interface AdobeProjectReviewLoopSummary {
  status: AdobeProjectReviewLoopStatus;
  stopReason: AdobeProjectReviewLoopStopReason;
  iterations: number;
  maxIterations: number;
  finalNextGoalPrompt: string | null;
  repeatedFeedback?: {
    fingerprint: string;
    attempts: number[];
    nextGoalPrompt: string;
  };
}

export interface AdobeProjectVisibleMouseProofs {
  illustratorScene?: DriveAdobeMouseResult;
  photoshopEdit?: DriveAdobeMouseResult;
  illustratorReturn?: DriveAdobeMouseResult;
}

export type AdobeProjectExternalReviewRunner = ((
  packet: ExternalArtworkReviewPacket
) => Promise<ExternalArtworkJudgeVerdict | AdobeProjectExternalReviewRunnerResult | unknown | null | undefined>) & {
  preflight?: () => Promise<unknown>;
};

export interface AdobeProjectExternalReviewRunnerResult {
  verdict: ExternalArtworkJudgeVerdict | unknown;
  provider?: string;
  command?: unknown;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  responseText?: string;
  readiness?: unknown;
}

export interface AdobeProjectExternalReviewProviderEvidence {
  provider?: string;
  command?: unknown;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  responseText?: string;
  readiness?: unknown;
}

export interface AdobeProjectExternalReviewReport {
  requested: boolean;
  ok: boolean;
  packet: ExternalArtworkReviewPacket;
  packetPath?: string;
  verdict?: ExternalArtworkJudgeVerdict;
  assessment?: ExternalArtworkJudgeAssessment;
  source?: "callback" | "provided" | "preflight";
  providerEvidence?: AdobeProjectExternalReviewProviderEvidence;
  error?: string;
  nextGoalPrompt: string | null;
  issues: string[];
}

export interface AdobeProjectGoalAcceptance {
  accepted: boolean;
  localAccepted: boolean;
  chatGptBrowserReviewRequired: true;
  missing: string[];
}

export interface AdobeProjectReviewReport {
  schemaVersion: "adobe-project-review-report.v1";
  generatedAt: string;
  ok: boolean;
  dryRun: boolean;
  accepted: boolean;
  goalAcceptance: AdobeProjectGoalAcceptance;
  prompt: string;
  finalPrompt: string;
  finalSvgPath: string;
  artifacts: {
    sourceSvgPath: string;
    photoshopReferencePngPath: string;
    photoshopHandoffSvgPath: string;
    photoshopWorkingPsdPath: string;
    photoshopFeedbackPath: string;
  };
  requirements: {
    illustratorPhotoshopRoundTrip: {
      ok: boolean;
      sourceExportQaOk?: boolean;
      photoshopReferenceQaOk?: boolean;
      photoshopHandoffQaOk?: boolean;
      finalExportQaOk?: boolean;
      visibleMouseOk?: boolean;
    };
    codexLocalReview: {
      ok: boolean;
      score?: number;
      issues: string[];
      improvements: string[];
      nextGoalPrompt: string | null;
    };
    chatGptBrowserReview: {
      requested: boolean;
      ok: boolean;
      passed: boolean;
      source?: "callback" | "provided" | "preflight";
      score?: number;
      packetPath?: string;
      state?: string;
      requiresHuman?: boolean;
      summary?: string;
      recommendedAction?: string;
      reasons: string[];
      error?: string;
      issues: string[];
      nextGoalPrompt: string | null;
    };
  };
  reviewLoop: AdobeProjectReviewLoopSummary;
  iterations: AdobeProjectReviewIteration[];
  next: string[];
}

export interface AdobeProjectWorkflowExecution {
  ok: boolean;
  dryRun: boolean;
  illustratorRunMode: AdobeSvgProofRunMode;
  photoshopRunMode: "com";
  workflow: AdobeProjectWorkflow;
  sceneLaunch?: LaunchJobResult;
  sceneResult?: JobStatus;
  sourceExportLaunch?: LaunchJobResult;
  sourceExportResult?: JobStatus;
  sourceExportQa?: ExportQaReport;
  photoshopProjectLaunch?: LaunchJobResult;
  photoshopProjectResult?: JobStatus;
  photoshopCommitLaunch?: LaunchJobResult;
  photoshopCommitResult?: JobStatus;
  photoshopReferenceQa?: ExportQaReport;
  photoshopHandoffQa?: ExportQaReport;
  photoshopFeedback?: Record<string, unknown>;
  illustratorReferenceLaunch?: LaunchJobResult;
  illustratorReferenceResult?: JobStatus;
  finalExportLaunch?: LaunchJobResult;
  finalExportResult?: JobStatus;
  finalExportQa?: ExportQaReport;
  visibleMouseProofs?: AdobeProjectVisibleMouseProofs;
  artworkReview?: ArtworkReviewReport;
  externalReview?: AdobeProjectExternalReviewReport;
  reviewLoop?: AdobeProjectReviewLoopSummary;
  goalAcceptance?: AdobeProjectGoalAcceptance;
  reviewIterations: AdobeProjectReviewIteration[];
  reviewReport?: AdobeProjectReviewReport;
  reviewReportPath?: string;
  next: string[];
}

export async function prepareAdobeProjectWorkflow(options: PrepareAdobeProjectWorkflowOptions): Promise<AdobeProjectWorkflow> {
  const outputPath = resolveOutputPath(options.outputPath);
  const sourceSvgPath = resolveOutputPath(options.sourceSvgPath ?? defaultSiblingPath(outputPath, ".illustrator-source.svg"));
  const photoshopReferencePngPath = resolveOutputPath(
    options.photoshopReferencePngPath ?? defaultSiblingPath(outputPath, ".photoshop-reference.png")
  );
  const photoshopHandoffSvgPath = resolveOutputPath(options.photoshopHandoffSvgPath ?? defaultSiblingPath(outputPath, ".photoshop-handoff.svg"));
  const photoshopWorkingPsdPath = resolveOutputPath(options.photoshopWorkingPsdPath ?? defaultSiblingPath(outputPath, ".photoshop-working.psd"));
  const photoshopFeedbackPath = resolveOutputPath(options.photoshopFeedbackPath ?? defaultSiblingPath(outputPath, ".photoshop-feedback.json"));
  const corpus = await loadDefaultCorpus(options.corpusPath);
  const planned = await planAdobeArtworkScene(options.prompt, corpus, options);
  const documentWidth = planned.scene.document?.width ?? options.width ?? 720;
  const documentHeight = planned.scene.document?.height ?? options.height ?? 480;

  const sceneJob = await createGeneratedJob({ kind: "cartoon_scene", scene: planned.scene }, options.root);
  const sourceExportJob = await createGeneratedJob(
    {
      kind: "export",
      format: "svg",
      outputPath: sourceSvgPath
    },
    options.root
  );
  const photoshopProjectJob = await createGeneratedPhotoshopJob(
    {
      kind: "project_pass",
      inputPath: sourceSvgPath,
      outputPngPath: photoshopReferencePngPath,
      outputSvgPath: photoshopHandoffSvgPath,
      outputPsdPath: photoshopWorkingPsdPath,
      feedbackPath: photoshopFeedbackPath,
      prompt: planned.plan.prompt,
      passName: "Photoshop project pass",
      width: options.proofWidth ?? documentWidth,
      height: options.proofHeight ?? documentHeight,
      resolution: options.proofResolution,
      keepOpen: Boolean(options.visibleMouseProof)
    },
    options.root
  );
  const photoshopCommitJob = options.visibleMouseProof
    ? await createGeneratedPhotoshopJob(
        {
          kind: "project_commit",
          inputPath: sourceSvgPath,
          outputPngPath: photoshopReferencePngPath,
          outputSvgPath: photoshopHandoffSvgPath,
          outputPsdPath: photoshopWorkingPsdPath,
          feedbackPath: photoshopFeedbackPath,
          prompt: planned.plan.prompt,
          passName: "Photoshop visible mouse commit",
          closeDocument: true
        },
        options.root
      )
    : undefined;
  const illustratorReferenceJob = await createGeneratedJob(
    {
      kind: "place_file_reference",
      inputPath: photoshopHandoffSvgPath,
      layerName: "Photoshop SVG handoff",
      name: "photoshop-svg-handoff",
      x: 0,
      y: 0,
      width: documentWidth,
      height: documentHeight,
      opacity: options.referenceOpacity ?? 35,
      locked: true,
      embed: options.embedReference ?? false
    },
    options.root
  );
  const finalExportJob = await createGeneratedJob(
    {
      kind: "export",
      format: "svg",
      outputPath
    },
    options.root
  );

  return {
    ok: true,
    prompt: planned.plan.prompt,
    intent: planned.intent,
    outputPath,
    sourceSvgPath,
    photoshopReferencePngPath,
    photoshopHandoffSvgPath,
    photoshopWorkingPsdPath,
    photoshopFeedbackPath,
    plan: planned.plan,
    sceneJob: generatedJobSummary(sceneJob),
    sourceExportJob: generatedJobSummary(sourceExportJob),
    photoshopProjectJob: generatedPhotoshopJobSummary(photoshopProjectJob),
    photoshopCommitJob: photoshopCommitJob ? generatedPhotoshopJobSummary(photoshopCommitJob) : undefined,
    illustratorReferenceJob: generatedJobSummary(illustratorReferenceJob),
    finalExportJob: generatedJobSummary(finalExportJob),
    handoff: {
      sourceOfTruth: "illustrator-vector-document",
      sequence: [
        "Illustrator creates editable vector scene",
        ...(options.visibleMouseProof ? ["Illustrator receives a visible mouse drawing pass before source SVG export"] : []),
        "Illustrator exports source SVG",
        options.visibleMouseProof
          ? "Photoshop opens SVG, keeps the document active, receives a visible mouse edit, and commits PSD, PNG preview, feedback JSON, and SVG handoff"
          : "Photoshop opens SVG and saves layered PSD, PNG preview, and SVG handoff",
        "Illustrator places Photoshop SVG handoff as a named reference layer",
        ...(options.visibleMouseProof ? ["Illustrator receives a visible mouse return pass before final SVG export"] : []),
        "Illustrator exports final project SVG"
      ],
      photoshopArtifacts: {
        referencePngPath: photoshopReferencePngPath,
        handoffSvgPath: photoshopHandoffSvgPath,
        workingPsdPath: photoshopWorkingPsdPath,
        feedbackPath: photoshopFeedbackPath
      },
      illustratorConsumes: photoshopHandoffSvgPath
    },
    runbook: buildRunbook(
      sceneJob,
      sourceExportJob,
      photoshopProjectJob,
      photoshopCommitJob,
      illustratorReferenceJob,
      finalExportJob,
      {
        outputPath,
        sourceSvgPath,
        photoshopReferencePngPath,
        photoshopHandoffSvgPath,
        photoshopWorkingPsdPath,
        photoshopFeedbackPath
      },
      Boolean(options.visibleMouseProof)
    )
  };
}

export async function executeAdobeProjectWorkflow(options: ExecuteAdobeProjectWorkflowOptions): Promise<AdobeProjectWorkflowExecution> {
  const maxReviewIterations = normalizeMaxReviewIterations(options.maxReviewIterations);
  const reviewIterations: AdobeProjectReviewIteration[] = [];
  let currentPrompt = options.prompt;
  let finalExecution: AdobeProjectWorkflowExecution | undefined;
  let stopReason: AdobeProjectReviewLoopStopReason | undefined;

  for (let attempt = 1; attempt <= maxReviewIterations; attempt += 1) {
    const execution = await executeAdobeProjectWorkflowAttempt(
      { ...options, prompt: currentPrompt },
      attempt,
      maxReviewIterations,
      reviewIterations
    );
    const nextGoalPrompt = nextGoalPromptForIteration(execution);
    const iteration = reviewIteration(attempt, currentPrompt, execution, nextGoalPrompt);
    reviewIterations.push(iteration);
    finalExecution = execution;

    if (!shouldRunReviewIteration(execution, nextGoalPrompt, attempt, maxReviewIterations)) {
      stopReason = inferReviewLoopStopReason(execution, nextGoalPrompt, attempt, maxReviewIterations);
      break;
    }

    const repeatedFeedback = findRepeatedFeedback(reviewIterations);
    if (repeatedFeedback) {
      iteration.repeatedFeedback = true;
      iteration.repeatedWithAttempt = repeatedFeedback.previousAttempt;
      stopReason = "repeated-feedback";
      break;
    }

    currentPrompt = nextGoalPrompt;
  }

  if (!finalExecution) {
    throw new Error("Adobe project workflow did not execute any review iteration.");
  }

  const reviewLoop = makeAdobeProjectReviewLoopSummary(
    finalExecution,
    reviewIterations,
    maxReviewIterations,
    stopReason ?? inferReviewLoopStopReason(finalExecution, nextGoalPromptForIteration(finalExecution), reviewIterations.length, maxReviewIterations)
  );
  const next = finalNextSteps(finalExecution.next, reviewIterations, reviewLoop);
  const executionWithoutGoalAcceptance: AdobeProjectWorkflowExecution = {
    ...finalExecution,
    reviewLoop,
    reviewIterations,
    next
  };
  const goalAcceptance = makeGoalAcceptanceForExecution(executionWithoutGoalAcceptance);
  const execution: AdobeProjectWorkflowExecution = {
    ...executionWithoutGoalAcceptance,
    goalAcceptance
  };
  const reviewReport = makeAdobeProjectReviewReport(execution, options.prompt);
  const reviewReportPath = options.reviewReportPath ? await writeAdobeProjectReviewReport(options.reviewReportPath, reviewReport) : undefined;

  return {
    ...execution,
    reviewReport: reviewReportPath ? reviewReport : undefined,
    reviewReportPath
  };
}

async function executeAdobeProjectWorkflowAttempt(
  options: ExecuteAdobeProjectWorkflowOptions,
  attempt: number,
  maxReviewIterations: number,
  previousReviewIterations: AdobeProjectReviewIteration[] = []
): Promise<AdobeProjectWorkflowExecution> {
  const dryRun = options.dryRun ?? false;
  const illustratorRunMode = options.illustratorRunMode ?? "launch";
  const waitForResults = !dryRun && (options.waitForResults ?? true);
  const workflow = await prepareAdobeProjectWorkflow(options);
  const visibleMouseProofs: AdobeProjectVisibleMouseProofs | undefined = options.visibleMouseProof ? {} : undefined;

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

  const externalReviewPreflight = await maybeRunExternalReviewPreflight(
    options,
    workflow,
    attempt,
    maxReviewIterations,
    previousReviewIterations
  );
  if (externalReviewPreflight) {
    return failure(
      { dryRun, illustratorRunMode, workflow, externalReview: externalReviewPreflight },
      "Resolve external ChatGPT browser review readiness before launching Illustrator or Photoshop for a required reviewed final SVG."
    );
  }

  const sceneLaunch = await runIllustratorWorkflowJob(workflow.sceneJob.jobPath, illustratorRunMode, options);
  if (!sceneLaunch.ok) {
    return failure({ dryRun, illustratorRunMode, workflow, sceneLaunch }, "Fix the Illustrator scene launch failure before exporting the source SVG.");
  }

  const sceneResult = waitForResults ? await waitForJob(workflow.sceneJob.id, options) : undefined;
  if (sceneResult?.result?.ok === false) {
    return failure(
      { dryRun, illustratorRunMode, workflow, sceneLaunch, sceneResult },
      "Fix the Illustrator scene job failure before exporting the source SVG."
    );
  }

  if (visibleMouseProofs) {
    await waitForVisibleMouseUi(options);
    visibleMouseProofs.illustratorScene = await runIllustratorVisibleMouseProof(options, {
      relativeX: 0.24,
      relativeY: 0.46,
      endRelativeX: 0.58,
      endRelativeY: 0.46
    });
    if (!visibleMouseProofs.illustratorScene.ok) {
      return failure(
        { dryRun, illustratorRunMode, workflow, sceneLaunch, sceneResult, visibleMouseProofs },
        "Fix the visible Illustrator mouse drawing pass before exporting the source SVG."
      );
    }
  }

  const sourceExportLaunch = await runIllustratorWorkflowJob(workflow.sourceExportJob.jobPath, illustratorRunMode, options);
  if (!sourceExportLaunch.ok) {
    return failure(
      { dryRun, illustratorRunMode, workflow, sceneLaunch, sceneResult, sourceExportLaunch },
      "Fix the Illustrator source SVG export launch failure before starting the Photoshop project pass."
    );
  }

  const sourceExportResult = waitForResults ? await waitForJob(workflow.sourceExportJob.id, options) : undefined;
  if (sourceExportResult?.result?.ok === false) {
    return failure(
      { dryRun, illustratorRunMode, workflow, sceneLaunch, sceneResult, sourceExportLaunch, sourceExportResult },
      "Fix the Illustrator source SVG export job failure before starting the Photoshop project pass."
    );
  }

  const sourceExportQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(workflow.sourceSvgPath, {
          format: "svg",
          minBytes: options.minBytes
        })
      : undefined;
  if (sourceExportQa && !sourceExportQa.ok) {
    return failure(
      { dryRun, illustratorRunMode, workflow, sceneLaunch, sceneResult, sourceExportLaunch, sourceExportResult, sourceExportQa },
      "Fix the Illustrator source SVG QA failure before starting the Photoshop project pass."
    );
  }

  const photoshopProjectLaunch = await runJsxViaPhotoshopCom(workflow.photoshopProjectJob.jobPath, {
    platform: resolveLaunchPlatform(options.photoshopPlatform ?? options.launchPlatform),
    dryRun,
    timeoutMs: options.timeoutMs,
    root: options.root
  });
  if (!photoshopProjectLaunch.ok) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch
      },
      "Fix the Photoshop project-pass launch failure before returning the artwork to Illustrator."
    );
  }

  const photoshopProjectResult = waitForResults ? await waitForJob(workflow.photoshopProjectJob.id, options) : undefined;
  if (photoshopProjectResult?.result?.ok === false) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult
      },
      "Fix the Photoshop project-pass job failure before returning the artwork to Illustrator."
    );
  }

  let photoshopCommitLaunch: LaunchJobResult | undefined;
  let photoshopCommitResult: JobStatus | undefined;

  if (visibleMouseProofs) {
    await waitForVisibleMouseUi(options);
    visibleMouseProofs.photoshopEdit = await runPhotoshopVisibleMouseProof(options);
    if (!visibleMouseProofs.photoshopEdit.ok) {
      return failure(
        {
          dryRun,
          illustratorRunMode,
          workflow,
          sceneLaunch,
          sceneResult,
          sourceExportLaunch,
          sourceExportResult,
          sourceExportQa,
          photoshopProjectLaunch,
          photoshopProjectResult,
          visibleMouseProofs
        },
        "Fix the visible Photoshop mouse edit pass before returning the SVG handoff to Illustrator."
      );
    }

    if (!dryRun) {
      await delay(1500);
    }

    if (!workflow.photoshopCommitJob) {
      return failure(
        {
          dryRun,
          illustratorRunMode,
          workflow,
          sceneLaunch,
          sceneResult,
          sourceExportLaunch,
          sourceExportResult,
          sourceExportQa,
          photoshopProjectLaunch,
          photoshopProjectResult,
          visibleMouseProofs
        },
        "Fix the workflow preparation failure: visible mouse proof requires a Photoshop post-mouse commit job."
      );
    }

    photoshopCommitLaunch = await runJsxViaPhotoshopCom(workflow.photoshopCommitJob.jobPath, {
      platform: resolveLaunchPlatform(options.photoshopPlatform ?? options.launchPlatform),
      dryRun,
      timeoutMs: options.timeoutMs,
      root: options.root
    });
    if (!photoshopCommitLaunch.ok) {
      return failure(
        {
          dryRun,
          illustratorRunMode,
          workflow,
          sceneLaunch,
          sceneResult,
          sourceExportLaunch,
          sourceExportResult,
          sourceExportQa,
          photoshopProjectLaunch,
          photoshopProjectResult,
          visibleMouseProofs,
          photoshopCommitLaunch
        },
        "Fix the Photoshop post-mouse SVG handoff commit launch failure before returning the artwork to Illustrator."
      );
    }

    photoshopCommitResult = waitForResults ? await waitForJob(workflow.photoshopCommitJob.id, options) : undefined;
    if (photoshopCommitResult?.result?.ok === false) {
      return failure(
        {
          dryRun,
          illustratorRunMode,
          workflow,
          sceneLaunch,
          sceneResult,
          sourceExportLaunch,
          sourceExportResult,
          sourceExportQa,
          photoshopProjectLaunch,
          photoshopProjectResult,
          visibleMouseProofs,
          photoshopCommitLaunch,
          photoshopCommitResult
        },
        "Fix the Photoshop post-mouse SVG handoff commit job failure before returning the artwork to Illustrator."
      );
    }
  }

  const photoshopReferenceQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(workflow.photoshopReferencePngPath, {
          format: "png",
          minBytes: options.minBytes,
          minWidth: options.proofMinWidth ?? options.minWidth,
          minHeight: options.proofMinHeight ?? options.minHeight,
          minNonBlankRatio: options.proofMinNonBlankRatio ?? options.minNonBlankRatio
        })
      : undefined;
  if (photoshopReferenceQa && !photoshopReferenceQa.ok) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopCommitLaunch,
        photoshopCommitResult,
        photoshopReferenceQa
      },
      "Fix the Photoshop PNG preview QA failure before placing the Photoshop SVG handoff back into Illustrator."
    );
  }

  const photoshopHandoffQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(workflow.photoshopHandoffSvgPath, {
          format: "svg",
          minBytes: options.minBytes
        })
      : undefined;
  if (photoshopHandoffQa && !photoshopHandoffQa.ok) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopCommitLaunch,
        photoshopCommitResult,
        photoshopReferenceQa,
        photoshopHandoffQa
      },
      "Fix the Photoshop SVG handoff QA failure before placing it back into Illustrator."
    );
  }

  const photoshopFeedback = waitForResults ? await readJsonArtifact(workflow.photoshopFeedbackPath) : undefined;

  const illustratorReferenceLaunch = await runIllustratorWorkflowJob(workflow.illustratorReferenceJob.jobPath, illustratorRunMode, options);
  if (!illustratorReferenceLaunch.ok) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopCommitLaunch,
        photoshopCommitResult,
        photoshopReferenceQa,
        photoshopHandoffQa,
        photoshopFeedback,
        illustratorReferenceLaunch
      },
      "Fix the Illustrator reference placement launch failure before final export."
    );
  }

  const illustratorReferenceResult = waitForResults ? await waitForJob(workflow.illustratorReferenceJob.id, options) : undefined;
  if (illustratorReferenceResult?.result?.ok === false) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopCommitLaunch,
        photoshopCommitResult,
        photoshopReferenceQa,
        photoshopHandoffQa,
        photoshopFeedback,
        illustratorReferenceLaunch,
        illustratorReferenceResult
      },
      "Fix the Illustrator reference placement job failure before final export."
    );
  }

  if (visibleMouseProofs) {
    await waitForVisibleMouseUi(options);
    visibleMouseProofs.illustratorReturn = await runIllustratorVisibleMouseProof(options, {
      relativeX: 0.32,
      relativeY: 0.62,
      endRelativeX: 0.68,
      endRelativeY: 0.58
    });
    if (!visibleMouseProofs.illustratorReturn.ok) {
      return failure(
        {
          dryRun,
          illustratorRunMode,
          workflow,
          sceneLaunch,
          sceneResult,
          sourceExportLaunch,
          sourceExportResult,
          sourceExportQa,
          photoshopProjectLaunch,
          photoshopProjectResult,
          photoshopCommitLaunch,
          photoshopCommitResult,
          photoshopReferenceQa,
          photoshopHandoffQa,
          photoshopFeedback,
          illustratorReferenceLaunch,
          illustratorReferenceResult,
          visibleMouseProofs
        },
        "Fix the visible Illustrator mouse return-pass drawing before final SVG export."
      );
    }
  }

  const finalExportLaunch = await runIllustratorWorkflowJob(workflow.finalExportJob.jobPath, illustratorRunMode, options);
  if (!finalExportLaunch.ok) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopCommitLaunch,
        photoshopCommitResult,
        photoshopReferenceQa,
        photoshopHandoffQa,
        photoshopFeedback,
        illustratorReferenceLaunch,
        illustratorReferenceResult,
        visibleMouseProofs,
        finalExportLaunch
      },
      "Fix the Illustrator final SVG export launch failure."
    );
  }

  const finalExportResult = waitForResults ? await waitForJob(workflow.finalExportJob.id, options) : undefined;
  if (finalExportResult?.result?.ok === false) {
    return failure(
      {
        dryRun,
        illustratorRunMode,
        workflow,
        sceneLaunch,
        sceneResult,
        sourceExportLaunch,
        sourceExportResult,
        sourceExportQa,
        photoshopProjectLaunch,
        photoshopProjectResult,
        photoshopCommitLaunch,
        photoshopCommitResult,
        photoshopReferenceQa,
        photoshopHandoffQa,
        photoshopFeedback,
        illustratorReferenceLaunch,
        illustratorReferenceResult,
        finalExportLaunch,
        visibleMouseProofs,
        finalExportResult
      },
      "Fix the Illustrator final SVG export job failure."
    );
  }

  const finalExportQa =
    waitForResults && !options.skipQa
      ? await inspectExportArtifact(workflow.outputPath, {
          format: "svg",
          minBytes: options.minBytes
        })
      : undefined;
  const artworkReview =
    waitForResults && !options.skipQa && !options.skipArtworkReview
      ? reviewArtworkQuality({
          prompt: workflow.prompt,
          scene: workflow.plan.scene,
          exportQa: finalExportQa ?? photoshopReferenceQa,
          target: isObjectPlan(workflow.plan) ? workflow.plan.target : undefined
        })
      : undefined;
  const artworkReviewClean = artworkReview ? artworkReview.ok && !shouldReviseArtworkFromReview(artworkReview) : true;
  const baseOk =
    sceneLaunch.ok &&
    sourceExportLaunch.ok &&
    photoshopProjectLaunch.ok &&
    (photoshopCommitLaunch?.ok ?? true) &&
    illustratorReferenceLaunch.ok &&
    finalExportLaunch.ok &&
    (sceneResult?.result?.ok ?? true) &&
    (sourceExportResult?.result?.ok ?? true) &&
    (photoshopProjectResult?.result?.ok ?? true) &&
    (photoshopCommitResult?.result?.ok ?? true) &&
    (illustratorReferenceResult?.result?.ok ?? true) &&
    (finalExportResult?.result?.ok ?? true) &&
    (sourceExportQa?.ok ?? true) &&
    (photoshopReferenceQa?.ok ?? true) &&
    (photoshopHandoffQa?.ok ?? true) &&
    (finalExportQa?.ok ?? true) &&
    visibleMouseProofsOk(visibleMouseProofs, Boolean(options.visibleMouseProof)) &&
    artworkReviewClean;
  const externalReview = await maybeRunExternalReview(
    options,
    workflow,
    attempt,
    maxReviewIterations,
    {
      workflowOk: baseOk,
      sourceExportQaOk: sourceExportQa?.ok,
      photoshopReferenceQaOk: photoshopReferenceQa?.ok,
      photoshopHandoffQaOk: photoshopHandoffQa?.ok,
      finalExportQaOk: finalExportQa?.ok,
      artworkReviewOk: artworkReview?.ok,
      artworkReviewScore: artworkReview?.score,
      localIssues: artworkReview?.issues,
      localNextGoalPrompt: artworkReview?.nextGoalPrompt ?? null
    },
    previousReviewIterations
  );
  const externalReviewClean =
    externalReview ? externalReview.ok || (!externalReview.verdict && !externalReview.error && !options.requireExternalReviewPass) : true;

  return {
    ok: baseOk && externalReviewClean,
    dryRun,
    illustratorRunMode,
    photoshopRunMode: "com",
    workflow,
    sceneLaunch,
    sceneResult,
    sourceExportLaunch,
    sourceExportResult,
    sourceExportQa,
    photoshopProjectLaunch,
    photoshopProjectResult,
    photoshopCommitLaunch,
    photoshopCommitResult,
    photoshopReferenceQa,
    photoshopHandoffQa,
    photoshopFeedback,
    illustratorReferenceLaunch,
    illustratorReferenceResult,
    finalExportLaunch,
    finalExportResult,
    finalExportQa,
    visibleMouseProofs,
    artworkReview,
    externalReview,
    reviewIterations: [],
    next: nextSteps(dryRun, waitForResults, Boolean(options.skipQa), {
      sceneLaunch,
      sourceExportLaunch,
      photoshopProjectLaunch,
      photoshopCommitLaunch,
      illustratorReferenceLaunch,
      finalExportLaunch,
      artworkReview,
      externalReview
    })
  };
}

function failure(
  fields: Partial<AdobeProjectWorkflowExecution> &
    Pick<AdobeProjectWorkflowExecution, "dryRun" | "illustratorRunMode" | "workflow">,
  message: string
): AdobeProjectWorkflowExecution {
  return {
    ok: false,
    photoshopRunMode: "com",
    reviewIterations: [],
    next: [message],
    ...fields
  };
}

async function runIllustratorWorkflowJob(
  jobPath: string,
  runMode: AdobeSvgProofRunMode,
  options: ExecuteAdobeProjectWorkflowOptions
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

async function waitForJob(jobId: string, options: ExecuteAdobeProjectWorkflowOptions): Promise<JobStatus> {
  return waitForJobResult(jobId, {
    root: options.root,
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForVisibleMouseUi(options: ExecuteAdobeProjectWorkflowOptions): Promise<void> {
  if (!options.dryRun) {
    await delay(2500);
  }
}

async function runIllustratorVisibleMouseProof(
  options: ExecuteAdobeProjectWorkflowOptions,
  points: { relativeX: number; relativeY: number; endRelativeX: number; endRelativeY: number }
): Promise<DriveAdobeMouseResult> {
  return driveIllustratorMouse({
    platform: resolveLaunchPlatform(options.launchPlatform),
    action: "drag",
    button: "left",
    relativeX: points.relativeX,
    relativeY: points.relativeY,
    endRelativeX: points.endRelativeX,
    endRelativeY: points.endRelativeY,
    durationMs: options.visibleMouseDurationMs ?? 1200,
    toolShortcut: options.illustratorMouseToolShortcut ?? "\\",
    windowTitlePattern: options.illustratorMouseWindowTitlePattern,
    dryRun: options.dryRun
  });
}

async function runPhotoshopVisibleMouseProof(options: ExecuteAdobeProjectWorkflowOptions): Promise<DriveAdobeMouseResult> {
  return drivePhotoshopMouse({
    platform: resolveLaunchPlatform(options.photoshopPlatform ?? options.launchPlatform),
    action: "drag",
    button: "left",
    relativeX: 0.34,
    relativeY: 0.54,
    endRelativeX: 0.66,
    endRelativeY: 0.58,
    durationMs: options.visibleMouseDurationMs ?? 1200,
    toolShortcut: options.photoshopMouseToolShortcut ?? "b",
    postShortcut: "{ESC}",
    postShortcutDelayMs: 500,
    windowTitlePattern: options.photoshopMouseWindowTitlePattern,
    dryRun: options.dryRun
  });
}

function visibleMouseProofsOk(proofs: AdobeProjectVisibleMouseProofs | undefined, required: boolean): boolean {
  if (!required) {
    return true;
  }

  return Boolean(proofs?.illustratorScene?.ok && proofs.photoshopEdit?.ok && proofs.illustratorReturn?.ok);
}

async function maybeRunExternalReviewPreflight(
  options: ExecuteAdobeProjectWorkflowOptions,
  workflow: AdobeProjectWorkflow,
  attempt: number,
  maxReviewIterations: number,
  previousReviewIterations: AdobeProjectReviewIteration[] = []
): Promise<AdobeProjectExternalReviewReport | undefined> {
  const preflight = options.externalReview?.preflight;
  if (!preflight) {
    return undefined;
  }

  let preflightResult: unknown;
  try {
    preflightResult = await preflight();
  } catch (error) {
    preflightResult = error;
  }

  if (externalReviewPreflightOk(preflightResult)) {
    return undefined;
  }

  const message = externalReviewPreflightMessage(preflightResult);
  const packet = makeExternalArtworkReviewPacket({
    goal:
      "Create a final SVG graphic through a full Adobe Illustrator to Photoshop to Illustrator project handoff, then keep iterating until Codex/local QA and ChatGPT browser review find no concrete improvement worth another revision.",
    prompt: workflow.prompt,
    attempt,
    maxAttempts: maxReviewIterations,
    finalSvgPath: workflow.outputPath,
    sourceSvgPath: workflow.sourceSvgPath,
    photoshopReferencePngPath: workflow.photoshopReferencePngPath,
    photoshopHandoffSvgPath: workflow.photoshopHandoffSvgPath,
    photoshopWorkingPsdPath: workflow.photoshopWorkingPsdPath,
    photoshopFeedbackPath: workflow.photoshopFeedbackPath,
    artifactEvidence: await collectWorkflowArtifactEvidence(workflow),
    workflowOk: false,
    localIssues: [message],
    handoffSequence: workflow.handoff.sequence,
    illustratorConsumes: workflow.handoff.illustratorConsumes,
    reviewHistory: externalReviewHistoryFromIterations(previousReviewIterations)
  });
  const packetPath = options.externalReviewPacketPath ? await writeExternalReviewPacket(options.externalReviewPacketPath, packet) : undefined;
  const providerEvidence = externalReviewProviderEvidenceFromUnknown(preflightResult);

  return {
    requested: true,
    ok: false,
    packet,
    packetPath,
    source: "preflight",
    providerEvidence: providerEvidence ? { ...providerEvidence, readiness: providerEvidence.readiness ?? preflightResult } : { readiness: preflightResult },
    error: message,
    nextGoalPrompt: null,
    issues: [`External ChatGPT browser review preflight failed before launching Adobe jobs: ${message}`]
  };
}

async function maybeRunExternalReview(
  options: ExecuteAdobeProjectWorkflowOptions,
  workflow: AdobeProjectWorkflow,
  attempt: number,
  maxReviewIterations: number,
  localVerification: {
    workflowOk: boolean;
    sourceExportQaOk?: boolean;
    photoshopReferenceQaOk?: boolean;
    photoshopHandoffQaOk?: boolean;
    finalExportQaOk?: boolean;
    artworkReviewOk?: boolean;
    artworkReviewScore?: number;
    localIssues?: string[];
    localNextGoalPrompt?: string | null;
  },
  previousReviewIterations: AdobeProjectReviewIteration[] = []
): Promise<AdobeProjectExternalReviewReport | undefined> {
  const providedVerdict = externalVerdictForAttempt(options, attempt);
  const requested = Boolean(options.externalReview || providedVerdict !== undefined || options.externalReviewPacketPath || options.requireExternalReviewPass);
  if (!requested) {
    return undefined;
  }

  const packet = makeExternalArtworkReviewPacket({
    goal:
      "Create a final SVG graphic through a full Adobe Illustrator to Photoshop to Illustrator project handoff, then keep iterating until Codex/local QA and ChatGPT browser review find no concrete improvement worth another revision.",
    prompt: workflow.prompt,
    attempt,
    maxAttempts: maxReviewIterations,
    finalSvgPath: workflow.outputPath,
    sourceSvgPath: workflow.sourceSvgPath,
    photoshopReferencePngPath: workflow.photoshopReferencePngPath,
    photoshopHandoffSvgPath: workflow.photoshopHandoffSvgPath,
    photoshopWorkingPsdPath: workflow.photoshopWorkingPsdPath,
    photoshopFeedbackPath: workflow.photoshopFeedbackPath,
    artifactEvidence: await collectWorkflowArtifactEvidence(workflow),
    sourceExportQaOk: localVerification.sourceExportQaOk,
    photoshopReferenceQaOk: localVerification.photoshopReferenceQaOk,
    photoshopHandoffQaOk: localVerification.photoshopHandoffQaOk,
    finalExportQaOk: localVerification.finalExportQaOk,
    artworkReviewOk: localVerification.artworkReviewOk,
    artworkReviewScore: localVerification.artworkReviewScore,
    localIssues: localVerification.localIssues,
    localNextGoalPrompt: localVerification.localNextGoalPrompt,
    workflowOk: localVerification.workflowOk,
    handoffSequence: workflow.handoff.sequence,
    illustratorConsumes: workflow.handoff.illustratorConsumes,
    reviewHistory: externalReviewHistoryFromIterations(previousReviewIterations)
  });
  const packetPath = options.externalReviewPacketPath ? await writeExternalReviewPacket(options.externalReviewPacketPath, packet) : undefined;

  let callbackVerdict: ExternalArtworkJudgeVerdict | AdobeProjectExternalReviewRunnerResult | unknown | null | undefined;
  try {
    callbackVerdict = options.externalReview ? await options.externalReview(packet) : undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const providerEvidence = externalReviewProviderEvidenceFromUnknown(error);
    return {
      requested: true,
      ok: false,
      packet,
      packetPath,
      source: "callback",
      providerEvidence,
      error: message,
      nextGoalPrompt: null,
      issues: [`External ChatGPT browser review failed before returning verdict JSON: ${message}`]
    };
  }
  const callbackResult = externalReviewRunnerResult(callbackVerdict);
  const verdictInput = callbackResult?.verdict ?? callbackVerdict ?? providedVerdict;
  if (verdictInput === undefined || verdictInput === null) {
    const issues = ["External ChatGPT browser review was requested but no verdict JSON was supplied."];
    return {
      requested: true,
      ok: false,
      packet,
      packetPath,
      nextGoalPrompt: null,
      issues
    };
  }

  const verdict = normalizeExternalArtworkJudgeVerdict(verdictInput);
  const assessment = assessExternalArtworkJudgeVerdict(verdict, workflow.prompt, options.externalReviewMinScore);

  return {
    requested: true,
    ok: assessment.ok,
    packet,
    packetPath,
    verdict,
    assessment,
    source: callbackVerdict === undefined ? "provided" : "callback",
    providerEvidence: callbackResult ? externalReviewProviderEvidence(callbackResult) : undefined,
    nextGoalPrompt: assessment.nextGoalPrompt,
    issues: assessment.issues
  };
}

function externalVerdictForAttempt(options: ExecuteAdobeProjectWorkflowOptions, attempt: number): ExternalArtworkJudgeVerdict | unknown | undefined {
  const attemptVerdict = options.externalReviewVerdicts?.[attempt - 1];
  if (attemptVerdict !== undefined) {
    return attemptVerdict;
  }

  return attempt === 1 ? options.externalReviewVerdict : undefined;
}

function externalReviewHistoryFromIterations(iterations: AdobeProjectReviewIteration[]): ExternalArtworkReviewHistoryItem[] {
  return iterations.map((iteration) => ({
    attempt: iteration.attempt,
    prompt: iteration.prompt,
    workflowPrompt: iteration.workflowPrompt,
    localReviewOk: iteration.artworkReviewOk,
    localIssues: iteration.artworkReviewIssues,
    localImprovements: iteration.artworkReviewImprovements,
    externalReviewOk: iteration.externalReviewOk,
    externalReviewScore: iteration.externalReviewScore,
    externalSummary: iteration.externalReviewSummary,
    externalIssues: iteration.externalReviewIssues,
    externalBlockingFindings: iteration.externalReviewBlockingFindings,
    nextGoalPrompt: iteration.nextGoalPrompt,
    feedbackFingerprint: iteration.feedbackFingerprint,
    repeatedFeedback: iteration.repeatedFeedback
  }));
}

function externalReviewPreflightOk(input: unknown): boolean {
  return typeof input === "object" && input !== null && !Array.isArray(input) && (input as Record<string, unknown>).ok === true;
}

function externalReviewPreflightMessage(input: unknown): string {
  if (input instanceof Error) {
    return input.message;
  }

  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    const parts = [record.state, record.summary, record.recommendedAction]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return typeof input === "string" && input.trim().length > 0
    ? input.trim()
    : "External ChatGPT browser review preflight did not report ready.";
}

function externalReviewRunnerResult(input: unknown): AdobeProjectExternalReviewRunnerResult | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input) || !("verdict" in input)) {
    return undefined;
  }

  return input as AdobeProjectExternalReviewRunnerResult;
}

function externalReviewProviderEvidence(result: AdobeProjectExternalReviewRunnerResult): AdobeProjectExternalReviewProviderEvidence {
  return {
    provider: typeof result.provider === "string" ? result.provider : undefined,
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    responseText: result.responseText,
    readiness: result.readiness
  };
}

function externalReviewProviderEvidenceFromUnknown(input: unknown): AdobeProjectExternalReviewProviderEvidence | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  if (
    !("command" in record) &&
    !("exitCode" in record) &&
    !("stdout" in record) &&
    !("stderr" in record) &&
    !("responseText" in record) &&
    !("readiness" in record)
  ) {
    return undefined;
  }

  return {
    provider: typeof record.provider === "string" ? record.provider : undefined,
    command: record.command,
    exitCode: typeof record.exitCode === "number" || record.exitCode === null ? record.exitCode : undefined,
    stdout: typeof record.stdout === "string" ? record.stdout : undefined,
    stderr: typeof record.stderr === "string" ? record.stderr : undefined,
    responseText: typeof record.responseText === "string" ? record.responseText : undefined,
    readiness: record.readiness
  };
}

async function writeExternalReviewPacket(path: string, packet: ExternalArtworkReviewPacket): Promise<string> {
  const outputPath = resolveOutputPath(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  return outputPath;
}

async function collectWorkflowArtifactEvidence(workflow: AdobeProjectWorkflow): Promise<ExternalArtworkReviewArtifactEvidence> {
  const [
    finalSvg,
    sourceSvg,
    photoshopReferencePng,
    photoshopHandoffSvg,
    photoshopWorkingPsd,
    photoshopFeedback
  ] = await Promise.all([
    collectArtifactEvidence(workflow.outputPath),
    collectArtifactEvidence(workflow.sourceSvgPath),
    collectArtifactEvidence(workflow.photoshopReferencePngPath),
    collectArtifactEvidence(workflow.photoshopHandoffSvgPath),
    collectArtifactEvidence(workflow.photoshopWorkingPsdPath),
    collectArtifactEvidence(workflow.photoshopFeedbackPath)
  ]);

  return {
    finalSvg,
    sourceSvg,
    photoshopReferencePng,
    photoshopHandoffSvg,
    photoshopWorkingPsd,
    photoshopFeedback
  };
}

async function collectArtifactEvidence(path: string): Promise<ExternalArtworkArtifactEvidenceItem> {
  try {
    const stats = await stat(path);
    if (!stats.isFile()) {
      return {
        path,
        status: "error",
        reason: "Path exists but is not a file."
      };
    }

    return {
      path,
      status: "available",
      bytes: stats.size,
      sha256: await sha256File(path)
    };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code === "ENOENT") {
      return {
        path,
        status: "missing",
        reason: "File does not exist."
      };
    }

    return {
      path,
      status: "error",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

async function writeAdobeProjectReviewReport(path: string, report: AdobeProjectReviewReport): Promise<string> {
  const outputPath = resolveOutputPath(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

function makeAdobeProjectReviewReport(execution: AdobeProjectWorkflowExecution, originalPrompt: string): AdobeProjectReviewReport {
  const latestIteration = execution.reviewIterations[execution.reviewIterations.length - 1];
  const externalReadiness = objectRecordOrUndefined(execution.externalReview?.providerEvidence?.readiness);
  const externalReviewRequested = Boolean(execution.externalReview?.requested);
  const roundTripOk = adobeRoundTripProved(execution);
  const localReviewOk = codexLocalReviewPassed(execution);
  const chatGptPassed = Boolean(execution.externalReview?.verdict && execution.externalReview.ok);
  const reviewLoop =
    execution.reviewLoop ??
    makeAdobeProjectReviewLoopSummary(
      execution,
      execution.reviewIterations,
      execution.reviewIterations.length,
      inferReviewLoopStopReason(execution, latestIteration?.nextGoalPrompt ?? null, execution.reviewIterations.length, execution.reviewIterations.length)
    );
  const accepted =
    reviewLoop.status === "accepted" &&
    !execution.dryRun &&
    execution.ok &&
    !latestIteration?.nextGoalPrompt &&
    (!externalReviewRequested || execution.externalReview?.ok === true);
  const goalAcceptance =
    execution.goalAcceptance ??
    makeFullGoalAcceptance({
      execution,
      localAccepted: accepted,
      roundTripOk,
      localReviewOk,
      chatGptPassed,
      externalReviewRequested
    });

  return {
    schemaVersion: "adobe-project-review-report.v1",
    generatedAt: new Date().toISOString(),
    ok: execution.ok,
    dryRun: execution.dryRun,
    accepted,
    goalAcceptance,
    prompt: originalPrompt,
    finalPrompt: execution.workflow.prompt,
    finalSvgPath: execution.workflow.outputPath,
    artifacts: {
      sourceSvgPath: execution.workflow.sourceSvgPath,
      photoshopReferencePngPath: execution.workflow.photoshopReferencePngPath,
      photoshopHandoffSvgPath: execution.workflow.photoshopHandoffSvgPath,
      photoshopWorkingPsdPath: execution.workflow.photoshopWorkingPsdPath,
      photoshopFeedbackPath: execution.workflow.photoshopFeedbackPath
    },
    requirements: {
      illustratorPhotoshopRoundTrip: {
        ok: roundTripOk,
        sourceExportQaOk: execution.sourceExportQa?.ok,
        photoshopReferenceQaOk: execution.photoshopReferenceQa?.ok,
        photoshopHandoffQaOk: execution.photoshopHandoffQa?.ok,
        finalExportQaOk: execution.finalExportQa?.ok,
        visibleMouseOk: execution.visibleMouseProofs ? visibleMouseProofsOk(execution.visibleMouseProofs, true) : undefined
      },
      codexLocalReview: {
        ok: localReviewOk,
        score: execution.artworkReview?.score,
        issues: execution.artworkReview?.issues ?? [],
        improvements: execution.artworkReview?.improvements ?? [],
        nextGoalPrompt: execution.artworkReview?.nextGoalPrompt ?? null
      },
      chatGptBrowserReview: {
        requested: externalReviewRequested,
        ok: execution.externalReview?.ok ?? false,
        passed: chatGptPassed,
        source: execution.externalReview?.source,
        score: execution.externalReview?.verdict?.score,
        packetPath: execution.externalReview?.packetPath,
        state: stringFromRecord(externalReadiness, "state"),
        requiresHuman: booleanFromRecord(externalReadiness, "requiresHuman"),
        summary: stringFromRecord(externalReadiness, "summary"),
        recommendedAction: stringFromRecord(externalReadiness, "recommendedAction"),
        reasons: stringArrayFromRecord(externalReadiness, "reasons"),
        error: execution.externalReview?.error,
        issues: execution.externalReview?.issues ?? [],
        nextGoalPrompt: execution.externalReview?.nextGoalPrompt ?? null
      }
    },
    reviewLoop,
    iterations: execution.reviewIterations,
    next: execution.next
  };
}

function adobeRoundTripProved(execution: AdobeProjectWorkflowExecution): boolean {
  if (execution.dryRun) {
    return false;
  }

  return Boolean(
    execution.sceneLaunch?.ok &&
      execution.sourceExportLaunch?.ok &&
      execution.photoshopProjectLaunch?.ok &&
      (execution.photoshopCommitLaunch?.ok ?? true) &&
      execution.illustratorReferenceLaunch?.ok &&
      execution.finalExportLaunch?.ok &&
      (execution.sceneResult?.result?.ok ?? true) &&
      (execution.sourceExportResult?.result?.ok ?? true) &&
      (execution.photoshopProjectResult?.result?.ok ?? true) &&
      (execution.photoshopCommitResult?.result?.ok ?? true) &&
      (execution.illustratorReferenceResult?.result?.ok ?? true) &&
      (execution.finalExportResult?.result?.ok ?? true) &&
      (execution.sourceExportQa?.ok ?? false) &&
      (execution.photoshopReferenceQa?.ok ?? false) &&
      (execution.photoshopHandoffQa?.ok ?? false) &&
      (execution.finalExportQa?.ok ?? false)
  );
}

function codexLocalReviewPassed(execution: AdobeProjectWorkflowExecution): boolean {
  if (execution.dryRun || !execution.artworkReview) {
    return false;
  }

  return execution.artworkReview.ok && !shouldReviseArtworkFromReview(execution.artworkReview);
}

function makeGoalAcceptanceForExecution(execution: AdobeProjectWorkflowExecution): AdobeProjectGoalAcceptance {
  const latestIteration = execution.reviewIterations[execution.reviewIterations.length - 1];
  const externalReviewRequested = Boolean(execution.externalReview?.requested);
  const roundTripOk = adobeRoundTripProved(execution);
  const localReviewOk = codexLocalReviewPassed(execution);
  const chatGptPassed = Boolean(execution.externalReview?.verdict && execution.externalReview.ok);
  const localAccepted =
    execution.reviewLoop?.status === "accepted" &&
    !execution.dryRun &&
    execution.ok &&
    !latestIteration?.nextGoalPrompt &&
    (!externalReviewRequested || execution.externalReview?.ok === true);

  return makeFullGoalAcceptance({
    execution,
    localAccepted,
    roundTripOk,
    localReviewOk,
    chatGptPassed,
    externalReviewRequested
  });
}

function makeFullGoalAcceptance(options: {
  execution: AdobeProjectWorkflowExecution;
  localAccepted: boolean;
  roundTripOk: boolean;
  localReviewOk: boolean;
  chatGptPassed: boolean;
  externalReviewRequested: boolean;
}): AdobeProjectGoalAcceptance {
  const missing: string[] = [];
  if (options.execution.dryRun) {
    missing.push("Run the Adobe project workflow without dryRun.");
  }
  if (!options.roundTripOk) {
    missing.push("Complete and verify the Illustrator -> Photoshop -> Illustrator round trip.");
  }
  if (!options.localReviewOk) {
    missing.push("Pass Codex local export QA and artwork review on the final SVG.");
  }
  if (!options.chatGptPassed) {
    missing.push(
      options.externalReviewRequested
        ? "Pass ChatGPT browser external review with a strict verdict JSON."
        : "Run ChatGPT browser external review with --external-review-provider auracall or a supplied external verdict."
    );
  }
  if (options.execution.reviewLoop?.status === "stalled") {
    missing.push("Resolve repeated review feedback before claiming final acceptance.");
  }

  return {
    accepted: options.localAccepted && options.roundTripOk && options.localReviewOk && options.chatGptPassed && missing.length === 0,
    localAccepted: options.localAccepted,
    chatGptBrowserReviewRequired: true,
    missing
  };
}

function objectRecordOrUndefined(input: unknown): Record<string, unknown> | undefined {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined;
}

function stringFromRecord(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function booleanFromRecord(record: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function stringArrayFromRecord(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function buildRunbook(
  sceneJob: GeneratedJob,
  sourceExportJob: GeneratedJob,
  photoshopProjectJob: {
    id: string;
    jobPath: string;
    resultPath: string;
    photoshopJobPath: string;
    photoshopResultPath: string;
  },
  photoshopCommitJob:
    | {
        id: string;
        jobPath: string;
        resultPath: string;
        photoshopJobPath: string;
        photoshopResultPath: string;
      }
    | undefined,
  illustratorReferenceJob: GeneratedJob,
  finalExportJob: GeneratedJob,
  paths: {
    outputPath: string;
    sourceSvgPath: string;
    photoshopReferencePngPath: string;
    photoshopHandoffSvgPath: string;
    photoshopWorkingPsdPath: string;
    photoshopFeedbackPath: string;
  },
  visibleMouseProof: boolean
): AdobeProjectWorkflowStep[] {
  const steps: Array<Omit<AdobeProjectWorkflowStep, "step">> = [
    {
      app: "Illustrator",
      action: "Run the Illustrator scene JSX to create the editable vector document.",
      jobId: sceneJob.id,
      scriptPath: sceneJob.illustratorJobPath,
      resultPath: sceneJob.resultPath,
      expected: "Scene job result JSON exists with ok=true and kind=cartoon_scene."
    }
  ];

  if (visibleMouseProof) {
    steps.push({
      app: "Bridge",
      action: "Drive the visible Windows mouse in Illustrator to draw on the active vector document before exporting the source SVG.",
      expected: "Illustrator mouse proof returns ok=true after measuring/focusing the Illustrator window and moving the real pointer."
    });
  }

  steps.push(
    {
      app: "Illustrator",
      action: `Export the current Illustrator document as source SVG at ${paths.sourceSvgPath}.`,
      jobId: sourceExportJob.id,
      scriptPath: sourceExportJob.illustratorJobPath,
      resultPath: sourceExportJob.resultPath,
      expected: "Source SVG export result JSON exists with ok=true and kind=export."
    },
    {
      app: "Bridge",
      action: "Run source SVG QA before handing the artwork to Photoshop.",
      expected: "Source SVG exists and is non-empty."
    },
    {
      app: "Photoshop",
      action: visibleMouseProof
        ? `Open the source SVG, create a layered project pass at ${paths.photoshopWorkingPsdPath}, write preliminary PNG/SVG/feedback artifacts, and keep the Photoshop document active for visible mouse editing.`
        : `Open the source SVG, create a layered project pass at ${paths.photoshopWorkingPsdPath}, write PNG preview ${paths.photoshopReferencePngPath}, write SVG handoff ${paths.photoshopHandoffSvgPath}, and write feedback JSON ${paths.photoshopFeedbackPath}.`,
      jobId: photoshopProjectJob.id,
      scriptPath: photoshopProjectJob.photoshopJobPath,
      resultPath: photoshopProjectJob.resultPath,
      expected: "Photoshop project-pass result JSON exists with ok=true and kind=project_pass."
    }
  );

  if (visibleMouseProof) {
    steps.push({
      app: "Bridge",
      action: "Drive the visible Windows mouse in Photoshop while the source SVG document is active.",
      expected: "Photoshop mouse proof returns ok=true after measuring/focusing the Photoshop window and moving the real pointer."
    });

    if (photoshopCommitJob) {
      steps.push({
        app: "Photoshop",
        action: `Commit the active post-mouse Photoshop document to ${paths.photoshopWorkingPsdPath}, ${paths.photoshopReferencePngPath}, ${paths.photoshopHandoffSvgPath}, and ${paths.photoshopFeedbackPath}.`,
        jobId: photoshopCommitJob.id,
        scriptPath: photoshopCommitJob.photoshopJobPath,
        resultPath: photoshopCommitJob.resultPath,
        expected: "Photoshop post-mouse commit result JSON exists with ok=true and kind=project_commit."
      });
    }
  }

  steps.push(
    {
      app: "Bridge",
      action: visibleMouseProof
        ? "Run PNG QA on the post-mouse Photoshop preview, verify the post-mouse Photoshop SVG handoff, and read Photoshop feedback JSON."
        : "Run PNG QA on the Photoshop preview, verify the Photoshop SVG handoff, and read Photoshop feedback JSON.",
      expected: "Photoshop PNG exists, SVG handoff exists, and feedback JSON is available for the next Illustrator pass."
    },
    {
      app: "Illustrator",
      action: "Place the Photoshop SVG handoff back into the active Illustrator document as a named reference layer.",
      jobId: illustratorReferenceJob.id,
      scriptPath: illustratorReferenceJob.illustratorJobPath,
      resultPath: illustratorReferenceJob.resultPath,
      expected: "Illustrator placement result JSON exists with ok=true and kind=place_file_reference."
    }
  );

  if (visibleMouseProof) {
    steps.push({
      app: "Bridge",
      action: "Drive the visible Windows mouse in Illustrator after placing the Photoshop SVG handoff and before final SVG export.",
      expected: "Illustrator return-pass mouse proof returns ok=true after moving the real pointer over the active Illustrator document."
    });
  }

  steps.push(
    {
      app: "Illustrator",
      action: `Export the final collaborative project SVG at ${paths.outputPath}.`,
      jobId: finalExportJob.id,
      scriptPath: finalExportJob.illustratorJobPath,
      resultPath: finalExportJob.resultPath,
      expected: "Final export result JSON exists with ok=true and kind=export."
    },
    {
      app: "Bridge",
      action: "Run final SVG QA plus artwork review; feed review.nextGoalPrompt into the next full Illustrator-Photoshop-Illustrator round-trip if needed.",
      expected: "The final output has both editable Illustrator vector content and a Photoshop-generated project reference pass."
    }
  );

  return steps.map((step, index) => ({ step: index + 1, ...step }));
}

function nextSteps(
  dryRun: boolean,
  waitForResults: boolean,
  skipQa: boolean,
  launches: {
    sceneLaunch: LaunchJobResult;
    sourceExportLaunch: LaunchJobResult;
    photoshopProjectLaunch: LaunchJobResult;
    photoshopCommitLaunch?: LaunchJobResult;
    illustratorReferenceLaunch: LaunchJobResult;
    finalExportLaunch: LaunchJobResult;
    artworkReview?: ArtworkReviewReport;
    externalReview?: AdobeProjectExternalReviewReport;
  }
): string[] {
  if (dryRun) {
    return [
      "Run the same Adobe project workflow without dryRun after Illustrator and Photoshop are available.",
      launches.sceneLaunch.next.waitForResult,
      launches.sourceExportLaunch.next.waitForResult,
      launches.photoshopProjectLaunch.next.waitForResult,
      ...(launches.photoshopCommitLaunch ? [launches.photoshopCommitLaunch.next.waitForResult] : []),
      launches.illustratorReferenceLaunch.next.waitForResult,
      launches.finalExportLaunch.next.waitForResult
    ];
  }

  if (!waitForResults) {
    return [
      launches.sceneLaunch.next.waitForResult,
      launches.sourceExportLaunch.next.waitForResult,
      launches.photoshopProjectLaunch.next.waitForResult,
      ...(launches.photoshopCommitLaunch ? [launches.photoshopCommitLaunch.next.waitForResult] : []),
      launches.illustratorReferenceLaunch.next.waitForResult,
      launches.finalExportLaunch.next.waitForResult
    ];
  }

  if (launches.artworkReview && shouldReviseArtworkFromReview(launches.artworkReview)) {
    return [launches.artworkReview.nextGoalPrompt];
  }

  if (launches.externalReview?.nextGoalPrompt) {
    return [launches.externalReview.nextGoalPrompt];
  }

  if (launches.externalReview && !launches.externalReview.verdict) {
    return [
      launches.externalReview.packetPath
        ? `Submit the external review packet at ${launches.externalReview.packetPath} to ChatGPT Pro/AuraCall, save the returned verdict JSON, and rerun with that verdict before accepting the final SVG.`
        : "Submit externalReview.packet to ChatGPT Pro/AuraCall, save the returned verdict JSON, and rerun with that verdict before accepting the final SVG."
    ];
  }

  return skipQa
    ? ["Run QA on the source SVG, Photoshop SVG handoff, Photoshop reference PNG, and final SVG before accepting the collaborative project."]
    : ["Use the final SVG as the collaborative Illustrator project output and keep the Photoshop SVG/PSD/PNG artifacts with it as the return project pass."];
}

function reviewIteration(
  attempt: number,
  prompt: string,
  execution: AdobeProjectWorkflowExecution,
  nextGoalPrompt: string | null
): AdobeProjectReviewIteration {
  const feedbackFingerprint = reviewFeedbackFingerprint(execution, nextGoalPrompt);
  return {
    attempt,
    prompt,
    workflowPrompt: execution.workflow.prompt,
    intent: execution.workflow.intent,
    ok: execution.ok,
    sourceExportQaOk: execution.sourceExportQa?.ok,
    photoshopReferenceQaOk: execution.photoshopReferenceQa?.ok,
    photoshopHandoffQaOk: execution.photoshopHandoffQa?.ok,
    finalExportQaOk: execution.finalExportQa?.ok,
    artworkReviewOk: execution.artworkReview?.ok,
    artworkReviewIssues: execution.artworkReview?.issues,
    artworkReviewImprovements: execution.artworkReview?.improvements,
    externalReviewOk: execution.externalReview?.ok,
    externalReviewScore: execution.externalReview?.verdict?.score,
    externalReviewSummary: execution.externalReview?.verdict?.summary,
    externalReviewIssues: execution.externalReview?.issues,
    externalReviewBlockingFindings: execution.externalReview?.verdict?.blocking_findings,
    visibleMouseOk: execution.visibleMouseProofs ? visibleMouseProofsOk(execution.visibleMouseProofs, true) : undefined,
    nextGoalPrompt,
    feedbackFingerprint
  };
}

function shouldRunReviewIteration(
  execution: AdobeProjectWorkflowExecution,
  nextGoalPrompt: string | null,
  attempt: number,
  maxReviewIterations: number
): nextGoalPrompt is string {
  return Boolean(
    attempt < maxReviewIterations &&
      nextGoalPrompt &&
      nextGoalPrompt.trim().length > 0 &&
      ((execution.artworkReview && shouldReviseArtworkFromReview(execution.artworkReview)) || Boolean(execution.externalReview?.nextGoalPrompt))
  );
}

function nextGoalPromptForIteration(execution: AdobeProjectWorkflowExecution): string | null {
  return execution.externalReview?.nextGoalPrompt ?? execution.artworkReview?.nextGoalPrompt ?? null;
}

function finalNextSteps(
  next: string[],
  reviewIterations: AdobeProjectReviewIteration[],
  reviewLoop: AdobeProjectReviewLoopSummary
): string[] {
  if (reviewIterations.length <= 1) {
    return next;
  }

  const last = reviewIterations[reviewIterations.length - 1];
  const summary = last?.ok && reviewLoop.status !== "stalled"
    ? `Adobe project review passed after ${reviewIterations.length} round-trip iteration(s).`
    : `Adobe project review stopped after ${reviewIterations.length} round-trip iteration(s); use the latest nextGoalPrompt for another full Illustrator-Photoshop-Illustrator pass.`;

  const repeated = reviewLoop.repeatedFeedback
    ? [
        `Review loop stopped because attempts ${reviewLoop.repeatedFeedback.attempts.join(
          " and "
        )} produced the same actionable feedback. Inspect the repeated nextGoalPrompt before launching more Adobe passes.`
      ]
    : [];

  return [summary, ...repeated, ...next];
}

function makeAdobeProjectReviewLoopSummary(
  execution: AdobeProjectWorkflowExecution,
  reviewIterations: AdobeProjectReviewIteration[],
  maxIterations: number,
  stopReason: AdobeProjectReviewLoopStopReason
): AdobeProjectReviewLoopSummary {
  const latest = reviewIterations[reviewIterations.length - 1];
  const repeated = latest?.repeatedFeedback && latest.feedbackFingerprint
    ? {
        fingerprint: latest.feedbackFingerprint,
        attempts: [latest.repeatedWithAttempt ?? latest.attempt, latest.attempt],
        nextGoalPrompt: latest.nextGoalPrompt ?? ""
      }
    : undefined;
  return {
    status: reviewLoopStatus(execution, stopReason),
    stopReason,
    iterations: reviewIterations.length,
    maxIterations,
    finalNextGoalPrompt: latest?.nextGoalPrompt ?? null,
    repeatedFeedback: repeated
  };
}

function reviewLoopStatus(
  execution: AdobeProjectWorkflowExecution,
  stopReason: AdobeProjectReviewLoopStopReason
): AdobeProjectReviewLoopStatus {
  if (stopReason === "repeated-feedback") {
    return "stalled";
  }

  if (stopReason === "external-review-preflight") {
    return "blocked-external-readiness";
  }

  if (stopReason === "external-review-pending") {
    return "pending-external-review";
  }

  if (execution.dryRun) {
    return "dry-run";
  }

  return execution.ok ? "accepted" : "needs-revision";
}

function inferReviewLoopStopReason(
  execution: AdobeProjectWorkflowExecution,
  nextGoalPrompt: string | null,
  attempt: number,
  maxReviewIterations: number
): AdobeProjectReviewLoopStopReason {
  if (execution.externalReview?.source === "preflight") {
    return "external-review-preflight";
  }

  if (execution.externalReview?.requested && !execution.externalReview.verdict && !execution.externalReview.error) {
    return "external-review-pending";
  }

  if (execution.dryRun) {
    return "dry-run";
  }

  if (nextGoalPrompt && attempt >= maxReviewIterations) {
    return "iteration-limit";
  }

  if (execution.ok && !nextGoalPrompt) {
    return "passed";
  }

  return "failed-without-actionable-prompt";
}

function findRepeatedFeedback(iterations: AdobeProjectReviewIteration[]): { previousAttempt: number } | undefined {
  const current = iterations[iterations.length - 1];
  if (!current?.feedbackFingerprint) {
    return undefined;
  }

  const previous = iterations
    .slice(0, -1)
    .find((iteration) => iteration.feedbackFingerprint === current.feedbackFingerprint);
  return previous ? { previousAttempt: previous.attempt } : undefined;
}

function reviewFeedbackFingerprint(execution: AdobeProjectWorkflowExecution, nextGoalPrompt: string | null): string | undefined {
  const signature = reviewFeedbackSignature(execution, nextGoalPrompt);
  if (!signature) {
    return undefined;
  }

  return createHash("sha256").update(normalizeReviewFeedbackSignature(signature)).digest("hex").slice(0, 16);
}

function reviewFeedbackSignature(execution: AdobeProjectWorkflowExecution, nextGoalPrompt: string | null): string | undefined {
  if (execution.externalReview?.verdict && !execution.externalReview.ok) {
    const verdict = execution.externalReview.verdict;
    return [
      "external",
      verdict.summary,
      ...verdict.blocking_findings.map((finding) => `${finding.severity}|${finding.issue}|${finding.required_fix}`),
      ...verdict.tests_or_checks_required
    ].join("\n");
  }

  if (execution.artworkReview && shouldReviseArtworkFromReview(execution.artworkReview)) {
    return ["local", ...execution.artworkReview.issues, ...execution.artworkReview.improvements].join("\n");
  }

  return nextGoalPrompt ? `next\n${nextGoalPrompt}` : undefined;
}

function normalizeReviewFeedbackSignature(signature: string): string {
  return signature.toLowerCase().replace(/\s+/g, " ").trim();
}

function isObjectPlan(plan: AdobeArtworkPlan): plan is ObjectShapePlan {
  return "guard" in plan && "target" in plan;
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

async function readJsonArtifact(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function resolveOutputPath(outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath);
}

function defaultSiblingPath(outputPath: string, suffix: string): string {
  const extension = extname(outputPath);
  if (!extension) {
    return `${outputPath}${suffix}`;
  }

  return `${outputPath.slice(0, -extension.length)}${suffix}`;
}
