import type { CartoonScene, SceneElement } from "../bridge/types.js";
import type { ExportQaReport } from "./exportQa.js";

export interface ArtworkReviewOptions {
  prompt: string;
  scene?: CartoonScene;
  exportQa?: ExportQaReport;
  target?: string;
}

export interface ArtworkReviewCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
  evidence?: string[];
}

export interface ArtworkReviewReport {
  ok: boolean;
  confidence: number;
  score: number;
  checks: ArtworkReviewCheck[];
  issues: string[];
  improvements: string[];
  nextPrompt: string | null;
  nextGoalPrompt: string | null;
}

interface Box {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function reviewArtworkQuality(options: ArtworkReviewOptions): ArtworkReviewReport {
  const prompt = options.prompt.trim();
  const checks = [
    checkExportQa(options.exportQa),
    ...checkSceneComposition(options.scene, prompt, options.target),
    ...checkExportAgainstScene(options.exportQa, options.scene)
  ];
  const failures = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");
  const score = checks.length === 0 ? 0 : checks.reduce((total, check) => total + scoreCheck(check), 0) / checks.length;
  const issues = failures.map((check) => check.message);
  const improvements = [...failures, ...warnings].map((check) => check.message);
  const nextPrompt = improvements.length === 0 ? null : makeNextPrompt(prompt, improvements, options.target);

