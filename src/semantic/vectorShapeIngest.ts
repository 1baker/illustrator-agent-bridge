import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import type { CartoonScene, SceneElement } from "../bridge/types.js";
import type { SemanticItem } from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([".ai", ".ait", ".eps", ".pdf", ".svg", ".json"]);
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_LIMIT = 200;

export interface VectorShapeInspectionOptions {
  limit?: number;
  maxBytes?: number;
}

export interface MergeShapeCombinationOptions {
  sourceCorpusPath?: string;
  outputCorpusPath: string;
}

export interface ShapeCombinationProfile {
  path: string;
  sourceKind: "svg" | "bridge_scene_json" | "illustrator_ai" | "eps" | "pdf" | "vector_text";
  title: string;
  shapeCounts: Record<string, number>;
  totalShapes: number;
  names: string[];
  relations: string[];
  colors: string[];
  inferredTags: string[];
  item: SemanticItem;
}

export interface MergeShapeCombinationResult {
  outputCorpusPath: string;
  baseItemCount: number;
  learnedItemCount: number;
  writtenItemCount: number;
}

export async function inspectVectorShapeFiles(
  inputs: string[],
  options: VectorShapeInspectionOptions = {}
): Promise<ShapeCombinationProfile[]> {
  if (inputs.length === 0) {
    throw new Error("At least one vector file or directory path is required.");
  }

  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 10_000));
  const files = await collectVectorFiles(inputs, limit);
  const profiles: ShapeCombinationProfile[] = [];

  for (const file of files) {
    const text = await readTextPrefix(file, options.maxBytes ?? DEFAULT_MAX_BYTES);
    const profile = profileVectorText(file, text);
    if (profile.totalShapes > 0 || profile.names.length > 0) {
      profiles.push(profile);
    }
  }

  return profiles;
}

export async function mergeShapeCombinationItems(
  items: SemanticItem[],
  options: MergeShapeCombinationOptions
): Promise<MergeShapeCombinationResult> {
  const outputCorpusPath = resolve(options.outputCorpusPath);
  const sourceCorpusPath = resolve(options.sourceCorpusPath ?? options.outputCorpusPath);
  const baseItems = await readCorpusIfExists(sourceCorpusPath);
  const byId = new Map<string, SemanticItem>();

  for (const item of baseItems) {
    byId.set(item.id, item);
  }

  for (const item of items) {
    byId.set(item.id, item);
  }

  const merged = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
  await mkdir(dirname(outputCorpusPath), { recursive: true });
  await writeFile(outputCorpusPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  return {
    outputCorpusPath,
    baseItemCount: baseItems.length,
    learnedItemCount: items.length,
    writtenItemCount: merged.length
  };
}

async function collectVectorFiles(inputs: string[], limit: number): Promise<string[]> {
  const files: string[] = [];
  const queue = inputs.map((input) => resolve(input));

  while (queue.length > 0 && files.length < limit) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let currentStat;
    try {
      currentStat = await stat(current);
    } catch {
      continue;
    }

    if (currentStat.isDirectory()) {
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
          continue;
        }
        queue.push(resolve(current, entry.name));
      }
      continue;
    }

    if (currentStat.isFile() && SUPPORTED_EXTENSIONS.has(extname(current).toLowerCase())) {
      files.push(current);
    }
  }

  return files;
}

async function readTextPrefix(path: string, maxBytes: number): Promise<string> {
  const buffer = await readFile(path);
  return buffer.subarray(0, Math.max(1, maxBytes)).toString("utf8");
}

function profileVectorText(path: string, text: string): ShapeCombinationProfile {
  const ext = extname(path).toLowerCase();
  const scene = ext === ".json" ? parseSceneJson(text) : undefined;

  if (scene) {
    return sceneProfile(path, scene);
  }

  if (/<svg\b/i.test(text) || ext === ".svg") {
    return svgProfile(path, text);
  }

  return operatorProfile(path, text);
}

function sceneProfile(path: string, scene: CartoonScene): ShapeCombinationProfile {
  const shapeCounts = countBy(scene.elements.map((element) => element.type));
  const names = uniqueStrings(scene.elements.map((element) => element.name).filter((name): name is string => Boolean(name)));
  const colors = uniqueStrings(scene.elements.flatMap((element) => [element.style?.fill, element.style?.stroke]).filter(isColorValue)).slice(0, 12);
  const relations = sceneShapeRelations(scene.elements);
  const inferredTags = inferTags(path, names, Object.keys(shapeCounts));
  return makeProfile({
    path,
    sourceKind: "bridge_scene_json",
    shapeCounts,
    names,
    relations,
    colors,
    inferredTags,
    extraText: "The file is a bridge scene JSON with explicit named Illustrator vector elements and measurable part geometry."
  });
}

