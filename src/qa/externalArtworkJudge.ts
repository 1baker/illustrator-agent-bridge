export type ExternalArtworkJudgeConfidence = "high" | "medium" | "low";
export type ExternalArtworkFindingSeverity = "critical" | "high" | "medium" | "low";
export type ExternalArtworkArtifactEvidenceStatus = "available" | "missing" | "error" | "not-collected";

export interface ExternalArtworkFinding {
  severity: ExternalArtworkFindingSeverity;
  file: string | null;
  line: number;
  issue: string;
  required_fix: string;
}

export interface ExternalArtworkJudgeVerdict {
  pass: boolean;
  score: number;
  summary: string;
  blocking_findings: ExternalArtworkFinding[];
  nonblocking_findings: ExternalArtworkFinding[];
  tests_or_checks_required: string[];
  confidence: ExternalArtworkJudgeConfidence;
}

export interface ExternalArtworkJudgeAssessment {
  ok: boolean;
  scoreThreshold: number;
  issues: string[];
  nextGoalPrompt: string | null;
}

export interface ExternalArtworkArtifactEvidenceItem {
  path: string;
  status: ExternalArtworkArtifactEvidenceStatus;
  bytes?: number;
  sha256?: string;
  reason?: string;
}

export interface ExternalArtworkReviewArtifactEvidence {
  finalSvg: ExternalArtworkArtifactEvidenceItem;
  sourceSvg: ExternalArtworkArtifactEvidenceItem;
  photoshopReferencePng: ExternalArtworkArtifactEvidenceItem;
  photoshopHandoffSvg: ExternalArtworkArtifactEvidenceItem;
  photoshopWorkingPsd: ExternalArtworkArtifactEvidenceItem;
  photoshopFeedback: ExternalArtworkArtifactEvidenceItem;
}

export interface ExternalArtworkReviewHistoryItem {
  attempt: number;
  prompt: string;
  workflowPrompt: string;
  localReviewOk?: boolean;
  localIssues?: string[];
  localImprovements?: string[];
  externalReviewOk?: boolean;
  externalReviewScore?: number;
  externalSummary?: string;
  externalIssues?: string[];
  externalBlockingFindings?: ExternalArtworkFinding[];
  nextGoalPrompt: string | null;
  feedbackFingerprint?: string;
  repeatedFeedback?: boolean;
}

export interface ExternalArtworkReviewPacket {
  schemaVersion: "adobe-project-external-review.v1";
  reviewer: "chatgpt-pro-browser";
  goal: string;
  prompt: string;
  iteration: {
    attempt: number;
    maxAttempts: number;
  };
  artifacts: {
    finalSvgPath: string;
    sourceSvgPath: string;
    photoshopReferencePngPath: string;
    photoshopHandoffSvgPath: string;
    photoshopWorkingPsdPath: string;
    photoshopFeedbackPath: string;
  };
  artifactEvidence: ExternalArtworkReviewArtifactEvidence;
  localVerification: {
    workflowOk: boolean;
    sourceExportQaOk?: boolean;
    photoshopReferenceQaOk?: boolean;
    photoshopHandoffQaOk?: boolean;
    finalExportQaOk?: boolean;
    artworkReviewOk?: boolean;
    artworkReviewScore?: number;
    localIssues: string[];
    nextGoalPrompt: string | null;
  };
  adobeHandoff: {
    sourceOfTruth: string;
    sequence: string[];
    illustratorConsumes: string;
  };
  reviewHistory: ExternalArtworkReviewHistoryItem[];
  expectedVerdictSchema: {
    pass: boolean;
    score: number;
    summary: string;
    blocking_findings: ExternalArtworkFinding[];
    nonblocking_findings: ExternalArtworkFinding[];
    tests_or_checks_required: string[];
    confidence: ExternalArtworkJudgeConfidence;
  };
  reviewerPrompt: string;
}

