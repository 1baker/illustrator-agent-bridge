import { createHash } from "node:crypto";
import { measureLabel } from "../core/labelPlacement.js";
import type { VectorElement, VectorScene } from "../core/vectorScene.js";
import { canonicalJson } from "../scientific/figureProject.js";

export const PROMPT_FIGURE_QA_POLICY = "prompt-figure-qa.v3" as const;
export interface PromptFigureQaFinding { code: string; severity: "error" | "warning"; message: string; elementIds?: string[]; }
export interface PromptFigureQaReport { schemaVersion: "PromptFigureQaReport.v1"; policyVersion: typeof PROMPT_FIGURE_QA_POLICY; ok: boolean; findings: PromptFigureQaFinding[]; metrics: { minimumFontPt: number | null; minimumStrokePt: number | null; safeInsetMm: number; labelOverlapCount: number; labelBodyOverlapCount: number; textFrameOverflowCount: number; outOfBoundsCount: number; scientificBodyAreaRatio: number; scientificBodyWidthSpan: number; scientificBodyHeightSpan: number; multiPartObjectRatio: number; depictionOperatorCoverage: number; genericObjectCount: number; relationshipCrossingCount: number; maximumRelationshipSpan: number; }; checks: { stableIds: boolean; semanticReferences: boolean; clipping: boolean; labelOverlap: boolean; annotationClearance: boolean; textFitsFrames: boolean; typography: boolean; strokes: boolean; contrast: boolean; composition: boolean; scientificSpecificity: boolean; symbolDiversity: boolean; semanticRecipeConsistency: boolean; relationshipRouting: boolean; }; sha256: string; }