function svgProfile(path: string, text: string): ShapeCombinationProfile {
  const tagMatches = [...text.matchAll(/<\s*(path|rect|circle|ellipse|line|polygon|polyline|text|g)\b/gi)].map((match) => match[1].toLowerCase());
  const shapeCounts = countBy(tagMatches);
  const names = uniqueStrings([
    ...matches(text, /\b(?:id|class|inkscape:label|aria-label)=["']([^"']{1,160})["']/gi),
    ...matches(text, /<title>([^<]{1,160})<\/title>/gi)
  ])
    .map(cleanName)
    .filter(Boolean)
    .slice(0, 40);
  const colors = uniqueStrings([
    ...matches(text, /#[0-9a-fA-F]{3,8}\b/g),
    ...matches(text, /\b(?:fill|stroke)=["']([^"']{1,40})["']/gi).filter((value) => value !== "none")
  ]).slice(0, 16);
  const relations = svgShapeRelations(text);
  const pathCommandText = summarizePathCommands(text);
  const inferredTags = inferTags(path, names, Object.keys(shapeCounts));
  return makeProfile({
    path,
    sourceKind: "svg",
    shapeCounts,
    names,
    relations,
    colors,
    inferredTags,
    extraText: pathCommandText ? `SVG path commands include ${pathCommandText}.` : "SVG uses explicit vector element tags and measurable element geometry when coordinates are present."
  });
}

function operatorProfile(path: string, text: string): ShapeCombinationProfile {
  const ext = extname(path).toLowerCase();
  const sourceKind = sourceKindForText(ext, text);
  const shapeCounts: Record<string, number> = {};

  const rectangleOperators = countPattern(text, /(?:^|\s)\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+re(?:\s|$)/g);
  const moveOperators = countPattern(text, /(?:^|\s)m(?:\s|$)/g) + countPattern(text, /\bmoveto\b/gi);
  const lineOperators = countPattern(text, /(?:^|\s)l(?:\s|$)/g) + countPattern(text, /\blineto\b/gi);
  const curveOperators = countPattern(text, /(?:^|\s)c(?:\s|$)/g) + countPattern(text, /\bcurveto\b/gi);
  const fillOperators = countPattern(text, /(?:^|\s)f\*?(?:\s|$)/g) + countPattern(text, /\bfill\b/gi);
  const strokeOperators = countPattern(text, /(?:^|\s)S(?:\s|$)/g) + countPattern(text, /\bstroke\b/gi);

  if (rectangleOperators > 0) shapeCounts.rect = rectangleOperators;
  if (moveOperators > 0 || lineOperators > 0 || curveOperators > 0) shapeCounts.path = moveOperators + lineOperators + curveOperators;
  if (fillOperators > 0) shapeCounts.fill = fillOperators;
  if (strokeOperators > 0) shapeCounts.stroke = strokeOperators;

  const names = uniqueStrings([
    ...matches(text, /\/Title\s*\(([^)]{1,160})\)/g),
    ...matches(text, /%%Title:\s*(.{1,160})/g),
    ...matches(text, /\/LayerName\s*\(([^)]{1,160})\)/g)
  ])
    .map(cleanName)
    .filter(Boolean)
    .slice(0, 30);
  const colors = uniqueStrings(matches(text, /#[0-9a-fA-F]{3,8}\b/g)).slice(0, 12);
  const inferredTags = inferTags(path, names, Object.keys(shapeCounts));
  return makeProfile({
    path,
    sourceKind,
    shapeCounts,
    names,
    colors,
    inferredTags,
    extraText: "The file was inspected through text-readable vector operators rather than full artwork rendering."
  });
}

function makeProfile(input: {
  path: string;
  sourceKind: ShapeCombinationProfile["sourceKind"];
  shapeCounts: Record<string, number>;
  names: string[];
  relations?: string[];
  colors: string[];
  inferredTags: string[];
  extraText: string;
}): ShapeCombinationProfile {
  const totalShapes = Object.values(input.shapeCounts).reduce((total, count) => total + count, 0);
  const title = basename(input.path);
  const pathContext = sourcePathContext(input.path);
  const shapeSummary = Object.entries(input.shapeCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `${count} ${name}`)
    .join(", ");
  const namesSummary = input.names.length > 0 ? `Named parts include ${input.names.slice(0, 12).join(", ")}.` : "No named vector parts were found.";
  const relations = input.relations ?? [];
  const relationSummary =
    relations.length > 0
      ? `Spatial part relationships include ${relations.slice(0, 18).join("; ")}.`
      : "Spatial part relationships were not detected.";
  const colorSummary = input.colors.length > 0 ? `Colors include ${input.colors.slice(0, 8).join(", ")}.` : "No explicit colors were found.";
  const text = [
    `${title} is a ${input.sourceKind} vector source with ${totalShapes} detected shape/operator signal(s).`,
    pathContext ? `Source path context: ${pathContext}.` : "",
    shapeSummary ? `Shape combination: ${shapeSummary}.` : "Shape combination counts were not detected.",
    namesSummary,
    relationSummary,
    colorSummary,
    input.extraText,
    "Use this as reviewed shape-combination evidence for semantic retrieval and future Illustrator recipe refinement."
  ].join(" ");

  return {
    path: input.path,
    sourceKind: input.sourceKind,
    title,
    shapeCounts: input.shapeCounts,
    totalShapes,
    names: input.names,
    relations,
    colors: input.colors,
    inferredTags: input.inferredTags,
    item: {
      id: `shapecombo.${slug(title)}.${hashText(`${input.path}\n${text}`).slice(0, 12)}`,
      kind: "shape_combination",
      title: `Shape combination: ${title}`,
      text,
      tags: uniqueStrings(["shape", "combination", "vector", input.sourceKind, ...input.inferredTags]),
      source: input.path
    }
  };
}

function sourcePathContext(path: string): string {
  const directoryContext = path.split(/[\\/]+/).filter(Boolean).slice(-10, -1).map(cleanName);
  const stagedNameContext = stagedSourceNameContext(basename(path));
  return uniqueStrings([...directoryContext, ...stagedNameContext])
    .filter((part) => !/^(home|users|bak3r|baker|projects|illustrator-agent-bridge|var|drive-vector-search|staged-svg|staged-svg-context|staged-vector-context)$/i.test(part))
    .join(" / ");
}

function stagedSourceNameContext(name: string): string[] {
  const stem = name.slice(0, name.length - extname(name).length);
  const tokens = stem
    .split(/_+/g)
    .map(cleanName)
    .filter(Boolean);
  const startIndex = tokens.findIndex((token) => /^(my|core-shell|saber|cochran|soy|soylei|project|papers|bioseparations|chemdraw)$/i.test(token));
  if (startIndex < 0) {
    return [];
  }

  const meaningful = tokens.slice(startIndex).filter((token) => !/^[A-Za-z]$/.test(token));
  return meaningful.length > 0 ? [meaningful.join(" ")] : [];
}

function parseSceneJson(text: string): CartoonScene | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    const candidate = sceneCandidate(parsed);
    if (candidate && Array.isArray(candidate.elements)) {
      return candidate as unknown as CartoonScene;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function sceneCandidate(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.elements)) {
    return record;
  }

  const scene = record.scene;
  if (typeof scene === "object" && scene !== null && !Array.isArray(scene) && Array.isArray((scene as Record<string, unknown>).elements)) {
    return scene as Record<string, unknown>;
  }

  const plan = record.plan;
  if (typeof plan === "object" && plan !== null && !Array.isArray(plan)) {
    const planScene = (plan as Record<string, unknown>).scene;
    if (typeof planScene === "object" && planScene !== null && !Array.isArray(planScene)) {
      return planScene as Record<string, unknown>;
    }
  }

  return undefined;
}

