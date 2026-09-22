import { ValidationError, normalizeScene } from "../core/sceneValidation.js";
import type { PathPoint, VectorClip, VectorScene } from "../core/vectorScene.js";
import { rasterizeSvgToPng, type PngRenderOptions, type PngRenderResult } from "./pngRenderer.js";
import { renderSceneToSvg } from "./svgRenderer.js";

export type RasterBlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten";

export interface RasterCompositionLayer {
  id: string;
  name?: string;
  scene: unknown;
  visible?: boolean;
  opacity?: number;
  blendMode?: RasterBlendMode;
  mask?: VectorClip;
}

export interface RasterComposition {
  document: {
    width: number;
    height: number;
    title?: string;
  };
  layers: RasterCompositionLayer[];
}

export interface RasterCompositionResult extends PngRenderResult {
  layerCount: number;
  visibleLayerCount: number;
  compositionSvg: string;
}

interface NormalizedLayer extends Omit<RasterCompositionLayer, "scene"> {
  scene: VectorScene;
  opacity: number;
  blendMode: RasterBlendMode;
}

interface NormalizedRasterComposition {
  document: RasterComposition["document"];
  layers: NormalizedLayer[];
}

/** Stack complete vector scenes as bounded raster layers, then derive a PNG. */
export function composeRasterLayersToPng(input: unknown, options: PngRenderOptions = {}): RasterCompositionResult {
  const composition = normalizeRasterComposition(input);
  const compositionSvg = renderRasterCompositionToSvg(composition);
  const rendered = rasterizeSvgToPng(compositionSvg, options);
  return {
    ...rendered,
    layerCount: composition.layers.length,
    visibleLayerCount: composition.layers.filter((layer) => layer.visible !== false).length,
    compositionSvg
  };
}

/** Build the inspectable SVG assembly used for software-native layer compositing. */
export function renderRasterCompositionToSvg(input: unknown): string {
  const composition = normalizeRasterComposition(input);
  const { width, height, title } = composition.document;
  const definitions = composition.layers
    .filter((layer) => layer.mask !== undefined)
    .map((layer) => `    <clipPath id="layer-mask-${xmlId(layer.id)}">\n${renderClip(layer.mask!, "      ")}\n    </clipPath>`);
  const layerNodes = composition.layers
    .filter((layer) => layer.visible !== false)
    .map((layer) => {
      const embedded = namespaceSceneSvg(renderSceneToSvg(layer.scene), layer.id);
      const attributes = [
        `id="layer-${xmlId(layer.id)}"`,
        `data-layer-id="${xml(layer.id)}"`,
        `data-name="${xml(layer.name ?? layer.id)}"`,
        `data-blend-mode="${layer.blendMode}"`,
        `opacity="${number(layer.opacity / 100)}"`,
        layer.blendMode === "normal" ? "" : `style="mix-blend-mode:${layer.blendMode}"`,
        layer.mask === undefined ? "" : `clip-path="url(#layer-mask-${xmlId(layer.id)})"`
      ].filter(Boolean);
      return [
        `  <g ${attributes.join(" ")}>`,
        ...embedded.split("\n").map((line) => `    ${line}`),
        "  </g>"
      ].join("\n");
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}" height="${number(height)}" viewBox="0 0 ${number(width)} ${number(height)}" role="img" aria-labelledby="composition-title">`,
    `  <title id="composition-title">${xml(title ?? "Raster composition")}</title>`,
    `  <metadata id="raster-composition" data-format="scientific-image-generator.raster-composition.v1">${xml(JSON.stringify({ layers: composition.layers.map(layerMetadata) }))}</metadata>`,
    definitions.length === 0 ? "" : ["  <defs>", ...definitions, "  </defs>"].join("\n"),
    ...layerNodes,
    "</svg>",
    ""
  ].filter(Boolean).join("\n");
}

function namespaceSceneSvg(svg: string, layerId: string): string {
  const prefix = `scene-${xmlId(layerId)}-`;
  return svg
    .replace(/^<\?xml[^>]+>\s*/i, "")
    .trim()
    .replace(/\bid="([^"]+)"/g, (_match, id: string) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_match, id: string) => `url(#${prefix}${id})`)
    .replace(/\baria-labelledby="([^"]+)"/g, (_match, ids: string) => `aria-labelledby="${ids.split(/\s+/).map((id) => `${prefix}${id}`).join(" ")}"`)
    .replace(/\b(?:href|xlink:href)="#([^"]+)"/g, (_match, id: string) => `href="#${prefix}${id}"`);
}

