import { createHash } from "node:crypto";
import { ValidationError } from "../core/sceneValidation.js";
import { compileScientificPlot } from "../core/scientificPlot.js";
import type { VectorScene } from "../core/vectorScene.js";
import { renderSceneToPng, type PngRenderOptions, type PngRenderResult } from "../render/pngRenderer.js";
import { renderScientificPlotToPgfplots } from "../render/pgfplotsRenderer.js";
import { renderSceneToSvg } from "../render/svgRenderer.js";
import { renderSceneToTikz } from "../render/tikzRenderer.js";
import { compileScientificFigure } from "./figureCompiler.js";
import { compileScientificFigureBrief } from "./figureBrief.js";
import { planScientificStory } from "./storyPlanner.js";
import { parseScientificText } from "./textStoryParser.js";

export type ScientificImageKind = "figure" | "story" | "text" | "plot" | "brief";

export interface ScientificImageRequest {
  schemaVersion: 1;
  kind: ScientificImageKind;
  content: unknown;
  output?: { png?: PngRenderOptions };
}

export interface ScientificImageArtifactDescriptor {
  mimeType: string;
  bytes: number;
  sha256: string;
  width?: number;
  height?: number;
}

export interface ScientificImageManifest {
  schemaVersion: "scientific-image-manifest.v1";
  kind: ScientificImageKind;
  engine: "software-scientific-image.v1";
  sourceSha256: string;
  sourceOfTruth: "semantic_vector_scene" | "validated_plot_spec";
  adobeUsed: false;
  stages: string[];
  counts: { elements: number; objects: number; relationships: number };
  artifacts: {
    scene: ScientificImageArtifactDescriptor;
    svg: ScientificImageArtifactDescriptor;
    latex: ScientificImageArtifactDescriptor;
    png: ScientificImageArtifactDescriptor;
  };
  latex: {
    renderer: "tikz-scene.v1" | "tikz-scene.v2" | "pgfplots-1.18.v1";
    requiredPackages: string[];
    compat?: "1.18";
  };
  png: Pick<PngRenderResult, "background" | "fit" | "fontPolicy" | "renderer">;
}

export interface ScientificImageGeneration {
  request: ScientificImageRequest;
  scene: VectorScene;
  sceneJson: string;
  svg: string;
  latex: string;
  png: PngRenderResult;
  manifest: ScientificImageManifest;
  intermediate: Record<string, unknown>;
}

interface CompiledScientificImage {
  scene: VectorScene;
  stages: string[];
  intermediate: Record<string, unknown>;
}

/** Generate a complete scientific-image artifact family without launching Adobe software. */
export function generateScientificImage(input: unknown): ScientificImageGeneration {
  const request = normalizeScientificImageRequest(input);
  const compiled = compileByKind(request);
  const sceneJson = `${JSON.stringify(compiled.scene, null, 2)}\n`;
  const svg = renderSceneToSvg(compiled.scene);
  const latexResult = request.kind === "plot" ? renderScientificPlotToPgfplots(request.content) : renderSceneToTikz(compiled.scene);
  const latex = latexResult.latex;
  const png = renderSceneToPng(compiled.scene, request.output?.png);
  const sourceJson = canonicalJson(request);
  const counts = {
    elements: compiled.scene.elements.length,
    objects: compiled.scene.semantics?.objects.length ?? 0,
    relationships: compiled.scene.semantics?.relationships?.length ?? 0
  };
  return {
    request,
    scene: compiled.scene,
    sceneJson,
    svg,
    latex,
    png,
    intermediate: compiled.intermediate,
    manifest: {
      schemaVersion: "scientific-image-manifest.v1",
      kind: request.kind,
      engine: "software-scientific-image.v1",
      sourceSha256: digest(sourceJson),
      sourceOfTruth: request.kind === "plot" ? "validated_plot_spec" : "semantic_vector_scene",
      adobeUsed: false,
      stages: [...compiled.stages, request.kind === "plot" ? "render_pgfplots_latex" : "render_tikz_latex", "render_editable_svg", "derive_png"],
      counts,
      artifacts: {
        scene: descriptor("application/json", Buffer.from(sceneJson, "utf8")),
        svg: descriptor("image/svg+xml", Buffer.from(svg, "utf8")),
        latex: descriptor("application/x-tex", Buffer.from(latex, "utf8")),
        png: descriptor("image/png", png.png, png.width, png.height)
      },
      latex: {
        renderer: latexResult.renderer,
        requiredPackages: [...latexResult.requiredPackages],
        ...(request.kind === "plot" ? { compat: "1.18" as const } : {})
      },
      png: { background: png.background, fit: png.fit, fontPolicy: png.fontPolicy, renderer: png.renderer }
    }
  };
}

