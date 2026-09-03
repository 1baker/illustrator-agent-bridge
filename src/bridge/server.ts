import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { runJsxViaIllustratorCom } from "./comAutomation.js";
import { dashboardHtml } from "./dashboard.js";
import { createGeneratedJob } from "./jobs.js";
import { getGeneratedJobPaths, resolveBridgeRoot } from "./files.js";
import { detectIllustratorApps, probeIllustratorCommunication, type IllustratorProbeMethod } from "./illustratorProbe.js";
import { generatedJobSummary } from "./jsxGenerator.js";
import { LaunchJobError, launchJsxJob, resolveLaunchPlatform, type LaunchPlatform } from "./launcher.js";
import { driveIllustratorMouse, drivePhotoshopMouse, type IllustratorMouseAction, type IllustratorMouseButton } from "./mouseAutomation.js";
import { detectPhotoshopDesktop } from "./photoshopProbe.js";
import { JobResultError, normalizeJobId, readJobStatus } from "./results.js";
import { normalizeCommand, normalizeScene, ValidationError } from "./validation.js";
import { OpenAiPlannerError } from "../planner/openAiCartoonPlanner.js";
import { ObjectShapePlannerError, parseObjectShapeTarget, planObjectShapeScene } from "../planner/objectShapePlanner.js";
import type { PlannerMode } from "../planner/plannerRouter.js";
import { planScientificConceptScene } from "../planner/scientificConceptPlanner.js";
import { createAuraCallExternalArtworkReviewRunner, detectAuraCallChatGptBrowser } from "../qa/auracallExternalArtworkJudge.js";
import { reviewArtworkQuality } from "../qa/artworkReviewGuard.js";
import { ExportQaError, inspectExportArtifact } from "../qa/exportQa.js";
import { guardObjectShapeScene } from "../qa/objectShapeGuard.js";
import { loadDefaultCorpus, searchCorpus } from "../semantic/search.js";
import type { SemanticKind } from "../semantic/types.js";
import { inspectVectorShapeFiles } from "../semantic/vectorShapeIngest.js";
import { executeAdobeProjectWorkflow, prepareAdobeProjectWorkflow } from "../workflow/adobeProjectWorkflow.js";
import { preflightAdobeProjectWorkflow } from "../workflow/adobeProjectPreflight.js";
import { executeAdobeSvgProofWorkflow, prepareAdobeSvgProofWorkflow, type AdobeArtworkIntent, type AdobeSvgProofRunMode } from "../workflow/adobeSvgProofWorkflow.js";
import { executeCartoonWorkflow } from "../workflow/cartoonExecutor.js";
import { executeObjectShapeWorkflow, type ObjectWorkflowRunMode } from "../workflow/objectExecutor.js";
import { prepareCartoonWorkflow } from "../workflow/cartoonWorkflow.js";
import { prepareObjectShapeWorkflow } from "../workflow/objectWorkflow.js";
import { renderSceneToSvg } from "../render/svgRenderer.js";
import { renderSceneToTikz } from "../render/tikzRenderer.js";
import { renderScientificPlotToPgfplots } from "../render/pgfplotsRenderer.js";
import { renderSceneToPng, type PngRenderResult } from "../render/pngRenderer.js";
import { composeRasterLayersToPng, type RasterCompositionResult } from "../render/rasterCompositor.js";
import { compileScientificFigure } from "../scientific/figureCompiler.js";
import { planScientificStory } from "../scientific/storyPlanner.js";
import { parseScientificText } from "../scientific/textStoryParser.js";
import { constructPolygonBoolean } from "../core/polygonBoolean.js";
import { flattenBezierPath } from "../core/bezierFlattening.js";
import { expandStroke } from "../core/strokeExpansion.js";
import { placePathMarkers } from "../core/pathMarkers.js";
import { compileScientificPlot } from "../core/scientificPlot.js";
import { generateScientificImage } from "../scientific/imageGenerator.js";
import { generateScientificFigureProject } from "../scientific/figureProjectGenerator.js";
import { planScientificPromptFigure } from "../scientific/promptFigureWorkflow.js";
import { approveScientificFigureBrief, approveScientificFigureFinal } from "../scientific/figureProject.js";
import { generateProposalVisualPackage, serializeProposalVisualPackage } from "../proposal/proposalVisualWorkflow.js";

export interface ServerOptions {
  host?: string;
  port?: number;
  root?: string;
}

