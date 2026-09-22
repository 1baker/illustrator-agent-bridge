import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export type IllustratorHostPlatform = "auto" | "macos" | "windows" | "wsl" | "linux";
export type AdobeHostPlatform = IllustratorHostPlatform;

export interface BridgeDirs {
  root: string;
  jobs: string;
  results: string;
}

export function resolveBridgeRoot(root?: string): string {
  const configured = root ?? process.env.ILLUSTRATOR_AGENT_BRIDGE_ROOT ?? "./var";
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

export async function ensureBridgeDirs(root?: string): Promise<BridgeDirs> {
  const bridgeRoot = resolveBridgeRoot(root);
  const jobs = join(bridgeRoot, "jobs");
  const results = join(bridgeRoot, "results");

  await mkdir(jobs, { recursive: true });
  await mkdir(results, { recursive: true });

  return { root: bridgeRoot, jobs, results };
}

export async function getGeneratedJobPaths(id: string, root?: string): Promise<{ jobPath: string; resultPath: string }> {
  const dirs = await ensureBridgeDirs(root);

  return {
    jobPath: join(dirs.jobs, `${id}.jsx`),
    resultPath: join(dirs.results, `${id}.json`)
  };
}

export async function writeGeneratedJob(jobPath: string, jsx: string): Promise<void> {
  await writeFile(jobPath, jsx, "utf8");
}

export function toIllustratorPath(localPath: string, hostPlatform: IllustratorHostPlatform = configuredHostPlatform()): string {
  const normalized = localPath.replace(/\\/g, "/");
  const windowsMount = normalized.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);

  if ((hostPlatform === "auto" || hostPlatform === "windows" || hostPlatform === "wsl") && windowsMount) {
    return `${windowsMount[1].toUpperCase()}:/${windowsMount[2]}`;
  }

  if ((hostPlatform === "wsl" || (hostPlatform === "auto" && isWsl())) && normalized.startsWith("/")) {
    const distro = process.env.WSL_DISTRO_NAME;
    if (distro) {
      return `//wsl.localhost/${distro}${normalized}`;
    }
  }

  return normalized;
}

export function toAdobeHostPath(localPath: string, hostPlatform: AdobeHostPlatform = configuredHostPlatform()): string {
  return toIllustratorPath(localPath, hostPlatform);
}

function configuredHostPlatform(): IllustratorHostPlatform {
  const value = process.env.ILLUSTRATOR_HOST_PLATFORM;
  if (value === "macos" || value === "windows" || value === "wsl" || value === "linux") {
    return value;
  }

  return "auto";
}

function isWsl(): boolean {
  return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}
