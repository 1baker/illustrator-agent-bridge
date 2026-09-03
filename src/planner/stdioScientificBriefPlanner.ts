import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { ValidationError } from "../core/sceneValidation.js";
import { compileScientificFigureBrief } from "../scientific/figureBrief.js";
import type { ScientificBriefPlan, ScientificBriefPlanner, ScientificBriefPlanRequest } from "./scientificBriefPlanner.js";

export interface StdioScientificBriefPlannerOptions {
  command: string;
  args?: string[];
  adapterId?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  cwd?: string;
  env?: Record<string, string>;
}

/** Provider-neutral, shell-free JSON-over-stdio semantic planner adapter. */
export class StdioScientificBriefPlanner implements ScientificBriefPlanner {
  readonly id: string;
  constructor(private readonly options: StdioScientificBriefPlannerOptions) {
    if (!options.command?.trim()) throw new ValidationError("stdio planner command is required");
    if (!isAbsolute(options.command)) throw new ValidationError("stdio planner command must be an absolute path");
    if ((options.args ?? []).some((value) => typeof value !== "string" || value.includes("\0"))) throw new ValidationError("stdio planner args must be strings without NUL bytes");
    this.id = normalizeAdapterId(options.adapterId ?? "local-stdio-planner.v1");
  }

  async plan(request: ScientificBriefPlanRequest): Promise<ScientificBriefPlan> {
    const response = await runAdapter(this.options, { schemaVersion: "ScientificBriefPlanRequest.v1", request });
    if (response.schemaVersion !== "ScientificBriefPlanResponse.v1") throw new ValidationError("stdio planner returned an unsupported schemaVersion");
    if (!("brief" in response)) throw new ValidationError("stdio planner response.brief is required");
    compileScientificFigureBrief(response.brief);
    const notes = response.notes === undefined ? [] : stringArray(response.notes, "stdio planner response.notes", 100);
    return { mode: "openai", brief: response.brief, provider: { name: "stdio", model: this.id }, notes: ["Local stdio adapter proposed coordinate-free semantics; deterministic code retained geometry authority.", ...notes] };
  }
}

async function runAdapter(options: StdioScientificBriefPlannerOptions, payload: unknown): Promise<Record<string, unknown>> {
  const maximum = options.maxOutputBytes ?? 2_000_000;
  if (!Number.isInteger(maximum) || maximum < 1024 || maximum > 16_000_000) throw new ValidationError("stdio planner maxOutputBytes must be between 1024 and 16000000");
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600_000) throw new ValidationError("stdio planner timeoutMs must be between 100 and 600000");
  const inherited = Object.fromEntries(["PATH", "LANG", "LC_ALL", "SYSTEMROOT", "WINDIR", "WSL_DISTRO_NAME"].flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]!]]));
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(options.command, options.args ?? [], { cwd: options.cwd ? resolve(options.cwd) : undefined, env: { ...inherited, ...(options.env ?? {}) }, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [], stderr: Buffer[] = []; let stdoutBytes = 0, stderrBytes = 0, settled = false;
    const finish = (error?: Error, value?: Record<string, unknown>) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolvePromise(value!); };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(new ValidationError(`stdio planner timed out after ${timeoutMs} ms`)); }, timeoutMs);
    child.on("error", (error) => finish(new ValidationError(`stdio planner could not start: ${error.message}`)));
    child.stdout.on("data", (chunk: Buffer) => { stdoutBytes += chunk.length; if (stdoutBytes > maximum) { child.kill("SIGKILL"); finish(new ValidationError("stdio planner output exceeded the configured byte limit")); } else stdout.push(chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes <= 16_384) stderr.push(chunk); });
    child.on("close", (code) => {
      if (settled) return;
      const diagnostic = Buffer.concat(stderr).toString("utf8").trim().slice(0, 2000);
      if (code !== 0) return finish(new ValidationError(`stdio planner exited with code ${code}${diagnostic ? `: ${diagnostic}` : ""}`));
      try { const parsed = JSON.parse(Buffer.concat(stdout).toString("utf8")); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("response must be an object"); finish(undefined, parsed as Record<string, unknown>); }
      catch (error) { finish(new ValidationError(`stdio planner returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`)); }
    });
    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

function normalizeAdapterId(value: string): string { if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) throw new ValidationError("stdio planner adapterId must be a stable identifier"); return value; }
function stringArray(value: unknown, path: string, maximum: number): string[] { if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== "string" || item.length > 2000)) throw new ValidationError(`${path} must be an array of at most ${maximum} strings`); return value as string[]; }
