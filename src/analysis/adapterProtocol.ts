import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { ValidationError } from "../core/sceneValidation.js";

export interface ScientificAnalysisRequest {
  schemaVersion: "scientific-analysis-request.v1";
  requestId: string;
  input: { path: string; sha256: string };
  adapter: {
    id: string;
    version: string;
    command: string;
    commandSha256: string;
    args?: string[];
    entrypoint?: { path: string; sha256: string };
    runtime: { path: string; sha256: string };
    environment: Record<string, string>;
  };
  weights: { path: string; sha256: string };
  parameters: Record<string, unknown>;
  prompts?: Array<{ kind: "point" | "box" | "text"; value: unknown }>;
  rois?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  calibration?: unknown;
}

export interface ScientificAnalysisResult {
  schemaVersion: "scientific-analysis-result.v1";
  requestId: string;
  inputSha256: string;
  adapter: {
    id: string;
    version: string;
    commandSha256: string;
    entrypointSha256?: string;
    runtimeSha256: string;
    environmentSha256: string;
  };
  weightSha256: string;
  environment: Record<string, string>;
  parameters: Record<string, unknown>;
  prompts: unknown[];
  rois: unknown[];
  calibration: { status: "verified" | "pixel_only"; source?: string; physicalUnits?: string; unitsPerPixel?: number; evidence?: string };
  runtimeMs: number;
  annotations: Array<{
    id: string;
    type: "mask" | "polygon" | "bounding_box" | "measurement";
    classLabel?: string;
    confidence?: number;
    count?: number;
    morphology?: Record<string, number>;
    pixels?: number;
    physicalValue?: number;
    physicalUnit?: string;
    points?: Array<{ x: number; y: number }>;
    box?: { x: number; y: number; width: number; height: number };
    maskPath?: string;
  }>;
  outputDigests: Record<string, string>;
  candidateAnnotations: true;
}

export class AnalysisAdapterError extends Error {
  constructor(message: string, readonly stderr = "") { super(message); this.name = "AnalysisAdapterError"; }
}

export async function runScientificAnalysisAdapter(input: unknown, options: { assetRoot: string; timeoutMs?: number; maxOutputBytes?: number } ): Promise<ScientificAnalysisResult> {
  const request = normalizeAnalysisRequest(input);
  const inputPath = safePath(options.assetRoot, request.input.path);
  const weightPath = safePath(options.assetRoot, request.weights.path);
  await verifyDigest(inputPath, request.input.sha256, "analysis input");
  await verifyDigest(weightPath, request.weights.sha256, "analysis weights");
  const commandPath = await verifyPinnedFile(request.adapter.command, request.adapter.commandSha256, "analysis adapter executable", true);
  const runtimePath = await verifyPinnedFile(safePath(options.assetRoot, request.adapter.runtime.path), request.adapter.runtime.sha256, "analysis adapter runtime identity", false);
  let entrypointPath: string | undefined;
  if (request.adapter.entrypoint) entrypointPath = await verifyPinnedFile(safePath(options.assetRoot, request.adapter.entrypoint.path), request.adapter.entrypoint.sha256, "analysis adapter entrypoint", false);
  const args = [...(request.adapter.args ?? [])];
  if (request.adapter.entrypoint) {
    if (args[0] !== request.adapter.entrypoint.path) throw new AnalysisAdapterError("analysis adapter entrypoint must be the first configured argument");
    args[0] = entrypointPath!;
  }
  const adapterIdentity = {
    commandSha256: request.adapter.commandSha256,
    ...(request.adapter.entrypoint ? { entrypointSha256: request.adapter.entrypoint.sha256 } : {}),
    runtimeSha256: request.adapter.runtime.sha256,
    environmentSha256: sha256(canonicalJson(request.adapter.environment))
  };
  const payload = JSON.stringify({ ...request, input: { ...request.input, path: inputPath }, weights: { ...request.weights, path: weightPath }, adapter: { ...request.adapter, command: commandPath, ...(entrypointPath ? { entrypoint: { ...request.adapter.entrypoint, path: entrypointPath } } : {}), runtime: { ...request.adapter.runtime, path: runtimePath }, ...adapterIdentity } });
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxOutputBytes = options.maxOutputBytes ?? 10 * 1024 * 1024;
  const { stdout, stderr, exitCode } = await run(commandPath, args, payload, timeoutMs, maxOutputBytes, request.adapter.environment);
  if (exitCode !== 0) throw new AnalysisAdapterError(`analysis adapter exited with code ${exitCode}`, stderr);
  let parsed: unknown;
  try { parsed = JSON.parse(stdout); } catch (error) { throw new AnalysisAdapterError(`analysis adapter returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`, stderr); }
  const result = normalizeAnalysisResult(parsed);
  if (result.requestId !== request.requestId || result.inputSha256 !== request.input.sha256 || result.weightSha256 !== request.weights.sha256) throw new AnalysisAdapterError("analysis adapter result does not match the request or pinned input/weight digests", stderr);
  if (result.adapter.id !== request.adapter.id || result.adapter.version !== request.adapter.version) throw new AnalysisAdapterError("analysis adapter result identifies a different adapter/version", stderr);
  if (result.adapter.commandSha256 !== adapterIdentity.commandSha256 || result.adapter.entrypointSha256 !== adapterIdentity.entrypointSha256 || result.adapter.runtimeSha256 !== adapterIdentity.runtimeSha256 || result.adapter.environmentSha256 !== adapterIdentity.environmentSha256) throw new AnalysisAdapterError("analysis adapter result does not match the pinned executable, entrypoint, runtime, or environment identity", stderr);
  if (result.calibration.status !== "verified" && result.annotations.some((item) => item.physicalValue !== undefined || item.physicalUnit !== undefined)) throw new AnalysisAdapterError("analysis adapter claimed physical measurements without verified calibration", stderr);
  return result;
}