export function normalizeScientificImageRequest(input: unknown): ScientificImageRequest {
  const value = record(input, "scientific image request");
  exactKeys(value, ["schemaVersion", "kind", "content", "output"], "scientific image request");
  if (value.schemaVersion !== 1) throw new ValidationError("scientific image request.schemaVersion must be 1");
  if (value.kind !== "figure" && value.kind !== "story" && value.kind !== "text" && value.kind !== "plot" && value.kind !== "brief") {
    throw new ValidationError("scientific image request.kind must be figure, story, text, plot, or brief");
  }
  if (!("content" in value)) throw new ValidationError("scientific image request.content is required");
  const output = value.output === undefined ? undefined : normalizeOutput(value.output);
  return { schemaVersion: 1, kind: value.kind, content: value.content, ...(output ? { output } : {}) };
}

function compileByKind(request: ScientificImageRequest): CompiledScientificImage {
  if (request.kind === "plot") {
    const result = compileScientificPlot(request.content);
    const { scene, ...plot } = result;
    return { scene, stages: ["validate_plot", "derive_linear_scales", "compile_plot_marks", "validate_semantic_scene"], intermediate: { plot } };
  }
  if (request.kind === "text") {
    const parsed = parseScientificText(request.content as Parameters<typeof parseScientificText>[0]);
    const figure = planScientificStory(parsed.story);
    const scene = compileScientificFigure(figure);
    return { scene, stages: ["parse_controlled_text", "plan_typed_story", "layout_scientific_figure", "validate_semantic_scene"], intermediate: { parsed, figure } };
  }
  if (request.kind === "story") {
    const figure = planScientificStory(request.content);
    const scene = compileScientificFigure(figure);
    return { scene, stages: ["validate_typed_story", "plan_scientific_figure", "layout_scientific_figure", "validate_semantic_scene"], intermediate: { figure } };
  }
  if (request.kind === "brief") {
    const brief = compileScientificFigureBrief(request.content);
    const scene = compileScientificFigure(brief.figure);
    return {
      scene,
      stages: ["validate_reviewed_figure_brief", "apply_stable_id_refinements", "plan_scientific_figure", "layout_scientific_figure", "validate_semantic_scene"],
      intermediate: { brief: brief.audit, story: brief.story, figure: brief.figure }
    };
  }
  const scene = compileScientificFigure(request.content);
  return { scene, stages: ["validate_figure_specification", "layout_scientific_figure", "validate_semantic_scene"], intermediate: {} };
}

function normalizeOutput(input: unknown): ScientificImageRequest["output"] {
  const value = record(input, "scientific image request.output");
  exactKeys(value, ["png"], "scientific image request.output");
  if (value.png === undefined) return {};
  const png = record(value.png, "scientific image request.output.png");
  exactKeys(png, ["width", "height", "scale", "background"], "scientific image request.output.png");
  return {
    png: {
      ...(png.width === undefined ? {} : { width: number(png.width, "output.png.width") }),
      ...(png.height === undefined ? {} : { height: number(png.height, "output.png.height") }),
      ...(png.scale === undefined ? {} : { scale: number(png.scale, "output.png.scale") }),
      ...(png.background === undefined ? {} : { background: text(png.background, "output.png.background") })
    }
  };
}

function descriptor(mimeType: string, data: Buffer, width?: number, height?: number): ScientificImageArtifactDescriptor {
  return { mimeType, bytes: data.length, sha256: digest(data), ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }) };
}

function digest(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
function record(input: unknown, path: string): Record<string, unknown> { if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError(`${path} must be an object`); return input as Record<string, unknown>; }
function exactKeys(input: Record<string, unknown>, allowed: string[], path: string): void { const extras = Object.keys(input).filter((key) => !allowed.includes(key)); if (extras.length) throw new ValidationError(`${path} contains unsupported field(s): ${extras.join(", ")}`); }
function number(input: unknown, path: string): number { if (typeof input !== "number" || !Number.isFinite(input)) throw new ValidationError(`${path} must be finite`); return input; }
function text(input: unknown, path: string): string { if (typeof input !== "string" || input.length < 1 || input.length > 20) throw new ValidationError(`${path} must contain 1 to 20 characters`); return input; }
