import { createHash } from "node:crypto";
import { normalizeScene } from "../core/sceneValidation.js";
import type { ScientificObject, VectorElement, VectorScene } from "../core/vectorScene.js";
import { canonicalJson } from "./figureProject.js";

export const VECTOR_REFINEMENT_POLICY = "scientific-vector-refinement.v1" as const;
export const VISUAL_QUALITY_POLICY = "scene-measured-visual-quality.v1" as const;

export interface ScientificSemanticState {
  schemaVersion: "ScientificSemanticState.v1";
  briefDigest: string;
  evidenceDigests: string[];
  sourceDataDigests: string[];
  componentIds: string[];
  relationships: Array<{ id: string; sourceId: string; predicate: string; targetId: string }>;
}

export interface ScientificPresentationState {
  schemaVersion: "ScientificPresentationState.v1";
  camera: { projection: "orthographic" | "oblique"; depth: number; framing: number };
  light: { directionDegrees: number; elevationDegrees: number; intensity: number };
  material: { faceContrast: number; highlightOpacity: number; shadowOpacity: number; textureOpacity: number };
  labels: { minimumClearance: number; anchors: Record<string, { x: number; y: number }> };
}

export interface PresentationMutationProposal {
  id: string;
  family: "camera" | "material" | "light" | "surface" | "labels" | "structure";
  changes: Array<{ path: string; before: number | string; after: number | string }>;
  inverseChanges: Array<{ path: string; before: number | string; after: number | string }>;
}

export interface ImmutableVectorApprovalPreimage {
  schemaVersion: "ImmutableVectorApprovalPreimage.v1";
  refinementPolicy: typeof VECTOR_REFINEMENT_POLICY;
  semanticStateDigest: string;
  presentationStateDigest: string;
  semanticSceneDigest: string;
  svgDigest: string;
  tikzDigest: string;
  pngDigest: string;
  generatorVersion: string;
  rendererVersion: string;
  mutationPolicyDigest: string;
  fontPolicyDigest: string;
  runtimeManifestDigest: string;
}

export interface VisualQualityMetrics {
  schemaVersion: "VisualQualityMetrics.v1";
  policyVersion: typeof VISUAL_QUALITY_POLICY;
  metrics: {
    semanticVisibilityRatio: number;
    semanticVectorCoverage: number;
    relationshipGeometryCoverage: number;
    namedElementRatio: number;
    whitespaceBalance: number;
    depthCueFamilyRatio: number;
    clippedTextureRatio: number;
    strokeConsistency: number;
    labelCollisionCount: number;
    offCanvasCount: number;
    hiddenRequiredObjectCount: number;
    detachedShadowCount: number;
    lightOrderViolationCount: number;
    embeddedRasterCount: number;
  };
  hardFailures: string[];
  score: number;
  digest: string;
}