export interface MakeExternalArtworkReviewPacketOptions {
  goal: string;
  prompt: string;
  attempt: number;
  maxAttempts: number;
  finalSvgPath: string;
  sourceSvgPath: string;
  photoshopReferencePngPath: string;
  photoshopHandoffSvgPath: string;
  photoshopWorkingPsdPath: string;
  photoshopFeedbackPath: string;
  artifactEvidence?: ExternalArtworkReviewArtifactEvidence;
  sourceExportQaOk?: boolean;
  photoshopReferenceQaOk?: boolean;
  photoshopHandoffQaOk?: boolean;
  finalExportQaOk?: boolean;
  artworkReviewOk?: boolean;
  artworkReviewScore?: number;
  localIssues?: string[];
  localNextGoalPrompt?: string | null;
  workflowOk: boolean;
  handoffSequence: string[];
  illustratorConsumes: string;
  reviewHistory?: ExternalArtworkReviewHistoryItem[];
}

export function makeExternalArtworkReviewPacket(options: MakeExternalArtworkReviewPacketOptions): ExternalArtworkReviewPacket {
  const packetWithoutPrompt = {
    schemaVersion: "adobe-project-external-review.v1" as const,
    reviewer: "chatgpt-pro-browser" as const,
    goal: options.goal,
    prompt: options.prompt,
    iteration: {
      attempt: options.attempt,
      maxAttempts: options.maxAttempts
    },
    artifacts: {
      finalSvgPath: options.finalSvgPath,
      sourceSvgPath: options.sourceSvgPath,
      photoshopReferencePngPath: options.photoshopReferencePngPath,
      photoshopHandoffSvgPath: options.photoshopHandoffSvgPath,
      photoshopWorkingPsdPath: options.photoshopWorkingPsdPath,
      photoshopFeedbackPath: options.photoshopFeedbackPath
    },
    artifactEvidence: options.artifactEvidence ?? notCollectedArtifactEvidence(options),
    localVerification: {
      workflowOk: options.workflowOk,
      sourceExportQaOk: options.sourceExportQaOk,
      photoshopReferenceQaOk: options.photoshopReferenceQaOk,
      photoshopHandoffQaOk: options.photoshopHandoffQaOk,
      finalExportQaOk: options.finalExportQaOk,
      artworkReviewOk: options.artworkReviewOk,
      artworkReviewScore: options.artworkReviewScore,
      localIssues: options.localIssues ?? [],
      nextGoalPrompt: options.localNextGoalPrompt ?? null
    },
    adobeHandoff: {
      sourceOfTruth: "illustrator-vector-document",
      sequence: options.handoffSequence,
      illustratorConsumes: options.illustratorConsumes
    },
    reviewHistory: options.reviewHistory ?? [],
    expectedVerdictSchema: {
      pass: false,
      score: 0,
      summary: "one sentence",
      blocking_findings: [
        {
          severity: "high" as const,
          file: null,
          line: 0,
          issue: "specific visual, scientific, composition, editability, or handoff problem",
          required_fix: "specific Illustrator/Photoshop/vector revision"
        }
      ],
      nonblocking_findings: [],
      tests_or_checks_required: [],
      confidence: "high" as const
    }
  };

  return {
    ...packetWithoutPrompt,
    reviewerPrompt: makeExternalArtworkReviewerPrompt(packetWithoutPrompt)
  };
}

export function normalizeExternalArtworkJudgeVerdict(input: unknown): ExternalArtworkJudgeVerdict {
  const record = objectRecord(input, "external artwork judge verdict");
  const verdict: ExternalArtworkJudgeVerdict = {
    pass: booleanValue(record.pass, "pass"),
    score: scoreValue(record.score, "score"),
    summary: nonEmptyString(record.summary, "summary"),
    blocking_findings: findingArray(record.blocking_findings, "blocking_findings"),
    nonblocking_findings: findingArray(record.nonblocking_findings, "nonblocking_findings"),
    tests_or_checks_required: stringArray(record.tests_or_checks_required, "tests_or_checks_required"),
    confidence: confidenceValue(record.confidence, "confidence")
  };

  return verdict;
}