export function inspectPromptFigureScene(scene: VectorScene, profile: "manuscript" | "proposal", physical: { widthMm: number; heightMm: number }): PromptFigureQaReport {
  const findings: PromptFigureQaFinding[] = [];
  const width = scene.document?.width ?? 720, height = scene.document?.height ?? 480;
  const scalePt = Math.min(physical.widthMm / 25.4 * 72 / width, physical.heightMm / 25.4 * 72 / height);
  const visible = scene.elements.filter((element) => element.visible !== false);
  const ids = visible.map((element) => element.id).filter((id): id is string => Boolean(id));
  const stableIds = ids.length === visible.length && new Set(ids).size === ids.length;
  if (!stableIds) findings.push({ code: "stable_ids", severity: "error", message: "Every visible mutable element requires a unique stable id." });
  const idSet = new Set(ids); const semanticIds = [...(scene.semantics?.objects ?? []).flatMap((item) => item.elementIds), ...(scene.semantics?.relationships ?? []).flatMap((item) => item.visualElementIds ?? [])];
  const semanticReferences = semanticIds.every((id) => idSet.has(id));
  if (!semanticReferences) findings.push({ code: "semantic_reference", severity: "error", message: "A semantic object or relationship references missing geometry." });
  const boxes = visible.map((element) => ({ element, box: bounds(element) }));
  const out = boxes.filter(({ box }) => box.x < 0 || box.y < 0 || box.x2 > width || box.y2 > height);
  for (const item of out) findings.push({ code: "content_clipping", severity: "error", message: `Element ${item.element.id ?? "unnamed"} extends beyond the page.`, elementIds: item.element.id ? [item.element.id] : undefined });
  const labels = boxes.filter(({ element }) => element.type === "text"); const overlaps: Array<[string, string]> = [];
  for (let left = 0; left < labels.length; left += 1) for (let right = left + 1; right < labels.length; right += 1) if (intersects(labels[left]!.box, labels[right]!.box)) overlaps.push([labels[left]!.element.id ?? "unnamed", labels[right]!.element.id ?? "unnamed"]);
  for (const pair of overlaps) findings.push({ code: "label_overlap", severity: "error", message: `Labels ${pair[0]} and ${pair[1]} overlap.`, elementIds: pair });
  const byId = new Map(visible.map((element) => [element.id, element]));
  const frameOverflows = visible.filter((element): element is Extract<VectorElement, { type: "text" }> => element.type === "text" && Boolean(element.id?.endsWith(".label-text"))).filter((label) => {
    const prefix = label.id!.slice(0, -".label-text".length);
    const background = byId.get(`${prefix}.label-background`);
    if (background?.type !== "rect") return true;
    const measured = measureLabel(label.text, label.size ?? 18, 0);
    const padding = 4;
    return label.x < background.x + padding - 1e-6 || label.y < background.y + padding - 1e-6 || label.x + measured.width > background.x + background.width - padding + 1e-6 || label.y + measured.height > background.y + background.height - padding + 1e-6;
  });
  for (const label of frameOverflows) findings.push({ code: "text_frame_overflow", severity: "error", message: `Label ${label.id} does not fit inside its mutable frame.`, elementIds: [label.id!] });
  const fontPoints = visible.filter((element): element is Extract<VectorElement, { type: "text" }> => element.type === "text").map((element) => (element.size ?? 18) * scalePt);
  const strokePoints = visible.filter((element) => element.style?.stroke !== null && (element.style?.stroke !== undefined || element.type === "line")).map((element) => (element.style?.strokeWidth ?? 2) * scalePt);
  const minimumFontPt = fontPoints.length ? Math.min(...fontPoints) : null, minimumStrokePt = strokePoints.length ? Math.min(...strokePoints) : null;
  const fontMinimum = profile === "manuscript" ? 7 : 8;
  if (minimumFontPt !== null && minimumFontPt < fontMinimum) findings.push({ code: "typography", severity: "error", message: `Minimum rendered text is ${minimumFontPt.toFixed(2)} pt; ${profile} requires ${fontMinimum} pt.` });
  if (minimumStrokePt !== null && minimumStrokePt < 0.25) findings.push({ code: "stroke_width", severity: "error", message: `Minimum rendered stroke is ${minimumStrokePt.toFixed(2)} pt; 0.25 pt is required.` });
  for (const element of visible) {
    const color = element.type === "text" ? (element.style?.fill ?? element.style?.stroke ?? "#111111") : element.style?.stroke;
    if (typeof color === "string" && contrastRatio(color, "#FFFFFF") < (element.type === "text" ? 4.5 : 3)) findings.push({ code: "contrast", severity: "error", message: `Element ${element.id ?? "unnamed"} lacks publication contrast against white.`, elementIds: element.id ? [element.id] : undefined });
  }
  const insetBoxes = boxes.filter(({ element, box }) => !(element.type === "rect" && box.x <= 0 && box.y <= 0 && box.x2 >= width && box.y2 >= height));
  const edgeDistance = insetBoxes.length ? Math.min(...insetBoxes.flatMap(({ box }) => [box.x, box.y, width - box.x2, height - box.y2])) : 0;
  const safeInsetMm = Number((Math.max(0, edgeDistance) / width * physical.widthMm).toFixed(3));
  if (insetBoxes.length && safeInsetMm < 1.5) findings.push({ code: "safe_inset", severity: "warning", message: `Minimum safe inset is ${safeInsetMm} mm; 1.5 mm is recommended.` });
  const semanticObjects = scene.semantics?.objects ?? [];
  const bodyElementsByObject = semanticObjects.map((object) => object.elementIds.map((id) => byId.get(id)).filter((element): element is VectorElement => Boolean(element) && element!.type !== "text" && !element!.id?.includes("label-")));
  const bodyBoxes = bodyElementsByObject.flat().map(bounds);
  const contextLabels = boxes.filter(({ element }) => element.type === "text" && Boolean(element.id?.endsWith(".context-label")));
  const labelBodyOverlaps = contextLabels.filter(({ box }) => bodyBoxes.some((body) => intersects(box, body)));
  for (const item of labelBodyOverlaps) findings.push({ code: "label_body_overlap", severity: "error", message: `Label ${item.element.id} overlaps scientific geometry.`, elementIds: item.element.id ? [item.element.id] : undefined });
  const bodyUnion = union(bodyBoxes);
  const drawableHeight = Math.max(1, height - 110);
  const scientificBodyAreaRatio = bodyUnion ? Number((((bodyUnion.x2 - bodyUnion.x) * (bodyUnion.y2 - bodyUnion.y)) / (width * drawableHeight)).toFixed(3)) : 0;
  const scientificBodyWidthSpan = bodyUnion ? Number(((bodyUnion.x2 - bodyUnion.x) / width).toFixed(3)) : 0;
  const scientificBodyHeightSpan = bodyUnion ? Number(((bodyUnion.y2 - bodyUnion.y) / drawableHeight).toFixed(3)) : 0;
  const multiPartObjectRatio = semanticObjects.length ? Number((bodyElementsByObject.filter((items) => items.length >= 4).length / semanticObjects.length).toFixed(3)) : 0;
  const depictionOperatorCoverage = semanticObjects.length ? Number((semanticObjects.filter((object) => object.properties?.compiler === "figure_program_v1" && typeof object.properties?.depictionOperator === "string").length / semanticObjects.length).toFixed(3)) : 0;
  const genericObjectCount = semanticObjects.filter((object) => object.kind === "generic" || object.properties?.recipe === "generic").length;
  const recipeMismatches = semanticObjects.filter((object) => {
    const wording = `${object.kind} ${object.label ?? ""}`.toLowerCase(); const recipe = String(object.properties?.recipe ?? "");
    return (/polymer|film|coating|matrix/.test(wording) && recipe === "membrane") || (/silica|substrate|surface|mineral/.test(wording) && recipe === "apparatus");
  });
  const relationshipLines = (scene.semantics?.relationships ?? []).flatMap((relationship) => (relationship.visualElementIds ?? []).map((id) => byId.get(id)).filter((element): element is Extract<VectorElement, { type: "line" }> => element?.type === "line").map((element) => ({ relationship, element })));
  let relationshipCrossingCount = 0;
  for (let left = 0; left < relationshipLines.length; left += 1) for (let right = left + 1; right < relationshipLines.length; right += 1) {
    const a = relationshipLines[left]!, b = relationshipLines[right]!;
    if (a.relationship.id !== b.relationship.id && segmentsIntersect(a.element, b.element)) relationshipCrossingCount += 1;
  }
  const pageDiagonal = Math.hypot(width, height);
  const maximumRelationshipSpan = relationshipLines.length ? Number((Math.max(...relationshipLines.map(({ element }) => Math.hypot(element.x2 - element.x, element.y2 - element.y))) / pageDiagonal).toFixed(3)) : 0;
  const publicationScope = semanticObjects.length >= 3;
  if (publicationScope && (scientificBodyAreaRatio < 0.25 || scientificBodyWidthSpan < 0.7 || scientificBodyHeightSpan < 0.4)) findings.push({ code: "low_scientific_area_utilization", severity: "error", message: `Scientific content uses area ${scientificBodyAreaRatio}, width span ${scientificBodyWidthSpan}, and height span ${scientificBodyHeightSpan}; publication mechanisms require a composed visual field.` });
  if (publicationScope && depictionOperatorCoverage < 0.75) findings.push({ code: "scientific_depiction_missing", severity: "error", message: `Only ${(depictionOperatorCoverage * 100).toFixed(0)}% of scientific objects use explicit depiction operators; labels and stock glyphs are insufficient.` });
  if (publicationScope && multiPartObjectRatio < 0.75) findings.push({ code: "generic_symbol_dominance", severity: "error", message: `Only ${(multiPartObjectRatio * 100).toFixed(0)}% of scientific objects have multi-part visual structure.` });
  if (genericObjectCount > Math.max(1, Math.floor(semanticObjects.length * 0.1))) findings.push({ code: "generic_object_overuse", severity: "error", message: `${genericObjectCount} semantic objects use the generic fallback.` });
  for (const object of recipeMismatches) findings.push({ code: "semantic_recipe_mismatch", severity: "error", message: `${object.label ?? object.id} uses a visual recipe inconsistent with its material or surface semantics.`, elementIds: object.elementIds });
  if (publicationScope && relationshipCrossingCount > 0) findings.push({ code: "relationship_crossing", severity: "error", message: `${relationshipCrossingCount} semantic relationship crossing(s) obscure the visual narrative.` });
  if (publicationScope && maximumRelationshipSpan > 0.55) findings.push({ code: "relationship_span", severity: "error", message: `A semantic relationship spans ${(maximumRelationshipSpan * 100).toFixed(0)}% of the page diagonal; contextual composition should keep related objects visually local.` });
  const checks = { stableIds, semanticReferences, clipping: out.length === 0, labelOverlap: overlaps.length === 0, annotationClearance: labelBodyOverlaps.length === 0, textFitsFrames: frameOverflows.length === 0, typography: !findings.some((item) => item.code === "typography"), strokes: !findings.some((item) => item.code === "stroke_width"), contrast: !findings.some((item) => item.code === "contrast"), composition: !findings.some((item) => item.code === "low_scientific_area_utilization"), scientificSpecificity: !findings.some((item) => item.code === "scientific_depiction_missing"), symbolDiversity: !findings.some((item) => item.code === "generic_symbol_dominance" || item.code === "generic_object_overuse"), semanticRecipeConsistency: recipeMismatches.length === 0, relationshipRouting: !findings.some((item) => item.code === "relationship_crossing" || item.code === "relationship_span") };
  const body = { schemaVersion: "PromptFigureQaReport.v1" as const, policyVersion: PROMPT_FIGURE_QA_POLICY, ok: !findings.some((item) => item.severity === "error"), findings, metrics: { minimumFontPt: minimumFontPt === null ? null : Number(minimumFontPt.toFixed(3)), minimumStrokePt: minimumStrokePt === null ? null : Number(minimumStrokePt.toFixed(3)), safeInsetMm, labelOverlapCount: overlaps.length, labelBodyOverlapCount: labelBodyOverlaps.length, textFrameOverflowCount: frameOverflows.length, outOfBoundsCount: out.length, scientificBodyAreaRatio, scientificBodyWidthSpan, scientificBodyHeightSpan, multiPartObjectRatio, depictionOperatorCoverage, genericObjectCount, relationshipCrossingCount, maximumRelationshipSpan }, checks };
  return { ...body, sha256: createHash("sha256").update(canonicalJson(body)).digest("hex") };
}

