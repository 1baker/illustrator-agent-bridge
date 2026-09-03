import { normalizeScene, ValidationError } from "../core/sceneValidation.js";
import type {
  CompoundPathElement,
  PathElement,
  PathPoint,
  VectorClip,
  VectorElement,
  VectorGroup,
  VectorPaint,
  VectorScene,
  VectorStyle
} from "../core/vectorScene.js";

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 480;

export interface TikzRenderResult {
  latex: string;
  renderer: "tikz-scene.v1" | "tikz-scene.v2";
  requiredPackages: string[];
}

/** Render a validated semantic vector scene as a standalone TikZ document. */
export function renderSceneToTikz(input: unknown): TikzRenderResult {
  const scene = normalizeScene(input);
  const paints = paintRegistry(scene);

  const width = scene.document?.width ?? DEFAULT_WIDTH;
  const height = scene.document?.height ?? DEFAULT_HEIGHT;
  const colors = colorDefinitions(scene);
  const body = renderComposition(scene, colors.names, paints.names);
  const semantics = scene.semantics === undefined
    ? []
    : [
        "% Scientific semantics (canonical JSON):",
        ...commentLines(JSON.stringify(scene.semantics))
      ];
  const latex = [
    "% Generated deterministically by illustrator-agent-bridge.",
    "% The semantic vector scene is authoritative; this file is an editable renderer artifact.",
    "\\documentclass[tikz,border=0pt]{standalone}",
    "\\usepackage{xcolor}",
    "\\usepackage{fontspec}",
    "\\setsansfont{DejaVu Sans}",
    "\\begin{document}",
    ...colors.definitions,
    ...paints.definitions,
    `\\begin{tikzpicture}[x=1pt,y=-1pt]`,
    `  \\path[use as bounding box] (0,0) rectangle (${number(width)},${number(height)});`,
    ...semantics.map((line) => `  ${line}`),
    body,
    "\\end{tikzpicture}",
    "\\end{document}",
    ""
  ].filter((line) => line !== "").join("\n");

  return { latex, renderer: paints.names.size === 0 ? "tikz-scene.v1" : "tikz-scene.v2", requiredPackages: ["tikz", "xcolor", "fontspec"] };
}

interface PaintRegistry { names: Map<string, string>; definitions: string[]; }

function paintRegistry(scene: VectorScene): PaintRegistry {
  const referenced = new Set(scene.elements.flatMap((element) => [element.style?.fillPaint, element.style?.strokePaint]).filter((id): id is string => Boolean(id)));
  const paints = [...(scene.paints ?? [])].filter((paint) => referenced.has(paint.id)).sort((a, b) => a.id.localeCompare(b.id));
  for (const element of scene.elements) {
    if (element.style?.strokePaint) throw new ValidationError("TikZ gradient strokes are not supported; expand the stroke to filled geometry first");
  }
  const names = new Map(paints.map((paint, index) => [paint.id, `bridgepaint${index + 1}`]));
  return { names, definitions: paints.map((paint) => paintDefinition(paint, names.get(paint.id)!)) };
}

function paintDefinition(paint: VectorPaint, name: string): string {
  if ((paint.units ?? "object_bounding_box") !== "object_bounding_box") throw new ValidationError(`TikZ paint ${paint.id} requires object_bounding_box units`);
  if ((paint.spread ?? "pad") !== "pad") throw new ValidationError(`TikZ paint ${paint.id} requires pad spread`);
  if (paint.transform !== undefined) throw new ValidationError(`TikZ paint ${paint.id} transforms are not supported`);
  if (paint.stops.some((stop) => (stop.opacity ?? 100) !== 100)) throw new ValidationError(`TikZ paint ${paint.id} stop opacity is not supported`);
  const stops = paint.stops.map((stop) => `color(${number(stop.offset)}bp)=(${paintColor(stop.color)})`).join("; ");
  if (paint.type === "radial_gradient") {
    if ((paint.fx !== undefined && paint.fx !== paint.cx) || (paint.fy !== undefined && paint.fy !== paint.cy)) throw new ValidationError(`TikZ radial paint ${paint.id} requires a centered focus`);
    return `\\pgfdeclareradialshading{${name}}{\\pgfpoint{0bp}{0bp}}{${stops}}`;
  }
  const dx = paint.x2 - paint.x1;
  const dy = paint.y2 - paint.y1;
  if (Math.abs(dy) <= 1e-9 && Math.abs(dx) > 1e-9) return `\\pgfdeclarehorizontalshading{${name}}{100bp}{${stops}}`;
  if (Math.abs(dx) <= 1e-9 && Math.abs(dy) > 1e-9) return `\\pgfdeclareverticalshading{${name}}{100bp}{${stops}}`;
  throw new ValidationError(`TikZ linear paint ${paint.id} must be horizontal or vertical`);
}

function paintColor(hex: string): string { return `{rgb,255:red,${Number.parseInt(hex.slice(1, 3), 16)};green,${Number.parseInt(hex.slice(3, 5), 16)};blue,${Number.parseInt(hex.slice(5, 7), 16)}}`; }