export function digestValue(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function semanticStateFromScene(scene: VectorScene, provenance: Pick<ScientificSemanticState, "briefDigest" | "evidenceDigests" | "sourceDataDigests">): ScientificSemanticState {
  const objects = (scene.semantics?.objects ?? []).filter((object) => object.properties?.decorative !== true);
  const objectIds = new Set(objects.map((object) => object.id));
  return {
    schemaVersion: "ScientificSemanticState.v1",
    ...provenance,
    evidenceDigests: [...provenance.evidenceDigests].sort(),
    sourceDataDigests: [...provenance.sourceDataDigests].sort(),
    componentIds: objects.map((object) => object.id).sort(),
    relationships: (scene.semantics?.relationships ?? []).filter((relationship) => objectIds.has(relationship.sourceObjectId) && objectIds.has(relationship.targetObjectId)).map((relationship) => ({ id: relationship.id, sourceId: relationship.sourceObjectId, predicate: relationship.predicate, targetId: relationship.targetObjectId })).sort((left, right) => left.id.localeCompare(right.id))
  };
}

export function assertSemanticStateUnchanged(before: ScientificSemanticState, after: ScientificSemanticState): void {
  if (digestValue(before) !== digestValue(after)) throw new Error("presentation mutation changed immutable scientific semantic state");
}

export function createImmutableApprovalPreimage(input: Omit<ImmutableVectorApprovalPreimage, "schemaVersion" | "refinementPolicy">): ImmutableVectorApprovalPreimage {
  return { schemaVersion: "ImmutableVectorApprovalPreimage.v1", refinementPolicy: VECTOR_REFINEMENT_POLICY, ...input };
}

export function verifyImmutableApprovalPreimage(expectedDigest: string, preimage: ImmutableVectorApprovalPreimage): void {
  if (digestValue(preimage) !== expectedDigest) throw new Error("immutable vector approval preimage is stale");
}

export function applyPresentationMutation(state: ScientificPresentationState, proposal: PresentationMutationProposal): ScientificPresentationState {
  const allowed = new Set([
    "camera.depth", "camera.framing", "light.directionDegrees", "light.elevationDegrees", "light.intensity",
    "material.faceContrast", "material.highlightOpacity", "material.shadowOpacity", "material.textureOpacity", "labels.minimumClearance"
  ]);
  const next = structuredClone(state) as ScientificPresentationState;
  for (const change of proposal.changes) {
    if (!allowed.has(change.path)) throw new Error(`presentation mutation cannot change ${change.path}`);
    const [section, field] = change.path.split(".") as [keyof ScientificPresentationState, string];
    const record = next[section] as unknown as Record<string, unknown>;
    if (record[field] !== change.before) throw new Error(`presentation mutation ${proposal.id} has stale before value for ${change.path}`);
    record[field] = change.after;
  }
  return next;
}

/** Measure rendered-scene structure independently from the mutation parameter targets. */
export function evaluateVisualQuality(scene: VectorScene): VisualQualityMetrics {
  const width = scene.document?.width ?? 720;
  const height = scene.document?.height ?? 480;
  const visible = scene.elements.filter((element) => isVisibleInScene(element, scene));
  const byId = new Map(scene.elements.filter((element) => element.id).map((element) => [element.id!, element]));
  const objects = scene.semantics?.objects ?? [];
  const required = objects.filter((object) => object.properties?.decorative !== true);
  const visibleObjects = required.filter((object) => object.elementIds.some((id) => {
    const element = byId.get(id);
    return element !== undefined && isVisibleInScene(element, scene) && !isFullyOccluded(element, visible);
  }));
  const covered = required.filter((object) => object.elementIds.some((id) => {
    const element = byId.get(id);
    return element !== undefined && element.type !== "text";
  }));
  const boxes = visible.map((element) => ({ element, box: elementBounds(element) }));
  const outCanvas = boxes.filter(({ box }) => box.x < 0 || box.y < 0 || box.x2 > width || box.y2 > height);
  const labels = boxes.filter(({ element }) => element.type === "text");
  let labelCollisionCount = 0;
  for (let left = 0; left < labels.length; left += 1) for (let right = left + 1; right < labels.length; right += 1) if (intersects(labels[left]!.box, labels[right]!.box)) labelCollisionCount += 1;
  const content = union(boxes.filter(({ element }) => element.id !== "background").map(({ box }) => box));
  const leftMargin = content ? Math.max(0, content.x) : 0;
  const rightMargin = content ? Math.max(0, width - content.x2) : 0;
  const topMargin = content ? Math.max(0, content.y) : 0;
  const bottomMargin = content ? Math.max(0, height - content.y2) : 0;
  const horizontalBalance = 1 - Math.min(1, Math.abs(leftMargin - rightMargin) / Math.max(1, width));
  const verticalBalance = 1 - Math.min(1, Math.abs(topMargin - bottomMargin) / Math.max(1, height));
  const relationships = scene.semantics?.relationships ?? [];
  const visibleRelationshipGeometry = relationships.filter((relationship) => (relationship.visualElementIds ?? []).some((id) => {
    const element = byId.get(id);
    return element !== undefined && isVisibleInScene(element, scene);
  }));
  const depthFamilies = ["film-extrusion", ".extrusion-", "contact-shadow", "specular-highlight", "rim-light", "microtexture"].filter((token) => visible.some((element) => element.id?.includes(token))).length;
  const texture = visible.filter((element) => element.id?.includes("microtexture"));
  const clippedTexture = texture.filter((element) => Boolean(element.groupId));
  const strokeWidths = visible.map((element) => element.style?.strokeWidth).filter((value): value is number => typeof value === "number" && value > 0);
  const meanStroke = strokeWidths.length ? strokeWidths.reduce((sum, value) => sum + value, 0) / strokeWidths.length : 0;
  const strokeDeviation = strokeWidths.length ? Math.sqrt(strokeWidths.reduce((sum, value) => sum + (value - meanStroke) ** 2, 0) / strokeWidths.length) : 0;
  const shadows = visible.filter((element) => element.id?.endsWith(".contact-shadow"));
  const detachedShadowCount = shadows.filter((shadow) => {
    const target = byId.get(shadow.id!.replace(".contact-shadow", ".plate"));
    return target === undefined || !intersects(elementBounds(shadow), elementBounds(target));
  }).length;
  let lightOrderViolationCount = 0;
  for (const highlight of visible.filter((element) => element.id?.includes("highlight") || element.id?.includes("rim-light"))) if ((highlight.zIndex ?? 0) <= 0) lightOrderViolationCount += 1;
  for (const shadow of shadows) {
    const target = byId.get(shadow.id!.replace(".contact-shadow", ".plate"));
    if (target && (shadow.zIndex ?? 0) >= (target.zIndex ?? 0)) lightOrderViolationCount += 1;
  }
  const metrics = {
    semanticVisibilityRatio: ratio(visibleObjects.length, required.length),
    semanticVectorCoverage: ratio(covered.length, required.length),
    relationshipGeometryCoverage: ratio(visibleRelationshipGeometry.length, relationships.length),
    namedElementRatio: ratio(visible.filter((element) => Boolean(element.id && element.name)).length, visible.length),
    whitespaceBalance: Number(((horizontalBalance + verticalBalance) / 2).toFixed(4)),
    depthCueFamilyRatio: depthFamilies / 6,
    clippedTextureRatio: ratio(clippedTexture.length, texture.length),
    strokeConsistency: meanStroke === 0 ? 0 : Number(Math.max(0, 1 - strokeDeviation / meanStroke).toFixed(4)),
    labelCollisionCount,
    offCanvasCount: outCanvas.length,
    hiddenRequiredObjectCount: required.length - visibleObjects.length,
    detachedShadowCount,
    lightOrderViolationCount,
    embeddedRasterCount: 0
  };
  const hardFailures = [
    ...(metrics.hiddenRequiredObjectCount ? [`${metrics.hiddenRequiredObjectCount} required semantic object(s) are not visibly represented`] : []),
    ...(metrics.relationshipGeometryCoverage < 1 ? ["one or more semantic relationships lack visible geometry"] : []),
    ...(metrics.offCanvasCount ? [`${metrics.offCanvasCount} visible element(s) extend beyond the canvas`] : []),
    ...(metrics.labelCollisionCount ? [`${metrics.labelCollisionCount} label collision(s) were measured`] : []),
    ...(metrics.detachedShadowCount ? [`${metrics.detachedShadowCount} contact shadow(s) are detached`] : []),
    ...(metrics.lightOrderViolationCount ? [`${metrics.lightOrderViolationCount} light or shadow z-order violation(s) were measured`] : []),
    ...(metrics.embeddedRasterCount ? ["embedded raster content is forbidden in the editable scene"] : [])
  ];
  const score = Number(Math.max(0, Math.min(100,
    metrics.semanticVisibilityRatio * 18 + metrics.semanticVectorCoverage * 12 + metrics.relationshipGeometryCoverage * 8 + metrics.namedElementRatio * 8 +
    metrics.whitespaceBalance * 10 + metrics.depthCueFamilyRatio * 20 + metrics.clippedTextureRatio * 5 + metrics.strokeConsistency * 10 +
    (hardFailures.length === 0 ? 10 : 0) - hardFailures.length * 12
  )).toFixed(3));
  const body = { schemaVersion: "VisualQualityMetrics.v1" as const, policyVersion: VISUAL_QUALITY_POLICY, metrics, hardFailures, score };
  return { ...body, digest: digestValue(body) };
}

export interface GenericDepictionPrimitive {
  kind: "shell" | "membrane" | "slab" | "filament" | "porous_network" | "particle_population" | "vessel" | "cutaway" | "interface";
  componentId: string;
  materialRole: "soft_tissue" | "polymer" | "mineral" | "fluid" | "metal" | "glass" | "generic";
  geometryElementIds: string[];
}

export interface ScientificDepictionGrammar {
  schemaVersion: "ScientificDepictionGrammar.v1";
  subjectAdapter: string;
  primitives: GenericDepictionPrimitive[];
}

export function validateDepictionGrammar(grammar: ScientificDepictionGrammar, scene: VectorScene): void {
  const objectIds = new Set((scene.semantics?.objects ?? []).map((object) => object.id));
  const elementIds = new Set(scene.elements.map((element) => element.id));
  for (const primitive of grammar.primitives) {
    if (!objectIds.has(primitive.componentId)) throw new Error(`depiction primitive references unknown component ${primitive.componentId}`);
    if (!primitive.geometryElementIds.length || primitive.geometryElementIds.some((id) => !elementIds.has(id))) throw new Error(`depiction primitive ${primitive.componentId} references missing vector geometry`);
  }
}

/** Apply a subject-neutral editable shadow/highlight treatment to declared primitives. */
export function applyGenericDepictionGrammar(scene: VectorScene, grammar: ScientificDepictionGrammar, presentation: ScientificPresentationState): VectorScene {
  validateDepictionGrammar(grammar, scene);
  const sourceById = new Map(scene.elements.filter((element) => element.id).map((element) => [element.id!, element]));
  const additions: VectorElement[] = [];
  const decorativeObjects: ScientificObject[] = [];
  const radians = presentation.light.directionDegrees * Math.PI / 180;
  const shadowDistance = Math.max(2, presentation.camera.depth * 0.42);
  const shadowDx = Math.cos(radians) * shadowDistance;
  const shadowDy = Math.sin(radians) * shadowDistance;
  for (const primitive of grammar.primitives) {
    const cueIds: string[] = [];
    const materialColor = materialShadowColor(primitive.materialRole);
    for (const elementId of primitive.geometryElementIds) {
      const source = sourceById.get(elementId)!;
      if (source.type === "text") continue;
      const shadowId = `${elementId}.generic-shadow`;
      const highlightId = `${elementId}.generic-highlight`;
      additions.push(offsetVectorElement(source, shadowId, shadowDx, shadowDy, {
        fill: source.style?.fill === null ? null : materialColor,
        fillPaint: undefined,
        stroke: materialColor,
        strokePaint: undefined,
        strokeWidth: Math.max(1, source.style?.strokeWidth ?? 1.5),
        opacity: presentation.material.shadowOpacity,
        lineCap: source.style?.lineCap ?? "round",
        lineJoin: source.style?.lineJoin ?? "round"
      }, (source.zIndex ?? 0) - 1));
      additions.push(offsetVectorElement(source, highlightId, -1.2, -1.2, {
        fill: null,
        stroke: "#FFFFFF",
        strokeWidth: Math.max(1, (source.style?.strokeWidth ?? 1.5) * 0.72),
        opacity: presentation.material.highlightOpacity,
        lineCap: source.style?.lineCap ?? "round",
        lineJoin: source.style?.lineJoin ?? "round"
      }, (source.zIndex ?? 0) + 1));
      cueIds.push(shadowId, highlightId);
    }
    if (cueIds.length) decorativeObjects.push({ id: `${primitive.componentId}.depiction-cues`, kind: "editable_dimensional_cues", elementIds: cueIds, properties: { decorative: true, primitive: primitive.kind, materialRole: primitive.materialRole, subjectAdapter: grammar.subjectAdapter } });
  }
  return normalizeScene({
    ...scene,
    elements: [...scene.elements, ...additions],
    semantics: scene.semantics ? { objects: [...scene.semantics.objects, ...decorativeObjects], relationships: scene.semantics.relationships ?? [] } : undefined
  });
}

function offsetVectorElement(source: Exclude<VectorElement, { type: "text" }>, id: string, dx: number, dy: number, style: Exclude<VectorElement, { type: "text" }>["style"], zIndex: number): VectorElement {
  const common = { ...source, id, name: id, style, zIndex };
  if (source.type === "rect" || source.type === "ellipse") return { ...common, type: source.type, x: source.x + dx, y: source.y + dy, width: source.width, height: source.height };
  if (source.type === "line") return { ...common, type: "line", x: source.x + dx, y: source.y + dy, x2: source.x2 + dx, y2: source.y2 + dy };
  if (source.type === "polygon") return { ...common, type: "polygon", x: source.x + dx, y: source.y + dy, points: source.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  if (source.type === "path") return { ...common, type: "path", x: source.x + dx, y: source.y + dy, points: source.points.map((point) => offsetPathPoint(point, dx, dy)), closed: source.closed };
  return { ...common, type: "compound_path", x: source.x + dx, y: source.y + dy, fillRule: source.fillRule, subpaths: source.subpaths.map((subpath) => ({ ...subpath, points: subpath.points.map((point) => offsetPathPoint(point, dx, dy)) })) };
}

function offsetPathPoint<T extends { x: number; y: number; leftX?: number; leftY?: number; rightX?: number; rightY?: number }>(point: T, dx: number, dy: number): T {
  return { ...point, x: point.x + dx, y: point.y + dy, ...(point.leftX === undefined ? {} : { leftX: point.leftX + dx }), ...(point.leftY === undefined ? {} : { leftY: point.leftY + dy }), ...(point.rightX === undefined ? {} : { rightX: point.rightX + dx }), ...(point.rightY === undefined ? {} : { rightY: point.rightY + dy }) };
}

function materialShadowColor(role: GenericDepictionPrimitive["materialRole"]): string {
  return ({ soft_tissue: "#8F5360", polymer: "#405E66", mineral: "#5F6670", fluid: "#357A91", metal: "#48515C", glass: "#557B86", generic: "#495666" })[role];
}

function isVisible(element: VectorElement | undefined): element is VectorElement {
  return element !== undefined && element.visible !== false && (element.style?.opacity ?? 100) > 0;
}

function isVisibleInScene(element: VectorElement, scene: VectorScene): boolean {
  if (!isVisible(element)) return false;
  const groups = new Map((scene.groups ?? []).map((group) => [group.id, group]));
  let groupId = element.groupId;
  while (groupId) {
    const group = groups.get(groupId);
    if (!group || group.visible === false || (group.opacity ?? 100) <= 0) return false;
    if (group.clip && !intersects(elementBounds(element), clipBounds(group.clip))) return false;
    groupId = group.parentId;
  }
  return true;
}

function isFullyOccluded(element: VectorElement, visible: VectorElement[]): boolean {
  const box = elementBounds(element);
  return visible.some((cover) => {
    if (cover === element || (cover.zIndex ?? 0) <= (element.zIndex ?? 0) || (cover.style?.opacity ?? 100) < 98) return false;
    const hasFill = cover.style?.fillPaint !== undefined || (typeof cover.style?.fill === "string" && cover.style.fill.toLowerCase() !== "none");
    if (!hasFill || cover.type === "line" || cover.type === "text" || (cover.type === "path" && !cover.closed)) return false;
    const candidate = elementBounds(cover);
    return candidate.x <= box.x && candidate.y <= box.y && candidate.x2 >= box.x2 && candidate.y2 >= box.y2;
  });
}

interface Box { x: number; y: number; x2: number; y2: number; }
function clipBounds(clip: NonNullable<NonNullable<VectorScene["groups"]>[number]["clip"]>): Box {
  if (clip.type === "rect" || clip.type === "ellipse") return { x: clip.x, y: clip.y, x2: clip.x + clip.width, y2: clip.y + clip.height };
  const points = clip.points;
  const xs = points.flatMap((point) => [point.x, "leftX" in point ? point.leftX : undefined, "rightX" in point ? point.rightX : undefined]).filter((value): value is number => value !== undefined);
  const ys = points.flatMap((point) => [point.y, "leftY" in point ? point.leftY : undefined, "rightY" in point ? point.rightY : undefined]).filter((value): value is number => value !== undefined);
  return { x: Math.min(...xs), y: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}
function elementBounds(element: VectorElement): Box {
  if (element.type === "rect" || element.type === "ellipse") return { x: element.x, y: element.y, x2: element.x + element.width, y2: element.y + element.height };
  if (element.type === "text") return { x: element.x, y: element.y, x2: element.x + Math.max(element.size ?? 18, element.text.length * (element.size ?? 18) * 0.56), y2: element.y + (element.size ?? 18) * 1.2 };
  if (element.type === "line") return normalize(element.x, element.y, element.x2, element.y2, element.style?.strokeWidth ?? 2);
  const points = element.type === "compound_path" ? element.subpaths.flatMap((subpath) => subpath.points) : element.points;
  const xs = points.flatMap((point) => [point.x, "leftX" in point ? point.leftX : undefined, "rightX" in point ? point.rightX : undefined]).filter((value): value is number => value !== undefined);
  const ys = points.flatMap((point) => [point.y, "leftY" in point ? point.leftY : undefined, "rightY" in point ? point.rightY : undefined]).filter((value): value is number => value !== undefined);
  return normalize(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), element.style?.strokeWidth ?? 0);
}
function normalize(x: number, y: number, x2: number, y2: number, expansion: number): Box { const half = expansion / 2; return { x: Math.min(x, x2) - half, y: Math.min(y, y2) - half, x2: Math.max(x, x2) + half, y2: Math.max(y, y2) + half }; }
function intersects(left: Box, right: Box): boolean { return left.x < right.x2 && left.x2 > right.x && left.y < right.y2 && left.y2 > right.y; }
function union(boxes: Box[]): Box | undefined { return boxes.length ? { x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)), x2: Math.max(...boxes.map((box) => box.x2)), y2: Math.max(...boxes.map((box) => box.y2)) } : undefined; }
function ratio(numerator: number, denominator: number): number { return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4)); }
