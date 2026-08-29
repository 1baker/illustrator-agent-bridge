import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ValidationError } from "../core/sceneValidation.js";
import { renderLatexTable, type LatexTableRenderResult } from "../render/latexTableRenderer.js";
import { generateScientificImage, type ScientificImageGeneration, type ScientificImageKind } from "../scientific/imageGenerator.js";
import {
  executeAdobeSvgProofWorkflow,
  prepareAdobeSvgProofWorkflow,
  type AdobeSvgProofWorkflow,
  type AdobeSvgProofWorkflowExecution
} from "../workflow/adobeSvgProofWorkflow.js";

export type ProposalVisualKind = "figure" | "plot" | "table";
export type ProposalVisualRenderer = "auto" | "tikz" | "pgfplots" | "latex_table" | "adobe_svg_proof";
export type ResolvedProposalVisualRenderer = Exclude<ProposalVisualRenderer, "auto">;
export type ProposalAdobeMode = "prepare" | "dry_run" | "execute";

export interface ProposalVisualDirective {
  id: string;
  kind: ProposalVisualKind;
  renderer: ProposalVisualRenderer;
  prompt: string;
  caption?: string;
  generatorKind?: Exclude<ScientificImageKind, "plot">;
  content?: unknown;
  source: { block: number; line: number };
}

export interface ProposalVisualRequest {
  schemaVersion: 1;
  proposal: { title: string; text: string };
  adobeMode?: ProposalAdobeMode;
}

export interface ProposalVisualGeneratedAsset {
  id: string;
  kind: ProposalVisualKind;
  renderer: "tikz" | "pgfplots";
  prompt: string;
  caption?: string;
  source: ProposalVisualDirective["source"];
  generated: ScientificImageGeneration;
}

export interface ProposalVisualTableAsset {
  id: string;
  kind: "table";
  renderer: "latex_table";
  prompt: string;
  caption?: string;
  source: ProposalVisualDirective["source"];
  generated: LatexTableRenderResult;
}

export interface ProposalVisualAdobeAsset {
  id: string;
  kind: "figure";
  renderer: "adobe_svg_proof";
  prompt: string;
  caption?: string;
  source: ProposalVisualDirective["source"];
  adobeMode: ProposalAdobeMode;
  outputPath: string;
  proofPngPath: string;
  workflow: AdobeSvgProofWorkflow | AdobeSvgProofWorkflowExecution;
}

export type ProposalVisualAsset = ProposalVisualGeneratedAsset | ProposalVisualTableAsset | ProposalVisualAdobeAsset;

export interface ProposalVisualPackage {
  schemaVersion: "proposal-visual-package.v1";
  ok: boolean;
  proposal: { title: string; sourceSha256: string; directiveCount: number };
  adobeMode: ProposalAdobeMode;
  assets: ProposalVisualAsset[];
  routes: Array<{ id: string; kind: ProposalVisualKind; requested: ProposalVisualRenderer; resolved: ResolvedProposalVisualRenderer; sourceLine: number }>;
}

export interface GenerateProposalVisualPackageOptions {
  outputDir?: string;
  root?: string;
}

/** Convert binary-bearing package results into a browser/MCP-safe JSON payload. */
export function serializeProposalVisualPackage(value: ProposalVisualPackage, includePngBase64 = true): Record<string, unknown> {
  return {
    schemaVersion: value.schemaVersion,
    ok: value.ok,
    proposal: value.proposal,
    adobeMode: value.adobeMode,
    routes: value.routes,
    assets: value.assets.map((asset) => {
      if (asset.renderer === "adobe_svg_proof") return asset;
      if (asset.renderer === "latex_table") return asset;
      return {
        id: asset.id,
        kind: asset.kind,
        renderer: asset.renderer,
        prompt: asset.prompt,
        ...(asset.caption === undefined ? {} : { caption: asset.caption }),
        source: asset.source,
        generated: {
          manifest: asset.generated.manifest,
          intermediate: asset.generated.intermediate,
          scene: asset.generated.scene,
          svg: asset.generated.svg,
          latex: asset.generated.latex,
          ...(includePngBase64 ? { pngBase64: asset.generated.png.png.toString("base64") } : {})
        }
      };
    })
  };
}

