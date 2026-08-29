import type { CompoundPathElement, PathElement, PathPoint, VectorClip, VectorElement, VectorGroup, VectorPaint, VectorScene, VectorStyle } from "../core/vectorScene.js";

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 480;

/** Render the bridge scene model directly to editable SVG without launching Adobe. */
export function renderSceneToSvg(scene: VectorScene): string {
  const width = scene.document?.width ?? DEFAULT_WIDTH;
  const height = scene.document?.height ?? DEFAULT_HEIGHT;
  const title = scene.document?.title ?? "Scientific Vector Scene";
  const annotations = semanticAnnotations(scene);
  const body = renderComposition(scene, annotations);
  const definitions = renderDefinitions(scene.groups ?? [], scene.paints ?? []);
  const metadata = scene.semantics
    ? `  <metadata id="scientific-semantics" data-format="scientific-image-generator.scene-semantics.v1">${xml(JSON.stringify(scene.semantics))}</metadata>`
    : "";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}" height="${number(height)}" viewBox="0 0 ${number(width)} ${number(height)}" role="img" aria-labelledby="scene-title">`,
    `  <title id="scene-title">${xml(title)}</title>`,
    metadata,
    definitions,
    body,
    "</svg>",
    ""
  ].join("\n");
}

interface SemanticAnnotation {
  objectIds: string[];
  kinds: string[];
  relationshipIds: string[];
}

function renderComposition(scene: VectorScene, annotations: Map<string, SemanticAnnotation>): string {
  const groups = scene.groups ?? [];
  const indexedElements = scene.elements.map((element, index) => ({ element, index }));
  const indexedGroups = groups.map((group, index) => ({ group, index }));

  function renderContainer(parentId: string | undefined, indent: string): string {
    const elementNodes = indexedElements
      .filter(({ element }) => element.groupId === parentId)
      .map(({ element, index }) => ({ kind: "element" as const, value: element, index, zIndex: element.zIndex ?? 0 }));
    const groupNodes = indexedGroups
      .filter(({ group }) => group.parentId === parentId)
      .map(({ group, index }) => ({ kind: "group" as const, value: group, index: scene.elements.length + index, zIndex: group.zIndex ?? 0 }));
    return [...elementNodes, ...groupNodes]
      .sort((left, right) => left.zIndex - right.zIndex || left.index - right.index)
      .map((node) => {
        if (node.kind === "element") {
          return node.value.visible === false ? "" : renderElement(node.value, node.index, annotations.get(node.value.id ?? ""), indent);
        }
        return renderGroup(node.value, indent, renderContainer);
      })
      .filter(Boolean)
      .join("\n");
  }

  return renderContainer(undefined, "  ");
}

function renderGroup(
  group: VectorGroup,
  indent: string,
  renderChildren: (parentId: string | undefined, indent: string) => string
): string {
  if (group.visible === false) {
    return "";
  }
  const attributes = [
    `id="group-${xmlId(group.id, 0)}"`,
    `data-group-id="${xml(group.id)}"`,
    `data-name="${xml(group.name ?? group.id)}"`,
    group.zIndex === undefined ? "" : `data-z-index="${group.zIndex}"`,
    group.opacity === undefined ? "" : `opacity="${number(group.opacity / 100)}"`,
    group.clip === undefined ? "" : `clip-path="url(#clip-${xmlId(group.id, 0)})"`
  ].filter(Boolean);
  const children = renderChildren(group.id, `${indent}  `);
  return [`${indent}<g ${attributes.join(" ")}>`, children, `${indent}</g>`].filter(Boolean).join("\n");
}

function renderDefinitions(groups: VectorGroup[], paints: VectorPaint[]): string {
  const clipped = groups.filter((group) => group.clip !== undefined);
  if (clipped.length === 0 && paints.length === 0) {
    return "";
  }
  return [
    "  <defs>",
    ...paints.map((paint) => renderPaint(paint, "    ")),
    ...clipped.map((group) => `    <clipPath id="clip-${xmlId(group.id, 0)}">\n${renderClip(group.clip!, "      ")}\n    </clipPath>`),
    "  </defs>"
  ].join("\n");
}

function renderPaint(paint: VectorPaint, indent: string): string {
  const units = paint.units === "user_space" ? "userSpaceOnUse" : "objectBoundingBox";
  const spread = paint.spread ?? "pad";
  const transform = paint.transform === undefined ? "" : ` gradientTransform="matrix(${paint.transform.map(number).join(" ")})"`;
  const name = paint.name === undefined ? "" : ` data-name="${xml(paint.name)}"`;
  const common = `id="${xml(paint.id)}" data-paint-id="${xml(paint.id)}"${name} gradientUnits="${units}" spreadMethod="${spread}"${transform}`;
  const stops = paint.stops.map((stop) => `${indent}  <stop offset="${number(stop.offset)}%" stop-color="${stop.color}" stop-opacity="${number((stop.opacity ?? 100) / 100)}" />`).join("\n");
  if (paint.type === "linear_gradient") return `${indent}<linearGradient ${common} x1="${number(paint.x1)}" y1="${number(paint.y1)}" x2="${number(paint.x2)}" y2="${number(paint.y2)}">\n${stops}\n${indent}</linearGradient>`;
  const focus = `${paint.fx === undefined ? "" : ` fx="${number(paint.fx)}"`}${paint.fy === undefined ? "" : ` fy="${number(paint.fy)}"`}`;
  return `${indent}<radialGradient ${common} cx="${number(paint.cx)}" cy="${number(paint.cy)}" r="${number(paint.r)}"${focus}>\n${stops}\n${indent}</radialGradient>`;
}