export function parseExternalArtworkJudgeVerdictText(text: string): ExternalArtworkJudgeVerdict {
  const json = parseJsonFromText(text);
  return normalizeExternalArtworkJudgeVerdict(json);
}

export function assessExternalArtworkJudgeVerdict(
  verdict: ExternalArtworkJudgeVerdict,
  originalPrompt: string,
  scoreThreshold = 90
): ExternalArtworkJudgeAssessment {
  const issues = verdict.blocking_findings.map((finding) => finding.issue);
  if (!verdict.pass) {
    issues.unshift(`External reviewer did not pass the artwork: ${verdict.summary}`);
  }

  if (verdict.score < scoreThreshold) {
    issues.unshift(`External reviewer score ${verdict.score} is below the required ${scoreThreshold}.`);
  }

  const ok = verdict.pass && verdict.score >= scoreThreshold && verdict.blocking_findings.length === 0;
  return {
    ok,
    scoreThreshold,
    issues,
    nextGoalPrompt: ok ? null : makeNextGoalPromptFromExternalVerdict(verdict, originalPrompt, scoreThreshold)
  };
}

export function makeNextGoalPromptFromExternalVerdict(
  verdict: ExternalArtworkJudgeVerdict,
  originalPrompt: string,
  scoreThreshold = 90
): string | null {
  if (verdict.pass && verdict.score >= scoreThreshold && verdict.blocking_findings.length === 0) {
    return null;
  }

  const findingLines =
    verdict.blocking_findings.length === 0
      ? [`1. Reviewer summary: ${verdict.summary}`]
      : verdict.blocking_findings.map(
          (finding, index) =>
            `${index + 1}. [${finding.severity}] ${finding.issue} Required fix: ${finding.required_fix}`
        );

  return [
    `Revise the Illustrator and Photoshop project for this goal: ${originalPrompt}`,
    `ChatGPT browser review failed the current final SVG with score ${verdict.score}/${scoreThreshold}+ required and confidence ${verdict.confidence}. Summary: ${verdict.summary}`,
    `Required fixes:\n${findingLines.join("\n")}`,
    "Preserve the editable Illustrator vector source, keep the Photoshop handoff/reference pass, export a final SVG, and rerun local QA plus external review before accepting the artwork."
  ].join("\n\n");
}

function makeExternalArtworkReviewerPrompt(packet: Omit<ExternalArtworkReviewPacket, "reviewerPrompt">): string {
  return [
    "You are the ChatGPT Pro browser reviewer for a Codex + Adobe Illustrator + Photoshop artwork loop.",
    "",
    `Goal: ${packet.goal}`,
    `Attempt ${packet.iteration.attempt} of ${packet.iteration.maxAttempts}.`,
    "",
    `Primary artifact: ${packet.artifacts.finalSvgPath}`,
    `Supporting artifacts: ${packet.artifacts.photoshopReferencePngPath}, ${packet.artifacts.sourceSvgPath}, ${packet.artifacts.photoshopHandoffSvgPath}, ${packet.artifacts.photoshopFeedbackPath}.`,
    "",
    "Artifact evidence:",
    ...artifactEvidencePromptLines(packet.artifactEvidence),
    "",
    "Local verification:",
    `- Workflow ok: ${packet.localVerification.workflowOk}`,
    `- Final SVG QA ok: ${packet.localVerification.finalExportQaOk ?? "not run"}`,
    `- Photoshop PNG proof QA ok: ${packet.localVerification.photoshopReferenceQaOk ?? "not run"}`,
    `- Local artwork review ok: ${packet.localVerification.artworkReviewOk ?? "not run"}`,
    `- Local artwork score: ${packet.localVerification.artworkReviewScore ?? "not available"}`,
    packet.localVerification.localIssues.length > 0
      ? `- Local issues: ${packet.localVerification.localIssues.join("; ")}`
      : "- Local issues: none reported",
    "",
    "Review history:",
    ...reviewHistoryPromptLines(packet.reviewHistory),
    "",
    "Return exactly one JSON object and no markdown:",
    JSON.stringify(packet.expectedVerdictSchema, null, 2),
    "",
    "Pass only if the final SVG is good enough to keep without another Illustrator/Photoshop revision. Fail if there are any concrete visual, scientific, composition, editability, export, or Adobe handoff changes Codex should make before accepting it. Treat score below 90, any blocking finding, malformed JSON, missing verification, missing required artifacts, or artifact identity uncertainty as a failed guard. When review history exists, verify that previous blocking findings were actually resolved before passing the current final SVG."
  ].join("\n");
}

