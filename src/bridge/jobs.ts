import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import type { BridgeCommand, GeneratedJob } from "./types.js";
import { getGeneratedJobPaths, type IllustratorHostPlatform, toIllustratorPath, writeGeneratedJob } from "./files.js";
import { generateJsx } from "./jsxGenerator.js";

export interface CreateGeneratedJobOptions {
  hostPlatform?: IllustratorHostPlatform;
}

export async function createGeneratedJob(command: BridgeCommand, root?: string, options: CreateGeneratedJobOptions = {}): Promise<GeneratedJob> {
  const id = randomUUID();
  const { jobPath, resultPath } = await getGeneratedJobPaths(id, root);
  const illustratorJobPath = toIllustratorPath(jobPath, options.hostPlatform);
  const illustratorResultPath = toIllustratorPath(resultPath, options.hostPlatform);
  const jsx = generateJsx(toHostCommand(command, options.hostPlatform), { id, resultPath: illustratorResultPath });
  await writeGeneratedJob(jobPath, jsx);

  return {
    id,
    jobPath,
    resultPath,
    illustratorJobPath,
    illustratorResultPath,
    jsx
  };
}

function toHostCommand(command: BridgeCommand, hostPlatform?: IllustratorHostPlatform): BridgeCommand {
  if (command.kind === "place_image_reference" || command.kind === "place_file_reference") {
    const absoluteInputPath = isAbsolute(command.inputPath) ? command.inputPath : resolve(process.cwd(), command.inputPath);
    return {
      ...command,
      inputPath: toIllustratorPath(absoluteInputPath, hostPlatform)
    };
  }

  if (command.kind === "export") {
    const absoluteOutputPath = isAbsolute(command.outputPath) ? command.outputPath : resolve(process.cwd(), command.outputPath);

    return {
      ...command,
      outputPath: toIllustratorPath(absoluteOutputPath, hostPlatform)
    };
  }

  return command;
}
