#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { startAgentMcpStdioServer } from "./agent/mcpServer.js";
import { getGeneratedJobPaths } from "./bridge/files.js";
import { runJsxViaIllustratorCom } from "./bridge/comAutomation.js";
import { detectIllustratorApps, probeIllustratorCommunication, type IllustratorProbeMethod } from "./bridge/illustratorProbe.js";
import { createGeneratedJob } from "./bridge/jobs.js";
import { generatedJobSummary } from "./bridge/jsxGenerator.js";
import { LaunchJobError, launchJsxJob, resolveLaunchPlatform, type LaunchPlatform } from "./bridge/launcher.js";
import { driveIllustratorMouse, drivePhotoshopMouse, type IllustratorMouseAction, type IllustratorMouseButton } from "./bridge/mouseAutomation.js";
import { runJsxViaPhotoshopCom } from "./bridge/photoshopComAutomation.js";
import { createGeneratedPhotoshopJob } from "./bridge/photoshopJobs.js";
import { generatedPhotoshopJobSummary } from "./bridge/photoshopJsxGenerator.js";
import { detectPhotoshopDesktop } from "./bridge/photoshopProbe.js";
import { JobResultError, normalizeJobId, readJobStatus, waitForJobResult } from "./bridge/results.js";
import { startBridgeServer } from "./bridge/server.js";
import { normalizeCommand, normalizeScene, ValidationError } from "./bridge/validation.js";
import { callIllustratorTool, getIllustratorMcpConfig, listIllustratorTools, McpConfigError } from "./mcp/illustratorClient.js";
import { OpenAiPlannerError } from "./planner/openAiCartoonPlanner.js";
import { ObjectShapePlannerError, parseObjectShapeTarget, planObjectShapeScene } from "./planner/objectShapePlanner.js";
import { planCartoonSceneWithMode, type PlannerMode } from "./planner/plannerRouter.js";
import { ExportQaError, inspectExportArtifact } from "./qa/exportQa.js";
import { reviewArtworkQuality } from "./qa/artworkReviewGuard.js";
import { guardObjectShapeScene } from "./qa/objectShapeGuard.js";
import { createAuraCallExternalArtworkReviewRunner, detectAuraCallChatGptBrowser } from "./qa/auracallExternalArtworkJudge.js";
import { loadDefaultCorpus, searchCorpus } from "./semantic/search.js";
import {
  executeAdobeSvgProofWorkflow,
  prepareAdobeSvgProofWorkflow,
  type AdobeArtworkIntent,
  type AdobeSvgProofRunMode
} from "./workflow/adobeSvgProofWorkflow.js";
import { executeAdobeProjectWorkflow, prepareAdobeProjectWorkflow } from "./workflow/adobeProjectWorkflow.js";
import { preflightAdobeProjectWorkflow } from "./workflow/adobeProjectPreflight.js";
import { executeCartoonWorkflow } from "./workflow/cartoonExecutor.js";
import { executeObjectShapeWorkflow, type ObjectWorkflowRunMode } from "./workflow/objectExecutor.js";
import { prepareCartoonWorkflow } from "./workflow/cartoonWorkflow.js";
import { prepareObjectShapeWorkflow } from "./workflow/objectWorkflow.js";
import { planScientificConceptScene } from "./planner/scientificConceptPlanner.js";
import type { SemanticKind } from "./semantic/types.js";
import { inspectVectorShapeFiles, mergeShapeCombinationItems } from "./semantic/vectorShapeIngest.js";

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  switch (command) {
    case "mcp:list-tools":
      await listTools(rest);
      return;
    case "mcp:call":
      await callTool(rest);
      return;
    case "mcp:serve":
      await startAgentMcpStdioServer();
      return;
    case "jsx:ping":
      await makePing(rest);
      return;
    case "jsx:cartoon":
      await makeCartoon(rest);
      return;
    case "jsx:export":
      await makeExport(rest);
      return;
    case "photoshop:proof-svg":
      await makePhotoshopSvgProof(rest);
      return;
    case "photoshop:detect":
      await photoshopDetect(rest);
      return;
    case "chatgpt:detect":
      await chatGptDetect(rest);
      return;
    case "illustrator:detect":
      await illustratorDetect(rest);
      return;
    case "illustrator:probe":
      await illustratorProbe(rest);
      return;
    case "illustrator:mouse":
      await illustratorMouse(rest);
      return;
    case "photoshop:mouse":
      await photoshopMouse(rest);
      return;
    case "plan:cartoon":
      await planCartoon(rest);
      return;
    case "plan:scientific":
      await planScientific(rest);
      return;
    case "plan:object":
      await planObject(rest);
      return;
    case "guard:object":
      await guardObject(rest);
      return;
    case "workflow:cartoon":
      await workflowCartoon(rest);
      return;
    case "workflow:execute-cartoon":
      await workflowExecuteCartoon(rest);
      return;
    case "workflow:adobe-svg-proof":
      await workflowAdobeSvgProof(rest);
      return;
    case "workflow:execute-adobe-svg-proof":
      await workflowExecuteAdobeSvgProof(rest);
      return;
    case "workflow:adobe-project":
      await workflowAdobeProject(rest);
      return;
    case "workflow:preflight-adobe-project":
      await workflowPreflightAdobeProject(rest);
      return;
    case "workflow:execute-adobe-project":
      await workflowExecuteAdobeProject(rest);
      return;
    case "workflow:object":
      await workflowObject(rest);
      return;
    case "workflow:execute-object":
      await workflowExecuteObject(rest);
      return;
    case "job:status":
      await jobStatus(rest);
      return;
    case "job:wait":
      await jobWait(rest);
      return;
    case "job:launch":
      await jobLaunch(rest);
      return;
    case "job:run-com":
      await jobRunCom(rest);
      return;
    case "job:run-photoshop-com":
      await jobRunPhotoshopCom(rest);
      return;
    case "qa:export":
      await qaExport(rest);
      return;
    case "qa:artwork":
      await qaArtwork(rest);
      return;
    case "serve":
      await serve(rest);
      return;
    case "semantic:search":
      await semanticSearch(rest);
      return;
    case "semantic:inspect-vector":
      await semanticInspectVector(rest);
      return;
    case "semantic:learn-vector":
      await semanticLearnVector(rest);
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return;
    default:
      throw new ValidationError(`Unknown command: ${command}`);
  }
}

async function listTools(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const config = getIllustratorMcpConfig({
    url: optionValue(options, "url"),
    token: optionValue(options, "token")
  });
  const tools = await listIllustratorTools(config);

  console.log(JSON.stringify({ ok: true, toolCount: tools.length, tools }, null, 2));
}