export function normalizeRasterComposition(input: unknown): NormalizedRasterComposition {
  const value = object(input, "Raster composition");
  const document = object(value.document, "Raster composition document");
  const width = dimension(document.width, "document.width");
  const height = dimension(document.height, "document.height");
  const title = optionalString(document.title, "document.title", 160);
  if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > 64) {
    throw new ValidationError("Raster composition layers must contain 1 to 64 entries");
  }
  const ids = new Set<string>();
  const layers = value.layers.map((raw, index): NormalizedLayer => {
    const layer = object(raw, `layers[${index}]`);
    const id = identifier(layer.id, `layers[${index}].id`);
    if (ids.has(id)) throw new ValidationError(`Raster composition layer id must be unique: ${id}`);
    ids.add(id);
    const scene = normalizeScene(layer.scene) as VectorScene;
    const sceneWidth = scene.document?.width ?? 720;
    const sceneHeight = scene.document?.height ?? 480;
    if (sceneWidth !== width || sceneHeight !== height) {
      throw new ValidationError(`Raster layer ${id} dimensions ${sceneWidth}x${sceneHeight} must match composition ${width}x${height}`);
    }
    const opacity = layer.opacity === undefined ? 100 : percentage(layer.opacity, `layers[${index}].opacity`);
    const blendMode = layer.blendMode === undefined ? "normal" : blend(layer.blendMode, `layers[${index}].blendMode`);
    const mask = layer.mask === undefined ? undefined : validateMask(layer.mask, width, height, index);
    return {
      id,
      name: optionalString(layer.name, `layers[${index}].name`, 120),
      scene,
      visible: optionalBoolean(layer.visible, `layers[${index}].visible`),
      opacity,
      blendMode,
      mask
    };
  });
  return { document: { width, height, title }, layers };
}

function validateMask(input: unknown, width: number, height: number, index: number): VectorClip {
  const normalized = normalizeScene({
    document: { width, height },
    elements: [{ id: "mask-validation-element", type: "rect", x: 0, y: 0, width: 1, height: 1, visible: false, style: { fill: null, stroke: null } }],
    groups: [{ id: `mask-${index}`, clip: input }]
  }) as VectorScene;
  return normalized.groups![0].clip!;
}

function renderClip(clip: VectorClip, indent: string): string {
  if (clip.type === "rect") return `${indent}<rect x="${number(clip.x)}" y="${number(clip.y)}" width="${number(clip.width)}" height="${number(clip.height)}" />`;
  if (clip.type === "ellipse") return `${indent}<ellipse cx="${number(clip.x + clip.width / 2)}" cy="${number(clip.y + clip.height / 2)}" rx="${number(clip.width / 2)}" ry="${number(clip.height / 2)}" />`;
  if (clip.type === "polygon") return `${indent}<polygon points="${clip.points.map((point) => `${number(point.x)},${number(point.y)}`).join(" ")}" />`;
  return `${indent}<path d="${pathData(clip.points)} Z" />`;
}

function pathData(points: PathPoint[]): string {
  const [first, ...rest] = points;
  if (!first) return "";
  const commands = [`M ${number(first.x)},${number(first.y)}`];
  let previous = first;
  for (const current of rest) {
    if ((previous.rightX !== undefined && previous.rightY !== undefined) || (current.leftX !== undefined && current.leftY !== undefined)) {
      const firstControl = previous.rightX === undefined ? `${number(previous.x)},${number(previous.y)}` : `${number(previous.rightX)},${number(previous.rightY!)}`;
      const secondControl = current.leftX === undefined ? `${number(current.x)},${number(current.y)}` : `${number(current.leftX)},${number(current.leftY!)}`;
      commands.push(`C ${firstControl} ${secondControl} ${number(current.x)},${number(current.y)}`);
    } else {
      commands.push(`L ${number(current.x)},${number(current.y)}`);
    }
    previous = current;
  }
  return commands.join(" ");
}

function layerMetadata(layer: NormalizedLayer): Record<string, unknown> {
  return { id: layer.id, name: layer.name, visible: layer.visible !== false, opacity: layer.opacity, blendMode: layer.blendMode, masked: layer.mask !== undefined };
}

function object(input: unknown, name: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ValidationError(`${name} must be an object`);
  return input as Record<string, unknown>;
}

function dimension(input: unknown, name: string): number {
  if (!Number.isInteger(input) || (input as number) < 1 || (input as number) > 14400) throw new ValidationError(`${name} must be an integer between 1 and 14400`);
  return input as number;
}

function percentage(input: unknown, name: string): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > 100) throw new ValidationError(`${name} must be between 0 and 100`);
  return input;
}

function blend(input: unknown, name: string): RasterBlendMode {
  if (input === "normal" || input === "multiply" || input === "screen" || input === "overlay" || input === "darken" || input === "lighten") return input;
  throw new ValidationError(`${name} must be normal, multiply, screen, overlay, darken, or lighten`);
}

function identifier(input: unknown, name: string): string {
  if (typeof input !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(input)) throw new ValidationError(`${name} must be a stable identifier`);
  return input;
}

function optionalString(input: unknown, name: string, max: number): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "string" || input.length < 1 || input.length > max) throw new ValidationError(`${name} must contain 1 to ${max} characters`);
  return input;
}

function optionalBoolean(input: unknown, name: string): boolean | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "boolean") throw new ValidationError(`${name} must be a boolean`);
  return input;
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function xmlId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-");
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new ValidationError("Raster composition contains a non-finite number");
  return String(Number(value.toFixed(6)));
}