function notCollectedArtifactEvidence(options: MakeExternalArtworkReviewPacketOptions): ExternalArtworkReviewArtifactEvidence {
  return {
    finalSvg: notCollectedArtifact(options.finalSvgPath),
    sourceSvg: notCollectedArtifact(options.sourceSvgPath),
    photoshopReferencePng: notCollectedArtifact(options.photoshopReferencePngPath),
    photoshopHandoffSvg: notCollectedArtifact(options.photoshopHandoffSvgPath),
    photoshopWorkingPsd: notCollectedArtifact(options.photoshopWorkingPsdPath),
    photoshopFeedback: notCollectedArtifact(options.photoshopFeedbackPath)
  };
}

function notCollectedArtifact(path: string): ExternalArtworkArtifactEvidenceItem {
  return {
    path,
    status: "not-collected",
    reason: "Artifact evidence was not collected by this packet builder call."
  };
}

function artifactEvidencePromptLines(evidence: ExternalArtworkReviewArtifactEvidence): string[] {
  return [
    artifactEvidenceLine("Final SVG", evidence.finalSvg),
    artifactEvidenceLine("Illustrator source SVG", evidence.sourceSvg),
    artifactEvidenceLine("Photoshop reference PNG", evidence.photoshopReferencePng),
    artifactEvidenceLine("Photoshop handoff SVG", evidence.photoshopHandoffSvg),
    artifactEvidenceLine("Photoshop working PSD", evidence.photoshopWorkingPsd),
    artifactEvidenceLine("Photoshop feedback JSON", evidence.photoshopFeedback)
  ];
}

function artifactEvidenceLine(label: string, item: ExternalArtworkArtifactEvidenceItem): string {
  const identity = item.status === "available" ? `, bytes=${item.bytes}, sha256=${item.sha256}` : "";
  const reason = item.reason ? `, reason=${singleLine(item.reason)}` : "";
  return `- ${label}: ${item.status}${identity}, path=${item.path}${reason}`;
}

function reviewHistoryPromptLines(history: ExternalArtworkReviewHistoryItem[]): string[] {
  if (history.length === 0) {
    return ["- No previous review iterations."];
  }

  return history.map((item) => {
    const parts = [
      `attempt ${item.attempt}`,
      `local=${item.localReviewOk ?? "not run"}`,
      `external=${item.externalReviewOk ?? "not run"}`,
      item.externalReviewScore === undefined ? undefined : `score=${item.externalReviewScore}`,
      item.repeatedFeedback ? "repeated-feedback=true" : undefined,
      item.feedbackFingerprint ? `fingerprint=${item.feedbackFingerprint}` : undefined
    ].filter((part): part is string => Boolean(part));
    const next = item.nextGoalPrompt ? ` nextGoalPrompt=${singleLine(item.nextGoalPrompt)}` : "";
    const detailLines = [
      item.localIssues?.length ? `localIssues=${item.localIssues.map(singleLine).join(" | ")}` : undefined,
      item.localImprovements?.length ? `localImprovements=${item.localImprovements.map(singleLine).join(" | ")}` : undefined,
      item.externalSummary ? `externalSummary=${singleLine(item.externalSummary)}` : undefined,
      item.externalIssues?.length ? `externalIssues=${item.externalIssues.map(singleLine).join(" | ")}` : undefined,
      item.externalBlockingFindings?.length ? `blockingFindings=${blockingFindingSummary(item.externalBlockingFindings)}` : undefined
    ].filter((line): line is string => Boolean(line));
    return [`- ${parts.join(", ")}.${next}`, ...detailLines.map((line) => `  ${line}`)].join("\n");
  });
}