async function callTool(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const positional = options.positionals;
  const toolName = positional[0];

  if (!toolName) {
    throw new ValidationError("mcp:call requires a tool name");
  }

  const toolArgs = positional[1] ? await readJsonArg(positional[1]) : {};
  const config = getIllustratorMcpConfig({
    url: optionValue(options, "url"),
    token: optionValue(options, "token")
  });
  const result = await callIllustratorTool(config, toolName, objectArg(toolArgs));

  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

async function makePing(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const message = optionValue(options, "message") ?? "hello from illustrator-agent-bridge";
  const job = await createGeneratedJob({ kind: "ping", message }, optionValue(options, "root"));
  console.log(JSON.stringify({ ok: true, job: generatedJobSummary(job) }, null, 2));
}

async function makeCartoon(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const scenePath = options.positionals[0] ?? "examples/cartoon-scene.json";
  const scene = normalizeScene(await readJsonFile(scenePath));
  const job = await createGeneratedJob({ kind: "cartoon_scene", scene }, optionValue(options, "root"));

  console.log(JSON.stringify({ ok: true, job: generatedJobSummary(job) }, null, 2));
}

async function makeExport(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const format = optionValue(options, "format") ?? "pdf";
  const outputPath = optionValue(options, "output");

  if (!outputPath) {
    throw new ValidationError("jsx:export requires --output PATH");
  }

  const command = normalizeCommand({
    kind: "export",
    format,
    outputPath
  });
  const job = await createGeneratedJob(command, optionValue(options, "root"));

  console.log(JSON.stringify({ ok: true, job: generatedJobSummary(job) }, null, 2));
}

async function makePhotoshopSvgProof(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const inputPath = options.positionals[0];
  const outputPath = optionValue(options, "output");

  if (!inputPath) {
    throw new ValidationError("photoshop:proof-svg requires an input SVG path");
  }

  if (!outputPath) {
    throw new ValidationError("photoshop:proof-svg requires --output PATH");
  }

  const job = await createGeneratedPhotoshopJob(
    {
      kind: "svg_proof",
      inputPath,
      outputPath,
      width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
      height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
      resolution: optionValue(options, "resolution") ? Number(optionValue(options, "resolution")) : undefined
    },
    optionValue(options, "root")
  );

  console.log(JSON.stringify({ ok: true, job: generatedPhotoshopJobSummary(job) }, null, 2));
}

async function illustratorDetect(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const platform = optionalLaunchPlatform(optionValue(options, "platform"));
  const candidates = await detectIllustratorApps(platform);
  console.log(JSON.stringify({ ok: true, platform: platform ?? "auto", candidates }, null, 2));
}

async function photoshopDetect(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const result = await detectPhotoshopDesktop({
    platform: optionalLaunchPlatform(optionValue(options, "platform")),
    crashLookbackMinutes: optionValue(options, "crash-lookback-minutes") ? Number(optionValue(options, "crash-lookback-minutes")) : undefined,
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined
  });
  console.log(JSON.stringify(result, null, 2));
}

async function chatGptDetect(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const result = await detectAuraCallChatGptBrowser({
    command: optionValue(options, "auracall-command"),
    timeoutSeconds: optionValue(options, "timeout-seconds") ? Number(optionValue(options, "timeout-seconds")) : undefined,
    operationTimeoutSeconds: optionValue(options, "operation-timeout-seconds") ? Number(optionValue(options, "operation-timeout-seconds")) : undefined,
    localOnly: !flagValue(options, "live"),
    pruneBrowserState: !flagValue(options, "no-prune"),
    workdir: process.cwd()
  });
  console.log(JSON.stringify(result, null, 2));
}

async function illustratorProbe(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const result = await probeIllustratorCommunication({
    platform: optionalLaunchPlatform(optionValue(options, "platform")),
    method: optionalProbeMethod(optionValue(options, "method")),
    appPath: optionValue(options, "app"),
    root: optionValue(options, "root"),
    dryRun: flagValue(options, "dry-run"),
    waitForResult: flagValue(options, "wait"),
    autoConfirmDialog: flagValue(options, "auto-confirm-dialog"),
    drawCircle: flagValue(options, "draw-circle"),
    drawComplex: flagValue(options, "draw-complex"),
    mouseProof: flagValue(options, "mouse-proof"),
    mouseAction: optionalMouseAction(optionValue(options, "mouse-action")),
    mouseX: optionValue(options, "mouse-x") ? Number(optionValue(options, "mouse-x")) : undefined,
    mouseY: optionValue(options, "mouse-y") ? Number(optionValue(options, "mouse-y")) : undefined,
    mouseToX: optionValue(options, "mouse-to-x") ? Number(optionValue(options, "mouse-to-x")) : undefined,
    mouseToY: optionValue(options, "mouse-to-y") ? Number(optionValue(options, "mouse-to-y")) : undefined,
    mouseDurationMs: optionValue(options, "mouse-duration-ms") ? Number(optionValue(options, "mouse-duration-ms")) : undefined,
    mouseWindowTitlePattern: optionValue(options, "mouse-window-title"),
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined,
    dialogTimeoutMs: optionValue(options, "dialog-timeout-ms") ? Number(optionValue(options, "dialog-timeout-ms")) : undefined,
    intervalMs: optionValue(options, "interval-ms") ? Number(optionValue(options, "interval-ms")) : undefined
  });
  console.log(JSON.stringify(result, null, 2));
}

async function illustratorMouse(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const platform = resolveLaunchPlatform(optionalLaunchPlatform(optionValue(options, "platform")));
  const result = await driveIllustratorMouse({
    platform,
    action: optionalMouseAction(optionValue(options, "action")),
    button: optionalMouseButton(optionValue(options, "button")),
    relativeX: optionValue(options, "x") ? Number(optionValue(options, "x")) : undefined,
    relativeY: optionValue(options, "y") ? Number(optionValue(options, "y")) : undefined,
    endRelativeX: optionValue(options, "to-x") ? Number(optionValue(options, "to-x")) : undefined,
    endRelativeY: optionValue(options, "to-y") ? Number(optionValue(options, "to-y")) : undefined,
    durationMs: optionValue(options, "duration-ms") ? Number(optionValue(options, "duration-ms")) : undefined,
    windowTitlePattern: optionValue(options, "window-title"),
    toolShortcut: optionValue(options, "tool-shortcut"),
    dryRun: flagValue(options, "dry-run")
  });
  console.log(JSON.stringify(result, null, 2));
}

async function photoshopMouse(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const platform = resolveLaunchPlatform(optionalLaunchPlatform(optionValue(options, "platform")));
  const result = await drivePhotoshopMouse({
    platform,
    action: optionalMouseAction(optionValue(options, "action")),
    button: optionalMouseButton(optionValue(options, "button")),
    relativeX: optionValue(options, "x") ? Number(optionValue(options, "x")) : undefined,
    relativeY: optionValue(options, "y") ? Number(optionValue(options, "y")) : undefined,
    endRelativeX: optionValue(options, "to-x") ? Number(optionValue(options, "to-x")) : undefined,
    endRelativeY: optionValue(options, "to-y") ? Number(optionValue(options, "to-y")) : undefined,
    durationMs: optionValue(options, "duration-ms") ? Number(optionValue(options, "duration-ms")) : undefined,
    windowTitlePattern: optionValue(options, "window-title"),
    toolShortcut: optionValue(options, "tool-shortcut"),
    dryRun: flagValue(options, "dry-run")
  });
  console.log(JSON.stringify(result, null, 2));
}

async function serve(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const port = optionValue(options, "port") ? Number(optionValue(options, "port")) : undefined;
  const host = optionValue(options, "host");
  const root = optionValue(options, "root");
  const server = await startBridgeServer({ port, host, root });

  console.log(JSON.stringify({ ok: true, url: server.url }, null, 2));
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await server.close();
}

async function semanticSearch(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const query = options.positionals.join(" ");

  if (!query) {
    throw new ValidationError("semantic:search requires a query");
  }

  const limit = optionValue(options, "limit") ? Number(optionValue(options, "limit")) : undefined;
  const corpus = await loadDefaultCorpus(optionValue(options, "corpus"));
  const kind = optionalSemanticKind(optionValue(options, "kind"));
  const results = searchCorpus(query, corpus, { limit, kind });

  console.log(JSON.stringify({ ok: true, query, kind, resultCount: results.length, results }, null, 2));
}

async function semanticInspectVector(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const inputs = options.positionals;

  if (inputs.length === 0) {
    throw new ValidationError("semantic:inspect-vector requires at least one file or directory path");
  }

  const profiles = await inspectVectorShapeFiles(inputs, {
    limit: optionValue(options, "limit") ? Number(optionValue(options, "limit")) : undefined
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        inputCount: inputs.length,
        profileCount: profiles.length,
        profiles,
        items: profiles.map((profile) => profile.item)
      },
      null,
      2
    )
  );
}

