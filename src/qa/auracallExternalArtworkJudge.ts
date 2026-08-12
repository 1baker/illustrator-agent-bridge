import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseExternalArtworkJudgeVerdictText,
  type ExternalArtworkJudgeVerdict,
  type ExternalArtworkReviewPacket
} from "./externalArtworkJudge.js";

export interface AuraCallExternalArtworkReviewOptions {
  command?: string;
  model?: string;
  timeoutSeconds?: number;
  slug?: string;
  workdir?: string;
  packetPath?: string;
  outputPath?: string;
  extraAttachmentPaths?: string[];
  preflightBrowserReadiness?: boolean;
  preflightTimeoutSeconds?: number;
}

export interface AuraCallExternalArtworkReviewCommand {
  command: string;
  args: string[];
  attachedFiles: string[];
  packetPath: string;
  outputPath: string;
}

export interface AuraCallExternalArtworkReviewResult {
  verdict: ExternalArtworkJudgeVerdict;
  provider: "auracall";
  command: AuraCallExternalArtworkReviewCommand;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  responseText: string;
  readiness?: AuraCallChatGptBrowserReadiness;
}

export type AuraCallExternalArtworkReviewRunner = ((
  packet: ExternalArtworkReviewPacket
) => Promise<AuraCallExternalArtworkReviewResult>) & {
  preflight?: () => Promise<AuraCallChatGptBrowserReadiness>;
};

export interface AuraCallChatGptBrowserReadiness {
  provider: "auracall";
  target: "chatgpt";
  ok: boolean;
  state?: string;
  severity?: string;
  requiresHuman?: boolean;
  summary?: string;
  recommendedAction?: string;
  reasons: string[];
  command: {
    command: string;
    args: string[];
  };
  exitCode: number | null;
  stdout: string;
  stderr: string;
  raw?: unknown;
  next: string[];
}

export class AuraCallExternalArtworkReviewError extends Error {
  readonly provider = "auracall";

  constructor(
    message: string,
    readonly command?: AuraCallExternalArtworkReviewCommand,
    readonly exitCode?: number | null,
    readonly stdout?: string,
    readonly stderr?: string,
    readonly responseText?: string,
    readonly readiness?: AuraCallChatGptBrowserReadiness
  ) {
    super(message);
    this.name = "AuraCallExternalArtworkReviewError";
  }
}

export function createAuraCallExternalArtworkReviewRunner(options: AuraCallExternalArtworkReviewOptions = {}): AuraCallExternalArtworkReviewRunner {
  const runner = ((packet: ExternalArtworkReviewPacket): Promise<AuraCallExternalArtworkReviewResult> =>
    runAuraCallExternalArtworkReview(packet, options)) as AuraCallExternalArtworkReviewRunner;
  if (options.preflightBrowserReadiness) {
    runner.preflight = () =>
      detectAuraCallChatGptBrowser({
        command: options.command,
        timeoutSeconds: options.preflightTimeoutSeconds ?? Math.min(options.timeoutSeconds ?? 30, 30),
        workdir: options.workdir
      });
  }

  return runner;
}

export async function runAuraCallExternalArtworkReview(
  packet: ExternalArtworkReviewPacket,
  options: AuraCallExternalArtworkReviewOptions = {}
): Promise<AuraCallExternalArtworkReviewResult> {
  const prepared = await prepareAuraCallExternalArtworkReviewCommand(packet, options);
  let readiness: AuraCallChatGptBrowserReadiness | undefined;
  if (options.preflightBrowserReadiness) {
    readiness = await detectAuraCallChatGptBrowser({
      command: options.command,
      timeoutSeconds: options.preflightTimeoutSeconds ?? Math.min(options.timeoutSeconds ?? 30, 30),
      workdir: options.workdir
    });
    if (!readiness.ok) {
      throw new AuraCallExternalArtworkReviewError(
        auraCallReadinessFailureMessage(readiness),
        prepared,
        readiness.exitCode,
        readiness.stdout,
        readiness.stderr,
        `${JSON.stringify(readiness, null, 2)}\n`,
        readiness
      );
    }
  }

  let execution: { exitCode: number | null; stdout: string; stderr: string };
  try {
    execution = await executeCommand(prepared.command, prepared.args, options.timeoutSeconds ?? 3600, options.workdir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AuraCallExternalArtworkReviewError(
      `AuraCall external artwork review could not start: ${message}`,
      prepared,
      null,
      "",
      message,
      "",
      readiness
    );
  }
  const responseText = await responseTextFor(prepared.outputPath, execution.stdout);

  if (execution.exitCode !== 0) {
    throw new AuraCallExternalArtworkReviewError(
      `AuraCall external artwork review failed with exit code ${execution.exitCode}.`,
      prepared,
      execution.exitCode,
      execution.stdout,
      execution.stderr,
      responseText,
      readiness
    );
  }

  try {
    return {
      verdict: parseExternalArtworkJudgeVerdictText(responseText),
      provider: "auracall",
      command: prepared,
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr,
      responseText,
      readiness
    };
  } catch (error) {
    throw new AuraCallExternalArtworkReviewError(
      error instanceof Error ? error.message : "AuraCall external artwork review returned malformed verdict JSON.",
      prepared,
      execution.exitCode,
      execution.stdout,
      execution.stderr,
      responseText,
      readiness
    );
  }
}

export async function detectAuraCallChatGptBrowser(
  options: Pick<AuraCallExternalArtworkReviewOptions, "command" | "timeoutSeconds" | "workdir"> & {
    operationTimeoutSeconds?: number;
    localOnly?: boolean;
    pruneBrowserState?: boolean;
  } = {}
): Promise<AuraCallChatGptBrowserReadiness> {
  const args = ["doctor", "--target", "chatgpt", "--json"];
  if (options.localOnly ?? true) {
    args.push("--local-only");
  }
  if (options.pruneBrowserState ?? true) {
    args.push("--prune-browser-state");
  }
  if (options.operationTimeoutSeconds !== undefined) {
    args.push("--operation-timeout", String(options.operationTimeoutSeconds));
  }
  const command = {
    command: options.command ?? "auracall",
    args
  };
  let execution: { exitCode: number | null; stdout: string; stderr: string };
  try {
    execution = await executeCommand(command.command, command.args, options.timeoutSeconds ?? 30, options.workdir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      provider: "auracall",
      target: "chatgpt",
      ok: false,
      state: "doctor-command-failed",
      severity: "error",
      requiresHuman: false,
      summary: `AuraCall doctor could not start: ${message}`,
      recommendedAction: "Install AuraCall or pass the correct auracall command path.",
      reasons: ["doctor command failed"],
      command,
      exitCode: null,
      stdout: "",
      stderr: message,
      next: ["Install AuraCall or pass the correct auracall command path."]
    };
  }

  const parsed = parseAuraCallDoctorJson(execution.stdout);
  const readiness = parsed?.readiness;
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) {
    return {
      provider: "auracall",
      target: "chatgpt",
      ok: false,
      state: "doctor-json-unparseable",
      severity: "error",
      requiresHuman: false,
      summary: "AuraCall doctor did not return parseable readiness JSON.",
      recommendedAction: "Run auracall doctor --target chatgpt --json directly and inspect stdout/stderr.",
      reasons: ["doctor output was not parseable"],
      command,
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr,
      next: ["Run auracall doctor --target chatgpt --json directly and inspect stdout/stderr."]
    };
  }

  const record = readiness as Record<string, unknown>;
  const ok = record.ok === true && execution.exitCode === 0;
  const recommendedAction = stringOrUndefined(record.recommendedAction);
  return {
    provider: "auracall",
    target: "chatgpt",
    ok,
    state: stringOrUndefined(record.state),
    severity: stringOrUndefined(record.severity),
    requiresHuman: typeof record.requiresHuman === "boolean" ? record.requiresHuman : undefined,
    summary: stringOrUndefined(record.summary),
    recommendedAction,
    reasons: stringArray(record.reasons),
    command,
    exitCode: execution.exitCode,
    stdout: execution.stdout,
    stderr: execution.stderr,
    raw: parsed,
    next: ok
      ? ["Run the Adobe project workflow with --external-review-provider auracall."]
      : [recommendedAction ?? "Run auracall login --target chatgpt, clear any browser gate, then rerun this readiness check."]
  };
}