interface RelationBox {
  name: string;
  type: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function sceneShapeRelations(elements: SceneElement[]): string[] {
  const boxes = elements
    .filter((element) => !isBackgroundName(element.name))
    .map(sceneElementBox)
    .filter((box): box is RelationBox => Boolean(box))
    .slice(0, 60);
  return shapeRelationsFromBoxes(boxes);
}

function svgShapeRelations(text: string): string[] {
  const boxes = [...text.matchAll(/<\s*(rect|circle|ellipse|line|polygon|polyline|path|text)\b([^>]*)>/gi)]
    .map((match, index) => svgElementBox(match[1].toLowerCase(), parseSvgAttributes(match[2] ?? ""), index))
    .filter((box): box is RelationBox => Boolean(box))
    .filter((box) => !isBackgroundName(box.name))
    .slice(0, 80);
  return shapeRelationsFromBoxes(boxes);
}

function shapeRelationsFromBoxes(boxes: RelationBox[]): string[] {
  const relations: string[] = [];

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const left = boxes[i];
      const right = boxes[j];
      if (!left || !right) continue;
      relations.push(...relationshipPhrases(left, right));
      if (relations.length >= 80) {
        return uniqueStrings(relations).slice(0, 80);
      }
    }
  }

  return uniqueStrings(relations).slice(0, 80);
}