async function semanticLearnVector(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const inputs = options.positionals;
  const output = optionValue(options, "output");

  if (inputs.length === 0) {
    throw new ValidationError("semantic:learn-vector requires at least one file or directory path");
  }

  if (!output) {
    throw new ValidationError("semantic:learn-vector requires --output CORPUS_JSON_PATH");
  }

  const profiles = await inspectVectorShapeFiles(inputs, {
    limit: optionValue(options, "limit") ? Number(optionValue(options, "limit")) : undefined
  });
  const merge = await mergeShapeCombinationItems(
    profiles.map((profile) => profile.item),
    {
      sourceCorpusPath: optionValue(options, "corpus"),
      outputCorpusPath: output
    }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        inputCount: inputs.length,
        profileCount: profiles.length,
        itemIds: profiles.map((profile) => profile.item.id),
        merge
      },
      null,
      2
    )
  );
}

async function jobStatus(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0];

  if (!id) {
    throw new ValidationError("job:status requires a job id");
  }

  const status = await readJobStatus(id, optionValue(options, "root"));
  console.log(JSON.stringify({ ok: true, job: status }, null, 2));
}

async function jobWait(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0];

  if (!id) {
    throw new ValidationError("job:wait requires a job id");
  }

  const status = await waitForJobResult(id, {
    root: optionValue(options, "root"),
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined,
    intervalMs: optionValue(options, "interval-ms") ? Number(optionValue(options, "interval-ms")) : undefined
  });
  console.log(JSON.stringify({ ok: true, job: status }, null, 2));
}

async function jobLaunch(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0];

  if (!id) {
    throw new ValidationError("job:launch requires a job id");
  }

  const { jobPath } = await getGeneratedJobPaths(normalizeJobId(id), optionValue(options, "root"));
  const result = await launchJsxJob(jobPath, {
    platform: optionalLaunchPlatform(optionValue(options, "platform")),
    appPath: optionValue(options, "app"),
    dryRun: flagValue(options, "dry-run"),
    root: optionValue(options, "root")
  });
  console.log(JSON.stringify(result, null, 2));
}

async function jobRunCom(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0];

  if (!id) {
    throw new ValidationError("job:run-com requires a job id");
  }

  const platform = resolveLaunchPlatform(optionalLaunchPlatform(optionValue(options, "platform")));
  const { jobPath } = await getGeneratedJobPaths(normalizeJobId(id), optionValue(options, "root"));
  const result = await runJsxViaIllustratorCom(jobPath, {
    platform,
    dryRun: flagValue(options, "dry-run"),
    root: optionValue(options, "root"),
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined
  });
  console.log(JSON.stringify(result, null, 2));
}

async function jobRunPhotoshopCom(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0];

  if (!id) {
    throw new ValidationError("job:run-photoshop-com requires a job id");
  }

  const platform = resolveLaunchPlatform(optionalLaunchPlatform(optionValue(options, "platform")));
  const { jobPath } = await getGeneratedJobPaths(normalizeJobId(id), optionValue(options, "root"));
  const result = await runJsxViaPhotoshopCom(jobPath, {
    platform,
    dryRun: flagValue(options, "dry-run"),
    root: optionValue(options, "root"),
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined
  });
  console.log(JSON.stringify(result, null, 2));
}

async function qaExport(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const path = options.positionals[0];

  if (!path) {
    throw new ValidationError("qa:export requires an export artifact path");
  }

  const report = await inspectExportArtifact(path, {
    format: optionalExportFormat(optionValue(options, "format")),
    minBytes: optionValue(options, "min-bytes") ? Number(optionValue(options, "min-bytes")) : undefined,
    minWidth: optionValue(options, "min-width") ? Number(optionValue(options, "min-width")) : undefined,
    minHeight: optionValue(options, "min-height") ? Number(optionValue(options, "min-height")) : undefined,
    minNonBlankRatio: optionValue(options, "min-nonblank-ratio") ? Number(optionValue(options, "min-nonblank-ratio")) : undefined
  });
  console.log(JSON.stringify({ ok: report.ok, report }, null, 2));
}

async function qaArtwork(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const path = options.positionals[0];

  if (!path) {
    throw new ValidationError("qa:artwork requires an export artifact path");
  }

  const exportQa = await inspectExportArtifact(path, {
    format: optionalExportFormat(optionValue(options, "format")),
    minBytes: optionValue(options, "min-bytes") ? Number(optionValue(options, "min-bytes")) : undefined,
    minWidth: optionValue(options, "min-width") ? Number(optionValue(options, "min-width")) : undefined,
    minHeight: optionValue(options, "min-height") ? Number(optionValue(options, "min-height")) : undefined,
    minNonBlankRatio: optionValue(options, "min-nonblank-ratio") ? Number(optionValue(options, "min-nonblank-ratio")) : undefined
  });
  const scenePath = optionValue(options, "scene");
  const scene = scenePath ? normalizeScene(sceneFromJson(await readJsonFile(scenePath))) : undefined;
  const review = reviewArtworkQuality({
    prompt: optionValue(options, "prompt") ?? "review exported Illustrator artwork",
    scene,
    exportQa,
    target: optionValue(options, "target")
  });

  console.log(JSON.stringify({ ok: exportQa.ok && review.ok, exportQa, review }, null, 2));
}

