#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
import { renderSceneToSvg } from "./render/svgRenderer.js";
import { renderSceneToTikz } from "./render/tikzRenderer.js";
import { renderScientificPlotToPgfplots } from "./render/pgfplotsRenderer.js";
import { compileLatexWithTectonic } from "./render/latexCompiler.js";
import { renderSceneToPng, type PngRenderOptions } from "./render/pngRenderer.js";
import { composeRasterLayersToPng } from "./render/rasterCompositor.js";
import { composeScientificDiagram } from "./scientific/diagramComposer.js";
import { composeTransformBasicsScene } from "./scientific/transformBasics.js";
import { composeCompositionBasicsScene } from "./scientific/compositionBasics.js";
import { composeConstraintBasicsScene } from "./scientific/constraintBasics.js";
import { composeRoutingBasicsScene } from "./scientific/routingBasics.js";
import { composeLabelStyleBasicsScene } from "./scientific/labelStyleBasics.js";
import { compileScientificFigure } from "./scientific/figureCompiler.js";
import { planScientificStory } from "./scientific/storyPlanner.js";
import { parseScientificText } from "./scientific/textStoryParser.js";
import { constructPolygonBoolean } from "./core/polygonBoolean.js";
import { flattenBezierPath } from "./core/bezierFlattening.js";
import { expandStroke } from "./core/strokeExpansion.js";
import { placePathMarkers } from "./core/pathMarkers.js";
import { compileScientificPlot } from "./core/scientificPlot.js";
import { composeBooleanGeometryBasicsScene } from "./scientific/booleanGeometryBasics.js";
import { composeCurveGeometryBasicsScene } from "./scientific/curveGeometryBasics.js";
import { composeStrokeExpansionBasicsScene } from "./scientific/strokeExpansionBasics.js";
import { composePathMarkerBasicsScene } from "./scientific/pathMarkerBasics.js";
import { composeVectorPaintBasicsScene } from "./scientific/vectorPaintBasics.js";
import { generateScientificImage } from "./scientific/imageGenerator.js";

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
    case "render:svg":
      await renderSvg(rest);
      return;
    case "render:tikz":
      await renderTikz(rest);
      return;
    case "render:png":
      await renderPng(rest);
      return;
    case "render:composite":
      await renderRasterComposite(rest);
      return;
    case "scientific:compose":
      await composeScientific(rest);
      return;
    case "scientific:generate":
      await generateScientificFigure(rest);
      return;
    case "scientific:story":
      await generateScientificStory(rest);
      return;
    case "scientific:text":
      await generateScientificText(rest);
      return;
    case "scientific:plot":
      await generateScientificPlot(rest);
      return;
    case "scientific:pgfplots":
      await generateScientificPgfplots(rest);
      return;
    case "scientific:image":
      await generateUnifiedScientificImage(rest);
      return;
    case "geometry:transform-basics":
      await renderTransformBasics(rest);
      return;
    case "geometry:composition-basics":
      await renderCompositionBasics(rest);
      return;
    case "geometry:constraint-basics":
      await renderConstraintBasics(rest);
      return;
    case "geometry:routing-basics":
      await renderRoutingBasics(rest);
      return;
    case "geometry:label-style-basics":
      await renderLabelStyleBasics(rest);
      return;
    case "geometry:boolean":
      await constructBooleanGeometry(rest);
      return;
    case "geometry:flatten-curve":
      await flattenCurveGeometry(rest);
      return;
    case "geometry:expand-stroke":
      await expandStrokeGeometry(rest);
      return;
    case "geometry:path-markers":
      await placePathMarkerGeometry(rest);
      return;
    case "geometry:boolean-basics":
      await renderBooleanGeometryBasics(rest);
      return;
    case "geometry:curve-basics":
      await renderCurveGeometryBasics(rest);
      return;
    case "geometry:stroke-expansion-basics":
      await renderStrokeExpansionBasics(rest);
      return;
    case "geometry:path-marker-basics":
      await renderPathMarkerBasics(rest);
      return;
    case "render:paint-basics":
      await renderVectorPaintBasics(rest);
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