interface ColorRegistry {
  names: Map<string, string>;
  definitions: string[];
}

function colorDefinitions(scene: VectorScene): ColorRegistry {
  const values = new Set<string>();
  for (const element of scene.elements) {
    if (element.type === "line") {
      if (element.style?.stroke !== null) values.add((element.style?.stroke ?? "#111111").toUpperCase());
    } else if (element.type === "text") {
      const textColor = element.style?.fill ?? element.style?.stroke ?? "#111111";
      values.add(textColor.toUpperCase());
    } else {
      if (element.style?.fill !== null) values.add((element.style?.fill ?? "#FFFFFF").toUpperCase());
      if (element.style?.stroke !== null) values.add((element.style?.stroke ?? "#111111").toUpperCase());
    }
  }
  for (const paint of scene.paints ?? []) for (const stop of paint.stops) values.add(stop.color.toUpperCase());
  const sorted = [...values].sort();
  const names = new Map(sorted.map((hex, index) => [hex, `bridgecolor${index + 1}`]));
  return {
    names,
    definitions: sorted.map((hex) => `\\definecolor{${names.get(hex)!}}{HTML}{${hex.slice(1)}}`)
  };
}

function renderComposition(scene: VectorScene, colors: Map<string, string>, paints: Map<string, string>): string {
  const groups = scene.groups ?? [];
  const indexedElements = scene.elements.map((element, index) => ({ element, index }));
  const indexedGroups = groups.map((group, index) => ({ group, index }));

  function renderContainer(parentId: string | undefined, indent: string): string {
    const elements = indexedElements
      .filter(({ element }) => element.groupId === parentId)
      .map(({ element, index }) => ({ kind: "element" as const, value: element, index, zIndex: element.zIndex ?? 0 }));
    const childGroups = indexedGroups
      .filter(({ group }) => group.parentId === parentId)
      .map(({ group, index }) => ({ kind: "group" as const, value: group, index: scene.elements.length + index, zIndex: group.zIndex ?? 0 }));
    return [...elements, ...childGroups]
      .sort((left, right) => left.zIndex - right.zIndex || left.index - right.index)
      .map((node) => node.kind === "element"
        ? (node.value.visible === false ? "" : renderElement(node.value, node.index, colors, paints, indent))
        : renderGroup(node.value, colors, indent, renderContainer))
      .filter(Boolean)
      .join("\n");
  }

  return renderContainer(undefined, "  ");
}

function renderGroup(
  group: VectorGroup,
  colors: Map<string, string>,
  indent: string,
  children: (parentId: string | undefined, indent: string) => string
): string {
  if (group.visible === false) return "";
  const options = group.opacity === undefined ? "" : `[opacity=${number(group.opacity / 100)}]`;
  const output = [`${indent}% group ${comment(group.id)}`, `${indent}\\begin{scope}${options}`];
  if (group.clip) output.push(`${indent}  \\clip ${clipGeometry(group.clip)};`);
  const rendered = children(group.id, `${indent}  `);
  if (rendered) output.push(rendered);
  output.push(`${indent}\\end{scope}`);
  void colors;
  return output.join("\n");
}

function renderElement(element: VectorElement, index: number, colors: Map<string, string>, paints: Map<string, string>, indent: string): string {
  const id = element.id ?? `${element.type}_${index + 1}`;
  const prefix = `${indent}% element ${comment(id)} (${element.type})\n`;
  if (element.type === "text") {
    const options = [
      "anchor=north west",
      `text=${colorName(element.style?.fill ?? element.style?.stroke ?? "#111111", colors)}`,
      `font={\\sffamily\\fontsize{${number(element.size ?? 18)}}{${number((element.size ?? 18) * 1.2)}}\\selectfont}`,
      ...opacityOptions(element.style)
    ];
    return `${prefix}${indent}\\node[${options.join(", ")}] at (${number(element.x)},${number(element.y)}) {${tex(element.text)}};`;
  }

  const options = styleOptions(element.style, colors, paints, element.type === "line");
  if (element.type === "compound_path" && element.fillRule === "evenodd") options.unshift("even odd rule");
  return `${prefix}${indent}\\path[${options.join(", ")}] ${elementGeometry(element)};`;
}

function elementGeometry(element: Exclude<VectorElement, { type: "text" }>): string {
  if (element.type === "rect") return `(${number(element.x)},${number(element.y)}) rectangle (${number(element.x + element.width)},${number(element.y + element.height)})`;
  if (element.type === "ellipse") return `(${number(element.x + element.width / 2)},${number(element.y + element.height / 2)}) ellipse [x radius=${number(element.width / 2)}pt, y radius=${number(element.height / 2)}pt]`;
  if (element.type === "line") return `(${number(element.x)},${number(element.y)}) -- (${number(element.x2)},${number(element.y2)})`;
  if (element.type === "polygon") return `${element.points.map(coordinate).join(" -- ")} -- cycle`;
  if (element.type === "path") return pathGeometry(element);
  return compoundGeometry(element);
}