async function planCartoon(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");

  if (!prompt) {
    throw new ValidationError("plan:cartoon requires a prompt");
  }

  const corpus = await loadDefaultCorpus(optionValue(options, "corpus"));
  const plan = await planCartoonSceneWithMode(prompt, corpus, {
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    plannerMode: optionalPlannerMode(optionValue(options, "planner")),
    openAiModel: optionValue(options, "model")
  });
  const job = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, optionValue(options, "root"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        plan,
        job: generatedJobSummary(job)
      },
      null,
      2
    )
  );
}

async function planScientific(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");

  if (!prompt) {
    throw new ValidationError("plan:scientific requires a prompt");
  }

  const corpus = await loadDefaultCorpus(optionValue(options, "corpus"));
  const plan = planScientificConceptScene(prompt, corpus, {
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    evidenceLimit: optionValue(options, "evidence-limit") ? Number(optionValue(options, "evidence-limit")) : undefined
  });
  const job = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, optionValue(options, "root"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        plan,
        job: generatedJobSummary(job)
      },
      null,
      2
    )
  );
}

async function planObject(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");

  if (!prompt) {
    throw new ValidationError("plan:object requires a prompt");
  }

  const corpus = await loadDefaultCorpus(optionValue(options, "corpus"));
  const plan = planObjectShapeScene(prompt, corpus, {
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    evidenceLimit: optionValue(options, "evidence-limit") ? Number(optionValue(options, "evidence-limit")) : undefined
  });
  const job = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, optionValue(options, "root"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        plan,
        job: generatedJobSummary(job)
      },
      null,
      2
    )
  );
}

async function guardObject(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const targetArg = options.positionals[0];
  const scenePath = options.positionals[1];

  if (!targetArg || !scenePath) {
    throw new ValidationError("guard:object requires TARGET and SCENE_JSON_PATH");
  }

  const target = parseObjectShapeTarget(targetArg);
  const scene = normalizeScene(sceneFromJson(await readJsonFile(scenePath)));
  const guard = guardObjectShapeScene(target, scene, optionValue(options, "prompt"));

  console.log(JSON.stringify({ ok: guard.ok, guard }, null, 2));
}

async function workflowCartoon(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");
  const outputPath = optionValue(options, "output");

  if (!prompt) {
    throw new ValidationError("workflow:cartoon requires a prompt");
  }

  if (!outputPath) {
    throw new ValidationError("workflow:cartoon requires --output PATH");
  }

  const workflow = await prepareCartoonWorkflow({
    prompt,
    outputPath,
    format: optionalExportFormat(optionValue(options, "format")),
    root: optionValue(options, "root"),
    corpusPath: optionValue(options, "corpus"),
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    plannerMode: optionalPlannerMode(optionValue(options, "planner")),
    openAiModel: optionValue(options, "model")
  });

  console.log(JSON.stringify(workflow, null, 2));
}

async function workflowExecuteCartoon(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");
  const outputPath = optionValue(options, "output");
  const dryRun = flagValue(options, "dry-run");

  if (!prompt) {
    throw new ValidationError("workflow:execute-cartoon requires a prompt");
  }

  if (!outputPath) {
    throw new ValidationError("workflow:execute-cartoon requires --output PATH");
  }

  const execution = await executeCartoonWorkflow({
    prompt,
    outputPath,
    format: optionalExportFormat(optionValue(options, "format")),
    root: optionValue(options, "root"),
    corpusPath: optionValue(options, "corpus"),
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    launchPlatform: optionalLaunchPlatform(optionValue(options, "platform")),
    appPath: optionValue(options, "app"),
    dryRun,
    waitForResults: dryRun ? false : !flagValue(options, "no-wait"),
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined,
    intervalMs: optionValue(options, "interval-ms") ? Number(optionValue(options, "interval-ms")) : undefined,
    skipQa: flagValue(options, "skip-qa"),
    skipArtworkReview: flagValue(options, "skip-review"),
    minBytes: optionValue(options, "min-bytes") ? Number(optionValue(options, "min-bytes")) : undefined,
    minWidth: optionValue(options, "min-width") ? Number(optionValue(options, "min-width")) : undefined,
    minHeight: optionValue(options, "min-height") ? Number(optionValue(options, "min-height")) : undefined,
    minNonBlankRatio: optionValue(options, "min-nonblank-ratio") ? Number(optionValue(options, "min-nonblank-ratio")) : undefined,
    plannerMode: optionalPlannerMode(optionValue(options, "planner")),
    openAiModel: optionValue(options, "model")
  });

  console.log(JSON.stringify(execution, null, 2));
}

async function workflowAdobeSvgProof(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");
  const outputPath = optionValue(options, "output");

  if (!prompt) {
    throw new ValidationError("workflow:adobe-svg-proof requires a prompt");
  }

  if (!outputPath) {
    throw new ValidationError("workflow:adobe-svg-proof requires --output PATH");
  }

  const workflow = await prepareAdobeSvgProofWorkflow({
    prompt,
    outputPath,
    proofPngPath: optionValue(options, "proof-output"),
    root: optionValue(options, "root"),
    corpusPath: optionValue(options, "corpus"),
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    intent: optionalAdobeArtworkIntent(optionValue(options, "intent")),
    plannerMode: optionalPlannerMode(optionValue(options, "planner")),
    openAiModel: optionValue(options, "model"),
    proofWidth: optionValue(options, "proof-width") ? Number(optionValue(options, "proof-width")) : undefined,
    proofHeight: optionValue(options, "proof-height") ? Number(optionValue(options, "proof-height")) : undefined,
    proofResolution: optionValue(options, "proof-resolution") ? Number(optionValue(options, "proof-resolution")) : undefined
  });

  console.log(JSON.stringify(workflow, null, 2));
}