async function renderSvg(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const scenePath = options.positionals[0] ?? "examples/geometry-basics-scene.json";
  const outputValue = optionValue(options, "output") ?? "var/exports/geometry-basics.svg";
  const outputPath = resolve(outputValue);
  const scene = normalizeScene(await readJsonFile(scenePath));
  const svg = renderSceneToSvg(scene);
  const pngOutputValue = optionValue(options, "png-output");
  const pngOutputPath = pngOutputValue === undefined ? undefined : resolve(pngOutputValue);
  const renderedPng = pngOutputPath === undefined ? undefined : renderSceneToPng(scene, pngOptions(options, "png-"));

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, svg, "utf8");
  if (pngOutputPath !== undefined && renderedPng !== undefined) {
    await mkdir(dirname(pngOutputPath), { recursive: true });
    await writeFile(pngOutputPath, renderedPng.png);
  }

  console.log(JSON.stringify({ ok: true, scenePath: resolve(scenePath), outputPath, pngOutputPath, pngBytes: renderedPng?.png.length, elementCount: scene.elements.length }, null, 2));
}

async function renderTikz(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const scenePath = options.positionals[0] ?? "examples/geometry-basics-scene.json";
  const outputPath = resolve(optionValue(options, "output") ?? "var/exports/geometry-basics.tex");
  const pdfOutputValue = optionValue(options, "pdf-output");
  const pdfOutputPath = pdfOutputValue === undefined ? undefined : resolve(pdfOutputValue);
  const rendered = renderSceneToTikz(await readJsonFile(scenePath));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered.latex, "utf8");
  const compiled = pdfOutputPath === undefined ? undefined : await compileLatexWithTectonic(rendered.latex, { enginePath: resolveTectonicPath(options) });
  if (compiled && pdfOutputPath) {
    await mkdir(dirname(pdfOutputPath), { recursive: true });
    await writeFile(pdfOutputPath, compiled.pdf);
  }
  console.log(JSON.stringify({ ok: true, scenePath: resolve(scenePath), outputPath, pdfOutputPath, bytes: Buffer.byteLength(rendered.latex), pdfBytes: compiled?.bytes, pdfSha256: compiled?.sha256, renderer: rendered.renderer, requiredPackages: rendered.requiredPackages }, null, 2));
}

async function renderPng(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const scenePath = options.positionals[0] ?? "examples/geometry-basics-scene.json";
  const outputPath = resolve(optionValue(options, "output") ?? "var/exports/geometry-basics.png");
  const scene = normalizeScene(await readJsonFile(scenePath));
  const rendered = renderSceneToPng(scene, pngOptions(options));

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered.png);

  console.log(JSON.stringify({
    ok: true,
    scenePath: resolve(scenePath),
    outputPath,
    sourceWidth: rendered.sourceWidth,
    sourceHeight: rendered.sourceHeight,
    width: rendered.width,
    height: rendered.height,
    background: rendered.background,
    fit: rendered.fit,
    fontPolicy: rendered.fontPolicy,
    renderer: rendered.renderer,
    bytes: rendered.png.length,
    elementCount: scene.elements.length
  }, null, 2));
}

async function renderRasterComposite(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const compositionPath = options.positionals[0] ?? "examples/raster-composition-basics.json";
  const outputPath = resolve(optionValue(options, "output") ?? "var/exports/raster-composition-basics.png");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/raster-composition-basics.svg");
  const rendered = composeRasterLayersToPng(await readJsonFile(compositionPath), pngOptions(options));

  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await writeFile(outputPath, rendered.png);
  await writeFile(svgOutputPath, rendered.compositionSvg, "utf8");

  console.log(JSON.stringify({
    ok: true,
    compositionPath: resolve(compositionPath),
    outputPath,
    svgOutputPath,
    width: rendered.width,
    height: rendered.height,
    layerCount: rendered.layerCount,
    visibleLayerCount: rendered.visibleLayerCount,
    background: rendered.background,
    renderer: rendered.renderer,
    bytes: rendered.png.length
  }, null, 2));
}

async function constructBooleanGeometry(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const requestPath = options.positionals[0] ?? "examples/polygon-boolean-request.json";
  const outputPath = resolve(optionValue(options, "output") ?? "var/exports/polygon-boolean-result.json");
  const result = constructPolygonBoolean(await readJsonFile(requestPath));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, requestPath: resolve(requestPath), outputPath, result }, null, 2));
}

async function flattenCurveGeometry(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const requestPath = options.positionals[0] ?? "examples/bezier-flatten-request.json";
  const outputPath = resolve(optionValue(options, "output") ?? "var/exports/bezier-flatten-result.json");
  const result = flattenBezierPath(await readJsonFile(requestPath));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, requestPath: resolve(requestPath), outputPath, result }, null, 2));
}