const OPEN_FENCE = /^[ \t]*```proposal-visual[ \t]*$/gm;
const BLOCK = /^[ \t]*```proposal-visual[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;

/** Extract reviewed visual declarations embedded directly in proposal Markdown. */
export function parseProposalVisualDirectives(proposalText: string): ProposalVisualDirective[] {
  if (typeof proposalText !== "string" || proposalText.trim().length === 0 || proposalText.length > 2_000_000) {
    throw new ValidationError("proposal text must contain 1 to 2000000 characters");
  }
  const openCount = [...proposalText.matchAll(OPEN_FENCE)].length;
  const matches = [...proposalText.matchAll(BLOCK)];
  if (openCount !== matches.length) throw new ValidationError("proposal contains an unclosed proposal-visual block");
  if (matches.length === 0 || matches.length > 24) throw new ValidationError("proposal must contain 1 to 24 proposal-visual blocks");
  const directives = matches.map((match, index) => normalizeDirective(parseBlockJson(match[1] ?? "", index + 1), index + 1, lineAt(proposalText, match.index ?? 0)));
  const ids = new Set<string>();
  for (const directive of directives) {
    if (ids.has(directive.id)) throw new ValidationError(`proposal contains duplicate visual id: ${directive.id}`);
    ids.add(directive.id);
  }
  return directives;
}

/** Route proposal declarations to deterministic LaTeX or the explicit Adobe adapter. */
export async function generateProposalVisualPackage(
  input: unknown,
  options: GenerateProposalVisualPackageOptions = {}
): Promise<ProposalVisualPackage> {
  const request = normalizeProposalVisualRequest(input);
  const directives = parseProposalVisualDirectives(request.proposal.text);
  const adobeMode = request.adobeMode ?? "prepare";
  const outputDir = resolve(options.outputDir ?? "var/exports/proposal-visuals");
  const routes = directives.map((directive) => ({
    id: directive.id,
    kind: directive.kind,
    requested: directive.renderer,
    resolved: resolveRenderer(directive),
    sourceLine: directive.source.line
  }));
  const assets: ProposalVisualAsset[] = [];
  for (let index = 0; index < directives.length; index += 1) {
    const directive = directives[index]!;
    const renderer = routes[index]!.resolved;
    if (renderer === "tikz" || renderer === "pgfplots") {
      const kind = renderer === "pgfplots" ? "plot" : (directive.generatorKind ?? "brief");
      const generated = generateScientificImage({ schemaVersion: 1, kind, content: directive.content });
      assets.push(copyOptionalCaption({ id: directive.id, kind: directive.kind, renderer, prompt: directive.prompt, source: directive.source, generated }, directive.caption));
      continue;
    }
    if (renderer === "latex_table") {
      assets.push(copyOptionalCaption({ id: directive.id, kind: "table", renderer, prompt: directive.prompt, source: directive.source, generated: renderLatexTable(directive.content) }, directive.caption));
      continue;
    }
    const outputPath = resolve(outputDir, `${directive.id}.svg`);
    const proofPngPath = resolve(outputDir, `${directive.id}.proof.png`);
    const workflow = adobeMode === "prepare"
      ? await prepareAdobeSvgProofWorkflow({ prompt: directive.prompt, outputPath, proofPngPath, intent: "scientific", root: options.root })
      : await executeAdobeSvgProofWorkflow({
          prompt: directive.prompt,
          outputPath,
          proofPngPath,
          intent: "scientific",
          illustratorRunMode: "com",
          photoshopPlatform: "wsl",
          launchPlatform: "wsl",
          dryRun: adobeMode === "dry_run",
          waitForResults: adobeMode === "execute",
          root: options.root
        });
    assets.push(copyOptionalCaption({ id: directive.id, kind: "figure", renderer, prompt: directive.prompt, source: directive.source, adobeMode, outputPath, proofPngPath, workflow }, directive.caption));
  }
  return {
    schemaVersion: "proposal-visual-package.v1",
    ok: assets.every((asset) => asset.renderer !== "adobe_svg_proof" || asset.workflow.ok),
    proposal: { title: request.proposal.title, sourceSha256: digest(request.proposal.text), directiveCount: directives.length },
    adobeMode,
    assets,
    routes
  };
}

export function normalizeProposalVisualRequest(input: unknown): ProposalVisualRequest {
  const value = record(input, "proposal visual request");
  exactKeys(value, ["schemaVersion", "proposal", "adobeMode"], "proposal visual request");
  if (value.schemaVersion !== 1) throw new ValidationError("proposal visual request.schemaVersion must be 1");
  const proposal = record(value.proposal, "proposal visual request.proposal");
  exactKeys(proposal, ["title", "text"], "proposal visual request.proposal");
  return {
    schemaVersion: 1,
    proposal: {
      title: text(proposal.title, "proposal visual request.proposal.title", 300),
      text: text(proposal.text, "proposal visual request.proposal.text", 2_000_000)
    },
    ...(value.adobeMode === undefined ? {} : { adobeMode: oneOf(value.adobeMode, ["prepare", "dry_run", "execute"] as const, "proposal visual request.adobeMode") })
  };
}

function normalizeDirective(input: unknown, block: number, line: number): ProposalVisualDirective {
  const value = record(input, `proposal visual block ${block}`);
  exactKeys(value, ["id", "kind", "renderer", "prompt", "caption", "generatorKind", "content"], `proposal visual block ${block}`);
  const kind = oneOf(value.kind, ["figure", "plot", "table"] as const, `proposal visual block ${block}.kind`);
  const renderer = oneOf(value.renderer, ["auto", "tikz", "pgfplots", "latex_table", "adobe_svg_proof"] as const, `proposal visual block ${block}.renderer`, "auto");
  const generatorKind = value.generatorKind === undefined
    ? undefined
    : oneOf(value.generatorKind, ["figure", "story", "text", "brief"] as const, `proposal visual block ${block}.generatorKind`);
  const directive: ProposalVisualDirective = {
    id: stableId(value.id, `proposal visual block ${block}.id`),
    kind,
    renderer,
    prompt: text(value.prompt, `proposal visual block ${block}.prompt`, 4000),
    ...(value.caption === undefined ? {} : { caption: text(value.caption, `proposal visual block ${block}.caption`, 800) }),
    ...(generatorKind === undefined ? {} : { generatorKind }),
    ...(value.content === undefined ? {} : { content: value.content }),
    source: { block, line }
  };
  validateCompatibility(directive);
  return directive;
}

function validateCompatibility(directive: ProposalVisualDirective): void {
  const renderer = resolveRenderer(directive);
  if (renderer === "tikz" && directive.kind !== "figure") throw new ValidationError(`${directive.id}: tikz is only valid for figures`);
  if (renderer === "pgfplots" && directive.kind !== "plot") throw new ValidationError(`${directive.id}: pgfplots is only valid for plots`);
  if (renderer === "latex_table" && directive.kind !== "table") throw new ValidationError(`${directive.id}: latex_table is only valid for tables`);
  if (renderer === "adobe_svg_proof" && directive.kind !== "figure") throw new ValidationError(`${directive.id}: adobe_svg_proof is only valid for figures`);
  if (renderer === "adobe_svg_proof" && directive.content !== undefined) throw new ValidationError(`${directive.id}: adobe_svg_proof accepts the prompt directly and does not accept content`);
  if (renderer !== "adobe_svg_proof" && directive.content === undefined) throw new ValidationError(`${directive.id}: ${renderer} requires reviewed content`);
  if (directive.generatorKind !== undefined && directive.kind !== "figure") throw new ValidationError(`${directive.id}: generatorKind is only valid for figures`);
}

function resolveRenderer(directive: ProposalVisualDirective): ResolvedProposalVisualRenderer {
  if (directive.renderer !== "auto") return directive.renderer;
  if (directive.kind === "plot") return "pgfplots";
  if (directive.kind === "table") return "latex_table";
  return directive.content === undefined ? "adobe_svg_proof" : "tikz";
}

function parseBlockJson(json: string, block: number): unknown {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new ValidationError(`proposal visual block ${block} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function lineAt(value: string, index: number): number { return value.slice(0, index).split("\n").length; }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function record(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${path} must be an object`); return value as Record<string, unknown>; }
function exactKeys(value: Record<string, unknown>, allowed: string[], path: string): void { const extras = Object.keys(value).filter((key) => !allowed.includes(key)); if (extras.length) throw new ValidationError(`${path} contains unsupported field(s): ${extras.join(", ")}`); }
function text(value: unknown, path: string, maximum: number): string { if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) throw new ValidationError(`${path} must be a non-empty string of at most ${maximum} characters`); return value; }
function stableId(value: unknown, path: string): string { if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) throw new ValidationError(`${path} must be a stable identifier`); return value; }
function oneOf<T extends string>(value: unknown, choices: readonly T[], path: string, fallback?: T): T { if (value === undefined && fallback !== undefined) return fallback; if (typeof value !== "string" || !choices.includes(value as T)) throw new ValidationError(`${path} must be one of ${choices.join(", ")}`); return value as T; }
function copyOptionalCaption<T extends object>(value: T, caption?: string): T & { caption?: string } { return caption === undefined ? value : { ...value, caption }; }
