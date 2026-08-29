import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js";
import { ValidationError, normalizeScene } from "../core/sceneValidation.js";
import type { VectorScene } from "../core/vectorScene.js";
import { renderSceneToSvg } from "./svgRenderer.js";

export interface PngRenderOptions {
  width?: number;
  height?: number;
  scale?: number;
  background?: string | "transparent";
}

export interface PngRenderResult {
  png: Buffer;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  background: string | "transparent";
  fit: "original" | "width" | "height" | "scale";
  fontPolicy: "system_fonts";
  renderer: "resvg-js-2.6.2";
}

const MAX_SVG_BYTES = 10 * 1024 * 1024;

/** Render the authoritative vector scene to a derived PNG artifact. */
export function renderSceneToPng(scene: unknown, options: PngRenderOptions = {}): PngRenderResult {
  const normalized = normalizeScene(scene) as VectorScene;
  return rasterizeSvgToPng(renderSceneToSvg(normalized), options);
}

/** Rasterize trusted, self-contained SVG while rejecting active or external content. */
export function rasterizeSvgToPng(svg: string | Buffer, options: PngRenderOptions = {}): PngRenderResult {
  const source = Buffer.isBuffer(svg) ? svg : Buffer.from(svg, "utf8");
  if (source.length === 0 || source.length > MAX_SVG_BYTES) {
    throw new ValidationError(`SVG raster input must contain 1 to ${MAX_SVG_BYTES} bytes`);
  }
  const text = source.toString("utf8");
  if (!/<svg\b/i.test(text)) throw new ValidationError("PNG raster input must contain an SVG root element");
  if (/<!DOCTYPE\b|<script\b|<foreignObject\b/i.test(text)) {
    throw new ValidationError("PNG raster input cannot contain DOCTYPE, script, or foreignObject content");
  }
  if (/\b(?:href|xlink:href)\s*=\s*["'](?!#|data:)[^"']+/i.test(text)) {
    throw new ValidationError("PNG raster input cannot reference external resources");
  }

  const normalized = normalizeOptions(options);
  const renderer = new Resvg(source, {
    background: normalized.background === "transparent" ? undefined : normalized.background,
    fitTo: normalized.fitTo,
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0,
    font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" },
    logLevel: "off"
  });
  const unresolved = renderer.imagesToResolve();
  if (unresolved.length > 0) throw new ValidationError("PNG raster input contains unresolved external images");
  const sourceWidth = renderer.width;
  const sourceHeight = renderer.height;
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new ValidationError("SVG raster input must resolve to positive dimensions");
  }
  const rendered = renderer.render();
  return {
    png: rendered.asPng(),
    sourceWidth,
    sourceHeight,
    width: rendered.width,
    height: rendered.height,
    background: normalized.background,
    fit: normalized.fit,
    fontPolicy: "system_fonts",
    renderer: "resvg-js-2.6.2"
  };
}

function normalizeOptions(options: PngRenderOptions): {
  background: string | "transparent";
  fit: PngRenderResult["fit"];
  fitTo: NonNullable<ResvgRenderOptions["fitTo"]>;
} {
  const requestedFits = [options.width, options.height, options.scale].filter((value) => value !== undefined);
  if (requestedFits.length > 1) throw new ValidationError("PNG render options may set only one of width, height, or scale");
  const background = options.background ?? "#FFFFFF";
  if (background !== "transparent" && !/^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/.test(background)) {
    throw new ValidationError("PNG background must be transparent, #RRGGBB, or #RRGGBBAA");
  }
  if (options.width !== undefined) {
    return { background, fit: "width", fitTo: { mode: "width", value: positiveDimension(options.width, "width") } };
  }
  if (options.height !== undefined) {
    return { background, fit: "height", fitTo: { mode: "height", value: positiveDimension(options.height, "height") } };
  }
  if (options.scale !== undefined) {
    if (!Number.isFinite(options.scale) || options.scale < 0.1 || options.scale > 8) {
      throw new ValidationError("PNG scale must be between 0.1 and 8");
    }
    return { background, fit: "scale", fitTo: { mode: "zoom", value: options.scale } };
  }
  return { background, fit: "original", fitTo: { mode: "original" } };
}

function positiveDimension(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 14400) {
    throw new ValidationError(`PNG ${name} must be an integer between 1 and 14400`);
  }
  return value;
}