  return {
    ok: failures.length === 0,
    confidence: roundTo(score, 3),
    score: roundTo(score, 3),
    checks,
    issues,
    improvements,
    nextPrompt,
    nextGoalPrompt: nextPrompt
  };
}

function checkExportQa(exportQa: ExportQaReport | undefined): ArtworkReviewCheck {
  if (!exportQa) {
    return warn("export-review-missing", "No exported artifact QA report was provided, so the artwork was not reviewed after drawing.");
  }

  if (!exportQa.ok) {
    return fail(
      "export-qa",
      "The exported artifact failed QA and should be redrawn or re-exported before acceptance.",
      exportQa.checks.filter((check) => check.status === "fail").map((check) => `${check.id}: ${check.message}`)
    );
  }

  return pass("export-qa", `Export QA passed for ${exportQa.format.toUpperCase()} artifact (${exportQa.bytes} bytes).`);
}

function checkSceneComposition(scene: CartoonScene | undefined, prompt: string, target: string | undefined): ArtworkReviewCheck[] {
  if (!scene) {
    return [warn("scene-review-missing", "No scene plan was provided, so composition and recognizability checks were limited to the export artifact.")];
  }

  const document = documentBox(scene);
  const visualElements = scene.elements.filter((element) => !isBackgroundElement(element) && isDrawableElement(element));
  const visualBoxes = visualElements.map(elementBox).filter((box): box is Box => Boolean(box));
  const visualBounds = unionBox("visual artwork", visualBoxes);
  const textElements = scene.elements.filter((element): element is Extract<SceneElement, { type: "text" }> => element.type === "text" && isDrawableElement(element));
  const checks: ArtworkReviewCheck[] = [];

  checks.push(checkVisualFootprint(document, visualBounds));
  checks.push(checkVisualRichness(prompt, visualElements, target));
  checks.push(checkTextReliance(textElements, visualElements, target));
  checks.push(checkFraming(document, visualBounds));
  checks.push(checkNamedEditableParts(scene.elements));

  return checks;
}

function checkExportAgainstScene(exportQa: ExportQaReport | undefined, scene: CartoonScene | undefined): ArtworkReviewCheck[] {
  if (!exportQa) {
    return [];
  }

  const checks: ArtworkReviewCheck[] = [];
  const vectorCount = Number(exportQa.details?.vectorElementCount ?? NaN);
  if (exportQa.format === "svg" && Number.isFinite(vectorCount)) {
    if (vectorCount <= 0) {
      checks.push(fail("export-vector-content", "The SVG export contains no recognizable vector or text elements."));
    } else if (scene && vectorCount < Math.max(3, scene.elements.length * 0.35)) {
      checks.push(warn("export-vector-content", `The SVG export has ${vectorCount} vector/text element(s), fewer than expected from the ${scene.elements.length}-element scene.`));
    } else {
      checks.push(pass("export-vector-content", `The SVG export contains ${vectorCount} vector/text element(s).`));
    }
  }

  const pixelAnalysis = exportQa.details?.pixelAnalysis as { nonBackgroundRatio?: number; touchesCanvasEdge?: boolean } | undefined;
  if (pixelAnalysis && typeof pixelAnalysis.nonBackgroundRatio === "number") {
    if (pixelAnalysis.nonBackgroundRatio < 0.01) {
      checks.push(fail("export-visible-pixels", "The exported PNG has too little non-background content to read as a finished drawing."));
    } else if (pixelAnalysis.nonBackgroundRatio < 0.04) {
      checks.push(warn("export-visible-pixels", "The exported PNG content is very small; enlarge or simplify the artwork before accepting it."));
    } else {
      checks.push(pass("export-visible-pixels", "The exported PNG has enough non-background content to inspect."));
    }

    if (pixelAnalysis.touchesCanvasEdge) {
      checks.push(warn("export-framing", "The exported PNG content touches the canvas edge; add margin or recenter the drawing."));
    }
  }

  return checks;
}

function checkVisualFootprint(document: Box, visualBounds: Box | undefined): ArtworkReviewCheck {
  if (!visualBounds) {
    return fail("visual-footprint", "No visible non-background vector artwork was found.");
  }

  const coverage = (visualBounds.width * visualBounds.height) / (document.width * document.height);
  if (coverage < 0.04) {
    return fail("visual-footprint", `The visible artwork is too small on the artboard (${percent(coverage)} footprint).`);
  }

  if (coverage < 0.12) {
    return warn("visual-footprint", `The visible artwork is small on the artboard (${percent(coverage)} footprint); enlarge the main subject.`);
  }

  if (coverage > 0.96) {
    return warn("visual-footprint", "The artwork nearly fills the entire artboard; add margin so it does not feel cropped.");
  }

  return pass("visual-footprint", `The visible artwork occupies a readable artboard footprint (${percent(coverage)}).`);
}

function checkVisualRichness(prompt: string, visualElements: SceneElement[], target: string | undefined): ArtworkReviewCheck {
  const expected = expectedVisualParts(prompt, target);
  if (visualElements.length < 3) {
    return fail("visual-richness", `Only ${visualElements.length} visible non-background vector element(s) were found; this is too sparse to judge as a finished drawing.`);
  }

  if (visualElements.length < expected) {
    return warn("visual-richness", `The scene has ${visualElements.length} visible non-background vector element(s); add more named parts, structure, or visual context.`);
  }

  return pass("visual-richness", `The scene has ${visualElements.length} visible non-background vector element(s).`);
}

function checkTextReliance(textElements: Array<Extract<SceneElement, { type: "text" }>>, visualElements: SceneElement[], target: string | undefined): ArtworkReviewCheck {
  const visualNonTextCount = visualElements.filter((element) => element.type !== "text").length;
  const targetText = target ? textElements.filter((element) => new RegExp(`\\b${escapeRegex(target)}\\b`, "i").test(element.text)) : [];

  if (targetText.length > 0 && visualNonTextCount < 4) {
    return fail("text-reliance", `The artwork includes text spelling out ${target} without enough supporting vector structure; the object should be recognizable from shapes, not labels.`);
  }

  if (textElements.length > 0 && visualNonTextCount < 4) {
    return fail("text-reliance", "The drawing relies on text more than visible shapes; add concrete vector forms before accepting it.");
  }

  if (textElements.length > visualNonTextCount * 0.75) {
    return warn("text-reliance", "The scene has many text labels relative to visual parts; reduce label reliance or add stronger shapes.");
  }

  return pass("text-reliance", textElements.length === 0 ? "The scene does not rely on text labels." : "Text labels, including any subject label, are supported by enough visible vector artwork.");
}

function checkFraming(document: Box, visualBounds: Box | undefined): ArtworkReviewCheck {
  if (!visualBounds) {
    return fail("framing", "No visual bounds were found for framing review.");
  }

  const minMargin = Math.min(visualBounds.left - document.left, visualBounds.top - document.top, document.right - visualBounds.right, document.bottom - visualBounds.bottom);
  const marginRatio = minMargin / Math.min(document.width, document.height);
  if (marginRatio < -0.01) {
    return fail("framing", "The visible artwork extends beyond the artboard.");
  }

  if (marginRatio < 0.02) {
    return warn("framing", "The visible artwork is very close to an artboard edge; recenter it or add margin.");
  }

  return pass("framing", "The visible artwork has usable margin around the subject.");
}

function checkNamedEditableParts(elements: SceneElement[]): ArtworkReviewCheck {
  const unnamed = elements.filter((element) => !element.name || element.name.trim().length === 0);
  if (unnamed.length > 0) {
    return warn("editable-parts", `${unnamed.length} scene element(s) are unnamed, which makes iterative edits less reliable.`);
  }

  return pass("editable-parts", "All scene elements are named for future edit passes.");
}

function expectedVisualParts(prompt: string, target: string | undefined): number {
  const text = `${prompt} ${target ?? ""}`.toLowerCase();
  if (/\b(scientific|concept|mechanism|membrane|polymer|reaction|catalytic|bioseparations|workflow|system)\b/.test(text)) {
    return 24;
  }

  if (target || /\b(cat|lock|key|object|icon)\b/.test(text)) {
    return 10;
  }

  return 6;
}

function documentBox(scene: CartoonScene): Box {
  const width = scene.document?.width ?? 720;
  const height = scene.document?.height ?? 480;
  return { name: "document", left: 0, top: 0, right: width, bottom: height, width, height };
}

function elementBox(element: SceneElement): Box | undefined {
  if (element.type === "rect" || element.type === "ellipse") {
    return makeBox(element.name ?? element.type, element.x, element.y, element.x + element.width, element.y + element.height);
  }

  if (element.type === "line") {
    return makeBox(element.name ?? element.type, Math.min(element.x, element.x2), Math.min(element.y, element.y2), Math.max(element.x, element.x2), Math.max(element.y, element.y2));
  }

  if (element.type === "polygon") {
    return pointBox(element.name ?? element.type, element.points);
  }

  if (element.type === "path") {
    return pointBox(
      element.name ?? element.type,
      element.points
        .flatMap((point) => [
          { x: point.x, y: point.y },
          point.leftX === undefined || point.leftY === undefined ? undefined : { x: point.leftX, y: point.leftY },
          point.rightX === undefined || point.rightY === undefined ? undefined : { x: point.rightX, y: point.rightY }
        ])
        .filter((point): point is { x: number; y: number } => Boolean(point))
    );
  }

  if (element.type === "compound_path") {
    return pointBox(element.name ?? element.type, element.subpaths.flatMap((subpath) => subpath.points.flatMap((point) => [
      { x: point.x, y: point.y },
      point.leftX === undefined || point.leftY === undefined ? undefined : { x: point.leftX, y: point.leftY },
      point.rightX === undefined || point.rightY === undefined ? undefined : { x: point.rightX, y: point.rightY }
    ]).filter((point): point is { x: number; y: number } => Boolean(point))));
  }

  const size = element.size ?? 18;
  return makeBox(element.name ?? element.type, element.x, element.y - size, element.x + Math.max(size, element.text.length * size * 0.55), element.y);
}

function pointBox(name: string, points: Array<{ x: number; y: number }>): Box | undefined {
  if (points.length === 0) {
    return undefined;
  }

  return makeBox(name, Math.min(...points.map((point) => point.x)), Math.min(...points.map((point) => point.y)), Math.max(...points.map((point) => point.x)), Math.max(...points.map((point) => point.y)));
}

function makeBox(name: string, left: number, top: number, right: number, bottom: number): Box | undefined {
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return undefined;
  }