function renderClip(clip: VectorClip, indent: string): string {
  if (clip.type === "rect") {
    return `${indent}<rect x="${number(clip.x)}" y="${number(clip.y)}" width="${number(clip.width)}" height="${number(clip.height)}" />`;
  }
  if (clip.type === "ellipse") {
    return `${indent}<ellipse cx="${number(clip.x + clip.width / 2)}" cy="${number(clip.y + clip.height / 2)}" rx="${number(clip.width / 2)}" ry="${number(clip.height / 2)}" />`;
  }
  if (clip.type === "polygon") {
    return `${indent}<polygon points="${clip.points.map((point) => `${number(point.x)},${number(point.y)}`).join(" ")}" />`;
  }
  return `${indent}<path d="${pathData({ ...clip, type: "path", closed: true })}" />`;
}

function renderElement(element: VectorElement, index: number, annotation: SemanticAnnotation | undefined, indent = "  "): string {
  const name = element.name ?? `${element.type}_${index + 1}`;
  const elementId = element.id ?? xmlId(name, index);
  const semanticAttributes = annotation
    ? ` data-scientific-objects="${xml(annotation.objectIds.join(" "))}" data-scientific-kinds="${xml(annotation.kinds.join(" "))}"${
        annotation.relationshipIds.length === 0 ? "" : ` data-scientific-relationships="${xml(annotation.relationshipIds.join(" "))}"`
      }`
    : "";
  const orderAttribute = element.zIndex === undefined ? "" : ` data-z-index="${element.zIndex}"`;
  const common = `id="${xml(elementId)}" data-element-id="${xml(elementId)}" data-name="${xml(name)}"${orderAttribute}${semanticAttributes}`;

  if (element.type === "rect") {
    return `${indent}<rect ${common} x="${number(element.x)}" y="${number(element.y)}" width="${number(element.width)}" height="${number(element.height)}" ${pathStyle(element.style)} />`;
  }

  if (element.type === "ellipse") {
    return `${indent}<ellipse ${common} cx="${number(element.x + element.width / 2)}" cy="${number(element.y + element.height / 2)}" rx="${number(element.width / 2)}" ry="${number(element.height / 2)}" ${pathStyle(element.style)} />`;
  }

  if (element.type === "line") {
    return `${indent}<line ${common} x1="${number(element.x)}" y1="${number(element.y)}" x2="${number(element.x2)}" y2="${number(element.y2)}" ${lineStyle(element.style)} />`;
  }

  if (element.type === "polygon") {
    const points = element.points.map((point) => `${number(point.x)},${number(point.y)}`).join(" ");
    return `${indent}<polygon ${common} points="${points}" ${pathStyle(element.style)} />`;
  }

  if (element.type === "path") {
    return `${indent}<path ${common} d="${pathData(element)}" ${pathStyle(element.style)} />`;
  }

  if (element.type === "compound_path") {
    return `${indent}<path ${common} d="${compoundPathData(element)}" fill-rule="${element.fillRule ?? "nonzero"}" clip-rule="${element.fillRule ?? "nonzero"}" ${pathStyle(element.style)} />`;
  }

  const style = textStyle(element.style);
  // Keep scientific labels deterministic across WSL, Linux, and browser renderers.
  // Some system-level generic font fallbacks expose incomplete glyph coverage.
  const font = ` font-family="${xml(element.font ?? "DejaVu Sans, Arial, sans-serif")}"`;
  return `${indent}<text ${common} x="${number(element.x)}" y="${number(element.y)}" font-size="${number(element.size ?? 18)}" dominant-baseline="hanging"${font} ${style}>${xml(element.text)}</text>`;
}

function semanticAnnotations(scene: VectorScene): Map<string, SemanticAnnotation> {
  const annotations = new Map<string, SemanticAnnotation>();
  if (!scene.semantics) {
    return annotations;
  }

  for (const object of scene.semantics.objects) {
    for (const elementId of object.elementIds) {
      const annotation = annotations.get(elementId) ?? { objectIds: [], kinds: [], relationshipIds: [] };
      annotation.objectIds.push(object.id);
      annotation.kinds.push(object.kind);
      annotations.set(elementId, annotation);
    }
  }

  for (const relationship of scene.semantics.relationships ?? []) {
    for (const elementId of relationship.visualElementIds ?? []) {
      const annotation = annotations.get(elementId) ?? { objectIds: [], kinds: [], relationshipIds: [] };
      annotation.relationshipIds.push(relationship.id);
      annotations.set(elementId, annotation);
    }
  }

  return annotations;
}

