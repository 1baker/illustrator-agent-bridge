import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentMcpServer } from "../src/agent/mcpServer.js";

test("agent MCP server exposes and calls bridge job tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "illustrator-agent-mcp-"));
  const server = createAgentMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const listed = await client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === "semantic_search_visual_knowledge"));
    assert.ok(listed.tools.some((tool) => tool.name === "inspect_vector_shape_files"));
    assert.ok(listed.tools.some((tool) => tool.name === "detect_illustrator_desktop"));
    assert.ok(listed.tools.some((tool) => tool.name === "detect_photoshop_desktop"));
    assert.ok(listed.tools.some((tool) => tool.name === "detect_chatgpt_browser"));
    assert.ok(listed.tools.some((tool) => tool.name === "preflight_adobe_project_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "probe_illustrator_communication"));
    assert.ok(listed.tools.some((tool) => tool.name === "drive_illustrator_mouse"));
    assert.ok(listed.tools.some((tool) => tool.name === "drive_photoshop_mouse"));
    assert.ok(listed.tools.some((tool) => tool.name === "prepare_cartoon_publication_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "execute_cartoon_publication_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "execute_adobe_svg_proof_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "prepare_object_shape_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "execute_object_shape_workflow"));
    assert.ok(listed.tools.some((tool) => tool.name === "plan_cartoon_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "plan_scientific_concept_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "plan_object_shape_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "guard_object_shape_scene"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_ping_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_cartoon_scene_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_create_export_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_launch_job"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_run_job_via_com"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_get_job_status"));
    assert.ok(listed.tools.some((tool) => tool.name === "bridge_wait_for_job_result"));
    assert.ok(listed.tools.some((tool) => tool.name === "qa_export_artifact"));
    assert.ok(listed.tools.some((tool) => tool.name === "review_artwork_quality"));

    const searchResult = await client.callTool({
      name: "semantic_search_visual_knowledge",
      arguments: {
        query: "cartoon lab flask",
        limit: 2
      }
    });
    const searchContent = searchResult.content as Array<{ type: string; text?: string }>;
    const searchBody = JSON.parse(searchContent[0]?.text ?? "");
    assert.equal(searchBody.ok, true);
    assert.equal(searchBody.results[0].item.kind, "object_semantics");

    const svgPath = join(root, "mcp-cat.svg");
    await writeFile(svgPath, `<svg><ellipse id="cat-head"/><path id="cat-tail" d="M0 0 C5 5 8 8 10 0"/></svg>`, "utf8");
    const inspectVectorResult = await client.callTool({
      name: "inspect_vector_shape_files",
      arguments: {
        paths: [svgPath]
      }
    });
    const inspectVectorContent = inspectVectorResult.content as Array<{ type: string; text?: string }>;
    const inspectVectorBody = JSON.parse(inspectVectorContent[0]?.text ?? "");
    assert.equal(inspectVectorBody.ok, true);
    assert.equal(inspectVectorBody.items[0].kind, "shape_combination");
    assert.match(inspectVectorBody.items[0].text, /cat-tail/);

    const probeResult = await client.callTool({
      name: "probe_illustrator_communication",
      arguments: {
        root,
        platform: "macos",
        appPath: "Adobe Illustrator",
        dryRun: true
      }
    });
    const probeContent = probeResult.content as Array<{ type: string; text?: string }>;
    const probeBody = JSON.parse(probeContent[0]?.text ?? "");
    assert.equal(probeBody.ok, true);
    assert.equal(probeBody.launch.dryRun, true);

    const photoshopDetectResult = await client.callTool({
      name: "detect_photoshop_desktop",
      arguments: {
        platform: "linux"
      }
    });
    const photoshopDetectContent = photoshopDetectResult.content as Array<{ type: string; text?: string }>;
    const photoshopDetectBody = JSON.parse(photoshopDetectContent[0]?.text ?? "");
    assert.equal(photoshopDetectBody.ok, false);
    assert.equal(photoshopDetectBody.platform, "linux");
    assert.match(photoshopDetectBody.next.join("\n"), /Windows or WSL/);

    const chatGptDetectResult = await client.callTool({
      name: "detect_chatgpt_browser",
      arguments: {
        auracallCommand: join(root, "missing-auracall"),
        timeoutSeconds: 1
      }
    });
    const chatGptDetectContent = chatGptDetectResult.content as Array<{ type: string; text?: string }>;
    const chatGptDetectBody = JSON.parse(chatGptDetectContent[0]?.text ?? "");
    assert.equal(chatGptDetectBody.ok, false);
    assert.equal(chatGptDetectBody.state, "doctor-command-failed");
    assert.deepEqual(chatGptDetectBody.command.args, ["doctor", "--target", "chatgpt", "--json", "--local-only", "--prune-browser-state"]);

    const preflightResult = await client.callTool({
      name: "preflight_adobe_project_workflow",
      arguments: {
        platform: "linux",
        photoshopPlatform: "linux",
        requireChatGptBrowser: false
      }
    });
    const preflightContent = preflightResult.content as Array<{ type: string; text?: string }>;
    const preflightBody = JSON.parse(preflightContent[0]?.text ?? "");
    assert.equal(preflightBody.ok, false);
    assert.equal(preflightBody.illustrator.ok, false);
    assert.equal(preflightBody.illustrator.platform, "linux");
    assert.equal(preflightBody.photoshop.ok, false);
    assert.equal(preflightBody.chatGpt, undefined);

    const mouseResult = await client.callTool({
      name: "drive_illustrator_mouse",
      arguments: {
        platform: "wsl",
        action: "move",
        x: 0.5,
        y: 0.5,
        dryRun: true
      }
    });
    const mouseContent = mouseResult.content as Array<{ type: string; text?: string }>;
    const mouseBody = JSON.parse(mouseContent[0]?.text ?? "");
    assert.equal(mouseBody.ok, true);
    assert.equal(mouseBody.action, "dry-run");
    assert.match(mouseBody.stdout, /SetCursorPos/);

    const photoshopMouseResult = await client.callTool({
      name: "drive_photoshop_mouse",
      arguments: {
        platform: "wsl",
        action: "drag",
        x: 0.35,
        y: 0.55,
        toX: 0.65,
        toY: 0.58,
        toolShortcut: "b",
        dryRun: true
      }
    });
    const photoshopMouseContent = photoshopMouseResult.content as Array<{ type: string; text?: string }>;
    const photoshopMouseBody = JSON.parse(photoshopMouseContent[0]?.text ?? "");
    assert.equal(photoshopMouseBody.ok, true);
    assert.equal(photoshopMouseBody.target, "photoshop");
    assert.equal(photoshopMouseBody.action, "dry-run");
    assert.match(photoshopMouseBody.stdout, /Photoshop/);

    const result = await client.callTool({
      name: "bridge_create_ping_job",
      arguments: {
        message: "from mcp test",
        root
      }
    });

    assert.equal(result.isError, undefined);
    const content = result.content as Array<{ type: string; text?: string }>;
    assert.equal(content[0]?.type, "text");
    const body = JSON.parse(content[0]?.text ?? "");
    assert.equal(body.ok, true);
    assert.match(body.job.jobPath, /jobs\/.+\.jsx$/);

    const launchResult = await client.callTool({
      name: "bridge_launch_job",
      arguments: {
        jobId: body.job.id,
        root,
        platform: "macos",
        dryRun: true
      }
    });
    const launchContent = launchResult.content as Array<{ type: string; text?: string }>;
    const launchBody = JSON.parse(launchContent[0]?.text ?? "");
    assert.equal(launchBody.ok, true);
    assert.equal(launchBody.dryRun, true);
    assert.equal(launchBody.command.command, "open");

    const runComResult = await client.callTool({
      name: "bridge_run_job_via_com",
      arguments: {
        jobId: body.job.id,
        root,
        platform: "wsl",
        dryRun: true
      }
    });
    const runComContent = runComResult.content as Array<{ type: string; text?: string }>;
    const runComBody = JSON.parse(runComContent[0]?.text ?? "");
    assert.equal(runComBody.ok, true);
    assert.equal(runComBody.dryRun, true);
    assert.equal(runComBody.command.command, "powershell.exe");

    const planResult = await client.callTool({
      name: "plan_cartoon_scene_job",
      arguments: {
        prompt: "cartoon lab scientist with flask",
        root
      }
    });
    const planContent = planResult.content as Array<{ type: string; text?: string }>;
    const planBody = JSON.parse(planContent[0]?.text ?? "");
    assert.equal(planBody.ok, true);
    assert.equal(planBody.plan.qa.ok, true);
    assert.match(planBody.job.jobPath, /jobs\/.+\.jsx$/);

    const scientificPlanResult = await client.callTool({
      name: "plan_scientific_concept_scene_job",
      arguments: {
        prompt: "polymer membrane electron transfer catalytic concept",
        root
      }
    });
    const scientificPlanContent = scientificPlanResult.content as Array<{ type: string; text?: string }>;
    const scientificPlanBody = JSON.parse(scientificPlanContent[0]?.text ?? "");
    assert.equal(scientificPlanBody.ok, true);
    assert.equal(scientificPlanBody.plan.qa.ok, true);
    assert.ok(scientificPlanBody.plan.evidence.length > 0);
    assert.match(scientificPlanBody.job.jobPath, /jobs\/.+\.jsx$/);

    const objectPlanResult = await client.callTool({
      name: "plan_object_shape_scene_job",
      arguments: {
        prompt: "full cat icon",
        root
      }
    });
    const objectPlanContent = objectPlanResult.content as Array<{ type: string; text?: string }>;
    const objectPlanBody = JSON.parse(objectPlanContent[0]?.text ?? "");
    assert.equal(objectPlanBody.ok, true);
    assert.equal(objectPlanBody.plan.target, "cat");
    assert.equal(objectPlanBody.plan.guard.ok, true);
    assert.match(objectPlanBody.job.jobPath, /jobs\/.+\.jsx$/);

    const guardResult = await client.callTool({
      name: "guard_object_shape_scene",
      arguments: {
        target: "cat",
        scene: objectPlanBody.plan.scene,
        prompt: "full cat icon"
      }
    });
    const guardContent = guardResult.content as Array<{ type: string; text?: string }>;
    const guardBody = JSON.parse(guardContent[0]?.text ?? "");
    assert.equal(guardBody.ok, true);
    assert.equal(guardBody.guard.nextPrompt, null);

    const workflowResult = await client.callTool({
      name: "prepare_cartoon_publication_workflow",
      arguments: {
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/mcp-workflow.pdf",
        root
      }
    });
    const workflowContent = workflowResult.content as Array<{ type: string; text?: string }>;
    const workflowBody = JSON.parse(workflowContent[0]?.text ?? "");
    assert.equal(workflowBody.ok, true);
    assert.equal(workflowBody.runbook.length, 4);

    const executionResult = await client.callTool({
      name: "execute_cartoon_publication_workflow",
      arguments: {
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/mcp-execute.svg",
        format: "svg",
        root,
        platform: "macos",
        dryRun: true
      }
    });
    const executionContent = executionResult.content as Array<{ type: string; text?: string }>;
    const executionBody = JSON.parse(executionContent[0]?.text ?? "");
    assert.equal(executionBody.ok, true);
    assert.equal(executionBody.dryRun, true);
    assert.equal(executionBody.sceneLaunch.dryRun, true);

    const adobeProofResult = await client.callTool({
      name: "execute_adobe_svg_proof_workflow",
      arguments: {
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/mcp-adobe-proof.svg",
        intent: "cartoon",
        root,
        platform: "wsl",
        photoshopPlatform: "wsl",
        illustratorRunMode: "com",
        dryRun: true,
        maxReviewIterations: 3,
        visibleMouseProof: true
      }
    });
    const adobeProofContent = adobeProofResult.content as Array<{ type: string; text?: string }>;
    const adobeProofBody = JSON.parse(adobeProofContent[0]?.text ?? "");
    assert.equal(adobeProofBody.ok, true);
    assert.equal(adobeProofBody.dryRun, true);
    assert.equal(adobeProofBody.reviewIterations.length, 1);
    assert.equal(adobeProofBody.reviewIterations[0].attempt, 1);
    assert.equal(adobeProofBody.workflow.intent, "cartoon");
    assert.equal(adobeProofBody.workflow.runbook.length, 6);
    assert.equal(adobeProofBody.sceneLaunch.command.command, "powershell.exe");
    assert.equal(adobeProofBody.photoshopLaunch.command.command, "powershell.exe");

    const adobeProjectReviewReportPath = join(root, "mcp-adobe-project.review.json");
    const adobeProjectResult = await client.callTool({
      name: "execute_adobe_project_workflow",
      arguments: {
        prompt: "cartoon lab scientist with flask",
        outputPath: "var/exports/mcp-adobe-project.svg",
        intent: "cartoon",
        root,
        platform: "wsl",
        photoshopPlatform: "wsl",
        illustratorRunMode: "com",
        dryRun: true,
        maxReviewIterations: 3,
        visibleMouseProof: true,
        reviewReportPath: adobeProjectReviewReportPath
      }
    });
    const adobeProjectContent = adobeProjectResult.content as Array<{ type: string; text?: string }>;
    const adobeProjectBody = JSON.parse(adobeProjectContent[0]?.text ?? "");
    assert.equal(adobeProjectBody.ok, true);
    assert.equal(adobeProjectBody.dryRun, true);
    assert.equal(adobeProjectBody.reviewReportPath, adobeProjectReviewReportPath);
    assert.equal(adobeProjectBody.reviewReport.schemaVersion, "adobe-project-review-report.v1");
    assert.equal(adobeProjectBody.reviewReport.accepted, false);
    assert.equal(adobeProjectBody.reviewReport.goalAcceptance.accepted, false);
    assert.equal(adobeProjectBody.reviewReport.goalAcceptance.chatGptBrowserReviewRequired, true);
    assert.match(adobeProjectBody.reviewReport.goalAcceptance.missing.join("\n"), /ChatGPT browser external review/);
    assert.equal(adobeProjectBody.workflow.runbook.length, 12);
    assert.equal(adobeProjectBody.workflow.handoff.sequence.length, 7);
    assert.match(adobeProjectBody.workflow.photoshopHandoffSvgPath, /mcp-adobe-project\.photoshop-handoff\.svg$/);
    assert.equal(adobeProjectBody.workflow.handoff.illustratorConsumes, adobeProjectBody.workflow.photoshopHandoffSvgPath);
    assert.match(adobeProjectBody.workflow.photoshopCommitJob.jobPath, /jobs\/.+\.jsx$/);
    assert.equal(adobeProjectBody.photoshopProjectLaunch.command.command, "powershell.exe");
    assert.equal(adobeProjectBody.photoshopCommitLaunch.command.command, "powershell.exe");
    assert.equal(adobeProjectBody.illustratorReferenceLaunch.command.command, "powershell.exe");
    assert.equal(adobeProjectBody.visibleMouseProofs.illustratorScene.action, "dry-run");
    assert.equal(adobeProjectBody.visibleMouseProofs.photoshopEdit.target, "photoshop");
    const adobeProjectReviewReport = JSON.parse(await readFile(adobeProjectReviewReportPath, "utf8"));
    assert.equal(adobeProjectReviewReport.schemaVersion, "adobe-project-review-report.v1");
    assert.equal(adobeProjectReviewReport.dryRun, true);
    assert.equal(adobeProjectReviewReport.goalAcceptance.accepted, false);

    const objectWorkflowResult = await client.callTool({
      name: "prepare_object_shape_workflow",
      arguments: {
        prompt: "secure padlock icon",
        outputPath: "var/exports/mcp-object-lock.svg",
        format: "svg",
        maxGuardIterations: 3,
        root
      }
    });
    const objectWorkflowContent = objectWorkflowResult.content as Array<{ type: string; text?: string }>;
    const objectWorkflowBody = JSON.parse(objectWorkflowContent[0]?.text ?? "");
    assert.equal(objectWorkflowBody.ok, true);
    assert.equal(objectWorkflowBody.plan.target, "lock");
    assert.equal(objectWorkflowBody.plan.guard.ok, true);
    assert.equal(objectWorkflowBody.guardIterations.length, 1);
    assert.equal(objectWorkflowBody.guardIterations[0].guardOk, true);
    assert.equal(objectWorkflowBody.runbook.length, 5);

    const objectExecutionResult = await client.callTool({
      name: "execute_object_shape_workflow",
      arguments: {
        prompt: "simple house key icon",
        outputPath: "var/exports/mcp-object-key.png",
        format: "png",
        root,
        platform: "wsl",
        runMode: "com",
        maxGuardIterations: 3,
        dryRun: true
      }
    });
    const objectExecutionContent = objectExecutionResult.content as Array<{ type: string; text?: string }>;
    const objectExecutionBody = JSON.parse(objectExecutionContent[0]?.text ?? "");
    assert.equal(objectExecutionBody.ok, true);
    assert.equal(objectExecutionBody.runMode, "com");
    assert.equal(objectExecutionBody.workflow.plan.guard.ok, true);
    assert.equal(objectExecutionBody.workflow.guardIterations.length, 1);
    assert.equal(objectExecutionBody.workflow.guardIterations[0].guardOk, true);
    assert.equal(objectExecutionBody.sceneLaunch.command.command, "powershell.exe");

    const exportSvgPath = join(root, "figure.svg");
    await writeFile(exportSvgPath, `<svg width="720" height="480"><rect width="720" height="480"/></svg>`, "utf8");
    const qaResult = await client.callTool({
      name: "qa_export_artifact",
      arguments: {
        path: exportSvgPath,
        minBytes: 1,
        minNonBlankRatio: 0.001
      }
    });
    const qaContent = qaResult.content as Array<{ type: string; text?: string }>;
    const qaBody = JSON.parse(qaContent[0]?.text ?? "");
    assert.equal(qaBody.ok, true);

    const artworkReviewResult = await client.callTool({
      name: "review_artwork_quality",
      arguments: {
        path: exportSvgPath,
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
      }
    });
    const artworkReviewContent = artworkReviewResult.content as Array<{ type: string; text?: string }>;
    const artworkReviewBody = JSON.parse(artworkReviewContent[0]?.text ?? "");
    assert.equal(artworkReviewBody.ok, false);
    assert.equal(artworkReviewBody.exportQa.ok, true);
    assert.equal(artworkReviewBody.review.ok, false);
    assert.match(artworkReviewBody.review.nextGoalPrompt, /Make the cat recognizable/);
  } finally {
    await client.close();
    await server.close();
  }
});