async function workflowExecuteAdobeSvgProof(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");
  const outputPath = optionValue(options, "output");
  const dryRun = flagValue(options, "dry-run");

  if (!prompt) {
    throw new ValidationError("workflow:execute-adobe-svg-proof requires a prompt");
  }

  if (!outputPath) {
    throw new ValidationError("workflow:execute-adobe-svg-proof requires --output PATH");
  }

  const execution = await executeAdobeSvgProofWorkflow({
    prompt,
    outputPath,
    proofPngPath: optionValue(options, "proof-output"),
    root: optionValue(options, "root"),
    corpusPath: optionValue(options, "corpus"),
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    intent: optionalAdobeArtworkIntent(optionValue(options, "intent")),
    plannerMode: optionalPlannerMode(optionValue(options, "planner")),
    openAiModel: optionValue(options, "model"),
    proofWidth: optionValue(options, "proof-width") ? Number(optionValue(options, "proof-width")) : undefined,
    proofHeight: optionValue(options, "proof-height") ? Number(optionValue(options, "proof-height")) : undefined,
    proofResolution: optionValue(options, "proof-resolution") ? Number(optionValue(options, "proof-resolution")) : undefined,
    launchPlatform: optionalLaunchPlatform(optionValue(options, "platform")),
    appPath: optionValue(options, "app"),
    illustratorRunMode: optionalAdobeSvgProofRunMode(optionValue(options, "illustrator-run-mode")),
    photoshopPlatform: optionalLaunchPlatform(optionValue(options, "photoshop-platform")),
    dryRun,
    waitForResults: dryRun ? false : !flagValue(options, "no-wait"),
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined,
    intervalMs: optionValue(options, "interval-ms") ? Number(optionValue(options, "interval-ms")) : undefined,
    skipQa: flagValue(options, "skip-qa"),
    skipArtworkReview: flagValue(options, "skip-review"),
    minBytes: optionValue(options, "min-bytes") ? Number(optionValue(options, "min-bytes")) : undefined,
    minWidth: optionValue(options, "min-width") ? Number(optionValue(options, "min-width")) : undefined,
    minHeight: optionValue(options, "min-height") ? Number(optionValue(options, "min-height")) : undefined,
    minNonBlankRatio: optionValue(options, "min-nonblank-ratio") ? Number(optionValue(options, "min-nonblank-ratio")) : undefined,
    proofMinWidth: optionValue(options, "proof-min-width") ? Number(optionValue(options, "proof-min-width")) : undefined,
    proofMinHeight: optionValue(options, "proof-min-height") ? Number(optionValue(options, "proof-min-height")) : undefined,
    proofMinNonBlankRatio: optionValue(options, "proof-min-nonblank-ratio") ? Number(optionValue(options, "proof-min-nonblank-ratio")) : undefined,
    maxReviewIterations: optionValue(options, "max-review-iterations") ? Number(optionValue(options, "max-review-iterations")) : undefined
  });

  console.log(JSON.stringify(execution, null, 2));
}

async function workflowAdobeProject(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");
  const outputPath = optionValue(options, "output");

  if (!prompt) {
    throw new ValidationError("workflow:adobe-project requires a prompt");
  }

  if (!outputPath) {
    throw new ValidationError("workflow:adobe-project requires --output PATH");
  }

  const workflow = await prepareAdobeProjectWorkflow({
    prompt,
    outputPath,
    sourceSvgPath: optionValue(options, "source-svg"),
    photoshopReferencePngPath: optionValue(options, "photoshop-reference"),
    photoshopHandoffSvgPath: optionValue(options, "photoshop-handoff-svg"),
    photoshopWorkingPsdPath: optionValue(options, "photoshop-working-psd"),
    photoshopFeedbackPath: optionValue(options, "photoshop-feedback"),
    root: optionValue(options, "root"),
    corpusPath: optionValue(options, "corpus"),
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    intent: optionalAdobeArtworkIntent(optionValue(options, "intent")),
    plannerMode: optionalPlannerMode(optionValue(options, "planner")),
    openAiModel: optionValue(options, "model"),
    proofWidth: optionValue(options, "proof-width") ? Number(optionValue(options, "proof-width")) : undefined,
    proofHeight: optionValue(options, "proof-height") ? Number(optionValue(options, "proof-height")) : undefined,
    proofResolution: optionValue(options, "proof-resolution") ? Number(optionValue(options, "proof-resolution")) : undefined,
    referenceOpacity: optionValue(options, "reference-opacity") ? Number(optionValue(options, "reference-opacity")) : undefined,
    embedReference: flagValue(options, "embed-reference"),
    visibleMouseProof: flagValue(options, "visible-mouse-proof")
  });

  console.log(JSON.stringify(workflow, null, 2));
}

async function workflowPreflightAdobeProject(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const externalReviewProvider = optionalExternalReviewProvider(optionValue(options, "external-review-provider"));
  const result = await preflightAdobeProjectWorkflow({
    illustratorPlatform: optionalLaunchPlatform(optionValue(options, "platform")),
    photoshopPlatform: optionalLaunchPlatform(optionValue(options, "photoshop-platform")),
    photoshopCrashLookbackMinutes: optionValue(options, "photoshop-crash-lookback-minutes")
      ? Number(optionValue(options, "photoshop-crash-lookback-minutes"))
      : undefined,
    photoshopTimeoutMs: optionValue(options, "photoshop-timeout-ms") ? Number(optionValue(options, "photoshop-timeout-ms")) : undefined,
    requireChatGptBrowser: flagValue(options, "require-chatgpt-browser") || externalReviewProvider === "auracall",
    auracallCommand: optionValue(options, "auracall-command"),
    chatGptTimeoutSeconds: optionValue(options, "chatgpt-timeout-seconds") ? Number(optionValue(options, "chatgpt-timeout-seconds")) : undefined,
    chatGptOperationTimeoutSeconds: optionValue(options, "chatgpt-operation-timeout-seconds")
      ? Number(optionValue(options, "chatgpt-operation-timeout-seconds"))
      : undefined
  });
  console.log(JSON.stringify(result, null, 2));
}