async function expandStrokeGeometry(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const requestPath = options.positionals[0] ?? "examples/stroke-expansion-request.json";
  const outputPath = resolve(optionValue(options, "output") ?? "var/exports/stroke-expansion-result.json");
  const result = expandStroke(await readJsonFile(requestPath));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, requestPath: resolve(requestPath), outputPath, result }, null, 2));
}

async function placePathMarkerGeometry(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const requestPath = options.positionals[0] ?? "examples/path-marker-request.json";
  const outputPath = resolve(optionValue(options, "output") ?? "var/exports/path-marker-result.json");
  const result = placePathMarkers(await readJsonFile(requestPath));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, requestPath: resolve(requestPath), outputPath, result }, null, 2));
}

async function generateScientificPlot(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const requestPath = options.positionals[0] ?? "examples/scientific-plot.json";
  const resultOutputPath = resolve(optionValue(options, "result-output") ?? "var/exports/scientific-plot.result.json");
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/scientific-plot.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/scientific-plot.svg");
  const pngOutputPath = resolve(optionValue(options, "png-output") ?? "var/exports/scientific-plot.png");
  const result = compileScientificPlot(await readJsonFile(requestPath));
  const svg = renderSceneToSvg(result.scene);
  const png = renderSceneToPng(result.scene, pngOptions(options, "png-"));
  for (const path of [resultOutputPath, sceneOutputPath, svgOutputPath, pngOutputPath]) await mkdir(dirname(path), { recursive: true });
  await writeFile(resultOutputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(sceneOutputPath, `${JSON.stringify(result.scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");
  await writeFile(pngOutputPath, png.png);
  console.log(JSON.stringify({ ok: true, requestPath: resolve(requestPath), resultOutputPath, sceneOutputPath, svgOutputPath, pngOutputPath, width: png.width, height: png.height, bytes: png.png.length, seriesCount: result.seriesSummaries.length, pointCount: result.seriesSummaries.reduce((sum, series) => sum + series.pointCount, 0), engine: result.engine }, null, 2));
}

async function generateScientificPgfplots(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const requestPath = options.positionals[0] ?? "examples/scientific-plot.json";
  const outputPath = resolve(optionValue(options, "output") ?? "var/exports/scientific-plot.tex");
  const pdfOutputValue = optionValue(options, "pdf-output");
  const pdfOutputPath = pdfOutputValue === undefined ? undefined : resolve(pdfOutputValue);
  const rendered = renderScientificPlotToPgfplots(await readJsonFile(requestPath));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered.latex, "utf8");
  const compiled = pdfOutputPath === undefined ? undefined : await compileLatexWithTectonic(rendered.latex, { enginePath: resolveTectonicPath(options) });
  if (compiled && pdfOutputPath) {
    await mkdir(dirname(pdfOutputPath), { recursive: true });
    await writeFile(pdfOutputPath, compiled.pdf);
  }
  console.log(JSON.stringify({ ok: true, requestPath: resolve(requestPath), outputPath, pdfOutputPath, bytes: Buffer.byteLength(rendered.latex), pdfBytes: compiled?.bytes, pdfSha256: compiled?.sha256, renderer: rendered.renderer, compat: rendered.compat, seriesCount: rendered.plot.seriesSummaries.length }, null, 2));
}

async function generateUnifiedScientificImage(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const requestPath = options.positionals[0] ?? "examples/scientific-image-story.json";
  const manifestOutputPath = resolve(optionValue(options, "manifest-output") ?? "var/exports/scientific-image.manifest.json");
  const intermediateOutputPath = resolve(optionValue(options, "intermediate-output") ?? "var/exports/scientific-image.intermediate.json");
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/scientific-image.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/scientific-image.svg");
  const pngOutputPath = resolve(optionValue(options, "png-output") ?? "var/exports/scientific-image.png");
  const latexOutputPath = resolve(optionValue(options, "latex-output") ?? "var/exports/scientific-image.tex");
  const latexPdfOutputValue = optionValue(options, "latex-pdf-output");
  const latexPdfOutputPath = latexPdfOutputValue === undefined ? undefined : resolve(latexPdfOutputValue);
  const generated = generateScientificImage(await readJsonFile(requestPath));
  const compiledLatex = latexPdfOutputPath === undefined
    ? undefined
    : await compileLatexWithTectonic(generated.latex, { enginePath: resolveTectonicPath(options) });
  for (const path of [manifestOutputPath, intermediateOutputPath, sceneOutputPath, svgOutputPath, pngOutputPath, latexOutputPath, latexPdfOutputPath]) {
    if (path !== undefined) await mkdir(dirname(path), { recursive: true });
  }
  await writeFile(manifestOutputPath, `${JSON.stringify(generated.manifest, null, 2)}\n`, "utf8");
  await writeFile(intermediateOutputPath, `${JSON.stringify(generated.intermediate, null, 2)}\n`, "utf8");
  await writeFile(sceneOutputPath, generated.sceneJson, "utf8");
  await writeFile(svgOutputPath, generated.svg, "utf8");
  await writeFile(latexOutputPath, generated.latex, "utf8");
  await writeFile(pngOutputPath, generated.png.png);
  if (compiledLatex && latexPdfOutputPath) await writeFile(latexPdfOutputPath, compiledLatex.pdf);
  console.log(JSON.stringify({
    ok: true,
    requestPath: resolve(requestPath),
    manifestOutputPath,
    intermediateOutputPath,
    sceneOutputPath,
    svgOutputPath,
    latexOutputPath,
    latexPdfOutputPath,
    pngOutputPath,
    latexPdfBytes: compiledLatex?.bytes,
    latexPdfSha256: compiledLatex?.sha256,
    ...generated.manifest
  }, null, 2));
}

async function renderBooleanGeometryBasics(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/polygon-boolean-basics.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/polygon-boolean-basics.svg");
  const pngOutputPath = resolve(optionValue(options, "png-output") ?? "var/exports/polygon-boolean-basics.png");
  const scene = normalizeScene(composeBooleanGeometryBasicsScene());
  const svg = renderSceneToSvg(scene);
  const png = renderSceneToPng(scene, pngOptions(options, "png-"));
  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await mkdir(dirname(pngOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");
  await writeFile(pngOutputPath, png.png);
  console.log(JSON.stringify({
    ok: true,
    sceneOutputPath,
    svgOutputPath,
    pngOutputPath,
    width: png.width,
    height: png.height,
    bytes: png.png.length,
    elementCount: scene.elements.length,
    semanticObjectCount: scene.semantics?.objects.length ?? 0,
    engine: "polygon-clipping-0.15.7"
  }, null, 2));
}

async function renderCurveGeometryBasics(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/curve-geometry-basics.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/curve-geometry-basics.svg");
  const pngOutputPath = resolve(optionValue(options, "png-output") ?? "var/exports/curve-geometry-basics.png");
  const scene = normalizeScene(composeCurveGeometryBasicsScene());
  const svg = renderSceneToSvg(scene);
  const png = renderSceneToPng(scene, pngOptions(options, "png-"));
  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await mkdir(dirname(pngOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");
  await writeFile(pngOutputPath, png.png);
  console.log(JSON.stringify({
    ok: true,
    sceneOutputPath,
    svgOutputPath,
    pngOutputPath,
    width: png.width,
    height: png.height,
    bytes: png.png.length,
    elementCount: scene.elements.length,
    semanticObjectCount: scene.semantics?.objects.length ?? 0,
    geometry: "adaptive-cubic-bezier-flattening"
  }, null, 2));
}

async function renderStrokeExpansionBasics(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/stroke-expansion-basics.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/stroke-expansion-basics.svg");
  const pngOutputPath = resolve(optionValue(options, "png-output") ?? "var/exports/stroke-expansion-basics.png");
  const scene = normalizeScene(composeStrokeExpansionBasicsScene());
  const svg = renderSceneToSvg(scene);
  const png = renderSceneToPng(scene, pngOptions(options, "png-"));
  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await mkdir(dirname(pngOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");
  await writeFile(pngOutputPath, png.png);
  console.log(JSON.stringify({ ok: true, sceneOutputPath, svgOutputPath, pngOutputPath, width: png.width, height: png.height, bytes: png.png.length, elementCount: scene.elements.length, semanticObjectCount: scene.semantics?.objects.length ?? 0, geometry: "software-stroke-expansion.v1" }, null, 2));
}

async function renderPathMarkerBasics(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/path-marker-basics.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/path-marker-basics.svg");
  const pngOutputPath = resolve(optionValue(options, "png-output") ?? "var/exports/path-marker-basics.png");
  const scene = normalizeScene(composePathMarkerBasicsScene());
  const svg = renderSceneToSvg(scene);
  const png = renderSceneToPng(scene, pngOptions(options, "png-"));
  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await mkdir(dirname(pngOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");
  await writeFile(pngOutputPath, png.png);
  console.log(JSON.stringify({ ok: true, sceneOutputPath, svgOutputPath, pngOutputPath, width: png.width, height: png.height, bytes: png.png.length, elementCount: scene.elements.length, semanticObjectCount: scene.semantics?.objects.length ?? 0, geometry: "software-path-markers.v1" }, null, 2));
}

async function renderVectorPaintBasics(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/vector-paint-basics.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/vector-paint-basics.svg");
  const pngOutputPath = resolve(optionValue(options, "png-output") ?? "var/exports/vector-paint-basics.png");
  const scene = normalizeScene(composeVectorPaintBasicsScene());
  const svg = renderSceneToSvg(scene);
  const png = renderSceneToPng(scene, pngOptions(options, "png-"));
  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await mkdir(dirname(pngOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");
  await writeFile(pngOutputPath, png.png);
  console.log(JSON.stringify({ ok: true, sceneOutputPath, svgOutputPath, pngOutputPath, width: png.width, height: png.height, bytes: png.png.length, elementCount: scene.elements.length, paintCount: scene.paints?.length ?? 0, semanticObjectCount: scene.semantics?.objects.length ?? 0, renderer: "software-vector-paints.v1" }, null, 2));
}

async function composeScientific(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const specPath = options.positionals[0] ?? "examples/scientific-symbol-composition.json";
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/scientific-symbol-composition.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/scientific-symbol-composition.svg");
  const scene = composeScientificDiagram(await readJsonFile(specPath));
  const svg = renderSceneToSvg(scene);

  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        specPath: resolve(specPath),
        sceneOutputPath,
        svgOutputPath,
        symbolCount: scene.semantics?.objects.length ?? 0,
        relationshipCount: scene.semantics?.relationships?.length ?? 0,
        elementCount: scene.elements.length
      },
      null,
      2
    )
  );
}

async function generateScientificFigure(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const specPath = options.positionals[0] ?? "examples/scientific-figure-spec.json";
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/scientific-figure.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/scientific-figure.svg");
  const scene = compileScientificFigure(await readJsonFile(specPath));
  const svg = renderSceneToSvg(scene);

  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");

  console.log(JSON.stringify({
    ok: true,
    specPath: resolve(specPath),
    sceneOutputPath,
    svgOutputPath,
    objectCount: scene.semantics?.objects.length ?? 0,
    relationshipCount: scene.semantics?.relationships?.length ?? 0,
    elementCount: scene.elements.length
  }, null, 2));
}

async function generateScientificStory(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const storyPath = options.positionals[0] ?? "examples/scientific-story.json";
  const figureOutputPath = resolve(optionValue(options, "figure-output") ?? "var/exports/scientific-story.figure.json");
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/scientific-story.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/scientific-story.svg");
  const figure = planScientificStory(await readJsonFile(storyPath));
  const scene = compileScientificFigure(figure);
  const svg = renderSceneToSvg(scene);

  await mkdir(dirname(figureOutputPath), { recursive: true });
  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await writeFile(figureOutputPath, `${JSON.stringify(figure, null, 2)}\n`, "utf8");
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");

  console.log(JSON.stringify({
    ok: true,
    storyPath: resolve(storyPath),
    figureOutputPath,
    sceneOutputPath,
    svgOutputPath,
    objectCount: scene.semantics?.objects.length ?? 0,
    relationshipCount: scene.semantics?.relationships?.length ?? 0,
    elementCount: scene.elements.length
  }, null, 2));
}

async function generateScientificText(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const textPath = options.positionals[0] ?? "examples/scientific-controlled-text.txt";
  const parseOutputPath = resolve(optionValue(options, "parse-output") ?? "var/exports/scientific-controlled-text.parse.json");
  const figureOutputPath = resolve(optionValue(options, "figure-output") ?? "var/exports/scientific-controlled-text.figure.json");
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/scientific-controlled-text.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/scientific-controlled-text.svg");
  const pngOutputPath = resolve(optionValue(options, "png-output") ?? "var/exports/scientific-controlled-text.png");
  const parsed = parseScientificText(await readFile(textPath, "utf8"));
  const figure = planScientificStory(parsed.story);
  const scene = compileScientificFigure(figure);
  const svg = renderSceneToSvg(scene);
  const png = renderSceneToPng(scene, {
    ...pngOptions(options, "png-"),
    background: optionValue(options, "png-background") ?? "#FFFFFF"
  });

  await mkdir(dirname(parseOutputPath), { recursive: true });
  await mkdir(dirname(figureOutputPath), { recursive: true });
  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await mkdir(dirname(pngOutputPath), { recursive: true });
  await writeFile(parseOutputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await writeFile(figureOutputPath, `${JSON.stringify(figure, null, 2)}\n`, "utf8");
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");
  await writeFile(pngOutputPath, png.png);

  console.log(JSON.stringify({
    ok: true,
    grammar: parsed.grammar,
    textPath: resolve(textPath),
    parseOutputPath,
    figureOutputPath,
    sceneOutputPath,
    svgOutputPath,
    pngOutputPath,
    statementCount: parsed.statements.length,
    objectCount: scene.semantics?.objects.length ?? 0,
    relationshipCount: scene.semantics?.relationships?.length ?? 0,
    elementCount: scene.elements.length,
    pngWidth: png.width,
    pngHeight: png.height,
    pngBytes: png.png.length,
    pngRenderer: png.renderer
  }, null, 2));
}

async function renderTransformBasics(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/transform-basics.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/transform-basics.svg");
  const scene = composeTransformBasicsScene();
  const svg = renderSceneToSvg(scene);

  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");

  console.log(JSON.stringify({ ok: true, sceneOutputPath, svgOutputPath, elementCount: scene.elements.length }, null, 2));
}

async function renderCompositionBasics(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/composition-basics.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/composition-basics.svg");
  const scene = composeCompositionBasicsScene();
  const svg = renderSceneToSvg(scene);

  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");

  console.log(
    JSON.stringify(
      { ok: true, sceneOutputPath, svgOutputPath, groupCount: scene.groups?.length ?? 0, elementCount: scene.elements.length },
      null,
      2
    )
  );
}

async function renderConstraintBasics(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/constraint-basics.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/constraint-basics.svg");
  const scene = composeConstraintBasicsScene();
  const svg = renderSceneToSvg(scene);

  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        sceneOutputPath,
        svgOutputPath,
        objectCount: scene.semantics?.objects.length ?? 0,
        relationshipCount: scene.semantics?.relationships?.length ?? 0,
        elementCount: scene.elements.length
      },
      null,
      2
    )
  );
}

async function renderRoutingBasics(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/routing-basics.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/routing-basics.svg");
  const scene = composeRoutingBasicsScene();
  const svg = renderSceneToSvg(scene);

  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        sceneOutputPath,
        svgOutputPath,
        routeCount: scene.semantics?.relationships?.length ?? 0,
        elementCount: scene.elements.length
      },
      null,
      2
    )
  );
}

async function renderLabelStyleBasics(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const sceneOutputPath = resolve(optionValue(options, "scene-output") ?? "var/exports/label-style-basics.scene.json");
  const svgOutputPath = resolve(optionValue(options, "svg-output") ?? "var/exports/label-style-basics.svg");
  const scene = composeLabelStyleBasicsScene();
  const svg = renderSceneToSvg(scene);

  await mkdir(dirname(sceneOutputPath), { recursive: true });
  await mkdir(dirname(svgOutputPath), { recursive: true });
  await writeFile(sceneOutputPath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  await writeFile(svgOutputPath, svg, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        sceneOutputPath,
        svgOutputPath,
        labeledObjectCount: scene.semantics?.objects.filter((object) => object.properties?.labelPosition !== undefined).length ?? 0,
        elementCount: scene.elements.length
      },
      null,
      2
    )
  );
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

function pngOptions(options: ParsedOptions, prefix = ""): PngRenderOptions {
  const numeric = (name: string): number | undefined => {
    const value = optionValue(options, `${prefix}${name}`);
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new ValidationError(`${prefix}${name} must be a finite number`);
    return parsed;
  };
  return {
    ...(numeric("width") === undefined ? {} : { width: numeric("width") }),
    ...(numeric("height") === undefined ? {} : { height: numeric("height") }),
    ...(numeric("scale") === undefined ? {} : { scale: numeric("scale") }),
    ...(optionValue(options, `${prefix}background`) === undefined ? {} : { background: optionValue(options, `${prefix}background`) })
  };
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

function resolveTectonicPath(options: ParsedOptions): string | undefined {
  const configured = optionValue(options, "tectonic-bin");
  if (configured !== undefined) return resolve(configured);
  const local = resolve("var/tools/tectonic/tectonic");
  return existsSync(local) ? local : undefined;
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
  render:svg [SCENE_JSON_PATH] [--output SVG_PATH] [--png-output PNG_PATH] [--png-width N | --png-height N | --png-scale N] [--png-background transparent|#RRGGBB|#RRGGBBAA]
  render:tikz [SCENE_JSON_PATH] [--output TEX_PATH] [--pdf-output PDF_PATH] [--tectonic-bin PATH]
  render:png [SCENE_JSON_PATH] [--output PNG_PATH] [--width N | --height N | --scale N] [--background transparent|#RRGGBB|#RRGGBBAA]
  render:composite [COMPOSITION_JSON_PATH] [--output PNG_PATH] [--svg-output SVG_PATH] [--width N | --height N | --scale N] [--background transparent|#RRGGBB|#RRGGBBAA]
  scientific:compose [SPEC_JSON_PATH] [--scene-output JSON_PATH] [--svg-output SVG_PATH]
  scientific:generate [SPEC_JSON_PATH] [--scene-output JSON_PATH] [--svg-output SVG_PATH]
  scientific:story [STORY_JSON_PATH] [--figure-output JSON_PATH] [--scene-output JSON_PATH] [--svg-output SVG_PATH]
  scientific:text [TEXT_PATH] [--parse-output JSON_PATH] [--figure-output JSON_PATH] [--scene-output JSON_PATH] [--svg-output SVG_PATH] [--png-output PNG_PATH] [--png-width N | --png-height N | --png-scale N] [--png-background transparent|#RRGGBB|#RRGGBBAA]
  scientific:plot [PLOT_JSON_PATH] [--result-output JSON_PATH] [--scene-output JSON_PATH] [--svg-output SVG_PATH] [--png-output PNG_PATH] [--png-width N | --png-height N | --png-scale N] [--png-background transparent|#RRGGBB|#RRGGBBAA]
  scientific:pgfplots [PLOT_JSON_PATH] [--output TEX_PATH] [--pdf-output PDF_PATH] [--tectonic-bin PATH]
  scientific:image [REQUEST_JSON_PATH] [--manifest-output JSON_PATH] [--intermediate-output JSON_PATH] [--scene-output JSON_PATH] [--svg-output SVG_PATH] [--latex-output TEX_PATH] [--latex-pdf-output PDF_PATH] [--png-output PNG_PATH] [--tectonic-bin PATH]
  geometry:boolean [REQUEST_JSON_PATH] [--output RESULT_JSON_PATH]
  geometry:flatten-curve [REQUEST_JSON_PATH] [--output RESULT_JSON_PATH]
  geometry:expand-stroke [REQUEST_JSON_PATH] [--output RESULT_JSON_PATH]
  geometry:path-markers [REQUEST_JSON_PATH] [--output RESULT_JSON_PATH]
  geometry:boolean-basics [--scene-output JSON_PATH] [--svg-output SVG_PATH] [--png-output PNG_PATH] [--png-width N | --png-height N | --png-scale N] [--png-background transparent|#RRGGBB|#RRGGBBAA]
  geometry:curve-basics [--scene-output JSON_PATH] [--svg-output SVG_PATH] [--png-output PNG_PATH] [--png-width N | --png-height N | --png-scale N] [--png-background transparent|#RRGGBB|#RRGGBBAA]
  geometry:stroke-expansion-basics [--scene-output JSON_PATH] [--svg-output SVG_PATH] [--png-output PNG_PATH] [--png-width N | --png-height N | --png-scale N] [--png-background transparent|#RRGGBB|#RRGGBBAA]
  geometry:path-marker-basics [--scene-output JSON_PATH] [--svg-output SVG_PATH] [--png-output PNG_PATH] [--png-width N | --png-height N | --png-scale N] [--png-background transparent|#RRGGBB|#RRGGBBAA]
  render:paint-basics [--scene-output JSON_PATH] [--svg-output SVG_PATH] [--png-output PNG_PATH] [--png-width N | --png-height N | --png-scale N] [--png-background transparent|#RRGGBB|#RRGGBBAA]
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