function relationshipPhrases(first: RelationBox, second: RelationBox): string[] {
  const phrases: string[] = [];
  const firstName = cleanRelationName(first.name);
  const secondName = cleanRelationName(second.name);
  let contained = false;

  if (containsBox(first, second)) {
    phrases.push(`${secondName} inside ${firstName}`);
    contained = true;
  } else if (containsBox(second, first)) {
    phrases.push(`${firstName} inside ${secondName}`);
    contained = true;
  }

  if (contained) {
    return phrases;
  }

  if (isAbove(first, second)) {
    phrases.push(`${firstName} above ${secondName}`);
  } else if (isAbove(second, first)) {
    phrases.push(`${secondName} above ${firstName}`);
  }

  if (isLeftOf(first, second)) {
    phrases.push(`${firstName} left of ${secondName}`);
  } else if (isLeftOf(second, first)) {
    phrases.push(`${secondName} left of ${firstName}`);
  }

  if (overlaps(first, second)) {
    phrases.push(`${firstName} overlaps ${secondName}`);
  } else if (isAttached(first, second)) {
    phrases.push(`${firstName} attached to ${secondName}`);
  }

  return phrases;
}

function sceneElementBox(element: SceneElement): RelationBox | undefined {
  if (element.type === "rect" || element.type === "ellipse") {
    return makeRelationBox(element.name ?? element.type, element.type, element.x, element.y, element.x + element.width, element.y + element.height);
  }

  if (element.type === "line") {
    return makeRelationBox(element.name ?? element.type, element.type, Math.min(element.x, element.x2), Math.min(element.y, element.y2), Math.max(element.x, element.x2), Math.max(element.y, element.y2));
  }

  if (element.type === "polygon") {
    return pointRelationBox(element.name ?? element.type, element.type, element.points);
  }

  if (element.type === "path") {
    return pointRelationBox(element.name ?? element.type, element.type, element.points.flatMap((point) => [
      { x: point.x, y: point.y },
      point.leftX === undefined || point.leftY === undefined ? undefined : { x: point.leftX, y: point.leftY },
      point.rightX === undefined || point.rightY === undefined ? undefined : { x: point.rightX, y: point.rightY }
    ]).filter((point): point is { x: number; y: number } => Boolean(point)));
  }

  if (element.type === "compound_path") {
    return pointRelationBox(element.name ?? element.type, element.type, element.subpaths.flatMap((subpath) => subpath.points.flatMap((point) => [
      { x: point.x, y: point.y },
      point.leftX === undefined || point.leftY === undefined ? undefined : { x: point.leftX, y: point.leftY },
      point.rightX === undefined || point.rightY === undefined ? undefined : { x: point.rightX, y: point.rightY }
    ]).filter((point): point is { x: number; y: number } => Boolean(point))));
  }

  const size = element.size ?? 18;
  return makeRelationBox(element.name ?? element.type, element.type, element.x, element.y - size, element.x + element.text.length * size * 0.55, element.y);
}