export function normalizeAnalysisRequest(input: unknown): ScientificAnalysisRequest {
  const value = object(input, "analysis request");
  if (value.schemaVersion !== "scientific-analysis-request.v1") throw new ValidationError("analysis request.schemaVersion must be scientific-analysis-request.v1");
  const inputValue = fileRef(value.input, "analysis request.input");
  const weights = fileRef(value.weights, "analysis request.weights");
  const adapter = object(value.adapter, "analysis request.adapter");
  return {
    schemaVersion: "scientific-analysis-request.v1", requestId: stableId(value.requestId, "analysis request.requestId"), input: inputValue,
    adapter: {
      id: stableId(adapter.id, "analysis request.adapter.id"), version: text(adapter.version, "analysis request.adapter.version", 120),
      command: text(adapter.command, "analysis request.adapter.command", 1000), commandSha256: digest(adapter.commandSha256, "analysis request.adapter.commandSha256"),
      ...(adapter.args === undefined ? {} : { args: stringArray(adapter.args, "analysis request.adapter.args", 64, 1000) }),
      ...(adapter.entrypoint === undefined ? {} : { entrypoint: fileRef(adapter.entrypoint, "analysis request.adapter.entrypoint") }),
      runtime: fileRef(adapter.runtime, "analysis request.adapter.runtime"), environment: stringRecord(adapter.environment ?? {}, "analysis request.adapter.environment")
    },
    weights, parameters: object(value.parameters ?? {}, "analysis request.parameters"),
    ...(value.prompts === undefined ? {} : { prompts: array(value.prompts, "analysis request.prompts", 1000) as ScientificAnalysisRequest["prompts"] }),
    ...(value.rois === undefined ? {} : { rois: array(value.rois, "analysis request.rois", 1000) as ScientificAnalysisRequest["rois"] }),
    ...(value.calibration === undefined ? {} : { calibration: value.calibration })
  };
}