export async function startBridgeServer(options: ServerOptions = {}): Promise<{ close: () => Promise<void>; url: string }> {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 4317;
  const root = resolveBridgeRoot(options.root);

  const server = createServer(async (request, response) => {
    try {
      await routeRequest(request, response, root);
    } catch (error) {
      writeJson(response, statusForError(error), {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : requestedPort;

  return {
    url: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

async function routeRequest(request: IncomingMessage, response: ServerResponse, root: string): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, { ok: true, root });
    return;
  }

  if (method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
    writeHtml(response, 200, dashboardHtml());
    return;
  }

  if (method === "GET" && url.pathname === "/v1/illustrator/detect") {
    const platform = optionalLaunchPlatform(url.searchParams.get("platform") ?? undefined);
    const candidates = await detectIllustratorApps(platform);
    writeJson(response, 200, { ok: true, platform: platform ?? "auto", candidates });
    return;
  }

  if (method === "GET" && url.pathname === "/v1/photoshop/detect") {
    const platform = optionalLaunchPlatform(url.searchParams.get("platform") ?? undefined);
    const crashLookbackMinutes = optionalNumberQueryValue(url.searchParams.get("crashLookbackMinutes") ?? undefined, "crashLookbackMinutes");
    const timeoutMs = optionalNumberQueryValue(url.searchParams.get("timeoutMs") ?? undefined, "timeoutMs");
    const result = await detectPhotoshopDesktop({ platform, crashLookbackMinutes, timeoutMs });
    writeJson(response, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/v1/chatgpt/detect") {
    const command = url.searchParams.get("auracallCommand") ?? undefined;
    const timeoutSeconds = optionalNumberQueryValue(url.searchParams.get("timeoutSeconds") ?? undefined, "timeoutSeconds");
    const result = await detectAuraCallChatGptBrowser({ command, timeoutSeconds, workdir: process.cwd() });
    writeJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/illustrator/probe") {
    const body = objectBody(await readOptionalJson(request));
    const result = await probeIllustratorCommunication({
      platform: optionalLaunchPlatform(body.platform),
      method: optionalProbeMethod(body.method),
      appPath: optionalStringBodyValue(body.appPath, "appPath"),
      dryRun: optionalBooleanBodyValue(body.dryRun, "dryRun"),
      waitForResult: optionalBooleanBodyValue(body.waitForResult, "waitForResult"),
      autoConfirmDialog: optionalBooleanBodyValue(body.autoConfirmDialog, "autoConfirmDialog"),
      drawCircle: optionalBooleanBodyValue(body.drawCircle, "drawCircle"),
      drawComplex: optionalBooleanBodyValue(body.drawComplex, "drawComplex"),
      mouseProof: optionalBooleanBodyValue(body.mouseProof, "mouseProof"),
      mouseAction: optionalMouseAction(body.mouseAction),
      mouseX: optionalNumberBodyValue(body.mouseX, "mouseX"),
      mouseY: optionalNumberBodyValue(body.mouseY, "mouseY"),
      mouseToX: optionalNumberBodyValue(body.mouseToX, "mouseToX"),
      mouseToY: optionalNumberBodyValue(body.mouseToY, "mouseToY"),
      mouseDurationMs: optionalNumberBodyValue(body.mouseDurationMs, "mouseDurationMs"),
      mouseWindowTitlePattern: optionalStringBodyValue(body.mouseWindowTitlePattern, "mouseWindowTitlePattern"),
      timeoutMs: optionalNumberBodyValue(body.timeoutMs, "timeoutMs"),
      dialogTimeoutMs: optionalNumberBodyValue(body.dialogTimeoutMs, "dialogTimeoutMs"),
      intervalMs: optionalNumberBodyValue(body.intervalMs, "intervalMs"),
      root
    });
    writeJson(response, 201, result);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/illustrator/mouse") {
    const body = objectBody(await readOptionalJson(request));
    const result = await driveIllustratorMouse({
      platform: resolveLaunchPlatform(optionalLaunchPlatform(body.platform)),
      action: optionalMouseAction(body.action),
      button: optionalMouseButton(body.button),
      relativeX: optionalNumberBodyValue(body.x, "x"),
      relativeY: optionalNumberBodyValue(body.y, "y"),
      endRelativeX: optionalNumberBodyValue(body.toX, "toX"),
      endRelativeY: optionalNumberBodyValue(body.toY, "toY"),
      durationMs: optionalNumberBodyValue(body.durationMs, "durationMs"),
      windowTitlePattern: optionalStringBodyValue(body.windowTitlePattern, "windowTitlePattern"),
      toolShortcut: optionalStringBodyValue(body.toolShortcut, "toolShortcut"),
      toolShortcutDelayMs: optionalNumberBodyValue(body.toolShortcutDelayMs, "toolShortcutDelayMs"),
      dryRun: optionalBooleanBodyValue(body.dryRun, "dryRun")
    });
    writeJson(response, 201, result);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/photoshop/mouse") {
    const body = objectBody(await readOptionalJson(request));
    const result = await drivePhotoshopMouse({
      platform: resolveLaunchPlatform(optionalLaunchPlatform(body.platform)),
      action: optionalMouseAction(body.action),
      button: optionalMouseButton(body.button),
      relativeX: optionalNumberBodyValue(body.x, "x"),
      relativeY: optionalNumberBodyValue(body.y, "y"),
      endRelativeX: optionalNumberBodyValue(body.toX, "toX"),
      endRelativeY: optionalNumberBodyValue(body.toY, "toY"),
      durationMs: optionalNumberBodyValue(body.durationMs, "durationMs"),
      windowTitlePattern: optionalStringBodyValue(body.windowTitlePattern, "windowTitlePattern"),
      toolShortcut: optionalStringBodyValue(body.toolShortcut, "toolShortcut"),
      toolShortcutDelayMs: optionalNumberBodyValue(body.toolShortcutDelayMs, "toolShortcutDelayMs"),
      dryRun: optionalBooleanBodyValue(body.dryRun, "dryRun")
    });
    writeJson(response, 201, result);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/semantic/search") {
    const body = objectBody(await readJson(request));
    const query = stringBodyValue(body.query, "query");
    const limit = optionalNumberBodyValue(body.limit, "limit");
    const kind = optionalSemanticKind(body.kind);
    const corpus = await loadDefaultCorpus();
    const results = searchCorpus(query, corpus, { limit, kind });
    writeJson(response, 200, {
      ok: true,
      query,
      kind,
      resultCount: results.length,
      results
    });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/semantic/inspect-vector") {
    const body = objectBody(await readJson(request));
    const paths = stringArrayBodyValue(body.paths, "paths");
    const profiles = await inspectVectorShapeFiles(paths, {
      limit: optionalNumberBodyValue(body.limit, "limit")
    });
    writeJson(response, 200, {
      ok: true,
      inputCount: paths.length,
      profileCount: profiles.length,
      profiles,
      items: profiles.map((profile) => profile.item)
    });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/jobs") {
    const body = await readJson(request);
    const command = normalizeCommand(body);
    const job = await createGeneratedJob(command, root);
    writeJson(response, 201, {
      ok: true,
      job: generatedJobSummary(job),
      run: {
        illustratorMenu: "File > Scripts > Other Script",
        scriptPath: job.illustratorJobPath,
        resultPath: job.resultPath,
        illustratorResultPath: job.illustratorResultPath
      }
    });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/scientific/plan") {
    const body = objectBody(await readJson(request));
    const prompt = stringBodyValue(body.prompt, "prompt");
    const corpus = await loadDefaultCorpus();
    const plan = planScientificConceptScene(prompt, corpus, {
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      evidenceLimit: optionalNumberBodyValue(body.evidenceLimit, "evidenceLimit")
    });
    const job = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, root);
    writeJson(response, 201, {
      ok: true,
      plan,
      job: generatedJobSummary(job),
      run: {
        illustratorMenu: "File > Scripts > Other Script",
        scriptPath: job.illustratorJobPath,
        resultPath: job.resultPath,
        illustratorResultPath: job.illustratorResultPath
      }
    });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/scientific/story") {
    const story = await readJson(request);
    const figure = planScientificStory(story);
    const scene = compileScientificFigure(figure);
    writeJson(response, 200, { ok: true, figure, scene, svg: renderSceneToSvg(scene) });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/scientific/text") {
    const parsed = parseScientificText(await readJson(request) as Parameters<typeof parseScientificText>[0]);
    const figure = planScientificStory(parsed.story);
    const scene = compileScientificFigure(figure);
    writeJson(response, 200, { ok: true, parsed, figure, scene, svg: renderSceneToSvg(scene) });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/scientific/plot") {
    const result = compileScientificPlot(await readJson(request));
    writeJson(response, 200, { ok: true, result, svg: renderSceneToSvg(result.scene) });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/scientific/pgfplots") {
    const rendered = renderScientificPlotToPgfplots(await readJson(request));
    writeJson(response, 200, { ok: true, latex: rendered.latex, renderer: rendered.renderer, compat: rendered.compat, plot: rendered.plot });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/scientific/image") {
    const generated = generateScientificImage(await readJson(request));
    writeJson(response, 200, {
      ok: true,
      manifest: generated.manifest,
      intermediate: generated.intermediate,
      scene: generated.scene,
      svg: generated.svg,
      latex: generated.latex,
      pngBase64: generated.png.png.toString("base64")
    });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/scientific/figure-project") {
    const body = objectBody(await readJson(request));
    const generated = await generateScientificFigureProject(body.project, {
      assetRoot: optionalStringBodyValue(body.assetRoot, "assetRoot") ?? root,
      runAnalysis: optionalBooleanBodyValue(body.runAnalysis, "runAnalysis")
    });
    writeJson(response, 200, {
      ok: true, project: generated.project, manifest: generated.manifest, qa: generated.qa, semanticJson: generated.semanticJson,
      analysisJson: generated.analysisJson, svg: generated.svg, latex: generated.latex, pngBase64: generated.png.toString("base64"), pdfBase64: generated.pdf.toString("base64")
    });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/scientific/prompt-plan") {
    const body = objectBody(await readJson(request));
    const generated = await planScientificPromptFigure(body.request, { registryRoot: resolve(root, "publication-figure-registry", "v1") });
    writeJson(response, 200, {
      ok: true, status: generated.status, nextGate: generated.nextGate, request: generated.request, requestDigest: generated.requestDigest,
      planner: generated.planner, presentationRetrieval: generated.presentationRetrieval, project: generated.project, semanticDigest: generated.semanticDigest, qa: generated.qa,
      preview: generated.preview ? { manifest: generated.preview.manifest, intermediate: generated.preview.intermediate, scene: generated.preview.scene, svg: generated.preview.svg, latex: generated.preview.latex, pngBase64: generated.preview.png.png.toString("base64") } : undefined
    });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/scientific/approve-brief") {
    const body = objectBody(await readJson(request)); const reviewer = optionalStringBodyValue(body.reviewer, "reviewer"), reviewedAt = optionalStringBodyValue(body.reviewedAt, "reviewedAt");
    if (!reviewer || !reviewedAt) throw new ValidationError("approve-brief requires reviewer and reviewedAt");
    writeJson(response, 200, { ok: true, project: approveScientificFigureBrief(body.project, reviewer, reviewedAt) }); return;
  }

  if (method === "POST" && url.pathname === "/v1/scientific/approve-final") {
    const body = objectBody(await readJson(request)); const reviewer = optionalStringBodyValue(body.reviewer, "reviewer"), reviewedAt = optionalStringBodyValue(body.reviewedAt, "reviewedAt");
    if (!reviewer || !reviewedAt) throw new ValidationError("approve-final requires reviewer and reviewedAt");
    writeJson(response, 200, { ok: true, project: approveScientificFigureFinal(body.project, body.evidence as Parameters<typeof approveScientificFigureFinal>[1], reviewer, reviewedAt) }); return;
  }

  if (method === "POST" && url.pathname === "/v1/proposal/visuals") {
    const generated = await generateProposalVisualPackage(await readJson(request), {
      root,
      outputDir: resolve(root, "exports", "proposal-visuals")
    });
    writeJson(response, 200, { ok: generated.ok, package: serializeProposalVisualPackage(generated) });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/render/tikz") {
    const body = objectBody(await readJson(request));
    const rendered = renderSceneToTikz(body.scene);
    writeJson(response, 200, { ok: true, latex: rendered.latex, renderer: rendered.renderer, requiredPackages: rendered.requiredPackages });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/render/png") {
    const body = objectBody(await readJson(request));
    const rendered = renderSceneToPng(body.scene, {
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      scale: optionalNumberBodyValue(body.scale, "scale"),
      background: optionalStringBodyValue(body.background, "background")
    });
    writePng(response, rendered);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/render/composite") {
    const body = objectBody(await readJson(request));
    const rendered = composeRasterLayersToPng(body.composition, {
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      scale: optionalNumberBodyValue(body.scale, "scale"),
      background: optionalStringBodyValue(body.background, "background")
    });
    writePng(response, rendered);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/geometry/boolean") {
    const result = constructPolygonBoolean(await readJson(request));
    writeJson(response, 200, { ok: true, result });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/geometry/flatten-curve") {
    const result = flattenBezierPath(await readJson(request));
    writeJson(response, 200, { ok: true, result });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/geometry/expand-stroke") {
    const result = expandStroke(await readJson(request));
    writeJson(response, 200, { ok: true, result });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/geometry/path-markers") {
    const result = placePathMarkers(await readJson(request));
    writeJson(response, 200, { ok: true, result });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/object-shapes/plan") {
    const body = objectBody(await readJson(request));
    const prompt = stringBodyValue(body.prompt, "prompt");
    const corpus = await loadDefaultCorpus();
    const plan = planObjectShapeScene(prompt, corpus, {
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      evidenceLimit: optionalNumberBodyValue(body.evidenceLimit, "evidenceLimit")
    });
    const job = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, root);
    writeJson(response, 201, {
      ok: true,
      plan,
      job: generatedJobSummary(job),
      run: {
        illustratorMenu: "File > Scripts > Other Script",
        scriptPath: job.illustratorJobPath,
        resultPath: job.resultPath,
        illustratorResultPath: job.illustratorResultPath
      }
    });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/object-shapes/guard") {
    const body = objectBody(await readJson(request));
    const target = parseObjectShapeTarget(stringBodyValue(body.target, "target"));
    const scene = normalizeScene(body.scene);
    const guard = guardObjectShapeScene(target, scene, optionalStringBodyValue(body.prompt, "prompt"));
    writeJson(response, 200, { ok: guard.ok, guard });
    return;
  }

  if (method === "POST" && url.pathname.startsWith("/v1/jobs/") && url.pathname.endsWith("/launch")) {
    const id = normalizeJobId(url.pathname.split("/")[3] ?? "");
    const body = objectBody(await readOptionalJson(request));
    const { jobPath } = await getGeneratedJobPaths(id, root);
    const result = await launchJsxJob(jobPath, {
      platform: optionalLaunchPlatform(body.platform),
      appPath: optionalStringBodyValue(body.appPath, "appPath"),
      dryRun: optionalBooleanBodyValue(body.dryRun, "dryRun"),
      root
    });

    writeJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname.startsWith("/v1/jobs/") && url.pathname.endsWith("/run-com")) {
    const id = normalizeJobId(url.pathname.split("/")[3] ?? "");
    const body = objectBody(await readOptionalJson(request));
    const { jobPath } = await getGeneratedJobPaths(id, root);
    const result = await runJsxViaIllustratorCom(jobPath, {
      platform: resolveLaunchPlatform(optionalLaunchPlatform(body.platform)),
      dryRun: optionalBooleanBodyValue(body.dryRun, "dryRun"),
      timeoutMs: optionalNumberBodyValue(body.timeoutMs, "timeoutMs"),
      root
    });

    writeJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/workflows/cartoon") {
    const body = objectBody(await readJson(request));
    const prompt = stringBodyValue(body.prompt, "prompt");
    const outputPath = stringBodyValue(body.outputPath, "outputPath");
    const workflow = await prepareCartoonWorkflow({
      prompt,
      outputPath,
      format: optionalExportFormat(body.format),
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      plannerMode: optionalPlannerMode(body.planner),
      openAiModel: optionalStringBodyValue(body.model, "model"),
      root
    });
    writeJson(response, 201, workflow);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/workflows/cartoon/execute") {
    const body = objectBody(await readJson(request));
    const execution = await executeCartoonWorkflow({
      prompt: stringBodyValue(body.prompt, "prompt"),
      outputPath: stringBodyValue(body.outputPath, "outputPath"),
      format: optionalExportFormat(body.format),
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      plannerMode: optionalPlannerMode(body.planner),
      openAiModel: optionalStringBodyValue(body.model, "model"),
      launchPlatform: optionalLaunchPlatform(body.platform),
      appPath: optionalStringBodyValue(body.appPath, "appPath"),
      dryRun: optionalBooleanBodyValue(body.dryRun, "dryRun"),
      waitForResults: optionalBooleanBodyValue(body.waitForResults, "waitForResults"),
      timeoutMs: optionalNumberBodyValue(body.timeoutMs, "timeoutMs"),
      intervalMs: optionalNumberBodyValue(body.intervalMs, "intervalMs"),
      skipQa: optionalBooleanBodyValue(body.skipQa, "skipQa"),
      skipArtworkReview: optionalBooleanBodyValue(body.skipArtworkReview, "skipArtworkReview"),
      minBytes: optionalNumberBodyValue(body.minBytes, "minBytes"),
      minWidth: optionalNumberBodyValue(body.minWidth, "minWidth"),
      minHeight: optionalNumberBodyValue(body.minHeight, "minHeight"),
      minNonBlankRatio: optionalNumberBodyValue(body.minNonBlankRatio, "minNonBlankRatio"),
      root
    });

    writeJson(response, 201, execution);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/workflows/adobe-svg-proof") {
    const body = objectBody(await readJson(request));
    const workflow = await prepareAdobeSvgProofWorkflow({
      prompt: stringBodyValue(body.prompt, "prompt"),
      outputPath: stringBodyValue(body.outputPath, "outputPath"),
      proofPngPath: optionalStringBodyValue(body.proofPngPath, "proofPngPath"),
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      intent: optionalAdobeArtworkIntent(body.intent),
      plannerMode: optionalPlannerMode(body.planner),
      openAiModel: optionalStringBodyValue(body.model, "model"),
      proofWidth: optionalNumberBodyValue(body.proofWidth, "proofWidth"),
      proofHeight: optionalNumberBodyValue(body.proofHeight, "proofHeight"),
      proofResolution: optionalNumberBodyValue(body.proofResolution, "proofResolution"),
      root
    });
    writeJson(response, 201, workflow);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/workflows/adobe-svg-proof/execute") {
    const body = objectBody(await readJson(request));
    const execution = await executeAdobeSvgProofWorkflow({
      prompt: stringBodyValue(body.prompt, "prompt"),
      outputPath: stringBodyValue(body.outputPath, "outputPath"),
      proofPngPath: optionalStringBodyValue(body.proofPngPath, "proofPngPath"),
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      intent: optionalAdobeArtworkIntent(body.intent),
      plannerMode: optionalPlannerMode(body.planner),
      openAiModel: optionalStringBodyValue(body.model, "model"),
      proofWidth: optionalNumberBodyValue(body.proofWidth, "proofWidth"),
      proofHeight: optionalNumberBodyValue(body.proofHeight, "proofHeight"),
      proofResolution: optionalNumberBodyValue(body.proofResolution, "proofResolution"),
      launchPlatform: optionalLaunchPlatform(body.platform),
      appPath: optionalStringBodyValue(body.appPath, "appPath"),
      illustratorRunMode: optionalAdobeSvgProofRunMode(body.illustratorRunMode),
      photoshopPlatform: optionalLaunchPlatform(body.photoshopPlatform),
      dryRun: optionalBooleanBodyValue(body.dryRun, "dryRun"),
      waitForResults: optionalBooleanBodyValue(body.waitForResults, "waitForResults"),
      timeoutMs: optionalNumberBodyValue(body.timeoutMs, "timeoutMs"),
      intervalMs: optionalNumberBodyValue(body.intervalMs, "intervalMs"),
      skipQa: optionalBooleanBodyValue(body.skipQa, "skipQa"),
      skipArtworkReview: optionalBooleanBodyValue(body.skipArtworkReview, "skipArtworkReview"),
      minBytes: optionalNumberBodyValue(body.minBytes, "minBytes"),
      minWidth: optionalNumberBodyValue(body.minWidth, "minWidth"),
      minHeight: optionalNumberBodyValue(body.minHeight, "minHeight"),
      minNonBlankRatio: optionalNumberBodyValue(body.minNonBlankRatio, "minNonBlankRatio"),
      proofMinWidth: optionalNumberBodyValue(body.proofMinWidth, "proofMinWidth"),
      proofMinHeight: optionalNumberBodyValue(body.proofMinHeight, "proofMinHeight"),
      proofMinNonBlankRatio: optionalNumberBodyValue(body.proofMinNonBlankRatio, "proofMinNonBlankRatio"),
      maxReviewIterations: optionalNumberBodyValue(body.maxReviewIterations, "maxReviewIterations"),
      root
    });
    writeJson(response, 201, execution);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/workflows/adobe-project") {
    const body = objectBody(await readJson(request));
    const workflow = await prepareAdobeProjectWorkflow({
      prompt: stringBodyValue(body.prompt, "prompt"),
      outputPath: stringBodyValue(body.outputPath, "outputPath"),
      sourceSvgPath: optionalStringBodyValue(body.sourceSvgPath, "sourceSvgPath"),
      photoshopReferencePngPath: optionalStringBodyValue(body.photoshopReferencePngPath, "photoshopReferencePngPath"),
      photoshopHandoffSvgPath: optionalStringBodyValue(body.photoshopHandoffSvgPath, "photoshopHandoffSvgPath"),
      photoshopWorkingPsdPath: optionalStringBodyValue(body.photoshopWorkingPsdPath, "photoshopWorkingPsdPath"),
      photoshopFeedbackPath: optionalStringBodyValue(body.photoshopFeedbackPath, "photoshopFeedbackPath"),
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      intent: optionalAdobeArtworkIntent(body.intent),
      plannerMode: optionalPlannerMode(body.planner),
      openAiModel: optionalStringBodyValue(body.model, "model"),
      proofWidth: optionalNumberBodyValue(body.proofWidth, "proofWidth"),
      proofHeight: optionalNumberBodyValue(body.proofHeight, "proofHeight"),
      proofResolution: optionalNumberBodyValue(body.proofResolution, "proofResolution"),
      referenceOpacity: optionalNumberBodyValue(body.referenceOpacity, "referenceOpacity"),
      embedReference: optionalBooleanBodyValue(body.embedReference, "embedReference"),
      visibleMouseProof: optionalBooleanBodyValue(body.visibleMouseProof, "visibleMouseProof"),
      root
    });
    writeJson(response, 201, workflow);
    return;
  }

  if (method === "GET" && url.pathname === "/v1/workflows/adobe-project/preflight") {
    const externalReviewProvider = optionalExternalReviewProvider(url.searchParams.get("externalReviewProvider") ?? undefined);
    const requireChatGptBrowser = optionalBooleanQueryValue(url.searchParams.get("requireChatGptBrowser") ?? undefined, "requireChatGptBrowser");
    const result = await preflightAdobeProjectWorkflow({
      illustratorPlatform: optionalLaunchPlatform(url.searchParams.get("platform") ?? undefined),
      photoshopPlatform: optionalLaunchPlatform(url.searchParams.get("photoshopPlatform") ?? undefined),
      photoshopCrashLookbackMinutes: optionalNumberQueryValue(
        url.searchParams.get("photoshopCrashLookbackMinutes") ?? undefined,
        "photoshopCrashLookbackMinutes"
      ),
      photoshopTimeoutMs: optionalNumberQueryValue(url.searchParams.get("photoshopTimeoutMs") ?? undefined, "photoshopTimeoutMs"),
      requireChatGptBrowser: requireChatGptBrowser || externalReviewProvider === "auracall",
      auracallCommand: url.searchParams.get("auracallCommand") ?? undefined,
      chatGptTimeoutSeconds: optionalNumberQueryValue(url.searchParams.get("chatGptTimeoutSeconds") ?? undefined, "chatGptTimeoutSeconds"),
      chatGptOperationTimeoutSeconds: optionalNumberQueryValue(
        url.searchParams.get("chatGptOperationTimeoutSeconds") ?? undefined,
        "chatGptOperationTimeoutSeconds"
      )
    });
    writeJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/workflows/adobe-project/execute") {
    const body = objectBody(await readJson(request));
    const externalReviewProvider = optionalExternalReviewProvider(body.externalReviewProvider);
    const externalReviewPacketPath = optionalStringBodyValue(body.externalReviewPacketPath, "externalReviewPacketPath");
    const externalReviewPreflight = optionalBooleanBodyValue(body.externalReviewPreflight, "externalReviewPreflight");
    const externalReview =
      externalReviewProvider === "auracall"
        ? createAuraCallExternalArtworkReviewRunner({
            command: optionalStringBodyValue(body.auracallCommand, "auracallCommand"),
            model: optionalStringBodyValue(body.externalReviewModel, "externalReviewModel"),
            timeoutSeconds: optionalNumberBodyValue(body.externalReviewTimeoutSeconds, "externalReviewTimeoutSeconds"),
            workdir: process.cwd(),
            packetPath: externalReviewPacketPath,
            outputPath: optionalStringBodyValue(body.externalReviewOutputPath, "externalReviewOutputPath"),
            preflightBrowserReadiness: externalReviewPreflight ?? true,
            preflightTimeoutSeconds: optionalNumberBodyValue(body.externalReviewPreflightTimeoutSeconds, "externalReviewPreflightTimeoutSeconds")
          })
        : undefined;
    const execution = await executeAdobeProjectWorkflow({
      prompt: stringBodyValue(body.prompt, "prompt"),
      outputPath: stringBodyValue(body.outputPath, "outputPath"),
      sourceSvgPath: optionalStringBodyValue(body.sourceSvgPath, "sourceSvgPath"),
      photoshopReferencePngPath: optionalStringBodyValue(body.photoshopReferencePngPath, "photoshopReferencePngPath"),
      photoshopHandoffSvgPath: optionalStringBodyValue(body.photoshopHandoffSvgPath, "photoshopHandoffSvgPath"),
      photoshopWorkingPsdPath: optionalStringBodyValue(body.photoshopWorkingPsdPath, "photoshopWorkingPsdPath"),
      photoshopFeedbackPath: optionalStringBodyValue(body.photoshopFeedbackPath, "photoshopFeedbackPath"),
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      intent: optionalAdobeArtworkIntent(body.intent),
      plannerMode: optionalPlannerMode(body.planner),
      openAiModel: optionalStringBodyValue(body.model, "model"),
      proofWidth: optionalNumberBodyValue(body.proofWidth, "proofWidth"),
      proofHeight: optionalNumberBodyValue(body.proofHeight, "proofHeight"),
      proofResolution: optionalNumberBodyValue(body.proofResolution, "proofResolution"),
      referenceOpacity: optionalNumberBodyValue(body.referenceOpacity, "referenceOpacity"),
      embedReference: optionalBooleanBodyValue(body.embedReference, "embedReference"),
      visibleMouseProof: optionalBooleanBodyValue(body.visibleMouseProof, "visibleMouseProof"),
      visibleMouseDurationMs: optionalNumberBodyValue(body.visibleMouseDurationMs, "visibleMouseDurationMs"),
      illustratorMouseToolShortcut: optionalStringBodyValue(body.illustratorMouseToolShortcut, "illustratorMouseToolShortcut"),
      photoshopMouseToolShortcut: optionalStringBodyValue(body.photoshopMouseToolShortcut, "photoshopMouseToolShortcut"),
      illustratorMouseWindowTitlePattern: optionalStringBodyValue(body.illustratorMouseWindowTitlePattern, "illustratorMouseWindowTitlePattern"),
      photoshopMouseWindowTitlePattern: optionalStringBodyValue(body.photoshopMouseWindowTitlePattern, "photoshopMouseWindowTitlePattern"),
      launchPlatform: optionalLaunchPlatform(body.platform),
      appPath: optionalStringBodyValue(body.appPath, "appPath"),
      illustratorRunMode: optionalAdobeSvgProofRunMode(body.illustratorRunMode),
      photoshopPlatform: optionalLaunchPlatform(body.photoshopPlatform),
      dryRun: optionalBooleanBodyValue(body.dryRun, "dryRun"),
      waitForResults: optionalBooleanBodyValue(body.waitForResults, "waitForResults"),
      timeoutMs: optionalNumberBodyValue(body.timeoutMs, "timeoutMs"),
      intervalMs: optionalNumberBodyValue(body.intervalMs, "intervalMs"),
      skipQa: optionalBooleanBodyValue(body.skipQa, "skipQa"),
      skipArtworkReview: optionalBooleanBodyValue(body.skipArtworkReview, "skipArtworkReview"),
      minBytes: optionalNumberBodyValue(body.minBytes, "minBytes"),
      minWidth: optionalNumberBodyValue(body.minWidth, "minWidth"),
      minHeight: optionalNumberBodyValue(body.minHeight, "minHeight"),
      minNonBlankRatio: optionalNumberBodyValue(body.minNonBlankRatio, "minNonBlankRatio"),
      proofMinWidth: optionalNumberBodyValue(body.proofMinWidth, "proofMinWidth"),
      proofMinHeight: optionalNumberBodyValue(body.proofMinHeight, "proofMinHeight"),
      proofMinNonBlankRatio: optionalNumberBodyValue(body.proofMinNonBlankRatio, "proofMinNonBlankRatio"),
      maxReviewIterations: optionalNumberBodyValue(body.maxReviewIterations, "maxReviewIterations"),
      externalReview,
      externalReviewPacketPath,
      externalReviewVerdict: body.externalReviewVerdict,
      requireExternalReviewPass: optionalBooleanBodyValue(body.requireExternalReviewPass, "requireExternalReviewPass") || externalReviewProvider === "auracall",
      externalReviewMinScore: optionalNumberBodyValue(body.externalReviewMinScore, "externalReviewMinScore"),
      reviewReportPath: optionalStringBodyValue(body.reviewReportPath, "reviewReportPath"),
      root
    });
    writeJson(response, 201, execution);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/workflows/object") {
    const body = objectBody(await readJson(request));
    const workflow = await prepareObjectShapeWorkflow({
      prompt: stringBodyValue(body.prompt, "prompt"),
      outputPath: stringBodyValue(body.outputPath, "outputPath"),
      format: optionalExportFormat(body.format),
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      evidenceLimit: optionalNumberBodyValue(body.evidenceLimit, "evidenceLimit"),
      maxGuardIterations: optionalNumberBodyValue(body.maxGuardIterations, "maxGuardIterations"),
      root
    });
    writeJson(response, 201, workflow);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/workflows/object/execute") {
    const body = objectBody(await readJson(request));
    const execution = await executeObjectShapeWorkflow({
      prompt: stringBodyValue(body.prompt, "prompt"),
      outputPath: stringBodyValue(body.outputPath, "outputPath"),
      format: optionalExportFormat(body.format),
      width: optionalNumberBodyValue(body.width, "width"),
      height: optionalNumberBodyValue(body.height, "height"),
      title: optionalStringBodyValue(body.title, "title"),
      evidenceLimit: optionalNumberBodyValue(body.evidenceLimit, "evidenceLimit"),
      maxGuardIterations: optionalNumberBodyValue(body.maxGuardIterations, "maxGuardIterations"),
      launchPlatform: optionalLaunchPlatform(body.platform),
      appPath: optionalStringBodyValue(body.appPath, "appPath"),
      runMode: optionalObjectWorkflowRunMode(body.runMode),
      dryRun: optionalBooleanBodyValue(body.dryRun, "dryRun"),
      waitForResults: optionalBooleanBodyValue(body.waitForResults, "waitForResults"),
      timeoutMs: optionalNumberBodyValue(body.timeoutMs, "timeoutMs"),
      intervalMs: optionalNumberBodyValue(body.intervalMs, "intervalMs"),
      skipQa: optionalBooleanBodyValue(body.skipQa, "skipQa"),
      skipArtworkReview: optionalBooleanBodyValue(body.skipArtworkReview, "skipArtworkReview"),
      minBytes: optionalNumberBodyValue(body.minBytes, "minBytes"),
      minWidth: optionalNumberBodyValue(body.minWidth, "minWidth"),
      minHeight: optionalNumberBodyValue(body.minHeight, "minHeight"),
      minNonBlankRatio: optionalNumberBodyValue(body.minNonBlankRatio, "minNonBlankRatio"),
      root
    });

    writeJson(response, 201, execution);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/qa/export") {
    const body = objectBody(await readJson(request));
    const report = await inspectExportArtifact(stringBodyValue(body.path, "path"), {
      format: optionalExportFormat(body.format),
      minBytes: optionalNumberBodyValue(body.minBytes, "minBytes"),
      minWidth: optionalNumberBodyValue(body.minWidth, "minWidth"),
      minHeight: optionalNumberBodyValue(body.minHeight, "minHeight"),
      minNonBlankRatio: optionalNumberBodyValue(body.minNonBlankRatio, "minNonBlankRatio")
    });
    writeJson(response, 200, { ok: report.ok, report });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/qa/artwork") {
    const body = objectBody(await readJson(request));
    const exportQa = await inspectExportArtifact(stringBodyValue(body.path, "path"), {
      format: optionalExportFormat(body.format),
      minBytes: optionalNumberBodyValue(body.minBytes, "minBytes"),
      minWidth: optionalNumberBodyValue(body.minWidth, "minWidth"),
      minHeight: optionalNumberBodyValue(body.minHeight, "minHeight"),
      minNonBlankRatio: optionalNumberBodyValue(body.minNonBlankRatio, "minNonBlankRatio")
    });
    const scene = body.scene === undefined ? undefined : normalizeScene(sceneFromJson(body.scene));
    const review = reviewArtworkQuality({
      prompt: optionalStringBodyValue(body.prompt, "prompt") ?? "review exported Illustrator artwork",
      scene,
      exportQa,
      target: optionalStringBodyValue(body.target, "target")
    });

    writeJson(response, 200, { ok: exportQa.ok && review.ok, exportQa, review });
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/v1/jobs/") && url.pathname.endsWith("/status")) {
    const id = url.pathname.split("/")[3];
    const status = await readJobStatus(id, root);
    writeJson(response, 200, {
      ok: true,
      job: status
    });
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/v1/jobs/") && url.pathname.endsWith("/result")) {
    const id = url.pathname.split("/")[3];
    const status = await readJobStatus(id, root);
    if (!status.exists) {
      writeJson(response, 404, {
        ok: false,
        error: "Job result not found",
        job: status
      });
      return;
    }

    writeJson(response, 200, status.result);
    return;
  }

  writeJson(response, 404, { ok: false, error: "Not found" });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const text = await readBodyText(request);
  if (!text.trim()) {
    throw new ValidationError("Request body is required");
  }

  return parseJson(text);
}

async function readOptionalJson(request: IncomingMessage): Promise<unknown> {
  const text = await readBodyText(request);
  if (!text.trim()) {
    return {};
  }

  return parseJson(text);
}

async function readBodyText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;

    if (length > 1024 * 1024) {
      throw new ValidationError("Request body cannot exceed 1 MiB");
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

function statusForError(error: unknown): number {
  if (
    error instanceof ValidationError ||
    error instanceof JobResultError ||
    error instanceof ExportQaError ||
    error instanceof LaunchJobError ||
    error instanceof OpenAiPlannerError ||
    error instanceof ObjectShapePlannerError
  ) {
    return 400;
  }

  return 500;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function writeHtml(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function writePng(response: ServerResponse, rendered: PngRenderResult | RasterCompositionResult): void {
  const headers: Record<string, string | number> = {
    "content-type": "image/png",
    "content-length": rendered.png.length,
    "x-renderer": rendered.renderer,
    "x-source-width": rendered.sourceWidth,
    "x-source-height": rendered.sourceHeight,
    "x-render-width": rendered.width,
    "x-render-height": rendered.height,
    "x-render-fit": rendered.fit,
    "x-render-background": rendered.background
  };
  if ("layerCount" in rendered) {
    headers["x-layer-count"] = rendered.layerCount;
    headers["x-visible-layer-count"] = rendered.visibleLayerCount;
  }
  response.writeHead(200, headers);
  response.end(rendered.png);
}

function objectBody(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError("Request body must be a JSON object");
  }

  return input as Record<string, unknown>;
}

function stringBodyValue(input: unknown, name: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new ValidationError(`${name} must be a non-empty string`);
  }

  return input;
}

function optionalStringBodyValue(input: unknown, name: string): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  return stringBodyValue(input, name);
}

function optionalNumberBodyValue(input: unknown, name: string): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new ValidationError(`${name} must be a finite number`);
  }

  return input;
}

function optionalNumberQueryValue(input: string | undefined, name: string): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = Number(input);
  if (!Number.isFinite(value)) {
    throw new ValidationError(`${name} must be a finite number`);
  }

  return value;
}

