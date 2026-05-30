import type { CodeDisciplineViolation, NormalizedCheckCodeDisciplineOptions } from "../types.js";
import type { ScannedSourceFile } from "../../imports/types.js";
import { planFolderizeCompoundFiles } from "./folderize-plan.js";

function runFolderizeCompoundFilesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation[] {
  return planFolderizeCompoundFiles(sourceFiles, options).map((candidate) => ({
    rule: "folderize-compound-files",
    stop: options.rules.folderizeCompoundFiles.stop,
    fix: options.rules.folderizeCompoundFiles.fix,
    filePath: candidate.relativeFromProjectRoot,
    message: `file can be grouped under ${candidate.suggestedPath}`,
    suggestedPath: candidate.suggestedPath,
    details: {
      mode: candidate.mode,
      prefix: candidate.prefix,
      remainder: candidate.remainder,
      separator: candidate.separator,
    },
  }));
}

export { runFolderizeCompoundFilesRule };
