import type { NormalizedCheckCodeDisciplineOptions } from "../types.js";
import type { ScannedSourceFile } from "../../imports/types.js";
import type { CodeDisciplineViolation } from "../../shared/discipline-types.js";
import { planFolderizeCompoundFiles } from "./folderize-plan.js";

function runFolderizeCompoundFilesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation[] {
  if (!options.rules.folderizeCompoundFiles) return [];

  return planFolderizeCompoundFiles(sourceFiles, options).map((candidate) => ({
    rule: "folderize-compound-files",
    severity: options.rules.folderizeCompoundFiles.severity,
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
