import { normalizeScene, ValidationError } from "../core/sceneValidation.js";
import type { BridgeCommand, ExportFormat } from "./types.js";

export { normalizeScene, ValidationError } from "../core/sceneValidation.js";

export function normalizeCommand(input: unknown): BridgeCommand {
  const value = object(input, "command");
  const kind = stringValue(value.kind, "kind");

  if (kind === "ping") {
    return {
      kind,
      message: optionalString(value.message, "message", 500)
    };
  }

  if (kind === "cartoon_scene") {
    return {
      kind,
      scene: normalizeScene(value.scene)
    };
  }

  if (kind === "export") {
    return {
      kind,
      format: normalizeExportFormat(value.format),
      outputPath: stringValue(value.outputPath, "outputPath", 1000)
    };
  }

  if (kind === "place_image_reference" || kind === "place_file_reference") {
    return {
      kind,
      inputPath: stringValue(value.inputPath, "inputPath", 1000),
      layerName: optionalString(value.layerName, "layerName", 120),
      name: optionalString(value.name, "name", 120),
      x: optionalFiniteNumber(value.x, "x"),
      y: optionalFiniteNumber(value.y, "y"),
      width: optionalPositiveNumber(value.width, "width", 14400),
      height: optionalPositiveNumber(value.height, "height", 14400),
      opacity: optionalNumberRange(value.opacity, "opacity", 0, 100),
      locked: value.locked === undefined ? undefined : booleanValue(value.locked, "locked"),
      embed: value.embed === undefined ? undefined : booleanValue(value.embed, "embed")
    };
  }

  throw new ValidationError(`Unsupported command kind: ${kind}`);
}

function normalizeExportFormat(input: unknown): ExportFormat {
  const format = stringValue(input, "format").toLowerCase();
  if (format !== "pdf" && format !== "svg" && format !== "png" && format !== "jpg") {
    throw new ValidationError("format must be pdf, svg, png, or jpg");
  }
  return format;
}

function object(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError(`${path} must be an object`);
  }
  return input as Record<string, unknown>;
}

function stringValue(input: unknown, path: string, maxLength = 200): string {
  if (typeof input !== "string") {
    throw new ValidationError(`${path} must be a string`);
  }
  if (input.length > maxLength) {
    throw new ValidationError(`${path} cannot exceed ${maxLength} characters`);
  }
  return input;
}

function optionalString(input: unknown, path: string, maxLength: number): string | undefined {
  return input === undefined ? undefined : stringValue(input, path, maxLength);
}

function finiteNumber(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new ValidationError(`${path} must be a finite number`);
  }
  return input;
}

function optionalFiniteNumber(input: unknown, path: string): number | undefined {
  return input === undefined ? undefined : finiteNumber(input, path);
}

function positiveNumber(input: unknown, path: string, max: number): number {
  const value = finiteNumber(input, path);
  if (value <= 0 || value > max) {
    throw new ValidationError(`${path} must be greater than 0 and no more than ${max}`);
  }
  return value;
}

function optionalPositiveNumber(input: unknown, path: string, max: number): number | undefined {
  return input === undefined ? undefined : positiveNumber(input, path, max);
}

function optionalNumberRange(input: unknown, path: string, min: number, max: number): number | undefined {
  if (input === undefined) {
    return undefined;
  }
  const value = finiteNumber(input, path);
  if (value < min || value > max) {
    throw new ValidationError(`${path} must be between ${min} and ${max}`);
  }
  return value;
}

function booleanValue(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") {
    throw new ValidationError(`${path} must be a boolean`);
  }
  return input;
}