function optionalBooleanQueryValue(input: string | undefined, name: string): boolean | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (input === "true") {
    return true;
  }

  if (input === "false") {
    return false;
  }

  throw new ValidationError(`${name} must be true or false`);
}

function optionalBooleanBodyValue(input: unknown, name: string): boolean | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input !== "boolean") {
    throw new ValidationError(`${name} must be a boolean`);
  }

  return input;
}

function optionalExternalReviewProvider(input: unknown): "manual" | "auracall" | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (input === "manual" || input === "auracall") {
    return input;
  }

  throw new ValidationError("externalReviewProvider must be manual or auracall");
}

function optionalExportFormat(input: unknown): "pdf" | "svg" | "png" | "jpg" | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "format").toLowerCase();
  if (value !== "pdf" && value !== "svg" && value !== "png" && value !== "jpg") {
    throw new ValidationError("format must be pdf, svg, png, or jpg");
  }

  return value;
}

function optionalLaunchPlatform(input: unknown): LaunchPlatform | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "platform").toLowerCase();
  if (value !== "auto" && value !== "macos" && value !== "windows" && value !== "wsl" && value !== "linux") {
    throw new ValidationError("platform must be auto, macos, windows, wsl, or linux");
  }

  return value;
}

function optionalPlannerMode(input: unknown): PlannerMode | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "planner").toLowerCase();
  if (value !== "deterministic" && value !== "auto" && value !== "openai") {
    throw new ValidationError("planner must be deterministic, auto, or openai");
  }

  return value;
}

