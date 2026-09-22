import { spawn } from "node:child_process";
import { resolveLaunchPlatform, type LaunchPlatform } from "./launcher.js";

export interface PhotoshopDetectOptions {
  platform?: LaunchPlatform;
  crashLookbackMinutes?: number;
  timeoutMs?: number;
}

export interface PhotoshopProcessInfo {
  processName: string;
  id: number;
  mainWindowTitle: string;
  responding?: boolean;
  path?: string;
}

export interface PhotoshopCrashEvent {
  timeCreated: string;
  providerName: string;
  id: number;
  levelDisplayName: string;
  summary: string;
}

export interface PhotoshopDesktopReadiness {
  ok: boolean;
  platform: Exclude<LaunchPlatform, "auto">;
  comRegistered: boolean;
  clsid?: string;
  localServer32?: string;
  appPath?: string;
  appExists: boolean;
  running: boolean;
  processes: PhotoshopProcessInfo[];
  recentCrashEvents: PhotoshopCrashEvent[];
  exitCode?: number | null;
  stderr?: string;
  warnings?: string[];
  next: string[];
}

interface RawPhotoshopReadiness {
  clsid?: unknown;
  localServer32?: unknown;
  appPath?: unknown;
  appExists?: unknown;
  processes?: unknown;
  recentCrashEvents?: unknown;
  warnings?: unknown;
}

export async function detectPhotoshopDesktop(options: PhotoshopDetectOptions = {}): Promise<PhotoshopDesktopReadiness> {
  const platform = resolveLaunchPlatform(options.platform);
  if (platform !== "windows" && platform !== "wsl") {
    return {
      ok: false,
      platform,
      comRegistered: false,
      appExists: false,
      running: false,
      processes: [],
      recentCrashEvents: [],
      next: ["Photoshop COM automation is available only on Windows or WSL-hosted Windows Photoshop."]
    };
  }

  const timeoutMs = options.timeoutMs ?? 15_000;
  const execution = await runPowerShell(photoshopRegistrationPowerShell(), timeoutMs);
  const parsed = parseJsonObject(execution.stdout);
  if (!parsed) {
    return {
      ok: false,
      platform,
      comRegistered: false,
      appExists: false,
      running: false,
      processes: [],
      recentCrashEvents: [],
      exitCode: execution.exitCode,
      stderr: execution.stderr,
      next: ["Photoshop readiness probe did not return parseable JSON."]
    };
  }

  const lookbackMinutes = options.crashLookbackMinutes ?? 120;
  const crashProbe = lookbackMinutes > 0 ? await runPowerShell(photoshopCrashEventsPowerShell(lookbackMinutes), Math.min(timeoutMs, 10_000)) : undefined;
  const crashEvents = crashProbe ? parseJsonValue(crashProbe.stdout) : [];
  const warnings: string[] = [];
  if (crashProbe && !Array.isArray(crashEvents) && !(typeof crashEvents === "object" && crashEvents !== null)) {
    warnings.push("Recent Photoshop crash event probe did not return parseable JSON within the timeout.");
  }

  return normalizePhotoshopReadiness(
    {
      ...parsed,
      recentCrashEvents: crashEvents ?? [],
      warnings
    },
    platform,
    execution.exitCode,
    [cleanPowerShellStderr(execution.stderr), cleanPowerShellStderr(crashProbe?.stderr ?? "")].filter(Boolean).join("\n") || undefined
  );
}

export function normalizePhotoshopReadiness(
  input: RawPhotoshopReadiness,
  platform: Exclude<LaunchPlatform, "auto">,
  exitCode?: number | null,
  stderr?: string
): PhotoshopDesktopReadiness {
  const clsid = stringOrUndefined(input.clsid);
  const localServer32 = stringOrUndefined(input.localServer32);
  const appPath = stringOrUndefined(input.appPath);
  const appExists = Boolean(input.appExists);
  const processes = processArray(input.processes);
  const recentCrashEvents = crashEventArray(input.recentCrashEvents);
  const warnings = stringArray(input.warnings);
  const comRegistered = Boolean(clsid && localServer32);
  const ok = comRegistered && appExists && recentCrashEvents.length === 0 && warnings.length === 0;

  return {
    ok,
    platform,
    comRegistered,
    clsid,
    localServer32,
    appPath,
    appExists,
    running: processes.length > 0,
    processes,
    recentCrashEvents,
    exitCode,
    stderr,
    warnings: warnings.length > 0 ? warnings : undefined,
    next: photoshopReadinessNextSteps({ comRegistered, appExists, processes, recentCrashEvents, warnings })
  };
}

function photoshopRegistrationPowerShell(): string {
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$ProgressPreference = 'SilentlyContinue'",
    "$clsidRecord = Get-ItemProperty 'Registry::HKEY_CLASSES_ROOT\\Photoshop.Application\\CLSID'",
    "$clsid = if ($clsidRecord) { $clsidRecord.'(default)' } else { $null }",
    "$localServerRecord = if ($clsid) { Get-ItemProperty (\"Registry::HKEY_CLASSES_ROOT\\CLSID\\\" + $clsid + \"\\LocalServer32\") } else { $null }",
    "$localServer = if ($localServerRecord) { $localServerRecord.'(default)' } else { $null }",
    "$appPath = $null",
    "if ($localServer -match '^\"([^\"]+Photoshop\\.exe)\"') { $appPath = $Matches[1] }",
    "elseif ($localServer -match '^(.*?Photoshop\\.exe)') { $appPath = $Matches[1].Trim() }",
    "if (-not $appPath) { $appPath = 'C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe' }",
    "$processes = @(Get-Process Photoshop -ErrorAction SilentlyContinue | Select-Object @{Name='processName';Expression={$_.ProcessName}}, @{Name='id';Expression={$_.Id}}, @{Name='mainWindowTitle';Expression={$_.MainWindowTitle}}, @{Name='responding';Expression={$_.Responding}}, @{Name='path';Expression={$_.Path}})",
    "[pscustomobject]@{",
    "  clsid = $clsid",
    "  localServer32 = $localServer",
    "  appPath = $appPath",
    "  appExists = [bool](Test-Path $appPath)",
    "  processes = $processes",
    "} | ConvertTo-Json -Depth 6 -Compress"
  ].join("\n");
}

