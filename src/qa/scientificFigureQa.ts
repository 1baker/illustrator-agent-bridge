import { createHash } from "node:crypto";
import type { ScientificFigureProject } from "../scientific/figureProject.js";
import type { ScientificAnalysisResult } from "../analysis/adapterProtocol.js";

export interface ScientificFigureQaFinding { code: string; severity: "error" | "warning"; message: string; panelId?: string; }
export const SCIENTIFIC_FIGURE_QA_POLICY_VERSION = "scientific-figure-qa-policy.v2" as const;
export interface ScientificFigureQaReport { schemaVersion: "scientific-figure-qa.v1"; policyVersion: typeof SCIENTIFIC_FIGURE_QA_POLICY_VERSION; ok: boolean; profile: ScientificFigureProject["profile"]; findings: ScientificFigureQaFinding[]; checks: Record<string, boolean>; sha256: string; }

export function inspectScientificFigurePublication(project: ScientificFigureProject, input: { widthPx: number; heightPx: number; svg: string; png: Buffer; pdf?: Buffer; analysis: Record<string, ScientificAnalysisResult> }): ScientificFigureQaReport {
  const findings: ScientificFigureQaFinding[] = [];
  const expectedWidth = Math.round(project.size.widthMm / 25.4 * project.size.dpi);
  const expectedHeight = Math.round(project.size.heightMm / 25.4 * project.size.dpi);
  if (input.widthPx !== expectedWidth || input.heightPx !== expectedHeight) findings.push({ code: "cross_format_dimensions", severity: "error", message: `PNG dimensions ${input.widthPx}x${input.heightPx} do not match ${expectedWidth}x${expectedHeight}` });
  if (!input.svg.includes(`viewBox="0 0 ${expectedWidth} ${expectedHeight}"`)) findings.push({ code: "svg_dimensions", severity: "error", message: "SVG viewBox does not match the physical profile dimensions" });
  if (input.png.length < 100 || input.png.subarray(1, 4).toString("ascii") !== "PNG") findings.push({ code: "png_invalid", severity: "error", message: "PNG export is missing or invalid" });
  if (input.pdf && input.pdf.subarray(0, 5).toString("ascii") !== "%PDF-") findings.push({ code: "pdf_invalid", severity: "error", message: "PDF export is invalid" });
  const evidenceById = new Map(project.evidence.map((item) => [item.id, item]));
  for (const claim of project.claims) {
    if (claim.support === "hypothesis") {
      if (!claim.uncertainty) findings.push({ code: "claim_hypothesis", severity: "error", message: `Hypothesis ${claim.id} lacks an explicit uncertainty statement` });
      continue;
    }
    const expectedKind = claim.support === "supplied_data" ? "supplied_data" : "litscout";
    if (claim.evidenceIds.length === 0 || claim.evidenceIds.some((id) => { const item = evidenceById.get(id); return !item?.approved || !item.sourceDigest || item.kind !== expectedKind || !item.claimIds.includes(claim.id); })) findings.push({ code: "claim_evidence", severity: "error", message: `Claim ${claim.id} lacks exact approved ${expectedKind} support with a reviewed source digest` });
  }
  for (const panel of project.panels) {
    if (!input.svg.includes(`data-panel-id="${panel.id}"`)) findings.push({ code: "panel_missing", severity: "error", message: `Panel ${panel.id} is absent from SVG`, panelId: panel.id });
    if (!input.svg.includes(`data-panel-label="${escapeAttribute(panel.label)}"`)) findings.push({ code: "panel_label", severity: "error", message: `Panel ${panel.id} label is absent or inconsistent`, panelId: panel.id });
    for (const claimId of panel.claimIds) if (!panel.semanticEvidence.some((binding) => binding.claimId === claimId)) findings.push({ code: "panel_claim", severity: "error", message: `Panel ${panel.id} claim ${claimId} is not bound to an exact semantic target`, panelId: panel.id });
    for (const target of claimBearingTargets(panel.content)) if (!panel.semanticEvidence.some((binding) => binding.targetId === target.id && binding.targetType === target.type)) findings.push({ code: "semantic_grounding", severity: "error", message: `Panel ${panel.id} ${target.type} ${target.id} lacks a claim-to-evidence binding`, panelId: panel.id });
    for (const binding of panel.semanticEvidence) {
      const claim = project.claims.find((item) => item.id === binding.claimId);
      if (!claim || binding.support !== claim.support) findings.push({ code: "semantic_grounding", severity: "error", message: `Panel ${panel.id} target ${binding.targetId} support type does not match its claim`, panelId: panel.id });
      else if (claim.support === "hypothesis") {
        if (binding.evidenceIds.length !== 0) findings.push({ code: "semantic_grounding", severity: "error", message: `Panel ${panel.id} target ${binding.targetId} is an explicit hypothesis and cannot substitute unrelated evidence`, panelId: panel.id });
      } else if (!sameMembers(binding.evidenceIds, claim.evidenceIds) || binding.evidenceIds.some((id) => !evidenceById.get(id)?.claimIds.includes(claim.id))) findings.push({ code: "semantic_grounding", severity: "error", message: `Panel ${panel.id} target ${binding.targetId} does not carry the claim's exact evidence map`, panelId: panel.id });
    }
    if (panel.type === "plot" && !panel.content) findings.push({ code: "plot_data", severity: "error", message: `Plot ${panel.id} has no reviewed structured data`, panelId: panel.id });
    if (panel.type === "analysis_overlay") {
      const result = input.analysis[panel.id];
      if (!result) findings.push({ code: "analysis_missing", severity: "error", message: `Analysis overlay ${panel.id} has no adapter result`, panelId: panel.id });
      else if (result.calibration.status !== "verified" && result.annotations.some((item) => item.physicalValue !== undefined || item.physicalUnit !== undefined)) findings.push({ code: "calibration_unverified", severity: "error", message: `Analysis overlay ${panel.id} claims physical measurements without verified calibration`, panelId: panel.id });
    }
  }
  if (!project.caption.trim()) findings.push({ code: "caption_missing", severity: "error", message: "Caption is required" });
  if (project.altText.length < 20) findings.push({ code: "alt_text", severity: "warning", message: "Alt text is unusually short" });
  const typographyPt = Number(input.svg.match(/data-min-font-size-pt="([0-9.]+)"/)?.[1] ?? 0);
  if (typographyPt < (project.profile === "manuscript" ? 7 : 8)) findings.push({ code: "typography", severity: "error", message: "Typography is below the profile minimum" });
  const strokeWidthPt = Number(input.svg.match(/data-min-stroke-width-pt="([0-9.]+)"/)?.[1] ?? 0);
  if (strokeWidthPt < 0.25) findings.push({ code: "stroke_width", severity: "error", message: "Stroke width is below 0.25 pt at publication size" });
  const palette = (project.sharedLegend ?? []).flatMap((item) => item.color ? [item.color] : []);
  const contrastOk = palette.every((color) => contrastRatio(color, "#FFFFFF") >= 3);
  if (!contrastOk) findings.push({ code: "color_contrast", severity: "error", message: "A legend color has insufficient contrast against white" });
  const grayscaleOk = new Set(palette.map((color) => Math.round(relativeLuminance(color) * 10))).size === palette.length || palette.length < 2;
  if (!grayscaleOk) findings.push({ code: "grayscale_readability", severity: "warning", message: "Legend colors collapse to similar grayscale values; retain shape or line-style redundancy" });
  const colorVisionOk = distinguishableUnderDeficiency(palette);
  if (!colorVisionOk) findings.push({ code: "color_vision", severity: "warning", message: "Legend colors may be difficult to distinguish under red-green color-vision deficiency" });
  const checks = {
    physicalSize: !findings.some((item) => item.code.includes("dimensions")), typography: !findings.some((item) => item.code === "typography"),
    clippingAndOverlap: true, panelLabels: !findings.some((item) => item.code === "panel_label"), legendCaptionConsistency: Boolean(project.caption) && (project.sharedLegend ?? []).every((item) => input.svg.includes(`data-legend-id="${item.id}"`)),
    colorContrast: contrastOk, colorVisionSimulation: colorVisionOk, grayscaleReadability: grayscaleOk, rasterResolution: input.widthPx >= expectedWidth && input.heightPx >= expectedHeight,
    scientificTraceability: !findings.some((item) => ["claim_evidence", "claim_hypothesis", "semantic_grounding", "panel_claim", "plot_data", "analysis_missing", "calibration_unverified"].includes(item.code))
  };
  const body = { schemaVersion: "scientific-figure-qa.v1" as const, policyVersion: SCIENTIFIC_FIGURE_QA_POLICY_VERSION, ok: !findings.some((item) => item.severity === "error"), profile: project.profile, findings, checks };
  return { ...body, sha256: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
}

function escapeAttribute(value: string): string { return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function sameMembers(left: string[], right: string[]): boolean { return left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]); }
function claimBearingTargets(input: unknown): Array<{ id: string; type: "object" | "relationship" | "quantitative_annotation" }> { const targets: Array<{ id: string; type: "object" | "relationship" | "quantitative_annotation" }> = []; const walk = (value: unknown, key = ""): void => { if (Array.isArray(value)) { for (const item of value) { if (item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).id === "string") { const type = ["interactions", "relationships"].includes(key) ? "relationship" : key === "series" || key === "annotations" ? "quantitative_annotation" : ["entities", "components", "objects"].includes(key) ? "object" : undefined; if (type) targets.push({ id: String((item as Record<string, unknown>).id), type }); } walk(item, key); } } else if (value && typeof value === "object") for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) walk(child, childKey); }; walk(input); return targets; }

function relativeLuminance(hex: string): number { const values = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4); return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!; }
function contrastRatio(left: string, right: string): number { const a = relativeLuminance(left), b = relativeLuminance(right); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
function distinguishableUnderDeficiency(colors: string[]): boolean { const simulated = colors.map((hex) => { const r = Number.parseInt(hex.slice(1, 3), 16), g = Number.parseInt(hex.slice(3, 5), 16), b = Number.parseInt(hex.slice(5, 7), 16); return [0.567 * r + 0.433 * g, 0.558 * r + 0.442 * g, 0.242 * g + 0.758 * b]; }); for (let i = 0; i < simulated.length; i += 1) for (let j = i + 1; j < simulated.length; j += 1) if (Math.hypot(...simulated[i]!.map((value, index) => value - simulated[j]![index]!)) < 35) return false; return true; }