export function normalizeAnalysisResult(input: unknown): ScientificAnalysisResult {
  const value = object(input, "analysis result");
  if (value.schemaVersion !== "scientific-analysis-result.v1") throw new ValidationError("analysis result.schemaVersion must be scientific-analysis-result.v1");
  const adapter = object(value.adapter, "analysis result.adapter");
  const calibration = object(value.calibration, "analysis result.calibration");
  const status = calibration.status === "verified" ? "verified" : calibration.status === "pixel_only" ? "pixel_only" : (() => { throw new ValidationError("analysis result.calibration.status must be verified or pixel_only"); })();
  const annotationsRaw = array(value.annotations, "analysis result.annotations", 100_000);
  const annotations = annotationsRaw.map((raw, index) => {
    const item = object(raw, `analysis result.annotations[${index}]`);
    const type = oneOf(item.type, ["mask", "polygon", "bounding_box", "measurement"] as const, `analysis result.annotations[${index}].type`);
    return { ...item, id: stableId(item.id, `analysis result.annotations[${index}].id`), type, ...(item.confidence === undefined ? {} : { confidence: bounded(item.confidence, `analysis result.annotations[${index}].confidence`, 0, 1) }) } as ScientificAnalysisResult["annotations"][number];
  });
  return {
    schemaVersion: "scientific-analysis-result.v1", requestId: stableId(value.requestId, "analysis result.requestId"), inputSha256: digest(value.inputSha256, "analysis result.inputSha256"),
    adapter: {
      id: stableId(adapter.id, "analysis result.adapter.id"), version: text(adapter.version, "analysis result.adapter.version", 120),
      commandSha256: digest(adapter.commandSha256, "analysis result.adapter.commandSha256"),
      ...(adapter.entrypointSha256 === undefined ? {} : { entrypointSha256: digest(adapter.entrypointSha256, "analysis result.adapter.entrypointSha256") }),
      runtimeSha256: digest(adapter.runtimeSha256, "analysis result.adapter.runtimeSha256"), environmentSha256: digest(adapter.environmentSha256, "analysis result.adapter.environmentSha256")
    }, weightSha256: digest(value.weightSha256, "analysis result.weightSha256"),
    environment: stringRecord(value.environment, "analysis result.environment"), parameters: object(value.parameters ?? {}, "analysis result.parameters"),
    prompts: array(value.prompts ?? [], "analysis result.prompts", 1000), rois: array(value.rois ?? [], "analysis result.rois", 1000),
    calibration: { status, ...(typeof calibration.source === "string" ? { source: calibration.source } : {}), ...(typeof calibration.physicalUnits === "string" ? { physicalUnits: calibration.physicalUnits } : {}), ...(typeof calibration.unitsPerPixel === "number" ? { unitsPerPixel: calibration.unitsPerPixel } : {}), ...(typeof calibration.evidence === "string" ? { evidence: calibration.evidence } : {}) },
    runtimeMs: bounded(value.runtimeMs, "analysis result.runtimeMs", 0, 86_400_000), annotations,
    outputDigests: digestRecord(value.outputDigests, "analysis result.outputDigests"), candidateAnnotations: value.candidateAnnotations === true ? true : (() => { throw new ValidationError("analysis result.candidateAnnotations must be true"); })()
  };
}

export function resolveCalibration(input: unknown): ScientificAnalysisResult["calibration"] {
  if (input === undefined || input === null) return { status: "pixel_only", source: "none", evidence: "No verified metadata or scale-bar calibration was supplied." };
  const value = object(input, "calibration");
  if (value.status === "verified" && (value.source === "embedded_metadata" || value.source === "scale_bar") && typeof value.unitsPerPixel === "number" && value.unitsPerPixel > 0 && typeof value.physicalUnits === "string" && typeof value.evidence === "string") {
    return { status: "verified", source: value.source, unitsPerPixel: value.unitsPerPixel, physicalUnits: value.physicalUnits, evidence: value.evidence };
  }
  return { status: "pixel_only", source: "unverified", evidence: "Calibration could not be independently verified; physical-unit claims are blocked." };
}

