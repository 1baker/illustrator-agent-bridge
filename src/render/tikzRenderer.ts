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
export function renderSceneToTikz(input: unknown, options: {compact?: boolean} = {}): TikzRenderResult {
  const scene = normalizeScene(input);
  const paints = paintRegistry(scene);

  const width = scene.document?.width ?? DEFAULT_WIDTH;
  const height = scene.document?.height ?? DEFAULT_HEIGHT;
  const colors = colorDefinitions(scene);
  const body = renderComposition(scene, colors.names, paints.names);
  // Keep stable names and literal drawing options: physical-size scaling relies
  // on those options. Gradient stop colors are declared inline, not by name.
  const usedColors = new Set(body.match(/\bbridgecolor\d+\b/g) ?? []);
  const colorDeclarations = colors.definitions.filter(line =>
    !options.compact || usedColors.has(line.match(/\\definecolor\{([^}]+)\}/)![1]!));
  const semantics = scene.semantics === undefined || options.compact
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
    ...colorDeclarations,
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
  if (paint.type === "radial_gradient") {
    if ((paint.fx !== undefined && paint.fx !== paint.cx) || (paint.fy !== undefined && paint.fy !== paint.cy)) throw new ValidationError(`TikZ radial paint ${paint.id} requires a centered focus`);
    if (paint.cx !== 0.5 || paint.cy !== 0.5) {
      const distance = `${number(75-50*paint.cy)} sub dup mul exch ${number(25+50*paint.cx)} sub dup mul add sqrt ${number(50*paint.r)} div dup 1 gt { pop 1 } if`;
      const channel = (color: string, index: number) => Number.parseInt(color.slice(index,index+2),16)/255;
      const interpolate = (index: number): string => {
        const a=paint.stops[index]!, b=paint.stops[index+1]!;
        const channels=[1,3,5].map(i=>`${number(channel(b.color,i)-channel(a.color,i))} mul ${number(channel(a.color,i))} add`);
        return `${number(a.offset/100)} sub ${number((b.offset-a.offset)/100)} div dup ${channels[0]} exch dup ${channels[1]} exch ${channels[2]}`;
      };
      let ramp=interpolate(paint.stops.length-2);
      for (let index=paint.stops.length-3;index>=0;index--) ramp=`dup ${number(paint.stops[index+1]!.offset/100)} le { ${interpolate(index)} } { ${ramp} } ifelse`;
      return `\\pgfdeclarefunctionalshading{${name}}{\\pgfpoint{0bp}{0bp}}{\\pgfpoint{100bp}{100bp}}{}{${distance} ${ramp}}`;
    }
    // PGF maps the central 50bp square to the path bounds. An SVG unit of
    // radius therefore corresponds to 50bp, not 100bp. Keep the declared
    // outer radius at 50bp so PGF does not rescale the shading again.
    const radialStops = paint.stops.filter(stop=>stop.offset*paint.r/2 < 50)
      .map(stop=>`color(${number(stop.offset*paint.r/2)}bp)=(${paintColor(stop.color)})`);
    radialStops.push(`color(50bp)=(${paintColor(samplePaintColor(paint,100/paint.r))})`);
    return `\\pgfdeclareradialshading{${name}}{\\pgfpoint{0bp}{0bp}}{${radialStops.join("; ")}}`;
  }
  const dx = paint.x2 - paint.x1;
  const dy = paint.y2 - paint.y1;
  const horizontal = Math.abs(dy) <= 1e-9 && Math.abs(dx) > 1e-9;
  const vertical = Math.abs(dx) <= 1e-9 && Math.abs(dy) > 1e-9;
  if (horizontal || vertical) {
    // Visible path bounds map to 25..75bp. PDF y increases upward, whereas
    // scene y increases downward; reverse vertical stop placement accordingly.
    const origin = horizontal ? 25+50*paint.x1 : 75-50*paint.y1;
    const span = horizontal ? 50*dx : -50*dy;
    const positions = [0,...paint.stops.map(stop=>origin+span*stop.offset/100).filter(value=>value>0 && value<100),100].sort((a,b)=>a-b);
    const stops = positions.map(position=>`color(${number(position)}bp)=(${paintColor(samplePaintColor(paint,(position-origin)/span*100))})`).join("; ");
    return `\\pgfdeclare${horizontal ? "horizontal" : "vertical"}shading{${name}}{100bp}{${stops}}`;
  }
  // Evaluate the SVG object-box projection directly in PGF's visible 25..75bp
  // square. Functional shading preserves oblique ramps without raster artwork.
  const denominator=number(50*(dx*dx+dy*dy));
  if(Number(denominator)===0)throw new ValidationError(`TikZ diagonal paint ${paint.id} is too short for output precision`);
  const projection=`${number(75-50*paint.y1)} exch sub ${number(dy)} mul exch ${number(25+50*paint.x1)} sub ${number(dx)} mul add ${denominator} div dup 0 lt { pop 0 } if dup 1 gt { pop 1 } if`;
  const channel=(color:string,index:number)=>Number.parseInt(color.slice(index,index+2),16)/255;
  const interpolate=(index:number)=>{
    const a=paint.stops[index]!,b=paint.stops[index+1]!;
    const channels=[1,3,5].map(i=>`${number(channel(b.color,i)-channel(a.color,i))} mul ${number(channel(a.color,i))} add`);
    return `${number(a.offset/100)} sub ${number((b.offset-a.offset)/100)} div dup ${channels[0]} exch dup ${channels[1]} exch ${channels[2]}`;
  };
  let ramp=interpolate(paint.stops.length-2);
  for(let i=paint.stops.length-3;i>=0;i--)ramp=`dup ${number(paint.stops[i+1]!.offset/100)} le { ${interpolate(i)} } { ${ramp} } ifelse`;
  return `\\pgfdeclarefunctionalshading{${name}}{\\pgfpoint{0bp}{0bp}}{\\pgfpoint{100bp}{100bp}}{}{${projection} ${ramp}}`;
}

function samplePaintColor(paint: VectorPaint, offset: number): string {
  if (offset >= 100) return paint.stops.at(-1)!.color;
  const upperIndex = paint.stops.findIndex(stop=>stop.offset >= offset);
  if (upperIndex <= 0) return paint.stops[0]!.color;
  const lower = paint.stops[upperIndex-1]!, upper = paint.stops[upperIndex]!;
  const t = (offset-lower.offset)/(upper.offset-lower.offset);
  return "#"+[1,3,5].map(index=>Math.round(Number.parseInt(lower.color.slice(index,index+2),16)*(1-t)+Number.parseInt(upper.color.slice(index,index+2),16)*t).toString(16).padStart(2,"0")).join("");
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
  const options = group.opacity === undefined ? "" : `[transparency group, opacity=${number(group.opacity / 100)}]`;
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
      `font={\\sffamily${element.fontWeight === "bold" ? "\\bfseries" : ""}\\fontsize{${number(element.size ?? 18)}}{${number((element.size ?? 18) * 1.2)}}\\selectfont}`,
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
  // SVG's implicit limit is 4; PGF's is 10. Leaving this implicit creates
  // PDF-only spikes at acute material corners even with identical geometry.
  if (stroke !== null) options.push(`miter limit=${number(style?.miterLimit ?? 4)}`);
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