function clipGeometry(clip: VectorClip): string {
  if (clip.type === "rect") return `(${number(clip.x)},${number(clip.y)}) rectangle (${number(clip.x + clip.width)},${number(clip.y + clip.height)})`;
  if (clip.type === "ellipse") return `(${number(clip.x + clip.width / 2)},${number(clip.y + clip.height / 2)}) ellipse [x radius=${number(clip.width / 2)}pt, y radius=${number(clip.height / 2)}pt]`;
  if (clip.type === "polygon") return `${clip.points.map(coordinate).join(" -- ")} -- cycle`;
  return pathGeometry({ ...clip, type: "path", closed: true });
}

function compoundGeometry(element: CompoundPathElement): string {
  return element.subpaths.map((subpath) => pathGeometry({ type: "path", x: 0, y: 0, points: subpath.points, closed: true })).join(" ");
}

function pathGeometry(element: PathElement): string {
  const [first, ...rest] = element.points;
  if (!first) return "";
  const parts = [coordinate(first)];
  let previous = first;
  for (const current of rest) {
    parts.push(segment(previous, current));
    previous = current;
  }
  if (element.closed !== false) {
    if (hasRightHandle(previous) || hasLeftHandle(first)) parts.push(segment(previous, first));
    parts.push("-- cycle");
  }
  return parts.join(" ");
}

function segment(from: PathPoint, to: PathPoint): string {
  if (hasRightHandle(from) || hasLeftHandle(to)) {
    const first = hasRightHandle(from) ? `(${number(from.rightX!)},${number(from.rightY!)})` : coordinate(from);
    const second = hasLeftHandle(to) ? `(${number(to.leftX!)},${number(to.leftY!)})` : coordinate(to);
    return `.. controls ${first} and ${second} .. ${coordinate(to)}`;
  }
  return `-- ${coordinate(to)}`;
}

function styleOptions(style: VectorStyle | undefined, colors: Map<string, string>, paints: Map<string, string>, line: boolean): string[] {
  const fill = line ? null : (style?.fill === undefined ? "#FFFFFF" : style.fill);
  const stroke = style?.stroke === undefined ? "#111111" : style.stroke;
  const options = [
    style?.fillPaint ? `shade, shading=${paintName(style.fillPaint, paints)}` : fill === null ? "fill=none" : `fill=${colorName(fill, colors)}`,
    stroke === null ? "draw=none" : `draw=${colorName(stroke, colors)}`
  ];
  if (stroke !== null) options.push(`line width=${number(style?.strokeWidth ?? 2)}pt`);
  if (style?.lineCap) options.push(`line cap=${style.lineCap === "square" ? "rect" : style.lineCap}`);
  if (style?.lineJoin) options.push(`line join=${style.lineJoin}`);
  if (style?.miterLimit !== undefined) options.push(`miter limit=${number(style.miterLimit)}`);
  if (style?.dashArray?.length) options.push(`dash pattern=${dashPattern(style.dashArray)}`);
  if (style?.dashOffset !== undefined) options.push(`dash phase=${number(style.dashOffset)}pt`);
  if (style?.opacity !== undefined) options.push(...opacityOptions(style));
  return options;
}

function paintName(value: string, paints: Map<string, string>): string {
  const name = paints.get(value);
  if (!name) throw new ValidationError(`TikZ paint registry is missing ${value}`);
  return name;
}

function opacityOptions(style: VectorStyle | undefined): string[] {
  return style?.opacity === undefined ? [] : [`opacity=${number(style.opacity / 100)}`];
}

function dashPattern(values: number[]): string {
  return values.map((value, index) => `${index % 2 === 0 ? "on" : "off"} ${number(value)}pt`).join(" ");
}

function colorName(value: string, colors: Map<string, string>): string {
  const name = colors.get(value.toUpperCase());
  if (!name) throw new ValidationError(`TikZ color registry is missing ${value}`);
  return name;
}

function coordinate(value: { x: number; y: number }): string { return `(${number(value.x)},${number(value.y)})`; }
function hasLeftHandle(point: PathPoint): boolean { return point.leftX !== undefined && point.leftY !== undefined; }
function hasRightHandle(point: PathPoint): boolean { return point.rightX !== undefined && point.rightY !== undefined; }
function number(value: number): string { return Number(value.toFixed(6)).toString(); }
function comment(value: string): string { return value.replace(/[\r\n%]/g, " "); }
function commentLines(value: string): string[] { return value.match(/.{1,100}/g)?.map((line) => `% ${comment(line)}`) ?? []; }

/** Escape untrusted labels so they remain text rather than executable TeX. */
export function escapeLatexText(value: string): string {
  const replacements: Record<string, string> = {
    "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "%": "\\%", "#": "\\#", "&": "\\&", "_": "\\_", "$": "\\$",
    "^": "\\textasciicircum{}", "~": "\\textasciitilde{}", "°": "\\ensuremath{{}^{\\circ}}", "±": "\\ensuremath{\\pm}"
  };
  return [...value].map((character) => replacements[character] ?? character).join("");
}

function tex(value: string): string { return escapeLatexText(value); }
