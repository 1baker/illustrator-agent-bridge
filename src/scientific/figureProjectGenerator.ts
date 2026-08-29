import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { pdf as openPdf } from "pdf-to-img";
import { ValidationError } from "../core/sceneValidation.js";
import { normalizeAnalysisResult, resolveCalibration, runScientificAnalysisAdapter, type ScientificAnalysisResult } from "../analysis/adapterProtocol.js";
import { rasterizeSvgToPng } from "../render/pngRenderer.js";
import { inspectScientificFigurePublication, SCIENTIFIC_FIGURE_QA_POLICY_VERSION, type ScientificFigureQaReport } from "../qa/scientificFigureQa.js";
import { generateScientificImage, type ScientificImageGeneration } from "./imageGenerator.js";
import { canonicalJson, normalizeScientificFigureProject, SCIENTIFIC_FIGURE_APPROVAL_POLICY_VERSION, semanticFigureDigest, type ScientificFigurePanel, type ScientificFigureProject } from "./figureProject.js";

export interface ScientificFigureProjectGeneration {
  project: ScientificFigureProject;
  svg: string;
  pdf: Buffer;
  png: Buffer;
  latex: string;
  semanticJson: string;
  analysisJson: string;
  manifestJson: string;
  manifest: Record<string, unknown>;
  analysis: Record<string, ScientificAnalysisResult>;
  qa: ScientificFigureQaReport;
}

interface RenderedPanel { panel: ScientificFigurePanel; svgBody: string; viewBox: string; sourceDigest: string; renderingDigest?: string; generated?: ScientificImageGeneration; analysis?: ScientificAnalysisResult; sourceMime?: string; }