async function workflowExecuteAdobeProject(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");
  const outputPath = optionValue(options, "output");
  const dryRun = flagValue(options, "dry-run");
  const externalReviewVerdictPath = optionValue(options, "external-review-verdict");
  const externalReviewPacketPath = optionValue(options, "external-review-packet");
  const reviewReportPath = optionValue(options, "review-report");
  const externalReviewVerdict = externalReviewVerdictPath ? await readJsonFile(externalReviewVerdictPath) : undefined;
  const externalReviewProvider = optionalExternalReviewProvider(optionValue(options, "external-review-provider"));
  const externalReview =
    externalReviewProvider === "auracall"
      ? createAuraCallExternalArtworkReviewRunner({
          command: optionValue(options, "auracall-command"),
          model: optionValue(options, "external-review-model"),
          timeoutSeconds: optionValue(options, "external-review-timeout-seconds")
            ? Number(optionValue(options, "external-review-timeout-seconds"))
            : undefined,
          workdir: process.cwd(),
          packetPath: externalReviewPacketPath,
          outputPath: optionValue(options, "external-review-output"),
          preflightBrowserReadiness: !flagValue(options, "no-external-review-preflight"),
          preflightTimeoutSeconds: optionValue(options, "external-review-preflight-timeout-seconds")
            ? Number(optionValue(options, "external-review-preflight-timeout-seconds"))
            : undefined
        })
      : undefined;

  if (!prompt) {
    throw new ValidationError("workflow:execute-adobe-project requires a prompt");
  }

  if (!outputPath) {
    throw new ValidationError("workflow:execute-adobe-project requires --output PATH");
  }

  const execution = await executeAdobeProjectWorkflow({
    prompt,
    outputPath,
    sourceSvgPath: optionValue(options, "source-svg"),
    photoshopReferencePngPath: optionValue(options, "photoshop-reference"),
    photoshopHandoffSvgPath: optionValue(options, "photoshop-handoff-svg"),
    photoshopWorkingPsdPath: optionValue(options, "photoshop-working-psd"),
    photoshopFeedbackPath: optionValue(options, "photoshop-feedback"),
    root: optionValue(options, "root"),
    corpusPath: optionValue(options, "corpus"),
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    intent: optionalAdobeArtworkIntent(optionValue(options, "intent")),
    plannerMode: optionalPlannerMode(optionValue(options, "planner")),
    openAiModel: optionValue(options, "model"),
    proofWidth: optionValue(options, "proof-width") ? Number(optionValue(options, "proof-width")) : undefined,
    proofHeight: optionValue(options, "proof-height") ? Number(optionValue(options, "proof-height")) : undefined,
    proofResolution: optionValue(options, "proof-resolution") ? Number(optionValue(options, "proof-resolution")) : undefined,
    referenceOpacity: optionValue(options, "reference-opacity") ? Number(optionValue(options, "reference-opacity")) : undefined,
    embedReference: flagValue(options, "embed-reference"),
    visibleMouseProof: flagValue(options, "visible-mouse-proof"),
    visibleMouseDurationMs: optionValue(options, "visible-mouse-duration-ms") ? Number(optionValue(options, "visible-mouse-duration-ms")) : undefined,
    illustratorMouseToolShortcut: optionValue(options, "illustrator-mouse-tool"),
    photoshopMouseToolShortcut: optionValue(options, "photoshop-mouse-tool"),
    illustratorMouseWindowTitlePattern: optionValue(options, "illustrator-mouse-window-title"),
    photoshopMouseWindowTitlePattern: optionValue(options, "photoshop-mouse-window-title"),
    launchPlatform: optionalLaunchPlatform(optionValue(options, "platform")),
    appPath: optionValue(options, "app"),
    illustratorRunMode: optionalAdobeSvgProofRunMode(optionValue(options, "illustrator-run-mode")),
    photoshopPlatform: optionalLaunchPlatform(optionValue(options, "photoshop-platform")),
    dryRun,
    waitForResults: dryRun ? false : !flagValue(options, "no-wait"),
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined,
    intervalMs: optionValue(options, "interval-ms") ? Number(optionValue(options, "interval-ms")) : undefined,
    skipQa: flagValue(options, "skip-qa"),
    skipArtworkReview: flagValue(options, "skip-review"),
    minBytes: optionValue(options, "min-bytes") ? Number(optionValue(options, "min-bytes")) : undefined,
    minWidth: optionValue(options, "min-width") ? Number(optionValue(options, "min-width")) : undefined,
    minHeight: optionValue(options, "min-height") ? Number(optionValue(options, "min-height")) : undefined,
    minNonBlankRatio: optionValue(options, "min-nonblank-ratio") ? Number(optionValue(options, "min-nonblank-ratio")) : undefined,
    proofMinWidth: optionValue(options, "proof-min-width") ? Number(optionValue(options, "proof-min-width")) : undefined,
    proofMinHeight: optionValue(options, "proof-min-height") ? Number(optionValue(options, "proof-min-height")) : undefined,
    proofMinNonBlankRatio: optionValue(options, "proof-min-nonblank-ratio") ? Number(optionValue(options, "proof-min-nonblank-ratio")) : undefined,
    maxReviewIterations: optionValue(options, "max-review-iterations") ? Number(optionValue(options, "max-review-iterations")) : undefined,
    externalReview,
    externalReviewPacketPath,
    externalReviewVerdict,
    requireExternalReviewPass: flagValue(options, "require-external-review") || externalReviewProvider === "auracall",
    externalReviewMinScore: optionValue(options, "external-review-min-score") ? Number(optionValue(options, "external-review-min-score")) : undefined,
    reviewReportPath
  });

  console.log(JSON.stringify(execution, null, 2));
}

async function workflowObject(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");
  const outputPath = optionValue(options, "output");

  if (!prompt) {
    throw new ValidationError("workflow:object requires a prompt");
  }

  if (!outputPath) {
    throw new ValidationError("workflow:object requires --output PATH");
  }

  const workflow = await prepareObjectShapeWorkflow({
    prompt,
    outputPath,
    format: optionalExportFormat(optionValue(options, "format")),
    root: optionValue(options, "root"),
    corpusPath: optionValue(options, "corpus"),
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    evidenceLimit: optionValue(options, "evidence-limit") ? Number(optionValue(options, "evidence-limit")) : undefined,
    maxGuardIterations: optionValue(options, "max-guard-iterations") ? Number(optionValue(options, "max-guard-iterations")) : undefined
  });

  console.log(JSON.stringify(workflow, null, 2));
}

async function workflowExecuteObject(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const prompt = options.positionals.join(" ");
  const outputPath = optionValue(options, "output");
  const dryRun = flagValue(options, "dry-run");

  if (!prompt) {
    throw new ValidationError("workflow:execute-object requires a prompt");
  }

  if (!outputPath) {
    throw new ValidationError("workflow:execute-object requires --output PATH");
  }

  const execution = await executeObjectShapeWorkflow({
    prompt,
    outputPath,
    format: optionalExportFormat(optionValue(options, "format")),
    root: optionValue(options, "root"),
    corpusPath: optionValue(options, "corpus"),
    title: optionValue(options, "title"),
    width: optionValue(options, "width") ? Number(optionValue(options, "width")) : undefined,
    height: optionValue(options, "height") ? Number(optionValue(options, "height")) : undefined,
    evidenceLimit: optionValue(options, "evidence-limit") ? Number(optionValue(options, "evidence-limit")) : undefined,
    maxGuardIterations: optionValue(options, "max-guard-iterations") ? Number(optionValue(options, "max-guard-iterations")) : undefined,
    launchPlatform: optionalLaunchPlatform(optionValue(options, "platform")),
    appPath: optionValue(options, "app"),
    runMode: optionalObjectWorkflowRunMode(optionValue(options, "run-mode")),
    dryRun,
    waitForResults: dryRun ? false : !flagValue(options, "no-wait"),
    timeoutMs: optionValue(options, "timeout-ms") ? Number(optionValue(options, "timeout-ms")) : undefined,
    intervalMs: optionValue(options, "interval-ms") ? Number(optionValue(options, "interval-ms")) : undefined,
    skipQa: flagValue(options, "skip-qa"),
    skipArtworkReview: flagValue(options, "skip-review"),
    minBytes: optionValue(options, "min-bytes") ? Number(optionValue(options, "min-bytes")) : undefined,
    minWidth: optionValue(options, "min-width") ? Number(optionValue(options, "min-width")) : undefined,
    minHeight: optionValue(options, "min-height") ? Number(optionValue(options, "min-height")) : undefined,
    minNonBlankRatio: optionValue(options, "min-nonblank-ratio") ? Number(optionValue(options, "min-nonblank-ratio")) : undefined
  });

  console.log(JSON.stringify(execution, null, 2));
}

