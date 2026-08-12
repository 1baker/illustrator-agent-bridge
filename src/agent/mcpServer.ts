import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { runJsxViaIllustratorCom } from "../bridge/comAutomation.js";
import { getGeneratedJobPaths } from "../bridge/files.js";
import { detectIllustratorApps, probeIllustratorCommunication } from "../bridge/illustratorProbe.js";
import { createGeneratedJob } from "../bridge/jobs.js";
import { generatedJobSummary } from "../bridge/jsxGenerator.js";
import { launchJsxJob, resolveLaunchPlatform } from "../bridge/launcher.js";
import { driveIllustratorMouse, drivePhotoshopMouse } from "../bridge/mouseAutomation.js";
import { detectPhotoshopDesktop } from "../bridge/photoshopProbe.js";
import { normalizeJobId, readJobStatus, waitForJobResult } from "../bridge/results.js";
import { normalizeScene } from "../bridge/validation.js";
import { callIllustratorTool, getIllustratorMcpConfig, listIllustratorTools } from "../mcp/illustratorClient.js";
import { planObjectShapeScene } from "../planner/objectShapePlanner.js";
import { planCartoonSceneWithMode } from "../planner/plannerRouter.js";
import { planScientificConceptScene } from "../planner/scientificConceptPlanner.js";
import { createAuraCallExternalArtworkReviewRunner, detectAuraCallChatGptBrowser } from "../qa/auracallExternalArtworkJudge.js";
import { reviewArtworkQuality } from "../qa/artworkReviewGuard.js";
import { inspectExportArtifact } from "../qa/exportQa.js";
import { guardObjectShapeScene } from "../qa/objectShapeGuard.js";
import { loadDefaultCorpus, searchCorpus } from "../semantic/search.js";
import { inspectVectorShapeFiles } from "../semantic/vectorShapeIngest.js";
import { executeAdobeProjectWorkflow } from "../workflow/adobeProjectWorkflow.js";
import { preflightAdobeProjectWorkflow } from "../workflow/adobeProjectPreflight.js";
import { executeAdobeSvgProofWorkflow } from "../workflow/adobeSvgProofWorkflow.js";
import { executeCartoonWorkflow } from "../workflow/cartoonExecutor.js";
import { executeObjectShapeWorkflow } from "../workflow/objectExecutor.js";
import { prepareCartoonWorkflow } from "../workflow/cartoonWorkflow.js";
import { prepareObjectShapeWorkflow } from "../workflow/objectWorkflow.js";

const optionalRootSchema = z.string().min(1).optional();
const optionalUrlSchema = z.string().url().optional();
const optionalTokenSchema = z.string().min(1).optional();
const exportFormatSchema = z.enum(["pdf", "svg", "png", "jpg"]);
const launchPlatformSchema = z.enum(["auto", "macos", "windows", "wsl", "linux"]).optional();
const probeMethodSchema = z.enum(["auto", "desktop", "com"]).optional();
const mouseActionSchema = z.enum(["move", "click", "double-click", "drag"]).optional();
const mouseButtonSchema = z.enum(["left", "right"]).optional();
const plannerModeSchema = z.enum(["deterministic", "auto", "openai"]).optional();
const objectShapeTargetSchema = z.enum(["cat", "lock", "key"]);
const objectWorkflowRunModeSchema = z.enum(["launch", "com"]).optional();
const adobeArtworkIntentSchema = z.enum(["auto", "cartoon", "scientific", "object"]).optional();
const adobeSvgProofRunModeSchema = z.enum(["launch", "com"]).optional();
const externalReviewProviderSchema = z.enum(["manual", "auracall"]).optional();
const semanticKindSchema = z
  .enum([
    "object_semantics",
    "shape_recipe",
    "shape_combination",
    "scientific_concept",
    "visual_metaphor",
    "style_reference",
    "publication_requirement",
    "document_state",
    "illustrator_capability"
  ])
  .optional();

