import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface LatexCompilationOptions {
  enginePath?: string;
  timeoutMs?: number;
}

export interface LatexCompilationResult {
  pdf: Buffer;
  bytes: number;
  sha256: string;
  engine: "tectonic";
  log: string;
}

export class LatexCompilationError extends Error {
  constructor(message: string, readonly log: string) {
    super(message);
    this.name = "LatexCompilationError";
  }
}

/** Compile generated standalone LaTeX and fail closed on any engine error. */
export async function compileLatexWithTectonic(latex: string, options: LatexCompilationOptions = {}): Promise<LatexCompilationResult> {
  if (typeof latex !== "string" || latex.length === 0 || latex.length > 2_000_000) {
    throw new LatexCompilationError("LaTeX source must contain 1 to 2000000 characters", "");
  }
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
    throw new LatexCompilationError("LaTeX compilation timeout must be an integer from 1000 to 300000 milliseconds", "");
  }

  const directory = await mkdtemp(join(tmpdir(), "scientific-latex-"));
  const sourcePath = join(directory, "document.tex");
  const pdfPath = join(directory, "document.pdf");
  try {
    await writeFile(sourcePath, latex, "utf8");
    const enginePath = options.enginePath ?? process.env.TECTONIC_BIN ?? "tectonic";
    const execution = await run(enginePath, ["-o", directory, sourcePath], timeoutMs);
    const log = [execution.stdout, execution.stderr].filter(Boolean).join("\n").slice(-200_000);
    if (execution.exitCode !== 0) {
      throw new LatexCompilationError(`Tectonic rejected generated LaTeX with exit code ${execution.exitCode}`, log);
    }
    let pdf: Buffer;
    try {
      pdf = await readFile(pdfPath);
    } catch {
      throw new LatexCompilationError("Tectonic reported success but did not create document.pdf", log);
    }
    if (pdf.length < 5 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new LatexCompilationError("Tectonic output is not a PDF document", log);
    }
    return { pdf, bytes: pdf.length, sha256: createHash("sha256").update(pdf).digest("hex"), engine: "tectonic", log };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

interface ProcessResult { exitCode: number; stdout: string; stderr: string; }

async function run(command: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      child.kill("SIGTERM");
      reject(new LatexCompilationError(`Tectonic compilation exceeded ${timeoutMs} milliseconds`, [stdout, stderr].filter(Boolean).join("\n").slice(-200_000)));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on("data", (chunk: string) => { stderr = appendBounded(stderr, chunk); });
    child.once("error", (error) => {
      finished = true;
      clearTimeout(timer);
      reject(new LatexCompilationError(`Unable to start Tectonic: ${error.message}`, stderr));
    });
    child.once("close", (exitCode) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ exitCode: exitCode ?? -1, stdout, stderr });
    });
  });
}

function appendBounded(current: string, chunk: string): string {
  return `${current}${chunk}`.slice(-200_000);
}