function svgElementBox(tag: string, attrs: Record<string, string>, index: number): RelationBox | undefined {
  if (!isSvgVisible(attrs)) {
    return undefined;
  }

  const name = svgElementName(tag, attrs, index);
  if (tag === "rect") {
    const x = svgNumber(attrs.x) ?? 0;
    const y = svgNumber(attrs.y) ?? 0;
    const width = svgNumber(attrs.width);
    const height = svgNumber(attrs.height);
    if (width === undefined || height === undefined) return undefined;
    return makeRelationBox(name, tag, x, y, x + width, y + height);
  }

  if (tag === "circle") {
    const cx = svgNumber(attrs.cx) ?? 0;
    const cy = svgNumber(attrs.cy) ?? 0;
    const r = svgNumber(attrs.r);
    if (r === undefined) return undefined;
    return makeRelationBox(name, tag, cx - r, cy - r, cx + r, cy + r);
  }

  if (tag === "ellipse") {
    const cx = svgNumber(attrs.cx) ?? 0;
    const cy = svgNumber(attrs.cy) ?? 0;
    const rx = svgNumber(attrs.rx);
    const ry = svgNumber(attrs.ry);
    if (rx === undefined || ry === undefined) return undefined;
    return makeRelationBox(name, tag, cx - rx, cy - ry, cx + rx, cy + ry);
  }

  if (tag === "line") {
    const x1 = svgNumber(attrs.x1);
    const y1 = svgNumber(attrs.y1);
    const x2 = svgNumber(attrs.x2);
    const y2 = svgNumber(attrs.y2);
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return undefined;
    return makeRelationBox(name, tag, Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
  }

  if (tag === "polygon" || tag === "polyline") {
    return pointRelationBox(name, tag, parsePointList(attrs.points ?? ""));
  }

  if (tag === "path") {
    return pointRelationBox(name, tag, parsePathCoordinatePairs(attrs.d ?? ""));
  }

  if (tag === "text") {
    const x = svgNumber(attrs.x);
    const y = svgNumber(attrs.y);
    const size = svgNumber(attrs["font-size"], 18) ?? 18;
    if (x === undefined || y === undefined) return undefined;
    const estimatedWidth = Math.max(size, (attrs["data-text"] ?? attrs.id ?? attrs.class ?? tag).length * size * 0.55);
    return makeRelationBox(name, tag, x, y - size, x + estimatedWidth, y);
  }

  return undefined;
}

function pointRelationBox(name: string, type: string, points: Array<{ x: number; y: number }>): RelationBox | undefined {
  if (points.length === 0) {
    return undefined;
  }

  return makeRelationBox(
    name,
    type,
    Math.min(...points.map((point) => point.x)),
    Math.min(...points.map((point) => point.y)),
    Math.max(...points.map((point) => point.x)),
    Math.max(...points.map((point) => point.y))
  );
}

function makeRelationBox(name: string, type: string, left: number, top: number, right: number, bottom: number): RelationBox | undefined {
  if (left === right && top === bottom) {
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

  return { name, type, left, top, right, bottom, width, height };
}

function containsBox(outer: RelationBox, inner: RelationBox): boolean {
  return inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;
}

function isAbove(upper: RelationBox, lower: RelationBox): boolean {
  return centerY(upper) < centerY(lower) && verticalGap(upper, lower) < Math.max(upper.height, lower.height) * 0.55 && horizontalOverlap(upper, lower) > Math.min(upper.width, lower.width) * 0.2;
}

function isLeftOf(left: RelationBox, right: RelationBox): boolean {
  return centerX(left) < centerX(right) && horizontalGap(left, right) < Math.max(left.width, right.width) * 0.55 && verticalOverlap(left, right) > Math.min(left.height, right.height) * 0.2;
}

function overlaps(first: RelationBox, second: RelationBox): boolean {
  return horizontalOverlap(first, second) > 0 && verticalOverlap(first, second) > 0;
}

function isAttached(first: RelationBox, second: RelationBox): boolean {
  return (
    horizontalGap(first, second) <= Math.min(first.width, second.width) * 0.12 && verticalOverlap(first, second) > 0
  ) || (
    verticalGap(first, second) <= Math.min(first.height, second.height) * 0.12 && horizontalOverlap(first, second) > 0
  );
}

function centerX(box: RelationBox): number {
  return (box.left + box.right) / 2;
}

function centerY(box: RelationBox): number {
  return (box.top + box.bottom) / 2;
}

function horizontalOverlap(first: RelationBox, second: RelationBox): number {
  return Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
}

function verticalOverlap(first: RelationBox, second: RelationBox): number {
  return Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
}

function horizontalGap(first: RelationBox, second: RelationBox): number {
  if (first.right < second.left) return second.left - first.right;
  if (second.right < first.left) return first.left - second.right;
  return 0;
}

function verticalGap(first: RelationBox, second: RelationBox): number {
  if (first.bottom < second.top) return second.top - first.bottom;
  if (second.bottom < first.top) return first.top - second.bottom;
  return 0;
}

function cleanRelationName(value: string): string {
  return cleanName(value).toLowerCase();
}

function isBackgroundName(value: string | undefined): boolean {
  return /\b(background|backdrop|ground shadow|shadow)\b/i.test(value ?? "");
}

function parseSvgAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']*)["']/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function svgElementName(tag: string, attrs: Record<string, string>, index: number): string {
  return cleanName(attrs.id ?? attrs["inkscape:label"] ?? attrs["aria-label"] ?? attrs.class ?? `${tag} ${index + 1}`);
}

function isSvgVisible(attrs: Record<string, string>): boolean {
  const style = parseSvgStyle(attrs.style ?? "");
  const display = (attrs.display ?? style.display ?? "").trim().toLowerCase();
  const visibility = (attrs.visibility ?? style.visibility ?? "").trim().toLowerCase();
  const opacity = svgNumber(attrs.opacity ?? style.opacity);
  if (display === "none" || visibility === "hidden" || visibility === "collapse" || (opacity !== undefined && opacity <= 0.02)) {
    return false;
  }

  const fill = attrs.fill ?? style.fill;
  const stroke = attrs.stroke ?? style.stroke;
  if (fill === undefined && stroke === undefined) {
    return true;
  }

  const strokeWidth = svgNumber(attrs["stroke-width"] ?? style["stroke-width"], 1) ?? 1;
  return isSvgPaintVisible(fill) || (isSvgPaintVisible(stroke) && strokeWidth > 0);
}

function parseSvgStyle(style: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const chunk of style.split(";")) {
    const [key, ...valueParts] = chunk.split(":");
    const value = valueParts.join(":").trim();
    if (key && value) {
      attrs[key.trim()] = value;
    }
  }
  return attrs;
}