function pathData(element: PathElement): string {
  const [first, ...rest] = element.points;
  if (!first) {
    return "";
  }

  const commands = [`M ${point(first)}`];
  let previous = first;

  for (const current of rest) {
    commands.push(segment(previous, current));
    previous = current;
  }

  if (element.closed !== false) {
    const curvedClose = hasRightHandle(previous) || hasLeftHandle(first);
    if (curvedClose) {
      commands.push(segment(previous, first));
    }
    commands.push("Z");
  }

  return commands.join(" ");
}

function compoundPathData(element: CompoundPathElement): string {
  return element.subpaths
    .map((subpath) => pathData({ type: "path", x: 0, y: 0, points: subpath.points, closed: true }))
    .join(" ");
}

function segment(from: PathPoint, to: PathPoint): string {
  if (hasRightHandle(from) || hasLeftHandle(to)) {
    const firstControl = hasRightHandle(from) ? `${number(from.rightX!)},${number(from.rightY!)}` : point(from);
    const secondControl = hasLeftHandle(to) ? `${number(to.leftX!)},${number(to.leftY!)}` : point(to);
    return `C ${firstControl} ${secondControl} ${point(to)}`;
  }

  return `L ${point(to)}`;
}

function hasLeftHandle(point: PathPoint): boolean {
  return point.leftX !== undefined && point.leftY !== undefined;
}

function hasRightHandle(point: PathPoint): boolean {
  return point.rightX !== undefined && point.rightY !== undefined;
}

function point(value: PathPoint): string {
  return `${number(value.x)},${number(value.y)}`;
}

function pathStyle(style: VectorStyle | undefined): string {
  return styleAttributes({
    fill: style?.fill === undefined ? "#FFFFFF" : style.fill,
    fillPaint: style?.fillPaint,
    stroke: style?.stroke === undefined ? "#111111" : style.stroke,
    strokePaint: style?.strokePaint,
    strokeWidth: style?.strokeWidth ?? 2,
    opacity: style?.opacity ?? 100,
    ...strokeAppearance(style)
  });
}

function lineStyle(style: VectorStyle | undefined): string {
  return styleAttributes({
    fill: null,
    fillPaint: undefined,
    stroke: style?.stroke === undefined ? "#111111" : style.stroke,
    strokePaint: style?.strokePaint,
    strokeWidth: style?.strokeWidth ?? 2,
    opacity: style?.opacity ?? 100,
    ...strokeAppearance(style)
  });
}

function textStyle(style: VectorStyle | undefined): string {
  return styleAttributes({
    fill: style?.fill === undefined ? "#111111" : style.fill,
    fillPaint: style?.fillPaint,
    stroke: style?.stroke ?? null,
    strokePaint: style?.strokePaint,
    strokeWidth: style?.strokeWidth ?? 0,
    opacity: style?.opacity ?? 100,
    ...strokeAppearance(style)
  });
}

function strokeAppearance(style: VectorStyle | undefined): Pick<VectorStyle, "lineCap" | "lineJoin" | "dashArray" | "dashOffset" | "miterLimit"> {
  return {
    lineCap: style?.lineCap,
    lineJoin: style?.lineJoin,
    dashArray: style?.dashArray,
    dashOffset: style?.dashOffset,
    miterLimit: style?.miterLimit
  };
}

type ResolvedVectorStyle = Required<Pick<VectorStyle, "fill" | "stroke" | "strokeWidth" | "opacity">> &
  Pick<VectorStyle, "fillPaint" | "strokePaint" | "lineCap" | "lineJoin" | "dashArray" | "dashOffset" | "miterLimit">;

function styleAttributes(style: ResolvedVectorStyle): string {
  return [
    `fill="${style.fillPaint === undefined ? style.fill ?? "none" : `url(#${xml(style.fillPaint)})`}"`,
    `stroke="${style.strokePaint === undefined ? style.stroke ?? "none" : `url(#${xml(style.strokePaint)})`}"`,
    `stroke-width="${number(style.strokeWidth)}"`,
    `opacity="${number(style.opacity / 100)}"`,
    style.lineCap === undefined ? "" : `stroke-linecap="${style.lineCap}"`,
    style.lineJoin === undefined ? "" : `stroke-linejoin="${style.lineJoin}"`,
    style.dashArray === undefined ? "" : `stroke-dasharray="${style.dashArray.map(number).join(" ")}"`,
    style.dashOffset === undefined ? "" : `stroke-dashoffset="${number(style.dashOffset)}"`,
    style.miterLimit === undefined ? "" : `stroke-miterlimit="${number(style.miterLimit)}"`
  ].filter(Boolean).join(" ");
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function xmlId(name: string, index: number): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "element"}-${index + 1}`;
}

function number(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot render non-finite number: ${value}`);
  }
  return String(Number(value.toFixed(6)));
}