export async function generateScientificFigureProject(input: unknown, options: { assetRoot: string; runAnalysis?: boolean } ): Promise<ScientificFigureProjectGeneration> {
  const project = normalizeScientificFigureProject(input);
  if (!project.approvals.brief || project.approvals.brief.digest !== semanticFigureDigest(project)) throw new ValidationError("rendering requires a current SHA-256-bound brief approval");
  const widthPx = Math.round(project.size.widthMm / 25.4 * project.size.dpi);
  const heightPx = Math.round(project.size.heightMm / 25.4 * project.size.dpi);
  const renderedPanels: RenderedPanel[] = [];
  const analysis: Record<string, ScientificAnalysisResult> = {};
  for (const panel of project.panels) {
    const rendered = await renderPanel(panel, project, options, renderedPanels);
    renderedPanels.push(rendered);
    if (rendered.analysis) analysis[panel.id] = rendered.analysis;
  }
  const svg = assembleSvg(project, renderedPanels, widthPx, heightPx);
  const pngResult = rasterizeSvgToPng(svg, { width: widthPx, background: "#FFFFFF" });
  const pdf = await pngToPdf(pngResult.png, project.size.widthMm, project.size.heightMm);
  const latex = renderProjectLatex(project);
  const semantic = {
    schemaVersion: "scientific-figure-semantic.v1", project, sourceOfTruth: "ScientificFigureProject.v1",
    panels: renderedPanels.map((item) => ({ id: item.panel.id, type: item.panel.type, sourceSha256: item.sourceDigest, ...(item.renderingDigest ? { renderingSha256: item.renderingDigest } : {}), semanticEvidence: item.panel.semanticEvidence, scene: item.generated?.scene, manifest: item.generated?.manifest })),
    analysis: Object.fromEntries(Object.entries(analysis).map(([id, result]) => [id, { requestId: result.requestId, candidateAnnotations: true, outputDigests: result.outputDigests }]))
  };
  const semanticJson = `${JSON.stringify(semantic, null, 2)}\n`;
  const analysisJson = `${JSON.stringify({ schemaVersion: "scientific-figure-analysis.v1", results: analysis }, null, 2)}\n`;
  const artifactDigests = { svg: sha256(svg), pdf: sha256(pdf), png: sha256(pngResult.png), semantic_json: sha256(semanticJson), latex: sha256(latex), analysis: sha256(analysisJson) };
  const qa = inspectScientificFigurePublication(project, { widthPx: pngResult.width, heightPx: pngResult.height, svg, png: pngResult.png, pdf, analysis });
  if (!qa.ok) throw new ValidationError(`scientific figure QA failed: ${qa.findings.filter((item) => item.severity === "error").map((item) => `${item.code}: ${item.message}`).join("; ")}`);
  const manifest = {
    schemaVersion: "scientific-figure-manifest.v1", projectId: project.id, revisionId: project.revisionId, profile: project.profile, lifecycle: "final_pending",
    semanticDigest: semanticFigureDigest(project), sourceOfTruth: "ScientificFigureProject.v1", adobeUsed: false, approvalPolicyVersion: SCIENTIFIC_FIGURE_APPROVAL_POLICY_VERSION, qaPolicyVersion: SCIENTIFIC_FIGURE_QA_POLICY_VERSION, physicalSize: { widthMm: project.size.widthMm, heightMm: project.size.heightMm, dpi: project.size.dpi, widthPx, heightPx },
    inputs: renderedPanels.map((item) => ({ panelId: item.panel.id, sha256: item.sourceDigest, ...(item.renderingDigest ? { sanitizedRenderingSha256: item.renderingDigest } : {}), immutable: item.panel.type === "supplied_image" })), artifacts: artifactDigests,
    analysis: Object.fromEntries(Object.entries(analysis).map(([id, result]) => [id, { adapter: result.adapter, inputSha256: result.inputSha256, weightSha256: result.weightSha256, outputDigests: result.outputDigests, candidateAnnotations: true }])), qa
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  return { project: { ...project, lifecycle: "final_pending" }, svg, pdf, png: pngResult.png, latex, semanticJson, analysisJson, manifestJson, manifest, analysis, qa };
}

async function renderPanel(panel: ScientificFigurePanel, project: ScientificFigureProject, options: { assetRoot: string; runAnalysis?: boolean }, previous: RenderedPanel[]): Promise<RenderedPanel> {
  if (panel.type === "schematic" || panel.type === "plot") {
    const request = panel.type === "plot" ? { schemaVersion: 1, kind: "plot", content: panel.content } : normalizeSchematicRequest(panel.content);
    const generated = generateScientificImage(request);
    const fragment = extractSvgFragment(generated.svg);
    return { panel, ...fragment, sourceDigest: generated.manifest.sourceSha256, generated };
  }
  if (panel.type === "supplied_image") {
    const media = await loadSuppliedMedia(panel, options.assetRoot);
    return { panel, ...media, sourceDigest: panel.source!.sha256, renderingDigest: media.renderingDigest, sourceMime: media.mime };
  }
  const source = previous.find((item) => item.panel.id === panel.sourcePanelId);
  if (!source) throw new ValidationError(`analysis overlay ${panel.id} source panel must appear earlier in panel order`);
  let result: ScientificAnalysisResult;
  if (panel.analysisResult !== undefined) result = normalizeAnalysisResult(panel.analysisResult);
  else if (options.runAnalysis && panel.analysisRequest !== undefined) result = await runScientificAnalysisAdapter(panel.analysisRequest, { assetRoot: options.assetRoot });
  else throw new ValidationError(`analysis overlay ${panel.id} requires a reviewed result or runAnalysis=true`);
  const calibration = resolveCalibration(panel.calibration ?? result.calibration);
  result = { ...result, calibration };
  const overlay = renderAnnotations(result.annotations);
  return { panel, svgBody: `${source.svgBody}\n${overlay}`, viewBox: source.viewBox, sourceDigest: sha256(canonicalJson({ source: source.sourceDigest, result })), analysis: result };
}

function normalizeSchematicRequest(content: unknown): Parameters<typeof generateScientificImage>[0] { const value = content as Record<string, unknown>; if (value && value.schemaVersion === 1 && typeof value.kind === "string" && "content" in value) return value; return { schemaVersion: 1, kind: "brief", content }; }

async function loadSuppliedMedia(panel: ScientificFigurePanel, assetRoot: string): Promise<{ svgBody: string; viewBox: string; mime: string; renderingDigest: string }> {
  const path = safePath(assetRoot, panel.source!.path); const raw = await readFile(path); const actual = sha256(raw);
  if (actual !== panel.source!.sha256) throw new ValidationError(`supplied image ${panel.id} SHA-256 mismatch: expected ${panel.source!.sha256}, got ${actual}`);
  const extension = extname(path).toLowerCase();
  if (extension === ".svg") { const sanitized = sanitizeSuppliedSvg(raw.toString("utf8")); return { ...extractSvgFragment(sanitized), mime: "image/svg+xml", renderingDigest: sha256(sanitized) }; }
  if (![".png", ".jpg", ".jpeg", ".tif", ".tiff", ".pdf"].includes(extension)) throw new ValidationError(`supplied image ${panel.id} must be PNG, JPEG, TIFF, SVG, or PDF`);
  const page = panel.source!.page ?? 1;
  if (extension === ".pdf") {
    const document = await openPdf(path, { scale: projectDensity(panel) / 72 });
    if (page > document.length) throw new ValidationError(`supplied PDF ${panel.id} has ${document.length} pages; page ${page} does not exist`);
    const png = Buffer.from(await document.getPage(page));
    const metadata = await sharp(png).metadata();
    const svgBody = `<image x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${png.toString("base64")}" />`;
    return { svgBody, viewBox: rasterViewBox(metadata.width, metadata.height), mime: "image/png", renderingDigest: sha256(svgBody) };
  }
  let image: ReturnType<typeof sharp>;
  try { image = sharp(raw); } catch (error) { throw new ValidationError(`unable to open supplied image ${panel.id}: ${error instanceof Error ? error.message : String(error)}`); }
  const metadata = await image.metadata();
  const png = await image.png().toBuffer();
  const svgBody = `<image x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${png.toString("base64")}" />`;
  return { svgBody, viewBox: rasterViewBox(metadata.width, metadata.height), mime: "image/png", renderingDigest: sha256(svgBody) };
}

function projectDensity(_panel: ScientificFigurePanel): number { return 300; }
function assembleSvg(project: ScientificFigureProject, panels: RenderedPanel[], width: number, height: number): string {
  const pxPerMmX = width / project.size.widthMm, pxPerMmY = height / project.size.heightMm;
  const padX = project.layout.paddingMm * pxPerMmX, padY = project.layout.paddingMm * pxPerMmY;
  const gapX = project.layout.gapMm * pxPerMmX, gapY = project.layout.gapMm * pxPerMmY;
  const legendHeight = project.sharedLegend?.length ? Math.max(34, 9 * project.sharedLegend.length) : 0;
  const cellWidth = (width - 2 * padX - gapX * (project.layout.columns - 1)) / project.layout.columns;
  const cellHeight = (height - 2 * padY - legendHeight - gapY * (project.layout.rows - 1)) / project.layout.rows;
  const body = panels.map(({ panel, svgBody, viewBox }) => {
    const x = padX + (panel.column - 1) * (cellWidth + gapX), y = padY + (panel.row - 1) * (cellHeight + gapY);
    const panelWidth = panel.columnSpan * cellWidth + (panel.columnSpan - 1) * gapX, panelHeight = panel.rowSpan * cellHeight + (panel.rowSpan - 1) * gapY;
    const fontPx = project.size.dpi * 8 / 72;
    const strokePx = project.size.dpi * 0.5 / 72;
    return `<g id="panel-${xmlId(panel.id)}" data-panel-id="${xml(panel.id)}" data-panel-label="${xml(panel.label)}" data-claim-evidence-sha256="${sha256(canonicalJson(panel.semanticEvidence))}"><rect x="${n(x)}" y="${n(y)}" width="${n(panelWidth)}" height="${n(panelHeight)}" fill="#FFFFFF" stroke="#B9C2CC" stroke-width="${n(strokePx)}"/><svg x="${n(x + 4)}" y="${n(y + 4)}" width="${n(panelWidth - 8)}" height="${n(panelHeight - 8)}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${svgBody}</svg><text x="${n(x + 8)}" y="${n(y + fontPx + 4)}" font-family="DejaVu Sans" font-size="${n(fontPx)}" font-weight="700" fill="#111111">${xml(panel.label)}</text></g>`;
  }).join("\n");
  const legendFontPx = project.size.dpi * 8 / 72;
  const legend = project.sharedLegend?.map((item, index) => `<g data-legend-id="${xml(item.id)}"><rect x="${n(padX + index * 180)}" y="${n(height - padY - legendFontPx)}" width="${n(legendFontPx)}" height="${n(legendFontPx)}" fill="${xml(item.color ?? "#666666")}"/><text x="${n(padX + index * 180 + legendFontPx + 6)}" y="${n(height - padY)}" font-family="DejaVu Sans" font-size="${n(legendFontPx)}" fill="#111111">${xml(item.label)}</text></g>`).join("\n") ?? "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="figure-title figure-desc" data-min-font-size-pt="8" data-min-stroke-width-pt="0.5"><title id="figure-title">${xml(project.title)}</title><desc id="figure-desc">${xml(project.altText)}</desc><metadata data-schema="ScientificFigureProject.v1">${xml(canonicalJson(project))}</metadata>${body}${legend}</svg>\n`;
}

function renderProjectLatex(project: ScientificFigureProject): string { return `% Generated from ScientificFigureProject.v1. Semantic JSON is authoritative.\n\\documentclass{article}\n\\usepackage[paperwidth=${project.size.widthMm}mm,paperheight=${project.size.heightMm}mm,margin=0mm]{geometry}\n\\usepackage{graphicx}\n\\pagestyle{empty}\n\\begin{document}\n\\noindent\\includegraphics[width=\\paperwidth,height=\\paperheight]{${escapeTex(project.id)}.pdf}\n% Caption: ${project.caption.replace(/[\r\n%]/g, " ")}\n% Alt text: ${project.altText.replace(/[\r\n%]/g, " ")}\n\\end{document}\n`; }
async function pngToPdf(png: Buffer, widthMm: number, heightMm: number): Promise<Buffer> { const document = await PDFDocument.create(); const deterministicDate = new Date("2000-01-01T00:00:00.000Z"); document.setProducer("illustrator-agent-bridge Scientific Figure Studio v1"); document.setCreator("ScientificFigureProject.v1"); document.setCreationDate(deterministicDate); document.setModificationDate(deterministicDate); const page = document.addPage([widthMm / 25.4 * 72, heightMm / 25.4 * 72]); const image = await document.embedPng(png); page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() }); return Buffer.from(await document.save({ useObjectStreams: false })); }
function renderAnnotations(annotations: ScientificAnalysisResult["annotations"]): string { return annotations.map((item) => { if (item.box) return `<g data-annotation-id="${xml(item.id)}" data-candidate="true"><rect x="${n(item.box.x)}" y="${n(item.box.y)}" width="${n(item.box.width)}" height="${n(item.box.height)}" fill="none" stroke="#D1495B" stroke-width="3"/><text x="${n(item.box.x)}" y="${n(Math.max(12, item.box.y - 4))}" font-size="14" fill="#9B1C31">${xml(item.classLabel ?? item.id)}${item.confidence === undefined ? "" : ` ${n(item.confidence)}`}</text></g>`; if (item.points?.length) return `<polygon data-annotation-id="${xml(item.id)}" data-candidate="true" points="${item.points.map((point) => `${n(point.x)},${n(point.y)}`).join(" ")}" fill="#D1495B44" stroke="#D1495B" stroke-width="2"/>`; return `<metadata data-annotation-id="${xml(item.id)}" data-candidate="true">${xml(JSON.stringify(item))}</metadata>`; }).join("\n"); }
function extractSvgFragment(svg: string): { svgBody: string; viewBox: string } { validateSvg(svg); const match = svg.replace(/^<\?xml[^>]+>\s*/i, "").match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i); if (!match) throw new ValidationError("panel renderer did not return a complete SVG"); const attributes = match[1]!; const declared = attributes.match(/\bviewBox=["']([^"']+)["']/i)?.[1]; const values = declared?.trim().split(/[\s,]+/).map(Number); if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value)) || values[2]! <= 0 || values[3]! <= 0) { const width = Number(attributes.match(/\bwidth=["']([0-9.]+)["']/i)?.[1]); const height = Number(attributes.match(/\bheight=["']([0-9.]+)["']/i)?.[1]); if (!(width > 0 && height > 0)) throw new ValidationError("panel SVG requires a finite positive viewBox or numeric width and height"); return { svgBody: match[2]!, viewBox: `0 0 ${n(width)} ${n(height)}` }; } return { svgBody: match[2]!, viewBox: values.map(n).join(" ") }; }
function rasterViewBox(width?: number, height?: number): string { if (!width || !height) throw new ValidationError("supplied raster image dimensions are unavailable"); return `0 0 ${width} ${height}`; }
function validateSvg(svg: string): void { if (!/<svg\b/i.test(svg) || /<!DOCTYPE\b|<script\b|<foreignObject\b/i.test(svg) || /\b(?:href|xlink:href)\s*=\s*["'](?!#|data:)[^"']+/i.test(svg)) throw new ValidationError("supplied SVG contains unsupported or external content"); }
export function sanitizeSuppliedSvg(svg: string): string {
  if (!/<svg\b/i.test(svg)) throw new ValidationError("supplied SVG is not a complete SVG document");
  const forbidden = /<!DOCTYPE\b|<!ENTITY\b|<\?(?!xml\s)|<\s*(?:script|foreignObject|iframe|object|embed|audio|video|style|link|use|animate|animateMotion|animateTransform|set|discard)\b|\son[a-z][a-z0-9_.:-]*\s*=|\b(?:url\s*\(|@import|expression\s*\(|behavior\s*:|-moz-binding\s*:)/i;
  if (forbidden.test(svg)) throw new ValidationError("supplied SVG contains active content, event handlers, unsafe CSS, entities, or unsupported embedded objects");
  for (const match of svg.matchAll(/\b(?:href|xlink:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
    const target = match[2]!.trim();
    if (target.startsWith("#")) continue;
    if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(target)) continue;
    throw new ValidationError("supplied SVG contains an external, file, or unsafe data resource reference");
  }
  const sanitized = svg.replace(/^\uFEFF/, "").replace(/^\s*<\?xml[^>]*>\s*/i, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  validateSvg(sanitized);
  return `${sanitized}\n`;
}
function safePath(root: string, child: string): string { const absoluteRoot = resolve(root), absolute = resolve(absoluteRoot, child); if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}/`)) throw new ValidationError(`supplied image path escapes asset root: ${child}`); return absolute; }
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function xml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function xmlId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-"); }
function escapeTex(value: string): string { return value.replace(/([%#$&_{}])/g, "\\$1"); }
function n(value: number): string { return Number(value.toFixed(4)).toString(); }