function photoshopCrashEventsPowerShell(crashLookbackMinutes: number): string {
  const minutes = Math.max(1, Math.trunc(crashLookbackMinutes));
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$ProgressPreference = 'SilentlyContinue'",
    "$events = @(Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddMinutes(-" +
      minutes +
      ")} -ErrorAction SilentlyContinue | Where-Object { $_.Message -match 'Photoshop\\.exe' -and ($_.ProviderName -match 'Application Error|Windows Error Reporting|Photoshop|Adobe') } | Select-Object -First 5 @{Name='timeCreated';Expression={$_.TimeCreated.ToString('o')}}, @{Name='providerName';Expression={$_.ProviderName}}, @{Name='id';Expression={$_.Id}}, @{Name='levelDisplayName';Expression={$_.LevelDisplayName}}, @{Name='summary';Expression={($_.Message -split \"`r?`n\" | Select-Object -First 8) -join ' | '}})",
    "$events | ConvertTo-Json -Depth 6 -Compress"
  ].join("\n");
}

function runPowerShell(script: string, timeoutMs: number): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
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
        stderr: `${Buffer.concat(stderr).toString("utf8")}\nPhotoshop readiness PowerShell probe timed out after ${timeoutMs} ms.`
      });
    }, timeoutMs);

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

function parseJsonObject(stdout: string): RawPhotoshopReadiness | undefined {
  const value = parseJsonValue(stdout);
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as RawPhotoshopReadiness) : undefined;
}

function parseJsonValue(stdout: string): unknown {
  const start = stdout.indexOf("{");
  const arrayStart = stdout.indexOf("[");
  const valueStart = start < 0 ? arrayStart : arrayStart < 0 ? start : Math.min(start, arrayStart);
  const objectEnd = stdout.lastIndexOf("}");
  const arrayEnd = stdout.lastIndexOf("]");
  const valueEnd = Math.max(objectEnd, arrayEnd);
  if (valueStart < 0 || valueEnd < valueStart) {
    return undefined;
  }

  try {
    return JSON.parse(stdout.slice(valueStart, valueEnd + 1));
  } catch {
    return undefined;
  }
}

function cleanPowerShellStderr(stderr: string): string | undefined {
  const trimmed = stderr.trim();
  if (!trimmed || /^#< CLIXML\r?\n?<Objs[\s\S]*S="progress"[\s\S]*<\/Objs>$/i.test(trimmed)) {
    return undefined;
  }

  return stderr;
}

function photoshopReadinessNextSteps(input: {
  comRegistered: boolean;
  appExists: boolean;
  processes: PhotoshopProcessInfo[];
  recentCrashEvents: PhotoshopCrashEvent[];
  warnings: string[];
}): string[] {
  if (!input.comRegistered) {
    return ["Install or repair Photoshop so Photoshop.Application COM registration exists."];
  }

  if (!input.appExists) {
    return ["Repair the Photoshop installation; COM points to an executable path that does not exist."];
  }

  if (input.recentCrashEvents.length > 0) {
    return [
      "Photoshop is crashing on launch. Open Photoshop on the Windows desktop and repair the crash before running Photoshop COM automation.",
      "After Photoshop stays open normally, rerun photoshop:detect and then job:run-photoshop-com."
    ];
  }

  if (input.warnings.length > 0) {
    return [
      "Photoshop COM registration was found, but the readiness probe could not verify recent crash history within the timeout.",
      "Rerun photoshop:detect with a larger --timeout-ms or --crash-lookback-minutes 0 before accepting Photoshop as ready."
    ];
  }

  if (input.processes.length === 0) {
    return ["Photoshop is registered and no recent crash was found. It should be safe to run job:run-photoshop-com; start Photoshop manually first if COM startup is slow."];
  }

  return ["Photoshop is registered and running. Run the Photoshop COM proof or Adobe project workflow."];
}

function stringOrUndefined(input: unknown): string | undefined {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
}

function processArray(input: unknown): PhotoshopProcessInfo[] {
  const values = Array.isArray(input) ? input : input && typeof input === "object" ? [input] : [];
  return values
    .map((value) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined))
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .map((value) => ({
      processName: stringOrUndefined(value.processName) ?? "Photoshop",
      id: numberOrZero(value.id),
      mainWindowTitle: stringOrUndefined(value.mainWindowTitle) ?? "",
      responding: booleanOrUndefined(value.responding),
      path: stringOrUndefined(value.path)
    }));
}

function crashEventArray(input: unknown): PhotoshopCrashEvent[] {
  const values = Array.isArray(input) ? input : input && typeof input === "object" ? [input] : [];
  return values
    .map((value) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined))
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .map((value) => ({
      timeCreated: stringOrUndefined(value.timeCreated) ?? "",
      providerName: stringOrUndefined(value.providerName) ?? "",
      id: numberOrZero(value.id),
      levelDisplayName: stringOrUndefined(value.levelDisplayName) ?? "",
      summary: stringOrUndefined(value.summary) ?? ""
    }));
}

function numberOrZero(input: unknown): number {
  return typeof input === "number" && Number.isFinite(input) ? input : 0;
}

function booleanOrUndefined(input: unknown): boolean | undefined {
  return typeof input === "boolean" ? input : undefined;
}

function stringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
}
