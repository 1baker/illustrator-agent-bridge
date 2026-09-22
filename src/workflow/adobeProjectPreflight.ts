import { detectIllustratorApps, type IllustratorAppCandidate } from "../bridge/illustratorProbe.js";
import { resolveLaunchPlatform, type LaunchPlatform } from "../bridge/launcher.js";
import { detectPhotoshopDesktop, type PhotoshopDesktopReadiness } from "../bridge/photoshopProbe.js";
import { detectAuraCallChatGptBrowser, type AuraCallChatGptBrowserReadiness } from "../qa/auracallExternalArtworkJudge.js";

export interface AdobeProjectPreflightOptions {
  illustratorPlatform?: LaunchPlatform;
  photoshopPlatform?: LaunchPlatform;
  photoshopCrashLookbackMinutes?: number;
  photoshopTimeoutMs?: number;
  requireChatGptBrowser?: boolean;
  auracallCommand?: string;
  chatGptTimeoutSeconds?: number;
  chatGptOperationTimeoutSeconds?: number;
}

export interface AdobeProjectPreflightResult {
  ok: boolean;
  warnings?: string[];
  illustrator: {
    ok: boolean;
    platform: Exclude<LaunchPlatform, "auto">;
    candidates: IllustratorAppCandidate[];
    next: string[];
  };
  photoshop: PhotoshopDesktopReadiness;
  chatGpt?: AuraCallChatGptBrowserReadiness;
  next: string[];
}

export async function preflightAdobeProjectWorkflow(options: AdobeProjectPreflightOptions = {}): Promise<AdobeProjectPreflightResult> {
  const illustratorPlatform = resolveLaunchPlatform(options.illustratorPlatform);
  const photoshopPlatform = resolveLaunchPlatform(options.photoshopPlatform);
  const candidates = await detectIllustratorApps(illustratorPlatform);
  const illustratorOk = candidates.some((candidate) => candidate.exists);
  const strictPhotoshop = await detectPhotoshopDesktop({
    platform: photoshopPlatform,
    crashLookbackMinutes: options.photoshopCrashLookbackMinutes,
    timeoutMs: options.photoshopTimeoutMs
  });
  const shouldIgnoreCrashHistory = shouldRelaxPhotoshopCrashHistoryForPreflight(
    strictPhotoshop,
    options.photoshopCrashLookbackMinutes !== undefined
  );
  const photoshop = shouldIgnoreCrashHistory
    ? await detectPhotoshopDesktop({
        platform: photoshopPlatform,
        crashLookbackMinutes: 0,
        timeoutMs: options.photoshopTimeoutMs
      })
    : strictPhotoshop;
  const warnings = shouldIgnoreCrashHistory ? [photoshopCrashHistoryWarning(strictPhotoshop)] : [];
  const chatGpt = options.requireChatGptBrowser
    ? await detectAuraCallChatGptBrowser({
        command: options.auracallCommand,
        timeoutSeconds: options.chatGptTimeoutSeconds,
        operationTimeoutSeconds: options.chatGptOperationTimeoutSeconds,
        workdir: process.cwd()
      })
    : undefined;
  const ok = illustratorOk && photoshop.ok && (chatGpt?.ok ?? true);

  return {
    ok,
    warnings: warnings.length > 0 ? warnings : undefined,
    illustrator: {
      ok: illustratorOk,
      platform: illustratorPlatform,
      candidates,
      next: illustratorOk
        ? ["Illustrator desktop was found. Use COM on Windows/WSL for the Adobe project workflow."]
        : ["Install Illustrator desktop or pass the correct --platform/--app before running the Adobe project workflow."]
    },
    photoshop,
    chatGpt,
    next: nextSteps(illustratorOk, photoshop, chatGpt, Boolean(options.requireChatGptBrowser))
  };
}

function nextSteps(
  illustratorOk: boolean,
  photoshop: PhotoshopDesktopReadiness,
  chatGpt: AuraCallChatGptBrowserReadiness | undefined,
  requireChatGptBrowser: boolean
): string[] {
  const next: string[] = [];
  if (!illustratorOk) {
    next.push("Install Illustrator desktop or select a platform where Illustrator is installed.");
  }
  if (!photoshop.ok) {
    next.push(...photoshop.next);
  }
  if (requireChatGptBrowser && !chatGpt?.ok) {
    next.push(...(chatGpt?.next ?? ["Run chatgpt:detect and resolve AuraCall browser readiness before external review."]));
  }

  return next.length > 0
    ? next
    : [
        requireChatGptBrowser
          ? "Adobe project prerequisites and ChatGPT browser review prerequisites are ready."
          : "Adobe project prerequisites are ready. Run with --require-chatgpt-browser to include external review readiness."
      ];
}

export function shouldRelaxPhotoshopCrashHistoryForPreflight(
  photoshop: PhotoshopDesktopReadiness,
  crashLookbackWasExplicit: boolean
): boolean {
  return Boolean(
    !crashLookbackWasExplicit &&
      !photoshop.ok &&
      photoshop.comRegistered &&
      photoshop.appExists &&
      photoshop.recentCrashEvents.length > 0 &&
      photoshop.processes.some((process) => process.responding !== false)
  );
}

function photoshopCrashHistoryWarning(photoshop: PhotoshopDesktopReadiness): string {
  const processIds = photoshop.processes
    .filter((process) => process.responding !== false)
    .map((process) => process.id)
    .filter((id) => id > 0)
    .join(", ");
  const suffix = processIds ? ` Responding process id(s): ${processIds}.` : "";
  return `Photoshop has recent crash events, but a current Photoshop process is responding, so preflight treats the current COM session as usable.${suffix} Pass --photoshop-crash-lookback-minutes to enforce strict crash-history blocking.`;
}