  if (left === right) {
    left -= 0.5;
    right += 0.5;
  }

  if (top === bottom) {
    top -= 0.5;
    bottom += 0.5;
  }

  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return undefined;
  }

  return { name, left, top, right, bottom, width, height };
}

function unionBox(name: string, boxes: Box[]): Box | undefined {
  if (boxes.length === 0) {
    return undefined;
  }

  return makeBox(name, Math.min(...boxes.map((box) => box.left)), Math.min(...boxes.map((box) => box.top)), Math.max(...boxes.map((box) => box.right)), Math.max(...boxes.map((box) => box.bottom)));
}

function isBackgroundElement(element: SceneElement): boolean {
  return /\b(background|backdrop|ground shadow|shadow)\b/i.test(element.name ?? "");
}

function isDrawableElement(element: SceneElement): boolean {
  const opacity = element.style?.opacity ?? 100;
  if (opacity <= 2) {
    return false;
  }

  if (element.type === "text") {
    return element.text.trim().length > 0;
  }

  const fill = element.style?.fill;
  const stroke = element.style?.stroke;
  const strokeWidth = element.style?.strokeWidth ?? 1;
  return isPaintVisible(fill) || (isPaintVisible(stroke) && strokeWidth > 0);
}

function isPaintVisible(value: string | null | undefined): boolean {
  if (value === undefined) {
    return true;
  }

  if (value === null) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "none" && normalized !== "transparent" && !/^#[0-9a-f]{6}00$/i.test(normalized);
}

function makeNextPrompt(prompt: string, improvements: string[], target: string | undefined): string {
  const basePrompt = baseArtworkPrompt(prompt);
  const clipped = improvements.slice(0, 6).map((issue) => `- ${issue}`).join("\n");
  const targetSentence = target ? `Make the ${target} recognizable from the vector shapes alone. ` : "";
  return [
    `Revise the Illustrator artwork for: ${basePrompt}`,
    `${targetSentence}Keep the original intent, but improve the current drawing before accepting it.`,
    "Fix these review findings:",
    clipped,
    "Return a complete updated scene with concrete named vector elements, stronger silhouette/framing, readable scale, and no label reliance."
  ].join("\n");
}

function baseArtworkPrompt(prompt: string): string {
  let current = prompt.trim();
  for (let depth = 0; depth < 6; depth += 1) {
    const firstLine = current.split(/\r?\n/, 1)[0]?.trim() ?? "";
    const match = firstLine.match(/^Revise the Illustrator artwork for:\s*(.+)$/i);
    if (!match) {
      return firstLine || current || "the requested artwork";
    }
    current = match[1].trim();
  }

  return current || "the requested artwork";
}

function scoreCheck(check: ArtworkReviewCheck): number {
  if (check.status === "pass") return 1;
  if (check.status === "warn") return 0.6;
  return 0;
}

function pass(id: string, message: string, evidence?: string[]): ArtworkReviewCheck {
  return { id, status: "pass", message, evidence };
}

function warn(id: string, message: string, evidence?: string[]): ArtworkReviewCheck {
  return { id, status: "warn", message, evidence };
}

function fail(id: string, message: string, evidence?: string[]): ArtworkReviewCheck {
  return { id, status: "fail", message, evidence };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