interface ParsedOptions {
  positionals: string[];
  values: Map<string, string>;
  flags: Set<string>;
}

const flagOptions = new Set([
  "dry-run",
  "no-wait",
  "skip-qa",
  "skip-review",
  "wait",
  "auto-confirm-dialog",
  "draw-circle",
  "draw-complex",
  "mouse-proof",
  "visible-mouse-proof",
  "embed-reference",
  "require-external-review",
  "require-chatgpt-browser",
  "no-external-review-preflight"
]);

function parseOptions(args: string[]): ParsedOptions {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];

    if (!key) {
      throw new ValidationError("Empty option name");
    }

    if (next === undefined || next.startsWith("--")) {
      if (flagOptions.has(key)) {
        flags.add(key);
        continue;
      }

      throw new ValidationError(`Option --${key} requires a value`);
    }

    values.set(key, next);
    index += 1;
  }

  return { positionals, values, flags };
}

function optionValue(options: ParsedOptions, key: string): string | undefined {
  return options.values.get(key);
}

function flagValue(options: ParsedOptions, key: string): boolean {
  const value = options.values.get(key);
  if (value !== undefined) {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }

    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }

    throw new ValidationError(`Option --${key} must be true or false`);
  }

  return options.flags.has(key);
}

async function readJsonArg(value: string): Promise<unknown> {
  if (value.trim().startsWith("{")) {
    return JSON.parse(value);
  }

  return readJsonFile(value);
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function objectArg(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("Tool arguments must be a JSON object");
  }

  return value as Record<string, unknown>;
}

function sceneFromJson(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const plan = record.plan;
  if (typeof plan === "object" && plan !== null && !Array.isArray(plan) && "scene" in plan) {
    return (plan as Record<string, unknown>).scene;
  }

  if ("scene" in record) {
    return record.scene;
  }

  return value;
}

function printHelp(): void {
  console.log(`illustrator-agent-bridge

Commands:
  mcp:list-tools [--url URL] [--token TOKEN]
  mcp:call TOOL [JSON_OR_PATH] [--url URL] [--token TOKEN]
  mcp:serve
  jsx:ping [--message TEXT] [--root DIR]
  jsx:cartoon [SCENE_JSON_PATH] [--root DIR]
  jsx:export --output PATH [--format pdf|svg|png|jpg] [--root DIR]
  photoshop:detect [--platform auto|windows|wsl] [--crash-lookback-minutes N] [--timeout-ms N]
  chatgpt:detect [--auracall-command PATH] [--timeout-seconds N] [--operation-timeout-seconds N] [--live] [--no-prune]
  photoshop:proof-svg SVG_PATH --output PNG_PATH [--width N] [--height N] [--resolution N] [--root DIR]
  illustrator:detect [--platform auto|macos|windows|wsl|linux]
  illustrator:probe [--platform auto|macos|windows|wsl|linux] [--method auto|desktop|com] [--app PATH_OR_NAME] [--dry-run] [--wait] [--auto-confirm-dialog] [--draw-circle] [--draw-complex] [--mouse-proof] [--mouse-action move|click|double-click|drag] [--timeout-ms N] [--dialog-timeout-ms N] [--root DIR]
  illustrator:mouse [--platform windows|wsl] [--action move|click|double-click|drag] [--button left|right] [--x 0.5] [--y 0.5] [--to-x 0.7] [--to-y 0.5] [--duration-ms N] [--tool-shortcut TEXT] [--window-title REGEX] [--dry-run]
  photoshop:mouse [--platform windows|wsl] [--action move|click|double-click|drag] [--button left|right] [--x 0.5] [--y 0.5] [--to-x 0.7] [--to-y 0.5] [--duration-ms N] [--tool-shortcut TEXT] [--window-title REGEX] [--dry-run]
  plan:cartoon PROMPT [--width N] [--height N] [--title TEXT] [--planner deterministic|auto|openai] [--model MODEL] [--root DIR] [--corpus PATH]
  plan:scientific PROMPT [--width N] [--height N] [--title TEXT] [--evidence-limit N] [--root DIR] [--corpus PATH]
  plan:object PROMPT [--width N] [--height N] [--title TEXT] [--evidence-limit N] [--root DIR] [--corpus PATH]
  guard:object cat|lock|key SCENE_JSON_PATH [--prompt TEXT]
  workflow:cartoon PROMPT --output PATH [--format pdf|svg|png|jpg] [--planner deterministic|auto|openai] [--model MODEL] [--root DIR] [--corpus PATH]
  workflow:execute-cartoon PROMPT --output PATH [--format pdf|svg|png|jpg] [--dry-run] [--no-wait] [--skip-qa] [--skip-review] [--planner deterministic|auto|openai] [--model MODEL] [--platform auto|macos|windows|wsl|linux] [--app PATH_OR_NAME] [--root DIR] [--corpus PATH] [--min-nonblank-ratio N]
  workflow:adobe-svg-proof PROMPT --output SVG_PATH [--proof-output PNG_PATH] [--intent auto|cartoon|scientific|object] [--planner deterministic|auto|openai] [--proof-width N] [--proof-height N] [--proof-resolution N] [--root DIR] [--corpus PATH]
  workflow:execute-adobe-svg-proof PROMPT --output SVG_PATH [--proof-output PNG_PATH] [--intent auto|cartoon|scientific|object] [--illustrator-run-mode launch|com] [--max-review-iterations N] [--platform auto|macos|windows|wsl|linux] [--photoshop-platform auto|windows|wsl] [--dry-run] [--no-wait] [--skip-qa] [--skip-review] [--root DIR] [--corpus PATH]
  workflow:adobe-project PROMPT --output SVG_PATH [--source-svg SVG_PATH] [--photoshop-reference PNG_PATH] [--photoshop-handoff-svg SVG_PATH] [--photoshop-working-psd PSD_PATH] [--photoshop-feedback JSON_PATH] [--intent auto|cartoon|scientific|object] [--reference-opacity N] [--embed-reference] [--visible-mouse-proof] [--root DIR] [--corpus PATH]
  workflow:preflight-adobe-project [--platform auto|macos|windows|wsl|linux] [--photoshop-platform auto|windows|wsl] [--photoshop-crash-lookback-minutes N] [--photoshop-timeout-ms N] [--require-chatgpt-browser] [--external-review-provider manual|auracall] [--chatgpt-timeout-seconds N] [--chatgpt-operation-timeout-seconds N] [--auracall-command PATH]
  workflow:execute-adobe-project PROMPT --output SVG_PATH [--source-svg SVG_PATH] [--photoshop-reference PNG_PATH] [--photoshop-handoff-svg SVG_PATH] [--photoshop-working-psd PSD_PATH] [--photoshop-feedback JSON_PATH] [--intent auto|cartoon|scientific|object] [--illustrator-run-mode launch|com] [--max-review-iterations N] [--reference-opacity N] [--embed-reference] [--visible-mouse-proof] [--visible-mouse-duration-ms N] [--illustrator-mouse-tool TEXT] [--photoshop-mouse-tool TEXT] [--external-review-provider manual|auracall] [--external-review-packet JSON_PATH] [--external-review-output TXT_PATH] [--external-review-verdict JSON_PATH] [--review-report JSON_PATH] [--require-external-review] [--external-review-min-score N] [--external-review-model MODEL] [--external-review-timeout-seconds N] [--external-review-preflight-timeout-seconds N] [--no-external-review-preflight] [--auracall-command PATH] [--platform auto|macos|windows|wsl|linux] [--photoshop-platform auto|windows|wsl] [--dry-run] [--no-wait] [--skip-qa] [--skip-review] [--root DIR] [--corpus PATH]
  workflow:object PROMPT --output PATH [--format pdf|svg|png|jpg] [--max-guard-iterations N] [--root DIR] [--corpus PATH]
  workflow:execute-object PROMPT --output PATH [--format pdf|svg|png|jpg] [--run-mode launch|com] [--max-guard-iterations N] [--dry-run] [--no-wait] [--skip-qa] [--skip-review] [--platform auto|macos|windows|wsl|linux] [--app PATH_OR_NAME] [--root DIR] [--corpus PATH] [--min-nonblank-ratio N]
  job:status JOB_ID [--root DIR]
  job:wait JOB_ID [--timeout-ms N] [--interval-ms N] [--root DIR]
  job:launch JOB_ID [--platform auto|macos|windows|wsl|linux] [--app PATH_OR_NAME] [--dry-run] [--root DIR]
  job:run-com JOB_ID [--platform auto|windows|wsl] [--dry-run] [--timeout-ms N] [--root DIR]
  job:run-photoshop-com JOB_ID [--platform auto|windows|wsl] [--dry-run] [--timeout-ms N] [--root DIR]
  qa:export PATH [--format pdf|svg|png|jpg] [--min-bytes N] [--min-width N] [--min-height N] [--min-nonblank-ratio N]
  qa:artwork PATH [--scene SCENE_OR_PLAN_JSON] [--prompt TEXT] [--target TEXT] [--format pdf|svg|png|jpg] [--min-bytes N] [--min-width N] [--min-height N] [--min-nonblank-ratio N]
  serve [--host 127.0.0.1] [--port 4317] [--root DIR]
  semantic:search QUERY [--limit N] [--kind object_semantics|shape_recipe|shape_combination|scientific_concept|visual_metaphor|style_reference|publication_requirement|document_state|illustrator_capability] [--corpus PATH]
  semantic:inspect-vector PATH... [--limit N]
  semantic:learn-vector PATH... --output CORPUS_JSON_PATH [--corpus BASE_CORPUS_JSON_PATH] [--limit N]

Environment:
  ILLUSTRATOR_MCP_URL       Illustrator Beta MCP URL, for example http://localhost:18412/v1/mcp
  ILLUSTRATOR_MCP_TOKEN     Bearer key copied from Illustrator Beta MCP & Tools
  ILLUSTRATOR_AGENT_BRIDGE_ROOT  Generated job/result root, default ./var
  ILLUSTRATOR_SEMANTIC_CORPUS    Semantic corpus JSON path, default ./data/semantic-corpus.json
  OPENAI_API_KEY            Enables --planner auto/openai LLM scene planning
  OPENAI_MODEL              Optional OpenAI planner model, default gpt-5.5
  OPENAI_BASE_URL           Optional OpenAI API base URL, default https://api.openai.com/v1
`);
}