interface Box { x: number; y: number; x2: number; y2: number; }
function bounds(element: VectorElement): Box {
  if (element.type === "rect" || element.type === "ellipse") return { x: element.x, y: element.y, x2: element.x + element.width, y2: element.y + element.height };
  if (element.type === "text") return { x: element.x, y: element.y, x2: element.x + Math.max(element.size ?? 18, element.text.length * (element.size ?? 18) * 0.56), y2: element.y + (element.size ?? 18) * 1.2 };
  if (element.type === "line") return normalized(element.x, element.y, element.x2, element.y2, element.style?.strokeWidth ?? 2);
  const points = element.type === "compound_path" ? element.subpaths.flatMap((path) => path.points) : element.points;
  const xs = points.flatMap((point) => [point.x, "leftX" in point ? point.leftX : undefined, "rightX" in point ? point.rightX : undefined]).filter((value): value is number => value !== undefined); const ys = points.flatMap((point) => [point.y, "leftY" in point ? point.leftY : undefined, "rightY" in point ? point.rightY : undefined]).filter((value): value is number => value !== undefined);
  return normalized(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), element.style?.strokeWidth ?? 0);
}
function normalized(x: number, y: number, x2: number, y2: number, expansion: number): Box { const half = expansion / 2; return { x: Math.min(x, x2) - half, y: Math.min(y, y2) - half, x2: Math.max(x, x2) + half, y2: Math.max(y, y2) + half }; }
function intersects(left: Box, right: Box): boolean { return left.x < right.x2 && left.x2 > right.x && left.y < right.y2 && left.y2 > right.y; }
function union(boxes: Box[]): Box | undefined { if (!boxes.length) return undefined; return { x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)), x2: Math.max(...boxes.map((box) => box.x2)), y2: Math.max(...boxes.map((box) => box.y2)) }; }
function segmentsIntersect(left: Extract<VectorElement, { type: "line" }>, right: Extract<VectorElement, { type: "line" }>): boolean {
  const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const a = orient(left.x, left.y, left.x2, left.y2, right.x, right.y), b = orient(left.x, left.y, left.x2, left.y2, right.x2, right.y2);
  const c = orient(right.x, right.y, right.x2, right.y2, left.x, left.y), d = orient(right.x, right.y, right.x2, right.y2, left.x2, left.y2);
  return a * b < 0 && c * d < 0;
}
function luminance(hex: string): number { if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0; const values = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4); return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!; }
function contrastRatio(left: string, right: string): number { const a = luminance(left), b = luminance(right); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