export function createAgentMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "illustrator-agent-bridge",
      version: "0.1.0"
    },
    {
      instructions:
        "Use these tools to communicate with Adobe Illustrator through either Illustrator Beta MCP or generated ExtendScript jobs. " +
        "Prefer Illustrator Beta MCP when configured. Use generated JSX jobs when direct MCP is unavailable."
    }
  );

  server.registerTool(
    "semantic_search_visual_knowledge",
    {
      title: "Search Visual Semantics",
      description:
        "Search local visual/object/style/publication knowledge before planning Illustrator artwork. Use this before creating scene jobs.",
      inputSchema: {
        query: z.string().min(1).max(1000),
        limit: z.number().int().min(1).max(25).optional(),
        kind: semanticKindSchema
      }
    },
    async ({ query, limit, kind }) => {
      const corpus = await loadDefaultCorpus();
      const results = searchCorpus(query, corpus, { limit, kind });
      return jsonToolResult({
        ok: true,
        query,
        resultCount: results.length,
        results
      });
    }
  );

  server.registerTool(
    "inspect_vector_shape_files",
    {
      title: "Inspect Vector Shape Files",
      description:
        "Inspect local/reviewed SVG, AI, EPS, PDF, or bridge scene JSON files and return shape_combination semantic items that can be merged into a corpus for future semantic search.",
      inputSchema: {
        paths: z.array(z.string().min(1).max(1000)).min(1).max(50),
        limit: z.number().int().min(1).max(10_000).optional()
      }
    },
    async ({ paths, limit }) => {
      const profiles = await inspectVectorShapeFiles(paths, { limit });
      return jsonToolResult({
        ok: true,
        inputCount: paths.length,
        profileCount: profiles.length,
        profiles,
        items: profiles.map((profile) => profile.item)
      });
    }
  );

  server.registerTool(
    "qa_export_artifact",
    {
      title: "QA Exported Illustrator Artifact",
      description:
        "Inspect an exported Illustrator artifact for publication workflow gates: file size, format signature, dimensions, SVG/PDF structure, and PNG nonblank pixels.",
      inputSchema: {
        path: z.string().min(1).max(1000),
        format: exportFormatSchema.optional(),
        minBytes: z.number().int().min(0).optional(),
        minWidth: z.number().int().min(1).optional(),
        minHeight: z.number().int().min(1).optional(),
        minNonBlankRatio: z.number().min(0).max(1).optional()
      }
    },
    async ({ path, format, minBytes, minWidth, minHeight, minNonBlankRatio }) => {
      const report = await inspectExportArtifact(path, { format, minBytes, minWidth, minHeight, minNonBlankRatio });
      return jsonToolResult({
        ok: report.ok,
        report
      });
    }
  );

  server.registerTool(
    "review_artwork_quality",
    {
      title: "Review Exported Illustrator Artwork",
      description:
        "Run export QA plus local scene/artwork critique and return review.nextGoalPrompt when the drawing should be refined before acceptance.",
      inputSchema: {
        path: z.string().min(1).max(1000),
        prompt: z.string().min(1).max(1000).optional(),
        scene: z.unknown().optional(),
        target: z.string().min(1).max(120).optional(),
        format: exportFormatSchema.optional(),
        minBytes: z.number().int().min(0).optional(),
        minWidth: z.number().int().min(1).optional(),
        minHeight: z.number().int().min(1).optional(),
        minNonBlankRatio: z.number().min(0).max(1).optional()
      }
    },
    async ({ path, prompt, scene, target, format, minBytes, minWidth, minHeight, minNonBlankRatio }) => {
      const exportQa = await inspectExportArtifact(path, { format, minBytes, minWidth, minHeight, minNonBlankRatio });
      const review = reviewArtworkQuality({
        prompt: prompt ?? "review exported Illustrator artwork",
        scene: scene === undefined ? undefined : normalizeScene(sceneFromJson(scene)),
        exportQa,
        target
      });
      return jsonToolResult({
        ok: exportQa.ok && review.ok,
        exportQa,
        review
      });
    }
  );

  server.registerTool(
    "detect_illustrator_desktop",
    {
      title: "Detect Illustrator Desktop",
      description: "Detect local Adobe Illustrator app candidates for desktop/JSX launch. Does not require OpenAI API credentials.",
      inputSchema: {
        platform: launchPlatformSchema
      }
    },
    async ({ platform }) => {
      const candidates = await detectIllustratorApps(platform);
      return jsonToolResult({
        ok: true,
        platform: platform ?? "auto",
        candidates
      });
    }
  );

  server.registerTool(
    "detect_photoshop_desktop",
    {
      title: "Detect Photoshop Desktop",
      description:
        "Read Photoshop COM registration, executable path, running process state, and recent Windows crash events before running Photoshop COM automation.",
      inputSchema: {
        platform: launchPlatformSchema,
        crashLookbackMinutes: z.number().int().min(1).max(1440).optional(),
        timeoutMs: z.number().int().min(1000).max(120_000).optional()
      }
    },
    async ({ platform, crashLookbackMinutes, timeoutMs }) => {
      const result = await detectPhotoshopDesktop({ platform, crashLookbackMinutes, timeoutMs });
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "detect_chatgpt_browser",
    {
      title: "Detect ChatGPT Browser",
      description:
        "Run AuraCall doctor for the managed ChatGPT browser and report whether browser-backed external review can run.",
      inputSchema: {
        auracallCommand: z.string().min(1).max(1000).optional(),
        timeoutSeconds: z.number().int().min(1).max(300).optional()
      }
    },
    async ({ auracallCommand, timeoutSeconds }) => {
      const result = await detectAuraCallChatGptBrowser({ command: auracallCommand, timeoutSeconds, workdir: process.cwd() });
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "preflight_adobe_project_workflow",
    {
      title: "Preflight Adobe Project Workflow",
      description:
        "Read-only prerequisite check for Illustrator, Photoshop COM, and optional AuraCall ChatGPT browser review before running the full Adobe project workflow.",
      inputSchema: {
        platform: launchPlatformSchema,
        photoshopPlatform: launchPlatformSchema,
        photoshopCrashLookbackMinutes: z.number().int().min(0).max(1440).optional(),
        photoshopTimeoutMs: z.number().int().min(1000).max(120_000).optional(),
        requireChatGptBrowser: z.boolean().optional(),
        externalReviewProvider: externalReviewProviderSchema,
        auracallCommand: z.string().min(1).max(1000).optional(),
        chatGptTimeoutSeconds: z.number().int().min(1).max(300).optional(),
        chatGptOperationTimeoutSeconds: z.number().int().min(1).max(300).optional()
      }
    },
    async ({
      platform,
      photoshopPlatform,
      photoshopCrashLookbackMinutes,
      photoshopTimeoutMs,
      requireChatGptBrowser,
      externalReviewProvider,
      auracallCommand,
      chatGptTimeoutSeconds,
      chatGptOperationTimeoutSeconds
    }) => {
      const result = await preflightAdobeProjectWorkflow({
        illustratorPlatform: platform,
        photoshopPlatform,
        photoshopCrashLookbackMinutes,
        photoshopTimeoutMs,
        requireChatGptBrowser: requireChatGptBrowser || externalReviewProvider === "auracall",
        auracallCommand,
        chatGptTimeoutSeconds,
        chatGptOperationTimeoutSeconds
      });
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "probe_illustrator_communication",
    {
      title: "Probe Illustrator Communication",
      description:
        "Create a ping or circle JSX job, run it in Illustrator through COM or desktop launch, and optionally wait for result JSON that proves Illustrator communication.",
      inputSchema: {
        platform: launchPlatformSchema,
        method: probeMethodSchema,
        appPath: z.string().min(1).max(1000).optional(),
        dryRun: z.boolean().optional(),
        waitForResult: z.boolean().optional(),
        autoConfirmDialog: z.boolean().optional(),
        drawCircle: z.boolean().optional(),
        drawComplex: z.boolean().optional(),
        mouseProof: z.boolean().optional(),
        mouseAction: mouseActionSchema,
        mouseX: z.number().min(0).max(1).optional(),
        mouseY: z.number().min(0).max(1).optional(),
        mouseToX: z.number().min(0).max(1).optional(),
        mouseToY: z.number().min(0).max(1).optional(),
        mouseDurationMs: z.number().int().min(0).max(30_000).optional(),
        mouseWindowTitlePattern: z.string().min(1).max(200).optional(),
        timeoutMs: z.number().int().min(0).max(600_000).optional(),
        dialogTimeoutMs: z.number().int().min(0).max(120_000).optional(),
        intervalMs: z.number().int().min(100).max(60_000).optional(),
        root: optionalRootSchema
      }
    },
    async ({
      platform,
      method,
      appPath,
      dryRun,
      waitForResult,
      autoConfirmDialog,
      drawCircle,
      drawComplex,
      mouseProof,
      mouseAction,
      mouseX,
      mouseY,
      mouseToX,
      mouseToY,
      mouseDurationMs,
      mouseWindowTitlePattern,
      timeoutMs,
      dialogTimeoutMs,
      intervalMs,
      root
    }) => {
      const result = await probeIllustratorCommunication({
        platform,
        method,
        appPath,
        dryRun,
        waitForResult,
        autoConfirmDialog,
        drawCircle,
        drawComplex,
        mouseProof,
        mouseAction,
        mouseX,
        mouseY,
        mouseToX,
        mouseToY,
        mouseDurationMs,
        mouseWindowTitlePattern,
        timeoutMs,
        dialogTimeoutMs,
        intervalMs,
        root
      });
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "drive_illustrator_mouse",
    {
      title: "Drive Illustrator Mouse",
      description:
        "Move, click, double-click, or drag the actual Windows mouse relative to the detected Illustrator window. Use dryRun first; live runs fail unless Illustrator can be focused or the target point is confirmed to belong to Illustrator.",
      inputSchema: {
        platform: launchPlatformSchema,
        action: mouseActionSchema,
        button: mouseButtonSchema,
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
        toX: z.number().min(0).max(1).optional(),
        toY: z.number().min(0).max(1).optional(),
        durationMs: z.number().int().min(0).max(30_000).optional(),
        toolShortcut: z.string().min(1).max(40).optional(),
        toolShortcutDelayMs: z.number().int().min(0).max(10_000).optional(),
        windowTitlePattern: z.string().min(1).max(200).optional(),
        dryRun: z.boolean().optional()
      }
    },
    async ({ platform, action, button, x, y, toX, toY, durationMs, toolShortcut, toolShortcutDelayMs, windowTitlePattern, dryRun }) => {
      const result = await driveIllustratorMouse({
        platform: resolveLaunchPlatform(platform),
        action,
        button,
        relativeX: x,
        relativeY: y,
        endRelativeX: toX,
        endRelativeY: toY,
        durationMs,
        toolShortcut,
        toolShortcutDelayMs,
        windowTitlePattern,
        dryRun
      });
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "drive_photoshop_mouse",
    {
      title: "Drive Photoshop Mouse",
      description:
        "Move, click, double-click, or drag the actual Windows mouse relative to the detected Photoshop window. Use dryRun first; live runs fail unless Photoshop can be focused or the target point is confirmed to belong to Photoshop.",
      inputSchema: {
        platform: launchPlatformSchema,
        action: mouseActionSchema,
        button: mouseButtonSchema,
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
        toX: z.number().min(0).max(1).optional(),
        toY: z.number().min(0).max(1).optional(),
        durationMs: z.number().int().min(0).max(30_000).optional(),
        toolShortcut: z.string().min(1).max(40).optional(),
        toolShortcutDelayMs: z.number().int().min(0).max(10_000).optional(),
        windowTitlePattern: z.string().min(1).max(200).optional(),
        dryRun: z.boolean().optional()
      }
    },
    async ({ platform, action, button, x, y, toX, toY, durationMs, toolShortcut, toolShortcutDelayMs, windowTitlePattern, dryRun }) => {
      const result = await drivePhotoshopMouse({
        platform: resolveLaunchPlatform(platform),
        action,
        button,
        relativeX: x,
        relativeY: y,
        endRelativeX: toX,
        endRelativeY: toY,
        durationMs,
        toolShortcut,
        toolShortcutDelayMs,
        windowTitlePattern,
        dryRun
      });
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "prepare_cartoon_publication_workflow",
    {
      title: "Prepare Cartoon Publication Workflow",
      description:
        "Prepare a complete fallback workflow: semantic plan, scene JSX job, export JSX job, and runbook for executing those jobs in Illustrator.",
      inputSchema: {
        prompt: z.string().min(1).max(1000),
        outputPath: z.string().min(1).max(1000),
        format: exportFormatSchema.optional(),
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        planner: plannerModeSchema,
        model: z.string().min(1).max(120).optional(),
        root: optionalRootSchema
      }
    },
    async ({ prompt, outputPath, format, width, height, title, planner, model, root }) => {
      const workflow = await prepareCartoonWorkflow({
        prompt,
        outputPath,
        format,
        width,
        height,
        title,
        plannerMode: planner,
        openAiModel: model,
        root
      });
      return jsonToolResult(workflow);
    }
  );

  server.registerTool(
    "execute_cartoon_publication_workflow",
    {
      title: "Execute Cartoon Publication Workflow",
      description:
        "Prepare a semantic cartoon workflow, launch scene/export JSX jobs in order, optionally wait for Illustrator result JSON, and run export artifact QA.",
      inputSchema: {
        prompt: z.string().min(1).max(1000),
        outputPath: z.string().min(1).max(1000),
        format: exportFormatSchema.optional(),
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        planner: plannerModeSchema,
        model: z.string().min(1).max(120).optional(),
        platform: launchPlatformSchema,
        appPath: z.string().min(1).max(1000).optional(),
        dryRun: z.boolean().optional(),
        waitForResults: z.boolean().optional(),
        timeoutMs: z.number().int().min(0).max(600_000).optional(),
        intervalMs: z.number().int().min(100).max(60_000).optional(),
        skipQa: z.boolean().optional(),
        skipArtworkReview: z.boolean().optional(),
        minBytes: z.number().int().min(0).optional(),
        minWidth: z.number().int().min(1).optional(),
        minHeight: z.number().int().min(1).optional(),
        minNonBlankRatio: z.number().min(0).max(1).optional(),
        root: optionalRootSchema
      }
    },
    async ({
      prompt,
      outputPath,
      format,
      width,
      height,
      title,
      planner,
      model,
      platform: launchPlatform,
      appPath,
      dryRun,
      waitForResults,
      timeoutMs,
      intervalMs,
      skipQa,
      skipArtworkReview,
      minBytes,
      minWidth,
      minHeight,
      minNonBlankRatio,
      root
    }) => {
      const execution = await executeCartoonWorkflow({
        prompt,
        outputPath,
        format,
        width,
        height,
        title,
        plannerMode: planner,
        openAiModel: model,
        launchPlatform,
        appPath,
        dryRun,
        waitForResults,
        timeoutMs,
        intervalMs,
        skipQa,
        skipArtworkReview,
        minBytes,
        minWidth,
        minHeight,
        minNonBlankRatio,
        root
      });
      return jsonToolResult(execution);
    }
  );

  server.registerTool(
    "execute_adobe_svg_proof_workflow",
    {
      title: "Execute Illustrator SVG With Photoshop Proof",
      description:
        "Take a natural-language prompt, plan editable Illustrator vector artwork, export SVG, run Photoshop via COM to rasterize the SVG as a PNG proof, and run QA/review on the proof.",
      inputSchema: {
        prompt: z.string().min(1).max(1500),
        outputPath: z.string().min(1).max(1000),
        proofPngPath: z.string().min(1).max(1000).optional(),
        intent: adobeArtworkIntentSchema,
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        planner: plannerModeSchema,
        model: z.string().min(1).max(120).optional(),
        proofWidth: z.number().int().min(1).max(30000).optional(),
        proofHeight: z.number().int().min(1).max(30000).optional(),
        proofResolution: z.number().min(1).max(2400).optional(),
        illustratorRunMode: adobeSvgProofRunModeSchema,
        platform: launchPlatformSchema,
        photoshopPlatform: launchPlatformSchema,
        appPath: z.string().min(1).max(1000).optional(),
        dryRun: z.boolean().optional(),
        waitForResults: z.boolean().optional(),
        timeoutMs: z.number().int().min(0).max(600_000).optional(),
        intervalMs: z.number().int().min(100).max(60_000).optional(),
        skipQa: z.boolean().optional(),
        skipArtworkReview: z.boolean().optional(),
        minBytes: z.number().int().min(0).optional(),
        minWidth: z.number().int().min(1).optional(),
        minHeight: z.number().int().min(1).optional(),
        minNonBlankRatio: z.number().min(0).max(1).optional(),
        proofMinWidth: z.number().int().min(1).optional(),
        proofMinHeight: z.number().int().min(1).optional(),
        proofMinNonBlankRatio: z.number().min(0).max(1).optional(),
        maxReviewIterations: z.number().int().min(1).max(10).optional(),
        root: optionalRootSchema
      }
    },
    async ({
      prompt,
      outputPath,
      proofPngPath,
      intent,
      width,
      height,
      title,
      planner,
      model,
      proofWidth,
      proofHeight,
      proofResolution,
      illustratorRunMode,
      platform: launchPlatform,
      photoshopPlatform,
      appPath,
      dryRun,
      waitForResults,
      timeoutMs,
      intervalMs,
      skipQa,
      skipArtworkReview,
      minBytes,
      minWidth,
      minHeight,
      minNonBlankRatio,
      proofMinWidth,
      proofMinHeight,
      proofMinNonBlankRatio,
      maxReviewIterations,
      root
    }) => {
      const execution = await executeAdobeSvgProofWorkflow({
        prompt,
        outputPath,
        proofPngPath,
        intent,
        width,
        height,
        title,
        plannerMode: planner,
        openAiModel: model,
        proofWidth,
        proofHeight,
        proofResolution,
        illustratorRunMode,
        launchPlatform,
        photoshopPlatform,
        appPath,
        dryRun,
        waitForResults,
        timeoutMs,
        intervalMs,
        skipQa,
        skipArtworkReview,
        minBytes,
        minWidth,
        minHeight,
        minNonBlankRatio,
        proofMinWidth,
        proofMinHeight,
        proofMinNonBlankRatio,
        maxReviewIterations,
        root
      });
      return jsonToolResult(execution);
    }
  );

  server.registerTool(
    "execute_adobe_project_workflow",
    {
      title: "Execute Illustrator And Photoshop Project Workflow",
      description:
        "Run a full Illustrator -> Photoshop -> Illustrator project handoff: editable Illustrator vector scene, source SVG export, Photoshop layered PSD/PNG/SVG handoff pass, Illustrator SVG handoff placement, final SVG export, and QA/review.",
      inputSchema: {
        prompt: z.string().min(1).max(1500),
        outputPath: z.string().min(1).max(1000),
        sourceSvgPath: z.string().min(1).max(1000).optional(),
        photoshopReferencePngPath: z.string().min(1).max(1000).optional(),
        photoshopHandoffSvgPath: z.string().min(1).max(1000).optional(),
        photoshopWorkingPsdPath: z.string().min(1).max(1000).optional(),
        photoshopFeedbackPath: z.string().min(1).max(1000).optional(),
        intent: adobeArtworkIntentSchema,
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        planner: plannerModeSchema,
        model: z.string().min(1).max(120).optional(),
        proofWidth: z.number().int().min(1).max(30000).optional(),
        proofHeight: z.number().int().min(1).max(30000).optional(),
        proofResolution: z.number().min(1).max(2400).optional(),
        referenceOpacity: z.number().min(0).max(100).optional(),
        embedReference: z.boolean().optional(),
        visibleMouseProof: z.boolean().optional(),
        visibleMouseDurationMs: z.number().int().min(0).max(30_000).optional(),
        illustratorMouseToolShortcut: z.string().min(1).max(40).optional(),
        photoshopMouseToolShortcut: z.string().min(1).max(40).optional(),
        illustratorMouseWindowTitlePattern: z.string().min(1).max(200).optional(),
        photoshopMouseWindowTitlePattern: z.string().min(1).max(200).optional(),
        illustratorRunMode: adobeSvgProofRunModeSchema,
        platform: launchPlatformSchema,
        photoshopPlatform: launchPlatformSchema,
        appPath: z.string().min(1).max(1000).optional(),
        dryRun: z.boolean().optional(),
        waitForResults: z.boolean().optional(),
        timeoutMs: z.number().int().min(0).max(600_000).optional(),
        intervalMs: z.number().int().min(100).max(60_000).optional(),
        skipQa: z.boolean().optional(),
        skipArtworkReview: z.boolean().optional(),
        minBytes: z.number().int().min(0).optional(),
        minWidth: z.number().int().min(1).optional(),
        minHeight: z.number().int().min(1).optional(),
        minNonBlankRatio: z.number().min(0).max(1).optional(),
        proofMinWidth: z.number().int().min(1).optional(),
        proofMinHeight: z.number().int().min(1).optional(),
        proofMinNonBlankRatio: z.number().min(0).max(1).optional(),
        maxReviewIterations: z.number().int().min(1).max(10).optional(),
        externalReviewProvider: externalReviewProviderSchema,
        externalReviewPacketPath: z.string().min(1).max(1000).optional(),
        externalReviewVerdict: z.unknown().optional(),
        requireExternalReviewPass: z.boolean().optional(),
        externalReviewMinScore: z.number().min(0).max(100).optional(),
        externalReviewModel: z.string().min(1).max(120).optional(),
        externalReviewTimeoutSeconds: z.number().int().min(1).max(7200).optional(),
        externalReviewPreflight: z.boolean().optional(),
        externalReviewPreflightTimeoutSeconds: z.number().int().min(1).max(300).optional(),
        externalReviewOutputPath: z.string().min(1).max(1000).optional(),
        reviewReportPath: z.string().min(1).max(1000).optional(),
        auracallCommand: z.string().min(1).max(1000).optional(),
        root: optionalRootSchema
      }
    },
    async ({
      prompt,
      outputPath,
      sourceSvgPath,
      photoshopReferencePngPath,
      photoshopHandoffSvgPath,
      photoshopWorkingPsdPath,
      photoshopFeedbackPath,
      intent,
      width,
      height,
      title,
      planner,
      model,
      proofWidth,
      proofHeight,
      proofResolution,
      referenceOpacity,
      embedReference,
      visibleMouseProof,
      visibleMouseDurationMs,
      illustratorMouseToolShortcut,
      photoshopMouseToolShortcut,
      illustratorMouseWindowTitlePattern,
      photoshopMouseWindowTitlePattern,
      illustratorRunMode,
      platform: launchPlatform,
      photoshopPlatform,
      appPath,
      dryRun,
      waitForResults,
      timeoutMs,
      intervalMs,
      skipQa,
      skipArtworkReview,
      minBytes,
      minWidth,
      minHeight,
      minNonBlankRatio,
      proofMinWidth,
      proofMinHeight,
      proofMinNonBlankRatio,
      maxReviewIterations,
      externalReviewProvider,
      externalReviewPacketPath,
      externalReviewVerdict,
      requireExternalReviewPass,
      externalReviewMinScore,
      externalReviewModel,
      externalReviewTimeoutSeconds,
      externalReviewPreflight,
      externalReviewPreflightTimeoutSeconds,
      externalReviewOutputPath,
      reviewReportPath,
      auracallCommand,
      root
    }) => {
      const externalReview =
        externalReviewProvider === "auracall"
          ? createAuraCallExternalArtworkReviewRunner({
              command: auracallCommand,
              model: externalReviewModel,
              timeoutSeconds: externalReviewTimeoutSeconds,
              workdir: process.cwd(),
              packetPath: externalReviewPacketPath,
              outputPath: externalReviewOutputPath,
              preflightBrowserReadiness: externalReviewPreflight ?? true,
              preflightTimeoutSeconds: externalReviewPreflightTimeoutSeconds
            })
          : undefined;
      const execution = await executeAdobeProjectWorkflow({
        prompt,
        outputPath,
        sourceSvgPath,
        photoshopReferencePngPath,
        photoshopHandoffSvgPath,
        photoshopWorkingPsdPath,
        photoshopFeedbackPath,
        intent,
        width,
        height,
        title,
        plannerMode: planner,
        openAiModel: model,
        proofWidth,
        proofHeight,
        proofResolution,
        referenceOpacity,
        embedReference,
        visibleMouseProof,
        visibleMouseDurationMs,
        illustratorMouseToolShortcut,
        photoshopMouseToolShortcut,
        illustratorMouseWindowTitlePattern,
        photoshopMouseWindowTitlePattern,
        illustratorRunMode,
        launchPlatform,
        photoshopPlatform,
        appPath,
        dryRun,
        waitForResults,
        timeoutMs,
        intervalMs,
        skipQa,
        skipArtworkReview,
        minBytes,
        minWidth,
        minHeight,
        minNonBlankRatio,
        proofMinWidth,
        proofMinHeight,
        proofMinNonBlankRatio,
        maxReviewIterations,
        externalReview,
        externalReviewPacketPath,
        externalReviewVerdict,
        requireExternalReviewPass: requireExternalReviewPass || externalReviewProvider === "auracall",
        externalReviewMinScore,
        reviewReportPath,
        root
      });
      return jsonToolResult(execution);
    }
  );

  server.registerTool(
    "prepare_object_shape_workflow",
    {
      title: "Prepare Guarded Object Shape Workflow",
      description:
        "Prepare a guarded cat/lock/key Illustrator workflow: semantic object plan, shape guard, scene JSX job, export JSX job, and runbook.",
      inputSchema: {
        prompt: z.string().min(1).max(1000),
        outputPath: z.string().min(1).max(1000),
        format: exportFormatSchema.optional(),
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        evidenceLimit: z.number().int().min(1).max(25).optional(),
        maxGuardIterations: z.number().int().min(1).max(10).optional(),
        root: optionalRootSchema
      }
    },
    async ({ prompt, outputPath, format, width, height, title, evidenceLimit, maxGuardIterations, root }) => {
      const workflow = await prepareObjectShapeWorkflow({
        prompt,
        outputPath,
        format,
        width,
        height,
        title,
        evidenceLimit,
        maxGuardIterations,
        root
      });
      return jsonToolResult(workflow);
    }
  );

  server.registerTool(
    "execute_object_shape_workflow",
    {
      title: "Execute Guarded Object Shape Workflow",
      description:
        "Prepare a guarded cat/lock/key object workflow, stop with nextGoalPrompt if the object guard fails, otherwise run scene/export JSX jobs and optional export QA.",
      inputSchema: {
        prompt: z.string().min(1).max(1000),
        outputPath: z.string().min(1).max(1000),
        format: exportFormatSchema.optional(),
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        evidenceLimit: z.number().int().min(1).max(25).optional(),
        maxGuardIterations: z.number().int().min(1).max(10).optional(),
        runMode: objectWorkflowRunModeSchema,
        platform: launchPlatformSchema,
        appPath: z.string().min(1).max(1000).optional(),
        dryRun: z.boolean().optional(),
        waitForResults: z.boolean().optional(),
        timeoutMs: z.number().int().min(0).max(600_000).optional(),
        intervalMs: z.number().int().min(100).max(60_000).optional(),
        skipQa: z.boolean().optional(),
        skipArtworkReview: z.boolean().optional(),
        minBytes: z.number().int().min(0).optional(),
        minWidth: z.number().int().min(1).optional(),
        minHeight: z.number().int().min(1).optional(),
        minNonBlankRatio: z.number().min(0).max(1).optional(),
        root: optionalRootSchema
      }
    },
    async ({
      prompt,
      outputPath,
      format,
      width,
      height,
      title,
      evidenceLimit,
      maxGuardIterations,
      runMode,
      platform: launchPlatform,
      appPath,
      dryRun,
      waitForResults,
      timeoutMs,
      intervalMs,
      skipQa,
      skipArtworkReview,
      minBytes,
      minWidth,
      minHeight,
      minNonBlankRatio,
      root
    }) => {
      const execution = await executeObjectShapeWorkflow({
        prompt,
        outputPath,
        format,
        width,
        height,
        title,
        evidenceLimit,
        maxGuardIterations,
        runMode,
        launchPlatform,
        appPath,
        dryRun,
        waitForResults,
        timeoutMs,
        intervalMs,
        skipQa,
        skipArtworkReview,
        minBytes,
        minWidth,
        minHeight,
        minNonBlankRatio,
        root
      });
      return jsonToolResult(execution);
    }
  );

  server.registerTool(
    "plan_cartoon_scene_job",
    {
      title: "Plan Cartoon Scene and Create JSX Job",
      description:
        "Use local semantic search to plan a first-pass publication-style cartoon scene from a natural-language prompt, QA the scene, and create a JSX job.",
      inputSchema: {
        prompt: z.string().min(1).max(1000),
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        planner: plannerModeSchema,
        model: z.string().min(1).max(120).optional(),
        root: optionalRootSchema
      }
    },
    async ({ prompt, width, height, title, planner, model, root }) => {
      const corpus = await loadDefaultCorpus();
      const plan = await planCartoonSceneWithMode(prompt, corpus, { width, height, title, plannerMode: planner, openAiModel: model });
      const job = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, root);
      return jsonToolResult({
        ok: true,
        plan,
        job: generatedJobSummary(job),
        run: runInstructions(job)
      });
    }
  );

  server.registerTool(
    "plan_scientific_concept_scene_job",
    {
      title: "Plan Scientific Concept Scene and Create JSX Job",
      description:
        "Run semantic searches for scientific concepts, visual metaphors, object semantics, and publication constraints, then create a complex Illustrator vector scene job.",
      inputSchema: {
        prompt: z.string().min(1).max(1500),
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        evidenceLimit: z.number().int().min(1).max(25).optional(),
        root: optionalRootSchema
      }
    },
    async ({ prompt, width, height, title, evidenceLimit, root }) => {
      const corpus = await loadDefaultCorpus();
      const plan = planScientificConceptScene(prompt, corpus, { width, height, title, evidenceLimit });
      const job = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, root);
      return jsonToolResult({
        ok: true,
        plan,
        job: generatedJobSummary(job),
        run: runInstructions(job)
      });
    }
  );

  server.registerTool(
    "plan_object_shape_scene_job",
    {
      title: "Plan Guarded Object Shape Scene and Create JSX Job",
      description:
        "Search local shape recipes and object semantics, create a recognizable cat/lock/key vector scene, run the local shape guard, and create an Illustrator JSX job. If guard.ok is false, feed guard.nextPrompt into the next iteration.",
      inputSchema: {
        prompt: z.string().min(1).max(1000),
        width: z.number().int().min(360).max(14400).optional(),
        height: z.number().int().min(240).max(14400).optional(),
        title: z.string().min(1).max(120).optional(),
        evidenceLimit: z.number().int().min(1).max(25).optional(),
        root: optionalRootSchema
      }
    },
    async ({ prompt, width, height, title, evidenceLimit, root }) => {
      const corpus = await loadDefaultCorpus();
      const plan = planObjectShapeScene(prompt, corpus, { width, height, title, evidenceLimit });
      const job = await createGeneratedJob({ kind: "cartoon_scene", scene: plan.scene }, root);
      return jsonToolResult({
        ok: true,
        plan,
        job: generatedJobSummary(job),
        run: runInstructions(job)
      });
    }
  );

  server.registerTool(
    "guard_object_shape_scene",
    {
      title: "Guard Object Shape Scene",
      description:
        "Check whether a structured Illustrator vector scene contains the recognizable parts of a cat, lock, or key. Returns guard.nextPrompt for the next refinement pass when checks fail.",
      inputSchema: {
        target: objectShapeTargetSchema,
        scene: z.unknown(),
        prompt: z.string().min(1).max(1000).optional()
      }
    },
    async ({ target, scene, prompt }) => {
      const normalizedScene = normalizeScene(scene);
      const guard = guardObjectShapeScene(target, normalizedScene, prompt);
      return jsonToolResult({
        ok: guard.ok,
        guard
      });
    }
  );

  server.registerTool(
    "bridge_launch_job",
    {
      title: "Launch Illustrator JSX Job",
      description:
        "Ask the host OS to open a generated JSX job in Illustrator or the registered JSX file association, then wait for the job result.",
      inputSchema: {
        jobId: z.string().min(1),
        platform: launchPlatformSchema,
        appPath: z.string().min(1).max(1000).optional(),
        dryRun: z.boolean().optional(),
        root: optionalRootSchema
      }
    },
    async ({ jobId, platform, appPath, dryRun, root }) => {
      const { jobPath } = await getGeneratedJobPaths(normalizeJobId(jobId), root);
      const result = await launchJsxJob(jobPath, { platform, appPath, dryRun, root });
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "bridge_run_job_via_com",
    {
      title: "Run Illustrator JSX Job via COM",
      description:
        "Execute a generated JSX job through Windows Illustrator COM DoJavaScriptFile. Prefer this on Windows/WSL when a job should run without desktop script-warning prompts.",
      inputSchema: {
        jobId: z.string().min(1),
        platform: launchPlatformSchema,
        dryRun: z.boolean().optional(),
        timeoutMs: z.number().int().min(0).max(600_000).optional(),
        root: optionalRootSchema
      }
    },
    async ({ jobId, platform, dryRun, timeoutMs, root }) => {
      const { jobPath } = await getGeneratedJobPaths(normalizeJobId(jobId), root);
      const result = await runJsxViaIllustratorCom(jobPath, {
        platform: resolveLaunchPlatform(platform),
        dryRun,
        timeoutMs,
        root
      });
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "bridge_get_job_status",
    {
      title: "Get Illustrator Job Status",
      description: "Check whether a generated Illustrator JSX job has written its result JSON.",
      inputSchema: {
        jobId: z.string().min(1),
        root: optionalRootSchema
      }
    },
    async ({ jobId, root }) => {
      const status = await readJobStatus(jobId, root);
      return jsonToolResult({
        ok: true,
        job: status
      });
    }
  );

  server.registerTool(
    "bridge_wait_for_job_result",
    {
      title: "Wait for Illustrator Job Result",
      description:
        "Poll for a generated Illustrator JSX job result JSON. Use after an agent or human has run the JSX in Illustrator.",
      inputSchema: {
        jobId: z.string().min(1),
        timeoutMs: z.number().int().min(0).max(600_000).optional(),
        intervalMs: z.number().int().min(100).max(60_000).optional(),
        root: optionalRootSchema
      }
    },
    async ({ jobId, timeoutMs, intervalMs, root }) => {
      const status = await waitForJobResult(jobId, { timeoutMs, intervalMs, root });
      return jsonToolResult({
        ok: true,
        job: status
      });
    }
  );

  server.registerTool(
    "bridge_create_ping_job",
    {
      title: "Create Illustrator Ping JSX Job",
      description:
        "Create a self-contained Illustrator ExtendScript ping job. Run the returned script path in Illustrator with File > Scripts > Other Script, then inspect the returned result path.",
      inputSchema: {
        message: z.string().max(500).optional(),
        root: optionalRootSchema
      }
    },
    async ({ message, root }) => {
      const job = await createGeneratedJob({ kind: "ping", message }, root);
      return jsonToolResult({
        ok: true,
        job: generatedJobSummary(job),
        run: runInstructions(job)
      });
    }
  );

  server.registerTool(
    "bridge_create_cartoon_scene_job",
    {
      title: "Create Illustrator Cartoon Scene JSX Job",
      description:
        "Validate a structured cartoon scene and create an Illustrator ExtendScript job that draws named vector elements and writes a JSON result file.",
      inputSchema: {
        scene: z.unknown(),
        root: optionalRootSchema
      }
    },
    async ({ scene, root }) => {
      const normalizedScene = normalizeScene(scene);
      const job = await createGeneratedJob({ kind: "cartoon_scene", scene: normalizedScene }, root);
      return jsonToolResult({
        ok: true,
        job: generatedJobSummary(job),
        run: runInstructions(job)
      });
    }
  );

  server.registerTool(
    "bridge_create_export_job",
    {
      title: "Create Illustrator Export JSX Job",
      description:
        "Create a JSX job that exports the active Illustrator document to PDF, SVG, PNG, or JPG. Run it after a document exists in Illustrator.",
      inputSchema: {
        format: exportFormatSchema,
        outputPath: z.string().min(1).max(1000),
        root: optionalRootSchema
      }
    },
    async ({ format, outputPath, root }) => {
      const job = await createGeneratedJob({ kind: "export", format, outputPath }, root);
      return jsonToolResult({
        ok: true,
        job: generatedJobSummary(job),
        run: runInstructions(job)
      });
    }
  );

  server.registerTool(
    "illustrator_beta_list_tools",
    {
      title: "List Illustrator Beta MCP Tools",
      description:
        "Connect to Illustrator Beta's built-in MCP server and list the tools exposed by Adobe. Requires ILLUSTRATOR_MCP_URL and usually ILLUSTRATOR_MCP_TOKEN unless passed as arguments.",
      inputSchema: {
        url: optionalUrlSchema,
        token: optionalTokenSchema
      }
    },
    async ({ url, token }) => {
      const config = getIllustratorMcpConfig({ url, token });
      const tools = await listIllustratorTools(config);
      return jsonToolResult({
        ok: true,
        toolCount: tools.length,
        tools
      });
    }
  );

  server.registerTool(
    "illustrator_beta_call_tool",
    {
      title: "Call Illustrator Beta MCP Tool",
      description:
        "Proxy a call to an Illustrator Beta MCP tool. Use only after listing tools and matching the tool's input schema.",
      inputSchema: {
        name: z.string().min(1),
        arguments: z.record(z.string(), z.unknown()).optional(),
        url: optionalUrlSchema,
        token: optionalTokenSchema
      }
    },
    async ({ name, arguments: toolArguments, url, token }) => {
      const config = getIllustratorMcpConfig({ url, token });
      const result = await callIllustratorTool(config, name, toolArguments ?? {});
      return jsonToolResult({
        ok: true,
        result
      });
    }
  );

  server.registerResource(
    "bridge_capabilities",
    "illustrator-agent://capabilities",
    {
      title: "Illustrator Agent Bridge Capabilities",
      description: "Current local bridge capabilities and recommended tool order.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              preferredPath: "Illustrator Beta MCP when configured; generated JSX fallback otherwise.",
              tools: [
                "semantic_search_visual_knowledge",
                "inspect_vector_shape_files",
                "detect_illustrator_desktop",
                "probe_illustrator_communication",
                "drive_illustrator_mouse",
                "drive_photoshop_mouse",
                "prepare_cartoon_publication_workflow",
                "execute_cartoon_publication_workflow",
                "execute_adobe_svg_proof_workflow",
                "execute_adobe_project_workflow",
                "prepare_object_shape_workflow",
                "execute_object_shape_workflow",
                "plan_cartoon_scene_job",
                "plan_scientific_concept_scene_job",
                "plan_object_shape_scene_job",
                "guard_object_shape_scene",
                "illustrator_beta_list_tools",
                "illustrator_beta_call_tool",
                "bridge_create_ping_job",
                "bridge_create_cartoon_scene_job",
                "bridge_create_export_job",
                "bridge_launch_job",
                "bridge_run_job_via_com",
                "bridge_get_job_status",
                "bridge_wait_for_job_result",
                "qa_export_artifact",
                "review_artwork_quality"
              ],
              generatedJobContract: {
                runInIllustrator: "File > Scripts > Other Script",
                launchFromDesktop: "bridge_launch_job opens a generated JSX through the host OS when file association or app selection is configured.",
                result: "Each generated JSX job writes a JSON result file.",
                export: "Export jobs require an active Illustrator document.",
                photoshopProof: "execute_adobe_svg_proof_workflow keeps Illustrator SVG as the editable source and uses Photoshop COM to rasterize a PNG proof for QA/review.",
                photoshopProject:
                  "execute_adobe_project_workflow runs an Illustrator -> Photoshop -> Illustrator handoff: source SVG, Photoshop layered PSD/PNG/feedback plus return SVG handoff, Illustrator SVG placement, final SVG. With visibleMouseProof true, the workflow drives the real mouse in Illustrator, Photoshop, and Illustrator again, and commits the Photoshop return SVG after the Photoshop mouse edit.",
                qa: "Run qa_export_artifact for file checks, then review_artwork_quality to get a refinement prompt before accepting the artwork."
              }
            },
            null,
            2
          )
        }
      ]
    })
  );

  return server;
}

export async function startAgentMcpStdioServer(): Promise<void> {
  const server = createAgentMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function runInstructions(job: { illustratorJobPath: string; resultPath: string; illustratorResultPath: string }) {
  return {
    illustratorMenu: "File > Scripts > Other Script",
    scriptPath: job.illustratorJobPath,
    resultPath: job.resultPath,
    illustratorResultPath: job.illustratorResultPath
  };
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