main(process.argv.slice(2)).catch((error) => {
  const expected =
    error instanceof ValidationError ||
    error instanceof McpConfigError ||
    error instanceof JobResultError ||
    error instanceof ExportQaError ||
    error instanceof LaunchJobError ||
    error instanceof OpenAiPlannerError ||
    error instanceof ObjectShapePlannerError;
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = expected ? 2 : 1;
});

function optionalExportFormat(input: string | undefined): "pdf" | "svg" | "png" | "jpg" | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "pdf" && value !== "svg" && value !== "png" && value !== "jpg") {
    throw new ValidationError("format must be pdf, svg, png, or jpg");
  }

  return value;
}

function optionalLaunchPlatform(input: string | undefined): LaunchPlatform | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "auto" && value !== "macos" && value !== "windows" && value !== "wsl" && value !== "linux") {
    throw new ValidationError("platform must be auto, macos, windows, wsl, or linux");
  }

  return value;
}

function optionalPlannerMode(input: string | undefined): PlannerMode | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "deterministic" && value !== "auto" && value !== "openai") {
    throw new ValidationError("planner must be deterministic, auto, or openai");
  }

  return value;
}

function optionalObjectWorkflowRunMode(input: string | undefined): ObjectWorkflowRunMode | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "launch" && value !== "com") {
    throw new ValidationError("run-mode must be launch or com");
  }

  return value;
}

function optionalAdobeArtworkIntent(input: string | undefined): AdobeArtworkIntent | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "auto" && value !== "cartoon" && value !== "scientific" && value !== "object") {
    throw new ValidationError("intent must be auto, cartoon, scientific, or object");
  }

  return value;
}

function optionalAdobeSvgProofRunMode(input: string | undefined): AdobeSvgProofRunMode | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "launch" && value !== "com") {
    throw new ValidationError("illustrator-run-mode must be launch or com");
  }

  return value;
}

function optionalExternalReviewProvider(input: string | undefined): "manual" | "auracall" | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "manual" && value !== "auracall") {
    throw new ValidationError("external-review-provider must be manual or auracall");
  }

  return value;
}

function optionalProbeMethod(input: string | undefined): IllustratorProbeMethod | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "auto" && value !== "desktop" && value !== "com") {
    throw new ValidationError("method must be auto, desktop, or com");
  }

  return value;
}

function optionalSemanticKind(input: string | undefined): SemanticKind | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (
    value !== "object_semantics" &&
    value !== "shape_recipe" &&
    value !== "shape_combination" &&
    value !== "scientific_concept" &&
    value !== "visual_metaphor" &&
    value !== "style_reference" &&
    value !== "publication_requirement" &&
    value !== "document_state" &&
    value !== "illustrator_capability"
  ) {
    throw new ValidationError("semantic kind is not supported");
  }

  return value;
}

function optionalMouseAction(input: string | undefined): IllustratorMouseAction | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "move" && value !== "click" && value !== "double-click" && value !== "drag") {
    throw new ValidationError("mouse action must be move, click, double-click, or drag");
  }

  return value;
}

function optionalMouseButton(input: string | undefined): IllustratorMouseButton | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input.toLowerCase();
  if (value !== "left" && value !== "right") {
    throw new ValidationError("mouse button must be left or right");
  }

  return value;
}