function safePath(root: string, child: string): string { const absoluteRoot = resolve(root); const absolute = resolve(absoluteRoot, child); if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}/`)) throw new AnalysisAdapterError(`analysis path escapes the configured asset root: ${child}`); return absolute; }
async function verifyDigest(path: string, expected: string, label: string): Promise<void> { let data: Buffer; try { data = await readFile(path); } catch (error) { throw new AnalysisAdapterError(`${label} is missing or unreadable: ${path}: ${error instanceof Error ? error.message : String(error)}`); } const actual = createHash("sha256").update(data).digest("hex"); if (actual !== expected) throw new AnalysisAdapterError(`${label} SHA-256 mismatch: expected ${expected}, got ${actual}`); }
async function verifyPinnedFile(path: string, expected: string, label: string, executable: boolean): Promise<string> { const absolute = resolve(path); let actualRealPath: string; try { actualRealPath = await realpath(absolute); } catch (error) { throw new AnalysisAdapterError(`${label} is missing or unresolved: ${absolute}: ${error instanceof Error ? error.message : String(error)}`); } if (actualRealPath !== absolute) throw new AnalysisAdapterError(`${label} must not use a symlink: ${absolute}`); const stat = await lstat(absolute); if (!stat.isFile()) throw new AnalysisAdapterError(`${label} must be a regular file: ${absolute}`); if (executable && (stat.mode & 0o111) === 0) throw new AnalysisAdapterError(`${label} is not executable: ${absolute}`); await verifyDigest(absolute, expected, label); return absolute; }
function run(command: string, args: string[], stdin: string, timeoutMs: number, maxOutputBytes: number, environment: Record<string, string>): Promise<{ stdout: string; stderr: string; exitCode: number }> { return new Promise((resolvePromise, reject) => { const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...environment } }); let stdout = "", stderr = "", done = false; const timer = setTimeout(() => { if (!done) { child.kill("SIGTERM"); reject(new AnalysisAdapterError(`analysis adapter exceeded ${timeoutMs} ms`, stderr)); } }, timeoutMs); child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); if (Buffer.byteLength(stdout) > maxOutputBytes) child.kill("SIGTERM"); }); child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-200_000); }); child.once("error", (error) => { done = true; clearTimeout(timer); reject(new AnalysisAdapterError(`unable to start analysis adapter: ${error.message}`, stderr)); }); child.once("close", (code) => { if (done) return; done = true; clearTimeout(timer); if (Buffer.byteLength(stdout) > maxOutputBytes) reject(new AnalysisAdapterError("analysis adapter output exceeded the configured byte limit", stderr)); else resolvePromise({ stdout, stderr, exitCode: code ?? -1 }); }); child.stdin.end(stdin); }); }
function canonicalJson(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; const item = value as Record<string, unknown>; return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(",")}}`; }
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function object(input: unknown, path: string): Record<string, unknown> { if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError(`${path} must be an object`); return input as Record<string, unknown>; }
function array(input: unknown, path: string, max: number): unknown[] { if (!Array.isArray(input) || input.length > max) throw new ValidationError(`${path} must be an array of at most ${max} items`); return input; }
function text(input: unknown, path: string, max: number): string { if (typeof input !== "string" || input.length < 1 || input.length > max) throw new ValidationError(`${path} must contain 1 to ${max} characters`); return input; }
function stableId(input: unknown, path: string): string { const value = text(input, path, 120); if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) throw new ValidationError(`${path} must be a stable identifier`); return value; }
function digest(input: unknown, path: string): string { const value = text(input, path, 64).toLowerCase(); if (!/^[0-9a-f]{64}$/.test(value)) throw new ValidationError(`${path} must be a SHA-256 digest`); return value; }
function bounded(input: unknown, path: string, min: number, max: number): number { if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) throw new ValidationError(`${path} must be from ${min} to ${max}`); return input; }
function oneOf<T extends string>(input: unknown, values: readonly T[], path: string): T { if (typeof input !== "string" || !values.includes(input as T)) throw new ValidationError(`${path} must be ${values.join(", ")}`); return input as T; }
function stringArray(input: unknown, path: string, max: number, itemMax: number): string[] { return array(input, path, max).map((item, index) => text(item, `${path}[${index}]`, itemMax)); }
function fileRef(input: unknown, path: string): { path: string; sha256: string } { const value = object(input, path); return { path: text(value.path, `${path}.path`, 1000), sha256: digest(value.sha256, `${path}.sha256`) }; }
function stringRecord(input: unknown, path: string): Record<string, string> { const value = object(input, path); const result: Record<string, string> = {}; for (const [key, item] of Object.entries(value)) result[key] = text(item, `${path}.${key}`, 1000); return result; }
function digestRecord(input: unknown, path: string): Record<string, string> { const value = object(input, path); const result: Record<string, string> = {}; for (const [key, item] of Object.entries(value)) result[key] = digest(item, `${path}.${key}`); return result; }
