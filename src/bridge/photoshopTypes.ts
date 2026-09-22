export type PhotoshopCommand =
  | PhotoshopPingCommand
  | PhotoshopSvgProofCommand
  | PhotoshopProjectPassCommand
  | PhotoshopProjectCommitCommand;

export interface PhotoshopPingCommand {
  kind: "ping";
  message?: string;
}

export interface PhotoshopSvgProofCommand {
  kind: "svg_proof";
  inputPath: string;
  outputPath: string;
  width?: number;
  height?: number;
  resolution?: number;
}

export interface PhotoshopProjectPassCommand {
  kind: "project_pass";
  inputPath: string;
  outputPngPath: string;
  outputSvgPath: string;
  outputPsdPath: string;
  feedbackPath: string;
  prompt?: string;
  passName?: string;
  width?: number;
  height?: number;
  resolution?: number;
  keepOpen?: boolean;
}

export interface PhotoshopProjectCommitCommand {
  kind: "project_commit";
  inputPath?: string;
  outputPngPath: string;
  outputSvgPath: string;
  outputPsdPath: string;
  feedbackPath: string;
  prompt?: string;
  passName?: string;
  closeDocument?: boolean;
}

export interface GeneratedPhotoshopJob {
  id: string;
  jobPath: string;
  resultPath: string;
  photoshopJobPath: string;
  photoshopResultPath: string;
  jsx: string;
}