export async function prepareAuraCallExternalArtworkReviewCommand(
  packet: ExternalArtworkReviewPacket,
  options: AuraCallExternalArtworkReviewOptions = {}
): Promise<AuraCallExternalArtworkReviewCommand> {
  const scratchDir = await mkdtemp(join(tmpdir(), "adobe-artwork-auracall-"));
  const packetPath = options.packetPath ?? join(scratchDir, "review-packet.json");
  const outputPath = options.outputPath ?? join(scratchDir, "auracall-verdict.txt");
  await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");

  const attachedFiles = await existingFiles([
    packetPath,
    packet.artifacts.finalSvgPath,
    packet.artifacts.sourceSvgPath,
    packet.artifacts.photoshopReferencePngPath,
    packet.artifacts.photoshopHandoffSvgPath,
    packet.artifacts.photoshopFeedbackPath,
    ...(options.extraAttachmentPaths ?? [])
  ]);
  const args = [
    "--engine",
    "browser",
    "--browser-target",
    "chatgpt",
    "--model",
    options.model ?? "gpt-5.2",
    "--prompt",
    packet.reviewerPrompt,
    "--wait",
    "--write-output",
    outputPath,
    "--timeout",
    String(options.timeoutSeconds ?? 3600),
    "--slug",
    options.slug ?? `adobe-artwork-review-${packet.iteration.attempt}`,
    "--file",
    ...attachedFiles
  ];

  return {
    command: options.command ?? "auracall",
    args,
    attachedFiles,
    packetPath,
    outputPath
  };
}

function auraCallReadinessFailureMessage(readiness: AuraCallChatGptBrowserReadiness): string {
  return [
    "AuraCall ChatGPT browser is not ready for external artwork review.",
    readiness.state ? `State: ${readiness.state}.` : undefined,
    readiness.summary,
    readiness.recommendedAction ? `Recommended action: ${readiness.recommendedAction}` : undefined
  ]
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .join(" ");
}

function parseAuraCallDoctorJson(stdout: string): Record<string, unknown> | undefined {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < start) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(stdout.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function stringOrUndefined(input: unknown): string | undefined {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
}

function stringArray(input: unknown): string[] {
  return Array.isArray(input) ? input.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
}

async function existingFiles(paths: string[]): Promise<string[]> {
  const unique = Array.from(new Set(paths.filter((path) => path.trim().length > 0)));
  const existing: string[] = [];
  for (const path of unique) {
    try {
      await access(path);
      existing.push(path);
    } catch {
      // Missing Adobe artifacts are expected for dry runs and failed local attempts.
    }
  }

  return existing;
}

function executeCommand(
  command: string,
  args: string[],
  timeoutSeconds: number,
  cwd?: string
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill();
      resolvePromise({
        exitCode: null,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}\nAuraCall external artwork review timed out after ${timeoutSeconds} seconds.`
      });
    }, Math.max(1, timeoutSeconds) * 1000);

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (settled) {
        return;
      }
      settled = true;
      resolvePromise({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
  });
}

async function responseTextFor(outputPath: string, stdout: string): Promise<string> {
  try {
    return await readFile(outputPath, "utf8");
  } catch {
    return stdout;
  }
}