function isSvgPaintVisible(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized === "none" || normalized === "transparent") {
    return false;
  }

  return !/^#[0-9a-f]{6}00$/i.test(normalized);
}

function svgNumber(value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePointList(points: string): Array<{ x: number; y: number }> {
  const values = numericValues(points);
  const parsed: Array<{ x: number; y: number }> = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    parsed.push({ x: values[index], y: values[index + 1] });
  }
  return parsed;
}

function parsePathCoordinatePairs(pathData: string): Array<{ x: number; y: number }> {
  return parsePointList(pathData);
}

function numericValues(text: string): number[] {
  return [...text.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)]
    .map((match) => Number.parseFloat(match[0]))
    .filter((value) => Number.isFinite(value));
}

function summarizePathCommands(text: string): string {
  const commands = [...text.matchAll(/\bd=["']([^"']{1,5000})["']/gi)]
    .flatMap((match) => [...match[1].matchAll(/[MLCQAZHVST]/gi)].map((command) => command[0].toUpperCase()));
  const counts = countBy(commands);
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([command, count]) => `${count} ${command}`)
    .join(", ");
}

function sourceKindForText(ext: string, text: string): ShapeCombinationProfile["sourceKind"] {
  if (ext === ".ai" || ext === ".ait" || /^%!PS-Adobe.*Adobe Illustrator/im.test(text) || /%AI\d_/i.test(text)) {
    return "illustrator_ai";
  }

  if (ext === ".eps" || /^%!PS-Adobe/im.test(text)) {
    return "eps";
  }

  if (ext === ".pdf" || text.startsWith("%PDF")) {
    return "pdf";
  }

  return "vector_text";
}

function inferTags(path: string, names: string[], shapeTypes: string[]): string[] {
  const text = `${basename(path)} ${names.join(" ")} ${shapeTypes.join(" ")}`.toLowerCase();
  const candidateTags = [
    "cat",
    "feline",
    "head",
    "ear",
    "eye",
    "nose",
    "whisker",
    "tail",
    "paw",
    "lock",
    "padlock",
    "shackle",
    "keyhole",
    "key",
    "bow",
    "ring",
    "shaft",
    "tooth",
    "teeth",
    "molecule",
    "polymer",
    "membrane",
    "arrow",
    "circle",
    "ellipse",
    "rect",
    "path",
    "line",
    "polygon",
    "text",
    "saber",
    "soylei",
    "bioseparations",
    "chemdraw",
    "powder",
    "coating",
    "plastic",
    "rheology",
    "kinetics",
    "epoxy",
    "alkene",
    "viscosity",
    "biomag",
    "sustaincoat",
    "corrosion",
    "initiator",
    "conversion",
    "chemical",
    "structure",
    "figure",
    "diagram"
  ];

  return candidateTags.filter((tag) => hasTagToken(text, tag));
}

function hasTagToken(text: string, tag: string): boolean {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}s?([^a-z0-9]|$)`, "i").test(text);
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? match[0]).filter(Boolean);
}

function countPattern(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isColorValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0 && value !== "none";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function hashText(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

async function readCorpusIfExists(path: string): Promise<SemanticItem[]> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.filter((item): item is SemanticItem => typeof item === "object" && item !== null && !Array.isArray(item) && typeof (item as SemanticItem).id === "string");
  } catch {
    return [];
  }
}