function optionalObjectWorkflowRunMode(input: unknown): ObjectWorkflowRunMode | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "runMode").toLowerCase();
  if (value !== "launch" && value !== "com") {
    throw new ValidationError("runMode must be launch or com");
  }

  return value;
}

function optionalAdobeArtworkIntent(input: unknown): AdobeArtworkIntent | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "intent").toLowerCase();
  if (value !== "auto" && value !== "cartoon" && value !== "scientific" && value !== "object") {
    throw new ValidationError("intent must be auto, cartoon, scientific, or object");
  }

  return value;
}

function optionalAdobeSvgProofRunMode(input: unknown): AdobeSvgProofRunMode | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "illustratorRunMode").toLowerCase();
  if (value !== "launch" && value !== "com") {
    throw new ValidationError("illustratorRunMode must be launch or com");
  }

  return value;
}

function optionalProbeMethod(input: unknown): IllustratorProbeMethod | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "method").toLowerCase();
  if (value !== "auto" && value !== "desktop" && value !== "com") {
    throw new ValidationError("method must be auto, desktop, or com");
  }

  return value;
}

function optionalSemanticKind(input: unknown): SemanticKind | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "kind").toLowerCase();
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
    throw new ValidationError("kind is not supported");
  }

  return value;
}

function stringArrayBodyValue(input: unknown, name: string): string[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ValidationError(`${name} must be a non-empty string array`);
  }

  return input.map((value, index) => {
    if (typeof value !== "string" || value.length === 0) {
      throw new ValidationError(`${name}[${index}] must be a non-empty string`);
    }

    return value;
  });
}

function optionalMouseAction(input: unknown): IllustratorMouseAction | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "action").toLowerCase();
  if (value !== "move" && value !== "click" && value !== "double-click" && value !== "drag") {
    throw new ValidationError("action must be move, click, double-click, or drag");
  }

  return value;
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

function optionalMouseButton(input: unknown): IllustratorMouseButton | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = stringBodyValue(input, "button").toLowerCase();
  if (value !== "left" && value !== "right") {
    throw new ValidationError("button must be left or right");
  }

  return value;
}
