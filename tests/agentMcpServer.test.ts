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
    assert.ok(listed.tools.some((tool) => tool.name === "generate_scientific_story"));
    assert.ok(listed.tools.some((tool) => tool.name === "generate_scientific_figure_from_text"));
    assert.ok(listed.tools.some((tool) => tool.name === "render_vector_scene_png"));
    assert.ok(listed.tools.some((tool) => tool.name === "render_vector_scene_tikz"));
    assert.ok(listed.tools.some((tool) => tool.name === "compose_vector_scene_layers_png"));
    assert.ok(listed.tools.some((tool) => tool.name === "generate_scientific_image"));
    assert.ok(listed.tools.some((tool) => tool.name === "generate_scientific_figure_project"));
    assert.ok(listed.tools.some((tool) => tool.name === "generate_proposal_visuals"));
    assert.ok(listed.tools.some((tool) => tool.name === "generate_scientific_plot"));
    assert.ok(listed.tools.some((tool) => tool.name === "generate_scientific_pgfplots"));
    assert.ok(listed.tools.some((tool) => tool.name === "place_path_markers"));
    assert.ok(listed.tools.some((tool) => tool.name === "construct_polygon_boolean"));
    assert.ok(listed.tools.some((tool) => tool.name === "flatten_bezier_path"));
    assert.ok(listed.tools.some((tool) => tool.name === "expand_vector_stroke"));
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

    const unifiedImageResult = await client.callTool({
      name: "generate_scientific_image",
      arguments: {
        request: {
          schemaVersion: 1,
          kind: "plot",
          content: {
            schemaVersion: 1,
            document: { title: "Unified MCP image", width: 800, height: 560 },
            xAxis: { label: "Time" },
            yAxis: { label: "Signal" },
            series: [{ id: "series", label: "Series", mark: "line", data: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }]
          }
        }
      }
    });
    const unifiedImageContent = unifiedImageResult.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    const unifiedImageBody = JSON.parse(unifiedImageContent.find((item) => item.type === "text")?.text ?? "");
    assert.equal(unifiedImageBody.ok, true);
    assert.equal(unifiedImageBody.manifest.engine, "software-scientific-image.v1");
    assert.equal(unifiedImageBody.manifest.adobeUsed, false);
    assert.match(unifiedImageBody.svg, /id="series\.line"/);
    assert.match(unifiedImageBody.latex, /\\usepackage\{pgfplots\}/);
    const unifiedImagePng = unifiedImageContent.find((item) => item.type === "image");
    assert.equal(unifiedImagePng?.mimeType, "image/png");
    assert.ok((unifiedImagePng?.data?.length ?? 0) > 100);

    const figureProject = JSON.parse(await readFile(join(process.cwd(), "examples", "golden-manuscript-figure-project.json"), "utf8"));
    const projectResult = await client.callTool({ name: "generate_scientific_figure_project", arguments: { project: figureProject, assetRoot: join(process.cwd(), "examples") } });
    const projectContent = projectResult.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    const projectBody = JSON.parse(projectContent.find((item) => item.type === "text")?.text ?? "");
    assert.equal(projectBody.ok, true);
    assert.equal(projectBody.manifest.schemaVersion, "scientific-figure-manifest.v1");
    assert.equal(projectBody.qa.ok, true);
    assert.ok((projectContent.find((item) => item.type === "image")?.data?.length ?? 0) > 1000);

    const proposalResult = await client.callTool({
      name: "generate_proposal_visuals",
      arguments: {
        request: {
          schemaVersion: 1,
          proposal: {
            title: "MCP proposal",
            text: `\`\`\`proposal-visual\n${JSON.stringify({
              id: "criteria",
              kind: "table",
              renderer: "latex_table",
              prompt: "Generate the reviewed criteria table.",
              content: {
                schemaVersion: 1,
                title: "Criteria",
                columns: [{ id: "criterion", heading: "Criterion", alignment: "left" }],
                rows: [{ id: "one", cells: ["Conversion >= 90%"] }]
              }
            })}\n\`\`\``
          }
        },
        root
      }
    });
    const proposalContent = proposalResult.content as Array<{ type: string; text?: string }>;
    const proposalBody = JSON.parse(proposalContent[0]?.text ?? "");
    assert.equal(proposalBody.ok, true);
    assert.equal(proposalBody.package.routes[0].resolved, "latex_table");
    assert.match(proposalBody.package.assets[0].generated.latex, /Criteria/);

    const plotResult = await client.callTool({
      name: "generate_scientific_plot",
      arguments: {
        plot: {
          schemaVersion: 1,
          document: { title: "MCP numerical plot", width: 800, height: 560 },
          xAxis: { label: "Time (s)" },
          yAxis: { label: "Signal" },
          series: [{ id: "signal", label: "Signal", mark: "line", data: [{ x: 0, y: 1 }, { x: 1, y: 3 }] }]
        }
      }
    });
    const plotContent = plotResult.content as Array<{ type: string; text?: string }>;
    const plotBody = JSON.parse(plotContent[0]?.text ?? "");
    assert.equal(plotBody.ok, true);
    assert.equal(plotBody.result.engine, "software-scientific-plot.v1");
    assert.match(plotBody.svg, /id="signal\.line"/);

    const pgfplotsResult = await client.callTool({
      name: "generate_scientific_pgfplots",
      arguments: {
        plot: {
          schemaVersion: 1,
          document: { title: "MCP PGFPlots", width: 800, height: 560 },
          xAxis: { label: "Time" },
          yAxis: { label: "Signal" },
          series: [{ id: "signal", label: "Signal", mark: "scatter", data: [{ x: 0, y: 1 }, { x: 1, y: 3 }] }]
        }
      }
    });
    const pgfplotsContent = pgfplotsResult.content as Array<{ type: string; text?: string }>;
    const pgfplotsBody = JSON.parse(pgfplotsContent[0]?.text ?? "");
    assert.equal(pgfplotsBody.ok, true);
    assert.equal(pgfplotsBody.compat, "1.18");
    assert.match(pgfplotsBody.latex, /only marks/);

    const tikzResult = await client.callTool({
      name: "render_vector_scene_tikz",
      arguments: { scene: { elements: [{ type: "line", x: 0, y: 0, x2: 20, y2: 20, style: { stroke: "#000000" } }] } }
    });
    const tikzContent = tikzResult.content as Array<{ type: string; text?: string }>;
    const tikzBody = JSON.parse(tikzContent[0]?.text ?? "");
    assert.equal(tikzBody.ok, true);
    assert.match(tikzBody.latex, /\\begin\{tikzpicture\}/);

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

    const storyResult = await client.callTool({
      name: "generate_scientific_story",
      arguments: {
        story: {
          schemaVersion: 1,
          document: { title: "agent story" },
          entities: [
            { id: "signal", type: "molecule", label: "signal" },
            { id: "receptor", type: "receptor", label: "receptor" },
            { id: "response", type: "process", label: "response" }
          ],
          interactions: [
            { id: "binding", sourceId: "signal", type: "binds_to", targetId: "receptor" },
            { id: "activation", sourceId: "receptor", type: "activates", targetId: "response" }
          ]
        }
      }
    });
    const storyContent = storyResult.content as Array<{ type: string; text?: string }>;
    const storyBody = JSON.parse(storyContent[0]?.text ?? "");
    assert.equal(storyBody.ok, true);
    assert.equal(storyBody.figure.settings.layoutMode, "layered");
    assert.equal(storyBody.scene.semantics.objects.length, 3);
    assert.match(storyBody.svg, /<svg/);

    const pngResult = await client.callTool({
      name: "render_vector_scene_png",
      arguments: { scene: storyBody.scene, width: 700, background: "#FFFFFF" }
    });
    const pngContent = pngResult.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    const pngBody = JSON.parse(pngContent[0]?.text ?? "");
    assert.equal(pngBody.ok, true);
    assert.equal(pngBody.width, 700);
    assert.equal(pngBody.renderer, "resvg-js-2.6.2");
    assert.equal(pngContent[1]?.type, "image");
    assert.equal(pngContent[1]?.mimeType, "image/png");
    assert.deepEqual(Buffer.from(pngContent[1]?.data ?? "", "base64").subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    const layerScene = (color: string) => ({
      document: { width: 120, height: 80 },
      elements: [{ type: "rect", x: 0, y: 0, width: 120, height: 80, style: { fill: color, stroke: null } }]
    });
    const compositeResult = await client.callTool({
      name: "compose_vector_scene_layers_png",
      arguments: {
        composition: {
          document: { width: 120, height: 80 },
          layers: [
            { id: "background", scene: layerScene("#FFFFFF") },
            { id: "overlay", scene: layerScene("#2563EB"), opacity: 50, mask: { type: "rect", x: 0, y: 0, width: 60, height: 80 } }
          ]
        }
      }
    });
    const compositeContent = compositeResult.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    const compositeBody = JSON.parse(compositeContent[0]?.text ?? "");
    assert.equal(compositeBody.ok, true);
    assert.equal(compositeBody.layerCount, 2);
    assert.equal(compositeBody.visibleLayerCount, 2);
    assert.equal(compositeContent[1]?.mimeType, "image/png");
    assert.deepEqual(Buffer.from(compositeContent[1]?.data ?? "", "base64").subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    const markerResult = await client.callTool({
      name: "place_path_markers",
      arguments: {
        request: {
          source: { type: "line", x: 0, y: 0, x2: 100, y2: 0, style: { stroke: "#2563EB", strokeWidth: 3 } },
          markers: [{ at: "end", kind: "arrowhead", size: 20, idPrefix: "signal.arrow" }]
        }
      }
    });
    const markerContent = markerResult.content as Array<{ type: string; text?: string }>;
    const markerBody = JSON.parse(markerContent[0]?.text ?? "");
    assert.equal(markerBody.ok, true);
    assert.equal(markerBody.result.engine, "software-path-markers.v1");
    assert.deepEqual(markerBody.result.placements[0].tangent, { x: 1, y: 0 });

    const strokeResult = await client.callTool({
      name: "expand_vector_stroke",
      arguments: {
        request: {
          tolerance: 0.1,
          source: { type: "line", x: 0, y: 0, x2: 100, y2: 0, style: { stroke: "#2563EB", strokeWidth: 20, lineCap: "square" } }
        }
      }
    });
    const strokeContent = strokeResult.content as Array<{ type: string; text?: string }>;
    const strokeBody = JSON.parse(strokeContent[0]?.text ?? "");
    assert.equal(strokeBody.ok, true);
    assert.equal(strokeBody.result.area, 2400);
    assert.equal(strokeBody.result.element.type, "compound_path");

    const flattenResult = await client.callTool({
      name: "flatten_bezier_path",
      arguments: {
        request: {
          tolerance: 1,
          path: {
            type: "path",
            x: 0,
            y: 0,
            closed: false,
            points: [
              { x: 0, y: 0, rightX: 0, rightY: 100 },
              { x: 100, y: 0, leftX: 100, leftY: 100 }
            ]
          }
        }
      }
    });
    const flattenContent = flattenResult.content as Array<{ type: string; text?: string }>;
    const flattenBody = JSON.parse(flattenContent[0]?.text ?? "");
    assert.equal(flattenBody.ok, true);
    assert.equal(flattenBody.result.curvedSegmentCount, 1);
    assert.ok(flattenBody.result.outputPointCount > 2);

    const booleanResult = await client.callTool({
      name: "construct_polygon_boolean",
      arguments: {
        request: {
          operation: "intersection",
          operands: [
            { rings: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }]] },
            { rings: [[{ x: 50, y: 20 }, { x: 150, y: 20 }, { x: 150, y: 100 }, { x: 50, y: 100 }]] }
          ]
        }
      }
    });
    const booleanContent = booleanResult.content as Array<{ type: string; text?: string }>;
    const booleanBody = JSON.parse(booleanContent[0]?.text ?? "");
    assert.equal(booleanBody.ok, true);
    assert.equal(booleanBody.result.area, 3000);
    assert.equal(booleanBody.result.element.type, "compound_path");
    assert.equal(booleanBody.result.engine, "polygon-clipping-0.15.7");

    const textResult = await client.callTool({
      name: "generate_scientific_figure_from_text",
      arguments: {
        text: "Title: Text pathway\nCanvas: 1000x700\nSignal [molecule] binds to receptor [receptor].\nReceptor activates response [process]."
      }
    });
    const textContent = textResult.content as Array<{ type: string; text?: string }>;
    const textBody = JSON.parse(textContent[0]?.text ?? "");
    assert.equal(textBody.ok, true);
    assert.equal(textBody.parsed.grammar, "scientific-controlled-text.v1");
    assert.equal(textBody.parsed.story.entities.length, 3);
    assert.equal(textBody.figure.settings.layoutMode, "layered");
    assert.equal(textBody.scene.semantics.relationships.length, 2);
    assert.match(textBody.svg, /<svg/);

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