function singleLine(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function blockingFindingSummary(findings: ExternalArtworkFinding[]): string {
  return findings
    .map((finding, index) => `${index + 1}. [${finding.severity}] ${singleLine(finding.issue)} Required fix: ${singleLine(finding.required_fix)}`)
    .join(" | ");
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("External artwork judge verdict response was empty.");
  }

  const direct = tryParseJson(trimmed);
  if (direct.ok) {
    return direct.value;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    const parsed = tryParseJson(fenced[1]);
    if (parsed.ok) {
      return parsed.value;
    }
  }

  const objectText = firstBalancedJsonObject(trimmed);
  if (objectText) {
    const parsed = tryParseJson(objectText);
    if (parsed.ok) {
      return parsed.value;
    }
  }

  throw new Error("External artwork judge verdict response did not contain a parseable JSON object.");
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function firstBalancedJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start < 0) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function objectRecord(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return input as Record<string, unknown>;
}

function booleanValue(input: unknown, field: string): boolean {
  if (typeof input !== "boolean") {
    throw new Error(`External artwork judge verdict field ${field} must be a boolean.`);
  }

  return input;
}

function scoreValue(input: unknown, field: string): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > 100) {
    throw new Error(`External artwork judge verdict field ${field} must be a finite number from 0 to 100.`);
  }

  return input;
}

function nonEmptyString(input: unknown, field: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`External artwork judge verdict field ${field} must be a non-empty string.`);
  }

  return input.trim();
}

function findingArray(input: unknown, field: string): ExternalArtworkFinding[] {
  if (!Array.isArray(input)) {
    throw new Error(`External artwork judge verdict field ${field} must be an array.`);
  }

  return input.map((value, index) => findingValue(value, `${field}[${index}]`));
}

function findingValue(input: unknown, label: string): ExternalArtworkFinding {
  const record = objectRecord(input, label);
  return {
    severity: severityValue(record.severity, `${label}.severity`),
    file: fileValue(record.file, `${label}.file`),
    line: lineValue(record.line, `${label}.line`),
    issue: nonEmptyString(record.issue, `${label}.issue`),
    required_fix: nonEmptyString(record.required_fix, `${label}.required_fix`)
  };
}

function severityValue(input: unknown, field: string): ExternalArtworkFindingSeverity {
  if (input === "critical" || input === "high" || input === "medium" || input === "low") {
    return input;
  }

  throw new Error(`External artwork judge verdict field ${field} must be critical, high, medium, or low.`);
}

function confidenceValue(input: unknown, field: string): ExternalArtworkJudgeConfidence {
  if (input === "high" || input === "medium" || input === "low") {
    return input;
  }

  throw new Error(`External artwork judge verdict field ${field} must be high, medium, or low.`);
}

function fileValue(input: unknown, field: string): string | null {
  if (input === null) {
    return null;
  }

  if (typeof input === "string") {
    return input;
  }

  throw new Error(`External artwork judge verdict field ${field} must be a string or null.`);
}

function lineValue(input: unknown, field: string): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0) {
    throw new Error(`External artwork judge verdict field ${field} must be a non-negative integer.`);
  }

  return input;
}

function stringArray(input: unknown, field: string): string[] {
  if (!Array.isArray(input)) {
    throw new Error(`External artwork judge verdict field ${field} must be an array.`);
  }

  return input.map((value, index) => nonEmptyString(value, `${field}[${index}]`));
}
